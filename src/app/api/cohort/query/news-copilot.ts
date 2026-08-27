import { NextResponse } from "next/server";
import { TextEncoder } from "util";
import { createCompletion } from "@/app/utils/services/ai-service";
import type { getCampaignNewsContextForUser } from "@/app/utils/campaign-news";
import { CampaignMemoryService } from "@/app/utils/services/campaign-memory-service";

export interface CampaignIdentity {
  orgId?: number | null;
  candidateName: string | null;
  organizationName: string | null;
  party: string | null;
  officeType: string | null;
  state: string | null;
  districtCode: string | null;
}

interface NewsCopilotParams {
  question: string;
  stream: boolean;
  newsContext: Awaited<ReturnType<typeof getCampaignNewsContextForUser>>;
  campaignIdentity?: CampaignIdentity | null;
  model?: string;
  recentMessages?: Array<{ role: 'user' | 'agent'; content: string }>;
  responseMode?: 'quick_update' | 'decision_support' | 'full_brief';
  complexity?: 'low' | 'medium' | 'high';
  memoryContext?: string;
  userId?: number;
  featureFlags?: {
    adaptiveModes?: boolean;
    memoryRetrieval?: boolean;
    criticPass?: boolean;
  };
}

function modeWordBudget(mode: 'quick_update' | 'decision_support' | 'full_brief') {
  if (mode === 'quick_update') return '120-220 words';
  if (mode === 'decision_support') return '250-450 words';
  return '550-900 words';
}

function modeSectionContract(mode: 'quick_update' | 'decision_support' | 'full_brief', candidateLabel: string) {
  if (mode === 'quick_update') {
    return [
      '## What Happened',
      '3-6 concise bullets of the most relevant updates.',
      '',
      '## Why It Matters',
      `1 short paragraph about implications for ${candidateLabel}.`,
      '',
      '## Sources',
      '(This section will be appended automatically — do not generate it.)',
    ].join('\n');
  }
  if (mode === 'decision_support') {
    return [
      '## Situation',
      '2-4 sentences of context.',
      '',
      '## Best Next Moves',
      'Top 3 concrete actions for the next 24-48 hours.',
      '',
      '## Risks to Watch',
      '2-4 bullets of the most material risks.',
      '',
      '## Sources',
      '(This section will be appended automatically — do not generate it.)',
    ].join('\n');
  }
  return [
    '## Situation Brief',
    '2-4 sentences synthesizing the overall picture.',
    '',
    `## What This Means for ${candidateLabel}`,
    'A strategic analysis paragraph with opportunities and risks.',
    '',
    '## Recommended Actions',
    'Numbered list of 3-5 concrete steps for the next 48 hours.',
    '',
    '## Draft Messaging',
    '### Talking points (3-5)',
    '### Rapid-response lines (2-3)',
    '',
    '## Confidence & Caveats',
    'One sentence on confidence and evidence gaps.',
    '',
    '## Sources',
    '(This section will be appended automatically — do not generate it.)',
  ].join('\n');
}

function lastAssistantReply(recentMessages?: Array<{ role: 'user' | 'agent'; content: string }>) {
  const msgs = recentMessages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'agent' && msgs[i].content?.trim()) return msgs[i].content;
  }
  return null;
}

/**
 * LLM-powered campaign news copilot.
 *
 * Step 1: Assemble all article bodies/summaries into a dossier.
 * Step 2: Send to the LLM with a strong campaign-strategist system prompt.
 * Step 3: Append factual evidence (sources) that the LLM does NOT generate.
 * Fallback: If the LLM call fails, return a structured template.
 */
export async function respondFromCampaignNewsOnly(params: NewsCopilotParams) {
  const {
    question,
    stream,
    newsContext,
    campaignIdentity,
    model,
    recentMessages,
    responseMode = 'full_brief',
    complexity = 'medium',
    memoryContext,
    userId,
    featureFlags,
  } = params;

  const items = (newsContext?.items || []).slice(0, 8);
  const selectedModel = (model || process.env.NEWS_COPILOT_MODEL || "gpt-4o").trim();
  const candidateLabel =
    campaignIdentity?.candidateName ||
    campaignIdentity?.organizationName ||
    "the campaign";
  const partyLabel = campaignIdentity?.party || "unknown party";
  const officeLabel = campaignIdentity?.officeType || "elected office";
  // newsContext.scope reflects the article query's actual scope — which is
  // the dashboard-selected district when one is active (see districtScope in
  // route.ts) — so it must win over the user's default campaignIdentity, or
  // the label shown to the LLM would still name the wrong district even
  // though the underlying articles were correctly scoped.
  const districtLabel =
    newsContext?.scope?.districtCode ||
    newsContext?.scope?.state ||
    campaignIdentity?.districtCode ||
    "your district";
  const requestedWindowLabel = newsContext?.retrieval?.requestedWindowLabel;
  const appliedWindowLabel = newsContext?.retrieval?.appliedWindowLabel;
  const windowWidened = Boolean(newsContext?.retrieval?.widened);
  const coverageNotice = requestedWindowLabel
    ? windowWidened && appliedWindowLabel
      ? `Coverage note: user asked for ${requestedWindowLabel}; retrieval widened to ${appliedWindowLabel} due to limited matches.`
      : `Coverage note: retrieval constrained to ${appliedWindowLabel || requestedWindowLabel}.`
    : null;
  const conversationContext = (recentMessages || [])
    .filter((m) => typeof m?.content === 'string' && m.content.trim().length > 0)
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  const previousAssistantResponse = lastAssistantReply(recentMessages);
  const adaptiveModesEnabled = featureFlags?.adaptiveModes !== false;
  const useCriticPass = featureFlags?.criticPass !== false && (complexity === 'medium' || complexity === 'high');

  // ── Build a rich article dossier for the LLM ──────────────────────────────
  const articleDossier = items
    .map((item, idx) => {
      const summary = (item.summary || "").trim();
      return [
        `--- Article ${idx + 1} ---`,
        `Headline: ${item.title}`,
        `Source: ${item.source}`,
        `Published: ${item.publishedAt || "unknown"}`,
        `URL: ${item.url}`,
        summary
          ? `Full excerpt / summary:\n${summary}`
          : "(no article body available)",
      ].join("\n");
    })
    .join("\n\n");

  // ── Factual evidence block (never LLM-generated) ─────────────────────────
  const evidenceLines = items.length
    ? items
        .map(
          (item, idx) =>
            `${idx + 1}. [${item.source || "Source"}] ${item.title}${item.publishedAt ? ` (${item.publishedAt})` : ""}${item.url ? ` — ${item.url}` : ""}`
        )
        .join("\n")
    : "No recent campaign news items were available for your district/state scope.";

  // ── System prompt: research/synthesis assistant persona ───────────────────
  const systemPrompt = [
    `You are a campaign research copilot for **${candidateLabel}** (${partyLabel}), focused on ${officeLabel} in **${districtLabel}**.`,
    "",
    "Your job is to synthesize information from multiple sources and answer the user's exact question directly.",
    "",
    "IMPORTANT RULES:",
    "- Synthesize across articles; do not copy a fixed script.",
    "- Lead with a direct answer to the question.",
    "- If the user asks for updates, prioritize what changed and what is new.",
    "- If the user asks for recommendations, include recommendations. Otherwise stay analytical.",
    "- Ground every claim in the articles provided. If you are uncertain, say so.",
    "- Be specific to the actual source content; avoid generic filler.",
    "- Keep it concise by default unless the user explicitly asks for a full brief.",
    "- Respect the requested time window when present. If coverage had to be widened due to sparse results, acknowledge that in Confidence & Caveats.",
    "",
    `Response mode: ${adaptiveModesEnabled ? responseMode : 'full_brief'}.`,
    `Target length: ${modeWordBudget(adaptiveModesEnabled ? responseMode : 'full_brief')}.`,
    "Use only the sections required for the selected response mode.",
    "",
    "RESPONSE FORMAT:",
    modeSectionContract(adaptiveModesEnabled ? responseMode : 'full_brief', candidateLabel),
  ].join("\n");

  const userPrompt = [
    `Here are the latest ${items.length} news articles relevant to the ${districtLabel} campaign:`,
    "",
    articleDossier,
    "",
    "---",
    "",
    memoryContext ? `Relevant long-term campaign memory:\n${memoryContext}` : '',
    memoryContext ? "\n---\n" : '',
    conversationContext ? `Recent conversation context (for follow-up continuity):\n${conversationContext}` : '',
    conversationContext ? "\n---\n" : '',
    previousAssistantResponse
      ? `Most recent assistant answer (avoid repeating unchanged content, focus on deltas):\n${previousAssistantResponse}`
      : '',
    previousAssistantResponse ? "\n---\n" : '',
    `The campaign team asks: "${question}"`,
    "",
    "If this is a follow-up, begin with what changed since the prior answer and avoid restating unchanged background.",
  ].join("\n");

  // ── Try LLM synthesis; fall back to template on failure ───────────────────
  try {
    const draftPrompt = `${userPrompt}\n\nDraft a first-pass response matching the selected response mode and length budget.`;
    const reviewPrompt = `You are the campaign chief of staff performing a quality check.

Question: "${question}"
Requested window: ${requestedWindowLabel || 'not specified'}
Applied window: ${appliedWindowLabel || 'not specified'}
Widened: ${windowWidened ? 'yes' : 'no'}

Review and improve the draft below:

---
{DRAFT}
---

Requirements:
- Keep the same section structure.
- Remove generic filler and tighten recommendations.
- Ensure every recommendation maps to observed evidence.
- Ensure the response directly answers the user's question in the first section.
- If window was widened, explicitly acknowledge that limitation in Confidence & Caveats.
- Be concise and useful, not templated.`;

    const draftResult = await createCompletion({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: draftPrompt },
      ],
      temperature: 0.4,
      maxTokens: 1400,
    });

    let finalResult = draftResult;
    if (useCriticPass) {
      finalResult = await createCompletion({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: reviewPrompt.replace('{DRAFT}', draftResult.content || '') },
        ],
        temperature: 0.25,
        maxTokens: responseMode === 'quick_update' ? 700 : responseMode === 'decision_support' ? 1100 : 1600,
      });
    }

    // Fallback model for transient provider/model failures.
    if ((!finalResult.content || !finalResult.content.trim()) && selectedModel !== "gpt-4o") {
      finalResult = await createCompletion({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: (useCriticPass ? reviewPrompt.replace('{DRAFT}', draftResult.content || '') : draftPrompt) },
        ],
        temperature: 0.25,
        maxTokens: responseMode === 'quick_update' ? 700 : responseMode === 'decision_support' ? 1100 : 1600,
      });
    }

    const content = [
      finalResult.content,
      coverageNotice ? `\n## Coverage\n${coverageNotice}\n` : '',
      `\n## Sources\n${evidenceLines}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Selective write-after-generate memory policy.
    if (featureFlags?.memoryRetrieval !== false && campaignIdentity?.orgId && userId && content) {
      const shouldPersist = responseMode !== 'quick_update' || /\b(decision|plan|priority|tomorrow|next)\b/i.test(question);
      if (shouldPersist) {
        const memoryType = responseMode === 'decision_support' ? 'event' : 'summary';
        const memoryContent = `Q: ${question}\nA: ${String(content).slice(0, 900)}`;
        void CampaignMemoryService.upsertMemory({
          orgId: campaignIdentity.orgId,
          userId,
          memoryType,
          content: memoryContent,
          importanceScore: responseMode === 'full_brief' ? 0.7 : 0.6,
          confidenceScore: 0.6,
        }).catch((error) => {
          console.warn('Memory write skipped:', error instanceof Error ? error.message : error);
        });
      }
    }

    if (stream) {
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        async start(controller) {
          const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          const progressSteps = [
            'Reviewing latest district and state headlines',
            responseMode === 'quick_update' ? 'Summarizing key updates' : 'Drafting response',
            ...(useCriticPass ? ['Self-checking recommendations against evidence'] : []),
            'Finalizing response for delivery',
          ];
          for (const step of progressSteps) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "progress", step })}\n\n`)
            );
            await sleep(250);
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new NextResponse(streamBody, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({ status: true, content });
  } catch (llmError: any) {
    console.warn(
      "⚠️ News copilot LLM call failed, using template fallback:",
      llmError.message
    );
    return buildTemplateFallback({
      items,
      candidateLabel,
      districtLabel,
      evidenceLines,
      question,
      stream,
    });
  }
}

interface GeneralWebCopilotParams {
  question: string;
  stream: boolean;
  campaignIdentity?: CampaignIdentity | null;
  model?: string;
  recentMessages?: Array<{ role: 'user' | 'agent'; content: string }>;
  memoryContext?: string;
  systemPrompt?: string;
  newsContextSummary?: string;
  requestedNewsTimeWindow?: string | null;
  districtScope?: { state: string; districtCode?: string | null } | null;
}

function deliverCopilotContent(content: string, stream: boolean) {
  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new NextResponse(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
  return NextResponse.json({ status: true, content });
}

/**
 * general/news mode: LLM answers without requiring a survey or a populated news digest.
 * Used for public-data questions (ballot order, clerk records, regression design, etc.).
 */
export async function respondFromGeneralWebOnly(params: GeneralWebCopilotParams) {
  const {
    question,
    stream,
    campaignIdentity,
    model,
    recentMessages,
    memoryContext,
    systemPrompt,
    newsContextSummary,
    requestedNewsTimeWindow,
    districtScope,
  } = params;

  const selectedModel = (model || process.env.GENERAL_COPILOT_MODEL || "gpt-4o").trim();
  const candidateLabel =
    campaignIdentity?.candidateName ||
    campaignIdentity?.organizationName ||
    "the campaign";
  // An explicit districtScope (a district selected on the dashboard, e.g. via
  // a district-intel deep report) always wins over the user's default
  // organization identity — otherwise follow-up questions about District X
  // get answered/searched as if they were about the user's home district.
  const districtLabel =
    districtScope?.districtCode ||
    districtScope?.state ||
    campaignIdentity?.districtCode ||
    campaignIdentity?.state ||
    "your jurisdiction";

  const conversationContext = (recentMessages || [])
    .filter((m) => typeof m?.content === "string" && m.content.trim().length > 0)
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const supplementalNews = (newsContextSummary || "").trim();
  const hasNewsDigest = supplementalNews.length > 0;

  const baseSystem = [
    `You are a campaign research copilot for **${candidateLabel}** in **${districtLabel}**.`,
    "This is **general/news** mode: the user is NOT tied to a specific survey cohort.",
    "",
    "You help with:",
    "- Electoral administration and public records (county clerks, canvass, ballot formatting)",
    "- **Ballot positioning / ballot order** and how to test order effects against outcomes",
    "- Research design (variables, controls, regression framing, data joins)",
    "- District/state campaign news when a digest is provided",
    "",
    "RULES:",
    "- Answer the user's exact question first.",
    "- Separate **facts from inference**. Label speculation clearly.",
    "- If you lack live data for this jurisdiction, say what to fetch (clerk site, SOS, L2, results files) and suggest a concrete analysis plan.",
    "- Do not invent statistics, vote totals, or clerk rulings.",
    "- Use markdown with short sections (## headings) when helpful.",
    systemPrompt ? `\nAdditional instructions:\n${systemPrompt}` : "",
  ].join("\n");

  const userPrompt = [
    requestedNewsTimeWindow
      ? `User requested news window: ${requestedNewsTimeWindow} (no matching digest may be available).`
      : "",
    hasNewsDigest
      ? `Optional campaign news digest (use only if relevant):\n${supplementalNews}`
      : "No campaign news digest is loaded for this session.",
    memoryContext ? `Relevant campaign memory:\n${memoryContext}` : "",
    conversationContext ? `Recent conversation:\n${conversationContext}` : "",
    "",
    `User question: "${question}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // First try a LIVE web search (OpenAI search-preview) so general/news mode
  // pulls real, current political/news/clerk/ballot information and cites it.
  try {
    const { webSearchAnswer, withSourcesSection } = await import("../../../utils/services/web-search");
    const searchSystem = [
      baseSystem,
      "",
      "You have live web access. Search the web for the most current, factual",
      "information relevant to the question — political news coverage, ballot",
      "news, county clerk records, election administration, polling, results.",
      "Prioritize reputable sources. ALWAYS ground claims in the sources you find",
      "and cite them inline. Do not fabricate figures.",
    ].join("\n");
    const search = await webSearchAnswer({ question: userPrompt, systemContext: searchSystem });
    const searched = (search.content || "").trim();
    if (searched) {
      return deliverCopilotContent(withSourcesSection(searched, search.citations), stream);
    }
    // empty → fall through to the non-search LLM below
  } catch (searchErr) {
    console.warn(
      "⚠️ Live web search failed, falling back to base LLM:",
      searchErr instanceof Error ? searchErr.message : searchErr
    );
  }

  try {
    const result = await createCompletion({
      model: selectedModel,
      messages: [
        { role: "system", content: baseSystem },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.35,
      maxTokens: 1600,
    });

    let content = (result.content || "").trim();
    if (!content && selectedModel !== "gpt-4o") {
      const fallback = await createCompletion({
        model: "gpt-4o",
        messages: [
          { role: "system", content: baseSystem },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.25,
        maxTokens: 1600,
      });
      content = (fallback.content || "").trim();
    }

    if (!content) {
      content = [
        "## Unable to generate a response",
        "The AI service returned an empty reply. Check that `OPENAI_API_KEY` (or your selected model provider key) is set in `.env.local` / `.env.production`, then try again.",
        "",
        "For **general/news** questions without a news digest, you can still ask about methodology (e.g. ballot order effects, merging clerk files with results) and I will outline a data plan.",
      ].join("\n");
    }

    if (!hasNewsDigest && !/\b(data plan|methodology|cannot access live)\b/i.test(content)) {
      content += `\n\n---\n_Note: No live news digest is attached for ${districtLabel}. Answers use general research knowledge unless you connect clerk/results data._`;
    }

    return deliverCopilotContent(content, stream);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("⚠️ General web copilot LLM failed:", message);
    const content = [
      "## AI unavailable",
      `Could not reach the language model (${message}).`,
      "",
      "Verify API keys in your environment, restart the server, and retry.",
      "",
      `Your question was: "${question}"`,
    ].join("\n");
    return deliverCopilotContent(content, stream);
  }
}

// ── Template fallback (used when LLM is unavailable) ──────────────────────
function buildTemplateFallback(opts: {
  items: any[];
  candidateLabel: string;
  districtLabel: string;
  evidenceLines: string;
  question: string;
  stream: boolean;
}) {
  const { items, candidateLabel, districtLabel, evidenceLines, question, stream } = opts;

  const articleBriefLines = items
    .map((item: any, idx: number) => {
      const brief = (item.summary || "").trim();
      if (!brief) return null;
      return `${idx + 1}) **${item.source || "Source"}:** ${brief.slice(0, 300)}${brief.length > 300 ? "…" : ""}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const content = [
    `## Situation Brief (${districtLabel})`,
    `${items.length} relevant district/state articles found. LLM synthesis is temporarily unavailable, so here is a structured summary.`,
    "",
    "## Article Summaries",
    articleBriefLines || "Full article text could not be extracted.",
    "",
    "## Recommended Actions",
    `1. Review the articles below and identify the dominant narrative.`,
    `2. Prepare talking points that connect ${candidateLabel}'s platform to the developments described.`,
    `3. Brief your team with the key facts before the next news cycle.`,
    "",
    "## Sources",
    evidenceLines,
    "",
    `_Question asked: "${question}"_`,
  ].join("\n");

  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new NextResponse(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
  return NextResponse.json({ status: true, content });
}
