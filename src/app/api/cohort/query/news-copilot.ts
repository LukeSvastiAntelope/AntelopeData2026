import { NextResponse } from "next/server";
import { TextEncoder } from "util";
import { createCompletion } from "@/app/utils/services/ai-service";
import type { getCampaignNewsContextForUser } from "@/app/utils/campaign-news";

export interface CampaignIdentity {
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
  const { question, stream, newsContext, campaignIdentity } = params;

  const items = (newsContext?.items || []).slice(0, 5);
  const candidateLabel =
    campaignIdentity?.candidateName ||
    campaignIdentity?.organizationName ||
    "the campaign";
  const partyLabel = campaignIdentity?.party || "unknown party";
  const officeLabel = campaignIdentity?.officeType || "elected office";
  const districtLabel =
    campaignIdentity?.districtCode ||
    newsContext?.scope?.districtCode ||
    newsContext?.scope?.state ||
    "your district";

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

  // ── System prompt: campaign-strategist persona ────────────────────────────
  const systemPrompt = [
    `You are the AI Campaign Manager for **${candidateLabel}** (${partyLabel}), running for ${officeLabel} in **${districtLabel}**.`,
    "",
    "Your job is to read the attached news articles about this district/state and produce a single, synthesized campaign intelligence brief that a campaign manager can act on immediately.",
    "",
    "IMPORTANT RULES:",
    "- Synthesize across ALL articles. Do NOT just list them one by one — weave the information into a coherent narrative that tells the campaign team what is happening and why it matters.",
    "- Ground every claim in the articles provided. If you are uncertain, say so.",
    "- Write as an experienced campaign strategist speaking directly to the candidate and their team.",
    "- Be specific to the ACTUAL content of the articles. Generic advice is useless — tie everything to what the articles actually say.",
    "- Be concise and action-oriented. Campaign staff are busy.",
    "",
    "OUTPUT FORMAT (use these exact markdown headings):",
    "",
    "## Situation Brief",
    "2-4 sentences synthesizing the overall picture across ALL articles into one unified narrative. What is the state of the race / district / political environment right now? What is the dominant narrative? Do not re-list articles — combine them.",
    "",
    `## What This Means for ${candidateLabel}`,
    "A strategic analysis paragraph: How do these developments specifically affect your campaign? What opportunities do they create? What risks do they pose? Reference specific facts from the articles.",
    "",
    "## Recommended Actions",
    "Numbered list of 3-5 concrete, actionable steps the campaign should take in the next 48 hours based on these specific developments. Each action should directly reference something from the articles.",
    "",
    "## Draft Messaging",
    "### Talking points (3-5)",
    "Specific talking points the candidate can use, directly informed by the article content. Not generic — tied to actual events.",
    "",
    "### Rapid-response lines (2-3)",
    "Short, quotable lines ready for press or social media, responding to specific developments in the articles.",
    "",
    "## Confidence & Caveats",
    "One sentence on how confident you are in this analysis and what information you wish you had.",
    "",
    "## Sources",
    "(This section will be appended automatically — do not generate it.)",
  ].join("\n");

  const userPrompt = [
    `Here are the latest ${items.length} news articles relevant to the ${districtLabel} campaign:`,
    "",
    articleDossier,
    "",
    "---",
    "",
    `The campaign team asks: "${question}"`,
    "",
    "Produce the campaign intelligence brief now.",
  ].join("\n");

  // ── Try LLM synthesis; fall back to template on failure ───────────────────
  try {
    const result = await createCompletion({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 2000,
    });

    const content = `${result.content}\n\n## Sources\n${evidenceLines}`;

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
