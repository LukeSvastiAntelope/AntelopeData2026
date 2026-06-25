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
    max_tokens: 2400,
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

type Finding = { q: string; content: string; citations: WebCitation[] };

// Run a batch of search queries in parallel and emit progress.
async function runSearches(
  queries: string[],
  systemContext: string | undefined,
  emit: (s: string) => void
): Promise<Finding[]> {
  return Promise.all(
    queries.map(async (q) => {
      try {
        const r = await webSearchAnswer({ question: q, systemContext });
        emit(`✓ ${q}${r.citations.length ? ` — ${r.citations.length} source(s)` : ''}`);
        return { q, content: r.content, citations: r.citations };
      } catch {
        emit(`✗ no results for: ${q}`);
        return { q, content: '', citations: [] as WebCitation[] };
      }
    })
  );
}

function findingsDossier(findings: Finding[]): string {
  return findings.map((f, i) => `### Finding ${i + 1} — query: ${f.q}\n${f.content || '(no results)'}`).join('\n\n');
}

// Plan the investigation: extract the exact entities, the quantitative task, and round-1 queries.
async function planResearch(
  question: string,
  systemContext?: string
): Promise<{ brief: string; analyticalTask: string; queries: string[] }> {
  try {
    const r: any = await getClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous research lead planning a DEEP, multi-step web investigation. ' +
            'Read the user question and extract the SPECIFIC entities it concerns: jurisdiction (state/county), the exact ' +
            'election or cycle, the precise variables and the relationship being tested, and the time frame. ' +
            'Design a FIRST round of web searches that gather concrete, verifiable facts and NUMBERS — e.g. the specific ' +
            'competitive races, candidate vote totals and margins, ballot order/position, and the number of county/party ' +
            'endorsements per candidate. STRONGLY prefer official/primary sources (county clerk offices, Secretary of ' +
            'State, official canvass/results PDFs) over punditry. Make each query specific and source-targeted ' +
            '(name the state, cycle, race, and "official results" / "county clerk canvass" where relevant). ' +
            (systemContext ? `\nContext: ${systemContext}\n` : '') +
            'Return ONLY JSON: {"brief":"1-2 sentence precise restatement naming the exact entities","analyticalTask":' +
            '"the quantitative analysis the user ultimately wants, e.g. regress vote margin on ballot position; correlate endorsement count with results","queries":["6 specific source-targeted search queries"]}.',
        },
        { role: 'user', content: question },
      ],
    });
    const p = JSON.parse(r?.choices?.[0]?.message?.content || '{}');
    return {
      brief: String(p.brief || question),
      analyticalTask: String(p.analyticalTask || ''),
      queries: Array.isArray(p.queries) ? p.queries.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 6) : [],
    };
  } catch {
    return { brief: question, analyticalTask: '', queries: [question] };
  }
}

// After round 1, identify concrete gaps and produce targeted follow-up queries.
async function followUpQueries(
  question: string,
  brief: string,
  analyticalTask: string,
  dossier: string
): Promise<string[]> {
  try {
    const r: any = await getClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are reviewing first-round research findings to plan a SECOND, deeper round. ' +
            'Identify the concrete gaps that still block the analytical task: which specific entities (races, counties, ' +
            'candidates discovered in round 1) still lack hard numbers — vote totals, margins, ballot positions, or ' +
            'endorsement counts — and which primary sources (county clerk canvass pages, official result PDFs) have not ' +
            'yet been pulled. Produce up to 5 HIGHLY SPECIFIC follow-up search queries that NAME the exact races/counties/' +
            'candidates from round 1, to retrieve the missing numbers from primary sources. ' +
            'Return ONLY JSON: {"queries":["..."]}. If nothing material is missing, return {"queries":[]}.',
        },
        { role: 'user', content: `QUESTION: ${question}\nBRIEF: ${brief}\nANALYTICAL TASK: ${analyticalTask}\n\nROUND-1 FINDINGS:\n${dossier.slice(0, 11000)}` },
      ],
    });
    const p = JSON.parse(r?.choices?.[0]?.message?.content || '{}');
    return Array.isArray(p.queries) ? p.queries.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 5) : [];
  } catch {
    return [];
  }
}

/**
 * Deep research agent: precise planning → round-1 web search → gap analysis →
 * round-2 targeted search → quantitative analytical synthesis with explicit
 * confidence/verifiability per finding. Uses only OPENAI_API_KEY (gpt-4o for
 * planning + synthesis, gpt-4o-search-preview for live web search).
 *
 * onStep streams human-readable progress so the UI shows the live research path.
 */
export async function deepResearch(opts: {
  question: string;
  systemContext?: string;
  onStep?: (step: string) => void;
  maxSubQuestions?: number;
}): Promise<DeepResearchResult> {
  const emit = (s: string) => { try { opts.onStep?.(s); } catch { /* ignore */ } };

  // Search guidance pushed into every web search: primary sources + hard numbers.
  const searchCtx = [
    opts.systemContext || '',
    'When searching, pull CONCRETE numbers and facts from PRIMARY/official sources where possible',
    '(county clerk offices, Secretary of State, official canvass/results). Report exact figures',
    '(vote totals, margins, ballot positions, endorsement counts) and name the source for each.',
  ].filter(Boolean).join(' ');

  // 1) PLAN
  emit('🧭 Planning the investigation — identifying the exact entities and the analysis required…');
  const plan = await planResearch(opts.question, opts.systemContext);
  if (plan.brief) emit(`🎯 Focus: ${plan.brief}`);
  if (plan.analyticalTask) emit(`📐 Analysis goal: ${plan.analyticalTask}`);
  const round1Queries = plan.queries.length ? plan.queries : [opts.question];

  // 2) ROUND 1 — broad primary-source gathering
  emit(`🔎 Round 1 — searching ${round1Queries.length} angles for primary-source facts…`);
  round1Queries.forEach((q) => emit(`• ${q}`));
  const round1 = await runSearches(round1Queries, searchCtx, emit);

  // 3) GAP ANALYSIS → ROUND 2 — chase the specific missing numbers
  let findings: Finding[] = [...round1];
  emit('🧩 Reviewing findings and identifying gaps for a deeper second pass…');
  const followups = await followUpQueries(opts.question, plan.brief, plan.analyticalTask, findingsDossier(round1));
  if (followups.length) {
    emit(`🔎 Round 2 — chasing ${followups.length} specifics (named races, clerk results, endorsement counts)…`);
    followups.forEach((q) => emit(`• ${q}`));
    findings = [...findings, ...await runSearches(followups, searchCtx, emit)];
  }

  // De-duplicate citations across all rounds.
  const seen = new Set<string>();
  const citations: WebCitation[] = [];
  for (const f of findings) for (const c of f.citations) {
    if (!seen.has(c.url)) { seen.add(c.url); citations.push(c); }
  }

  // 4) ANALYTICAL SYNTHESIS — reason over the data, do the requested analysis, rate confidence
  emit('🧠 Analyzing the gathered data and writing the report (with confidence ratings)…');
  const dossier = findingsDossier(findings);
  const sourceList = citations.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n');

  let report = '';
  try {
    const synth: any = await getClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior quantitative research analyst writing a rigorous, decision-grade report. ' +
            'Ground EVERYTHING strictly in the provided findings — never invent facts, numbers, or sources. ' +
            'Be precise and specific to the exact jurisdiction/race/cycle named. Use markdown with these sections:\n' +
            '1. **Executive Summary** — the direct answer with the key numbers.\n' +
            '2. **Method & Sources** — what was searched and which sources are primary (official) vs secondary.\n' +
            '3. **Findings** — for each sub-question, give the concrete data points (specific races, vote totals, margins, ' +
            'ballot positions, endorsement counts) — use a markdown TABLE when there are multiple entities — with inline [n] citations.\n' +
            '4. **Analysis** — perform the requested analytical task by reasoning over the ACTUAL numbers found: describe the ' +
            'relationship (e.g. ballot position vs vote margin; endorsement count vs result), its DIRECTION and approximate ' +
            'MAGNITUDE, and which factor appears more associated with results. If the data is too sparse to regress, say so explicitly and show what you can.\n' +
            '5. **Confidence & Verifiability** — rate EACH key finding High / Medium / Low and explain why (official primary ' +
            'source vs single news mention vs inferred), the sample size / N where relevant, and what additional data would raise confidence.\n' +
            '6. **Limitations & Next Steps**.\n' +
            'Cite sources inline as [n] matching the numbered list. If a needed number was not found, state that plainly rather than guessing.',
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION:\n${opts.question}\n\nBRIEF: ${plan.brief}\nANALYTICAL TASK: ${plan.analyticalTask}\n\nALL FINDINGS:\n${dossier}\n\nNUMBERED SOURCES:\n${sourceList}`,
        },
      ],
    });
    report = (synth?.choices?.[0]?.message?.content || '').trim();
  } catch {
    report = dossier;
  }

  const content = citations.length
    ? `${report}\n\n## Sources\n${citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n')}`
    : report;

  emit('✅ Research complete.');
  return { content, citations, subQuestions: round1Queries.concat(followups) };
}
