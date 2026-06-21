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
