/**
 * Live web search via SerpAPI + Anthropic gateway for planning/synthesis.
 *
 * Search uses SERPAPI_API_KEY (google / google_news). LLM steps go through
 * ai-service tiers — no OpenAI.
 */

import { createCompletion } from '@/app/utils/services/ai-service';

export interface WebCitation {
  title: string;
  url: string;
}

export interface WebSearchResult {
  content: string;
  citations: WebCitation[];
}

async function serpSearch(query: string): Promise<WebCitation[]> {
  const key = process.env.SERPAPI_API_KEY || '';
  if (!key) {
    throw new Error('SERPAPI_API_KEY is not set');
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('api_key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('num', '8');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SERPAPI request failed: ${res.status}`);
  }
  const payload = await res.json();
  const organic: any[] = Array.isArray(payload?.organic_results)
    ? payload.organic_results
    : [];
  const news: any[] = Array.isArray(payload?.news_results)
    ? payload.news_results
    : [];

  const citations: WebCitation[] = [];
  const seen = new Set<string>();
  for (const r of [...organic, ...news]) {
    const link = String(r?.link || r?.url || '').trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    citations.push({
      title: String(r?.title || link).trim(),
      url: link,
    });
    if (citations.length >= 8) break;
  }
  return citations;
}

export async function webSearchAnswer(opts: {
  question: string;
  systemContext?: string;
  model?: string;
}): Promise<WebSearchResult> {
  const citations = await serpSearch(opts.question);
  const sourceBlock = citations
    .map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`)
    .join('\n');

  const completion = await createCompletion({
    tier: 'workhorse',
    maxTokens: 2400,
    messages: [
      {
        role: 'system',
        content:
          (opts.systemContext ? `${opts.systemContext}\n\n` : '') +
          'Answer using ONLY the numbered web sources below. Cite inline as [n]. ' +
          'If sources are insufficient, say what is missing. Do not invent URLs.',
      },
      {
        role: 'user',
        content: `QUESTION:\n${opts.question}\n\nSOURCES:\n${sourceBlock || '(no results)'}`,
      },
    ],
  });

  return {
    content: (completion.content || '').trim(),
    citations,
  };
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
  return findings
    .map((f, i) => `### Finding ${i + 1} — query: ${f.q}\n${f.content || '(no results)'}`)
    .join('\n\n');
}

async function planResearch(
  question: string,
  systemContext?: string
): Promise<{ brief: string; analyticalTask: string; queries: string[] }> {
  try {
    const r = await createCompletion({
      tier: 'heavy',
      maxTokens: 800,
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous research lead planning a DEEP, multi-step web investigation. ' +
            'Read the user question and extract the SPECIFIC entities it concerns: jurisdiction (state/county), the exact ' +
            'election or cycle, the precise variables and the relationship being tested, and the time frame. ' +
            'Design a FIRST round of web searches that gather concrete, verifiable facts and NUMBERS. ' +
            (systemContext ? `\nContext: ${systemContext}\n` : '') +
            'Return ONLY JSON: {"brief":"1-2 sentence precise restatement naming the exact entities","analyticalTask":' +
            '"the quantitative analysis the user ultimately wants","queries":["6 specific source-targeted search queries"]}.',
        },
        { role: 'user', content: question },
      ],
    });
    const raw = (r.content || '{}').replace(/```json\n?|\n?```/g, '').trim();
    const p = JSON.parse(raw);
    return {
      brief: String(p.brief || question),
      analyticalTask: String(p.analyticalTask || ''),
      queries: Array.isArray(p.queries)
        ? p.queries.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 6)
        : [],
    };
  } catch {
    return { brief: question, analyticalTask: '', queries: [question] };
  }
}

async function followUpQueries(
  question: string,
  brief: string,
  analyticalTask: string,
  dossier: string
): Promise<string[]> {
  try {
    const r = await createCompletion({
      tier: 'workhorse',
      maxTokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'You are reviewing first-round research findings to plan a SECOND, deeper round. ' +
            'Identify concrete gaps that still block the analytical task and produce up to 5 HIGHLY SPECIFIC follow-up search queries. ' +
            'Return ONLY JSON: {"queries":["..."]}. If nothing material is missing, return {"queries":[]}.',
        },
        {
          role: 'user',
          content: `QUESTION: ${question}\nBRIEF: ${brief}\nANALYTICAL TASK: ${analyticalTask}\n\nROUND-1 FINDINGS:\n${dossier.slice(0, 11000)}`,
        },
      ],
    });
    const raw = (r.content || '{}').replace(/```json\n?|\n?```/g, '').trim();
    const p = JSON.parse(raw);
    return Array.isArray(p.queries)
      ? p.queries.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

/**
 * Deep research: plan → SerpAPI round-1 → gap analysis → round-2 → synthesis.
 * LLM steps use Anthropic gateway tiers; search uses SERPAPI_API_KEY.
 */
export async function deepResearch(opts: {
  question: string;
  systemContext?: string;
  onStep?: (step: string) => void;
  maxSubQuestions?: number;
}): Promise<DeepResearchResult> {
  const emit = (s: string) => {
    try {
      opts.onStep?.(s);
    } catch {
      /* ignore */
    }
  };

  const searchCtx = [
    opts.systemContext || '',
    'When searching, pull CONCRETE numbers and facts from PRIMARY/official sources where possible',
    '(county clerk offices, Secretary of State, official canvass/results). Report exact figures',
    '(vote totals, margins, ballot positions, endorsement counts) and name the source for each.',
  ]
    .filter(Boolean)
    .join(' ');

  emit('🧭 Planning the investigation — identifying the exact entities and the analysis required…');
  const plan = await planResearch(opts.question, opts.systemContext);
  if (plan.brief) emit(`🎯 Focus: ${plan.brief}`);
  if (plan.analyticalTask) emit(`📐 Analysis goal: ${plan.analyticalTask}`);
  const round1Queries = plan.queries.length ? plan.queries : [opts.question];

  emit(`🔎 Round 1 — searching ${round1Queries.length} angles for primary-source facts…`);
  round1Queries.forEach((q) => emit(`• ${q}`));
  const round1 = await runSearches(round1Queries, searchCtx, emit);

  let findings: Finding[] = [...round1];
  emit('🧩 Reviewing findings and identifying gaps for a deeper second pass…');
  const followups = await followUpQueries(
    opts.question,
    plan.brief,
    plan.analyticalTask,
    findingsDossier(round1)
  );
  if (followups.length) {
    emit(
      `🔎 Round 2 — chasing ${followups.length} specifics (named races, clerk results, endorsement counts)…`
    );
    followups.forEach((q) => emit(`• ${q}`));
    findings = [...findings, ...(await runSearches(followups, searchCtx, emit))];
  }

  const seen = new Set<string>();
  const citations: WebCitation[] = [];
  for (const f of findings)
    for (const c of f.citations) {
      if (!seen.has(c.url)) {
        seen.add(c.url);
        citations.push(c);
      }
    }

  emit('🧠 Analyzing the gathered data and writing the report (with confidence ratings)…');
  const dossier = findingsDossier(findings);
  const sourceList = citations.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n');

  let report = '';
  try {
    const synth = await createCompletion({
      tier: 'heavy',
      maxTokens: 3000,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior quantitative research analyst writing a rigorous, decision-grade report. ' +
            'Ground EVERYTHING strictly in the provided findings — never invent facts, numbers, or sources. ' +
            'Be precise and specific to the exact jurisdiction/race/cycle named. Use markdown with these sections:\n' +
            '1. **Executive Summary** — the direct answer with the key numbers.\n' +
            '2. **Method & Sources** — what was searched and which sources are primary (official) vs secondary.\n' +
            '3. **Findings** — concrete data points with inline [n] citations; use tables when helpful.\n' +
            '4. **Analysis** — perform the requested analytical task over the ACTUAL numbers found.\n' +
            '5. **Confidence & Verifiability** — rate EACH key finding High / Medium / Low.\n' +
            '6. **Limitations & Next Steps**.\n' +
            'Cite sources inline as [n]. If a needed number was not found, state that plainly.',
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION:\n${opts.question}\n\nBRIEF: ${plan.brief}\nANALYTICAL TASK: ${plan.analyticalTask}\n\nALL FINDINGS:\n${dossier}\n\nNUMBERED SOURCES:\n${sourceList}`,
        },
      ],
    });
    report = (synth.content || '').trim();
  } catch {
    report = dossier;
  }

  const content = citations.length
    ? `${report}\n\n## Sources\n${citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n')}`
    : report;

  emit('✅ Research complete.');
  return { content, citations, subQuestions: round1Queries.concat(followups) };
}
