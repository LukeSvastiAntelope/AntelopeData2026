/**
 * Aggregate-only guard for shareable chart cards (server + client).
 * Blocks posting when plotted source columns look identifying.
 */

const IDENTIFYING_COLUMN_PATTERNS: RegExp[] = [
  /^name$/i,
  /first[_\s-]?name/i,
  /last[_\s-]?name/i,
  /full[_\s-]?name/i,
  /email/i,
  /e-?mail/i,
  /phone/i,
  /mobile/i,
  /cell[_\s-]?phone/i,
  /address/i,
  /street/i,
  /zip[_\s-]?code/i,
  /postal/i,
  /\bssn\b/i,
  /social[_\s-]?security/i,
  /voter[_\s-]?id/i,
  /person[_\s-]?id/i,
  /respondent[_\s-]?id/i,
  /agent[_\s-]?token/i,
  /date[_\s-]?of[_\s-]?birth/i,
  /\bdob\b/i,
  /birth[_\s-]?date/i,
  // Person / CRM identifiers (must not ride along on shareable cards)
  /^id$/i,
  /\bvan[_\s-]?id\b/i,
  /\bcontact[_\s-]?id\b/i,
  /\buuid\b/i,
  /\bguid\b/i,
  /\bexternal[_\s-]?id\b/i,
  /\bperson[_\s-]?record[_\s-]?id\b/i,
  /\bhousehold[_\s-]?id\b/i,
  /\bmember[_\s-]?id\b/i,
  /\buser[_\s-]?id\b/i,
  /\baccount[_\s-]?id\b/i,
  /\bcrm[_\s-]?id\b/i,
  /\bvoter[_\s-]?file[_\s-]?id\b/i,
  /\bstate[_\s-]?id\b/i,
  /\bdriver.?s?[_\s-]?license/i,
];

export function findIdentifyingColumns(columns: string[]): string[] {
  const hits: string[] = [];
  for (const col of columns) {
    const name = String(col || '').trim();
    if (!name) continue;
    if (IDENTIFYING_COLUMN_PATTERNS.some((re) => re.test(name))) {
      hits.push(name);
    }
  }
  return hits;
}

export function assertAggregateOnly(columns: string[]): {
  ok: boolean;
  identifying: string[];
  message?: string;
} {
  const identifying = findIdentifyingColumns(columns);
  if (!identifying.length) return { ok: true, identifying: [] };
  return {
    ok: false,
    identifying,
    message: `Shareable cards are aggregate-only. Identifying columns present: ${identifying.join(', ')}. Remove person-level fields before posting.`,
  };
}

/**
 * Columns referenced in plot/step Python (quoted labels) — the plotted frame,
 * not the whole dataset.
 */
export function extractSourceColumnsFromCode(
  code: string | null | undefined,
  availableColumns?: string[] | null
): string[] {
  const src = String(code || '');
  if (!src.trim()) return [];

  const found = new Set<string>();
  const quoteRe = /['"`]([^'"`]{1,128})['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(src))) {
    const token = String(m[1] || '').trim();
    if (!token || token.length > 80) continue;
    // Skip obvious non-column strings
    if (/^(df|data|true|false|none|null)$/i.test(token)) continue;
    if (/[\n\r]/.test(token)) continue;
    found.add(token);
  }

  const available = (availableColumns || [])
    .map((c) => String(c || '').trim())
    .filter(Boolean);
  if (available.length) {
    const availLower = new Map(available.map((c) => [c.toLowerCase(), c]));
    const intersect: string[] = [];
    for (const token of found) {
      const hit = availLower.get(token.toLowerCase());
      if (hit) intersect.push(hit);
    }
    if (intersect.length) return Array.from(new Set(intersect));
  }

  return Array.from(found);
}
