/**
 * Aggregate-only guard for shareable chart cards.
 * Blocks posting when the plotted dataframe contains identifying columns.
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
