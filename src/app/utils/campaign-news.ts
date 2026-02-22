import crypto from 'crypto';
import { openSql } from '@/app/utils/database/db';

interface CampaignTarget {
  state: string;
  districtCode?: string | null;
  candidateName?: string | null;
  organizationName?: string | null;
}

interface SerpNewsResult {
  title?: string;
  link?: string;
  source?: {
    name?: string;
    icon?: string;
  };
  date?: string;
  snippet?: string;
}

export interface CampaignNewsDigestSummary {
  targets: number;
  fetched: number;
  inserted: number;
  deduped: number;
  failed: number;
  errors: string[];
}

export interface CampaignNewsRefreshSummary {
  fetched: number;
  inserted: number;
  deduped: number;
  query: string;
}

export interface CampaignNewsContextPacket {
  scope: {
    state?: string | null;
    districtCode?: string | null;
  };
  retrieval: {
    requestedWindowLabel: string | null;
    appliedWindowLabel: string | null;
    widened: boolean;
  };
  items: Array<{
    title: string;
    source: string;
    publishedAt: string | null;
    summary: string | null;
    relevanceScore: number;
    url: string;
  }>;
}

export interface NewsTimeWindowConfig {
  preset: 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'last_30_days' | 'custom_days';
  days: number;
  label: string;
}

interface NewsContextOptions {
  limit?: number;
  minItems?: number;
  timeWindow?: NewsTimeWindowConfig | null;
}

function toHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeDate(input?: string): string | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
  return null;
}

function buildNewsQuery(target: CampaignTarget): string {
  const terms: string[] = [];
  if (target.candidateName) terms.push(`"${target.candidateName}"`);
  if (target.districtCode) terms.push(`"${target.districtCode}"`);
  terms.push(`"${target.state}" campaign politics election voters`);
  return terms.join(' ');
}

function buildNewsQueryForQuestion(target: CampaignTarget, question: string): string {
  const base = buildNewsQuery(target);
  const normalizedQuestion = (question || '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  if (!normalizedQuestion) return base;
  return `${base} ${normalizedQuestion}`;
}

function computeRelevanceScore(target: CampaignTarget, item: SerpNewsResult): number {
  const haystack = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  let score = 0;
  if (target.candidateName && haystack.includes(target.candidateName.toLowerCase())) score += 4;
  if (target.districtCode && haystack.includes(target.districtCode.toLowerCase())) score += 3;
  if (target.state && haystack.includes(target.state.toLowerCase())) score += 1.5;
  if (/(campaign|election|poll|voter|turnout|fundrais)/.test(haystack)) score += 1.5;
  return Number(score.toFixed(2));
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : '';
    });
}

function cleanText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/\s+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractLikelyArticleText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  const articleMatch = stripped.match(/<article[\s\S]*?<\/article>/i);
  const zone = articleMatch ? articleMatch[0] : stripped;

  const paragraphs: string[] = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pRegex.exec(zone)) !== null) {
    const text = cleanText(match[1].replace(/<[^>]+>/g, ' '));
    if (text.length >= 60) paragraphs.push(text);
    if (paragraphs.join(' ').length > 4000) break;
  }

  if (!paragraphs.length) {
    const bodyText = cleanText(zone.replace(/<[^>]+>/g, ' '));
    return bodyText.slice(0, 3000);
  }
  return paragraphs.join(' ').slice(0, 3000);
}

function summarizeArticleText(text: string): string | null {
  const clean = cleanText(text);
  if (clean.length < 160) return null;
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);
  if (!sentences.length) return clean.slice(0, 420);
  return sentences.slice(0, 4).join(' ').slice(0, 520);
}

async function fetchArticleBrief(url: string): Promise<string | null> {
  const attempt = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Helps reduce bot blocks on some publishers.
          'user-agent':
            'Mozilla/5.0 (compatible; AntelopeCampaignNewsBot/1.0; +https://antelopehq.com)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;
      const html = await res.text();
      const text = extractLikelyArticleText(html);
      return summarizeArticleText(text);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  return Promise.race<string | null>([
    attempt(),
    new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
}

export async function getCampaignNewsTargets(): Promise<CampaignTarget[]> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT DISTINCT UPPER(TRIM(o.state)) AS state,
            o.district_code AS districtCode,
            o.candidate_name AS candidateName,
            o.name AS organizationName
     FROM organizations o
     WHERE o.state IS NOT NULL AND TRIM(o.state) <> ''`
  );
  return rows
    .map((r: any) => ({
      state: (r.state || '').toUpperCase(),
      districtCode: r.districtCode || null,
      candidateName: r.candidateName || null,
      organizationName: r.organizationName || null,
    }))
    .filter((t: CampaignTarget) => /^[A-Z]{2}$/.test(t.state));
}

async function fetchGoogleNewsViaSerpApi(query: string): Promise<SerpNewsResult[]> {
  const key = process.env.SERPAPI_API_KEY || '';
  if (!key) throw new Error('SERPAPI_API_KEY is not set');

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_news');
  url.searchParams.set('api_key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('num', '10');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SERPAPI request failed: ${res.status}`);
  }
  const payload = await res.json();
  return Array.isArray(payload?.news_results) ? payload.news_results : [];
}

async function getCampaignTargetForUser(userId: string): Promise<CampaignTarget | null> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT UPPER(TRIM(o.state)) AS state,
            o.district_code AS districtCode,
            o.candidate_name AS candidateName,
            o.name AS organizationName
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [userId]
  );
  if (!rows?.length || !rows[0]?.state) return null;
  return {
    state: rows[0].state,
    districtCode: rows[0].districtCode || null,
    candidateName: rows[0].candidateName || null,
    organizationName: rows[0].organizationName || null,
  };
}

export async function refreshCampaignNewsForUserScope(
  userId: string,
  question: string,
  options: { maxResults?: number } = {}
): Promise<CampaignNewsRefreshSummary> {
  const target = await getCampaignTargetForUser(userId);
  if (!target) {
    return { fetched: 0, inserted: 0, deduped: 0, query: '' };
  }

  const db = await openSql();
  const query = buildNewsQueryForQuestion(target, question);
  const maxResults = Math.max(5, Math.min(20, Number(options.maxResults) || 12));
  const news = (await fetchGoogleNewsViaSerpApi(query)).slice(0, maxResults);

  let inserted = 0;
  let deduped = 0;

  for (const item of news) {
    const title = (item.title || '').trim();
    const url = (item.link || '').trim();
    if (!title || !url) {
      deduped++;
      continue;
    }

    const itemSummary = (item.snippet || '').trim() || null;
    const titleHash = toHash(title.toLowerCase());
    const urlHash = toHash(url.toLowerCase());
    const relevanceScore = computeRelevanceScore(target, item);
    const sourceName = item.source?.name || 'Unknown source';
    const sourceDomain = (() => {
      try { return new URL(url).hostname; } catch { return null; }
    })();

    const [result]: any = await db.execute(
      `INSERT INTO campaign_news_items
        (title, source, source_domain, url, url_hash, title_hash, published_at, summary, relevance_score, state, district_code, topic_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source = VALUES(source),
         source_domain = VALUES(source_domain),
         summary = CASE
           WHEN VALUES(summary) IS NULL OR VALUES(summary) = '' THEN summary
           ELSE VALUES(summary)
         END,
         relevance_score = GREATEST(relevance_score, VALUES(relevance_score)),
         published_at = COALESCE(VALUES(published_at), published_at),
         district_code = COALESCE(VALUES(district_code), district_code),
         topic_tags = VALUES(topic_tags)`,
      [
        title,
        sourceName,
        sourceDomain,
        url,
        urlHash,
        titleHash,
        normalizeDate(item.date),
        itemSummary,
        relevanceScore,
        target.state,
        target.districtCode || null,
        JSON.stringify(['campaign', 'district-news', 'live-query']),
      ]
    );

    if (result?.affectedRows === 1) inserted++;
    else deduped++;
  }

  return { fetched: news.length, inserted, deduped, query };
}

export async function runCampaignNewsDigest(): Promise<CampaignNewsDigestSummary> {
  const summary: CampaignNewsDigestSummary = {
    targets: 0,
    fetched: 0,
    inserted: 0,
    deduped: 0,
    failed: 0,
    errors: [],
  };

  const targets = await getCampaignNewsTargets();
  summary.targets = targets.length;
  if (!targets.length) return summary;

  const db = await openSql();

  for (const target of targets) {
    try {
      const news = await fetchGoogleNewsViaSerpApi(buildNewsQuery(target));
      summary.fetched += news.length;

      for (const item of news) {
        const title = (item.title || '').trim();
        const url = (item.link || '').trim();
        if (!title || !url) {
          summary.deduped++;
          continue;
        }

        const itemSummary = (item.snippet || '').trim() || null;
        const titleHash = toHash(title.toLowerCase());
        const urlHash = toHash(url.toLowerCase());
        const relevanceScore = computeRelevanceScore(target, item);
        const sourceName = item.source?.name || 'Unknown source';
        const sourceDomain = (() => {
          try { return new URL(url).hostname; } catch { return null; }
        })();

        const [result]: any = await db.execute(
          `INSERT INTO campaign_news_items
            (title, source, source_domain, url, url_hash, title_hash, published_at, summary, relevance_score, state, district_code, topic_tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             source = VALUES(source),
             source_domain = VALUES(source_domain),
             summary = CASE
               WHEN VALUES(summary) IS NULL OR VALUES(summary) = '' THEN summary
               ELSE VALUES(summary)
             END,
             relevance_score = GREATEST(relevance_score, VALUES(relevance_score)),
             published_at = COALESCE(VALUES(published_at), published_at),
             district_code = COALESCE(VALUES(district_code), district_code),
             topic_tags = VALUES(topic_tags)`,
          [
            title,
            sourceName,
            sourceDomain,
            url,
            urlHash,
            titleHash,
            normalizeDate(item.date),
            itemSummary,
            relevanceScore,
            target.state,
            target.districtCode || null,
            JSON.stringify(['campaign', 'district-news']),
          ]
        );

        // mysql affectedRows: 1 insert, 2 update
        if (result?.affectedRows === 1) summary.inserted++;
        else summary.deduped++;
      }
    } catch (error) {
      summary.failed++;
      summary.errors.push(`${target.state}${target.districtCode ? `/${target.districtCode}` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return summary;
}

export async function getUserCampaignScope(userId: string): Promise<{ state: string | null; districtCode: string | null }> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT UPPER(TRIM(o.state)) AS state, o.district_code AS districtCode
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) return { state: null, districtCode: null };
  return {
    state: rows[0].state || null,
    districtCode: rows[0].districtCode || null,
  };
}

export async function getCampaignNewsContextForUser(
  userId: string,
  optionsOrLimit: number | NewsContextOptions = 5
): Promise<CampaignNewsContextPacket> {
  const scope = await getUserCampaignScope(userId);
  if (!scope.state) {
    return {
      scope,
      retrieval: {
        requestedWindowLabel: null,
        appliedWindowLabel: null,
        widened: false,
      },
      items: [],
    };
  }

  const options: NewsContextOptions =
    typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : (optionsOrLimit || {});
  const safeLimit = Math.max(1, Math.min(10, Number(options.limit) || 5));
  const minimumResults = Math.max(1, Math.min(5, Number(options.minItems) || 3));

  const db = await openSql();
  const fetchRows = async (windowStartIso: string | null) => {
    const params: any[] = [scope.state];
    let districtSql = '';
    if (scope.districtCode) {
      districtSql = ' OR district_code = ?';
      params.push(scope.districtCode);
    }
    let timeSql = '';
    if (windowStartIso) {
      timeSql = ' AND COALESCE(published_at, ingested_at) >= ?';
      params.push(windowStartIso);
    }

    const [rows]: any = await db.execute(
      `SELECT id, title, source, url, published_at, summary, relevance_score, COALESCE(published_at, ingested_at) AS effective_ts
       FROM campaign_news_items
       WHERE (state = ?${districtSql})${timeSql}
       ORDER BY COALESCE(published_at, ingested_at) DESC
       LIMIT 50`,
      params
    );
    return rows as any[];
  };

  const now = Date.now();
  const requestedWindow = options.timeWindow || null;
  const requestedStartIso = requestedWindow
    ? new Date(now - requestedWindow.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    : null;

  let appliedWindowLabel: string | null = requestedWindow?.label || null;
  let widened = false;
  let rows = await fetchRows(requestedStartIso);

  if (requestedWindow && rows.length < minimumResults) {
    const widenedDays = Math.min(30, Math.max(requestedWindow.days + 3, requestedWindow.days * 2));
    if (widenedDays > requestedWindow.days) {
      const widenedStartIso = new Date(now - widenedDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const widenedRows = await fetchRows(widenedStartIso);
      if (widenedRows.length > rows.length) {
        rows = widenedRows;
        widened = true;
        appliedWindowLabel = `last ${widenedDays} days`;
      }
    }
  }

  const normalizeTitleForDedupe = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|a|an|for|in|on|and|of|to|with|after|before|results|live|updated)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const scored = rows
    .map((r: any) => {
      const effectiveTs = r.effective_ts ? new Date(r.effective_ts).getTime() : now;
      const ageDays = Math.max(0, (now - effectiveTs) / (24 * 60 * 60 * 1000));
      const recencyScore = Math.exp(-ageDays / 4); // Half-life-ish around 3 days.
      const relevanceNormalized = Math.min(1, Math.max(0, Number(r.relevance_score || 0) / 10));
      const finalScore = Number((0.65 * relevanceNormalized + 0.35 * recencyScore).toFixed(4));
      const sourceDomain = (() => {
        try {
          return new URL(r.url).hostname.replace(/^www\./, '');
        } catch {
          return 'unknown';
        }
      })();
      const dedupeKey = `${normalizeTitleForDedupe(String(r.title || '')).slice(0, 90)}|${sourceDomain}`;
      return {
        ...r,
        finalScore,
        effectiveTs,
        dedupeKey,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore || b.effectiveTs - a.effectiveTs);

  const uniqueRows: any[] = [];
  const seenKeys = new Set<string>();
  for (const row of scored) {
    if (seenKeys.has(row.dedupeKey)) continue;
    seenKeys.add(row.dedupeKey);
    uniqueRows.push(row);
    if (uniqueRows.length >= safeLimit) break;
  }

  // Enrich with article-level briefs when summary is missing/too short.
  // Keep bounded to avoid slow responses.
  const enrichable = uniqueRows
    .filter((r: any) => !r.summary || String(r.summary).trim().length < 140)
    .slice(0, 2);

  await Promise.all(
    enrichable.map(async (row: any) => {
      const brief = await fetchArticleBrief(row.url);
      if (!brief) return;
      row.summary = brief;
      try {
        await db.execute(
          `UPDATE campaign_news_items
           SET summary = CASE
             WHEN summary IS NULL OR CHAR_LENGTH(TRIM(summary)) < 140 THEN ?
             ELSE summary
           END
           WHERE id = ?`,
          [brief, row.id]
        );
      } catch {
        // Non-fatal: keep transiently enriched summary for current request.
      }
    })
  );

  return {
    scope,
    retrieval: {
      requestedWindowLabel: requestedWindow?.label || null,
      appliedWindowLabel,
      widened,
    },
    items: uniqueRows.map((r: any) => ({
      title: r.title,
      source: r.source || 'Unknown source',
      url: r.url,
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
      summary: r.summary || null,
      relevanceScore: Number(r.finalScore),
    })),
  };
}
