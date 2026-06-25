/**
 * Live web search with citations via OpenAI's search-preview models.
 *
 * These models perform a real web search server-side and return an answer plus
 * `annotations` (url_citation objects). They use the standard OPENAI_API_KEY —
 * no separate SerpAPI/Tavily/Brave key required. Note: search-preview models
 * reject the `temperature` parameter, so we don't send it.
 */
import OpenAI from 'openai';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export interface WebCitation {
  title: string;
  url: string;
}

export interface WebSearchResult {
  content: string;
  citations: WebCitation[];
}

export async function webSearchAnswer(opts: {
  question: string;
  systemContext?: string;
  model?: string;
}): Promise<WebSearchResult> {
  const model = (opts.model || process.env.WEB_SEARCH_MODEL || 'gpt-4o-search-preview').trim();

  const messages: any[] = [];
  if (opts.systemContext) messages.push({ role: 'system', content: opts.systemContext });
  messages.push({ role: 'user', content: opts.question });

  const resp: any = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: 1600,
    // Do NOT pass temperature — search-preview models reject it.
  });

  const msg: any = resp?.choices?.[0]?.message || {};
  const content = (msg.content || '').trim();
  const annotations: any[] = Array.isArray(msg.annotations) ? msg.annotations : [];

  const seen = new Set<string>();
  const citations: WebCitation[] = [];
  for (const a of annotations) {
    const c = a?.url_citation;
    if (a?.type === 'url_citation' && c?.url && !seen.has(c.url)) {
      seen.add(c.url);
      citations.push({ title: (c.title || c.url).trim(), url: c.url });
    }
  }

  return { content, citations };
}

/** Append a markdown "## Sources" section listing the citations. */
export function withSourcesSection(content: string, citations: WebCitation[]): string {
  if (!citations.length) return content;
  const lines = citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n');
  return `${content}\n\n## Sources\n${lines}`;
}

export interface DeepResearchResult {
  content: string;
  citations: WebCitation[];
  subQuestions: string[];
}

/**
 * Multi-step "deep research" (ChatGPT/Claude style): decompose the topic into
 * focused sub-questions, run a live web search for each, then synthesize a
 * comprehensive, cited report. Uses only OPENAI_API_KEY (gpt-4o for
 * planning/synthesis, gpt-4o-search-preview for the searches).
 *
 * onStep is invoked with human-readable progress so the UI can stream the
 * research process live.
 */
export async function deepResearch(opts: {
  question: string;
  systemContext?: string;
  onStep?: (step: string) => void;
  maxSubQuestions?: number;
}): Promise<DeepResearchResult> {
  const emit = (s: string) => { try { opts.onStep?.(s); } catch { /* ignore */ } };
  const maxSub = Math.min(Math.max(opts.maxSubQuestions ?? 5, 3), 6);

  // 1) Plan — decompose into diverse sub-questions.
  emit('🧭 Planning research — breaking the topic into focused sub-questions…');
  let subQuestions: string[] = [];
  try {
    const plan: any = await getClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `You are a research planner. Break the user's topic into ${maxSub} focused, diverse sub-questions that, ` +
            `searched together, comprehensively cover it (different angles: facts/latest news, stakeholders, data/numbers, ` +
            `context/background, implications). Return ONLY JSON: {"subQuestions": ["...", "..."]}.`,
        },
        { role: 'user', content: opts.question },
      ],
    });
    const parsed = JSON.parse(plan?.choices?.[0]?.message?.content || '{}');
    if (Array.isArray(parsed.subQuestions)) {
      subQuestions = parsed.subQuestions.map((s: any) => String(s).trim()).filter(Boolean).slice(0, maxSub);
    }
  } catch { /* fall back below */ }
  if (subQuestions.length === 0) subQuestions = [opts.question];

  // 2) Search every sub-question live, in PARALLEL (serial was too slow).
  emit(`🔎 Searching the web across ${subQuestions.length} angles…`);
  subQuestions.forEach((q) => emit(`• ${q}`));
  const findings = await Promise.all(
    subQuestions.map(async (q) => {
      try {
        const r = await webSearchAnswer({ question: q, systemContext: opts.systemContext });
        emit(`✓ Found sources for: ${q}`);
        return { q, content: r.content, citations: r.citations };
      } catch {
        return { q, content: '', citations: [] as WebCitation[] };
      }
    })
  );

  // De-duplicate citations across all sub-searches.
  const seen = new Set<string>();
  const citations: WebCitation[] = [];
  for (const f of findings) for (const c of f.citations) {
    if (!seen.has(c.url)) { seen.add(c.url); citations.push(c); }
  }

  // 3) Synthesize a comprehensive cited report.
  emit('🧠 Synthesizing findings into a structured report…');
  const dossier = findings
    .map((f, i) => `### Sub-topic ${i + 1}: ${f.q}\n${f.content || '(no results)'}`)
    .join('\n\n');
  const sourceList = citations.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n');

  let report = '';
  try {
    const synth: any = await getClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert research analyst. Write a comprehensive, well-structured markdown report that answers ' +
            "the user's question, grounded ONLY in the research findings provided. Use ## section headings, an opening " +
            '**Executive summary**, specific facts/figures, and balanced analysis. Cite sources inline as [n] matching the ' +
            'numbered source list. Do not invent facts or sources. End the body before the sources list (it is appended separately).',
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION:\n${opts.question}\n\nFINDINGS:\n${dossier}\n\nNUMBERED SOURCES:\n${sourceList}`,
        },
      ],
    });
    report = (synth?.choices?.[0]?.message?.content || '').trim();
  } catch {
    report = dossier; // fall back to raw findings if synthesis fails
  }

  const content = citations.length
    ? `${report}\n\n## Sources\n${citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n')}`
    : report;

  emit('✅ Research complete.');
  return { content, citations, subQuestions };
}
