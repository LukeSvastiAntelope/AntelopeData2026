/**
 * Client/server helpers to pull p-value + test name from analysis text / figure metadata.
 * Used so to-content can send real stats — never invent significance from keywords.
 */

const TEST_NAME_PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /\bchi[-\s]?square\b|\bχ\s*²\b|\bchisq\b/i, name: 'chi-square' },
  { re: /\bwilcoxon\b/i, name: 'wilcoxon' },
  { re: /\bmann[-\s]?whitney\b/i, name: 'mann-whitney' },
  { re: /\bfisher(?:'s)?\s+exact\b/i, name: "fisher's exact" },
  { re: /\banova\b|\bkruskal[-\s]?wallis\b/i, name: 'anova' },
  { re: /\bwelch(?:'s)?\s+t(?:-|\s)?test\b|\btwo[-\s]?sample\s+t(?:-|\s)?test\b|\bt(?:-|\s)?test\b/i, name: 't-test' },
  { re: /\bz(?:-|\s)?test\b|\btwo[-\s]?proportion\b/i, name: 'z-test' },
  { re: /\bpearson\b.*\bcorr|\bcorrelation\b.*\bp\b/i, name: 'correlation' },
  { re: /\blogistic\s+regression\b|\blogit\b/i, name: 'logistic regression' },
];

const P_VALUE_RE =
  /(?:p(?:\s*[-_]?\s*value)?|pcorr(?:ected)?|p_adj|padj|q(?:\s*[-_]?\s*value)?)\s*(?:[=≈:~]|<|>|≤|≥)\s*(?:([0-9]*\.?[0-9]+)\s*[x×]\s*10\s*\^\s*(-?\d+)|([0-9]*\.?[0-9]+(?:e[+-]?\d+)?))/gi;

export type FindingStats = {
  pValue: number | null;
  testName: string | null;
};

function parseSci(mantissa: string, exp: string): number {
  return Number(mantissa) * Math.pow(10, Number(exp));
}

/** Extract the smallest finite p in (0, 1] from free text. */
export function extractPValueFromText(text: string): number | null {
  if (!text) return null;
  let best: number | null = null;
  P_VALUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = P_VALUE_RE.exec(text)) !== null) {
    const raw =
      m[1] != null && m[2] != null ? parseSci(m[1], m[2]) : Number(m[3]);
    if (!Number.isFinite(raw) || raw <= 0 || raw > 1) continue;
    if (best == null || raw < best) best = raw;
  }
  return best;
}

export function extractTestNameFromText(text: string): string | null {
  if (!text) return null;
  for (const { re, name } of TEST_NAME_PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}

export function extractFindingStats(text: string): FindingStats {
  return {
    pValue: extractPValueFromText(text),
    testName: extractTestNameFromText(text),
  };
}

/** Prefer explicit metadata; fall back to parsing caption / synthesis. */
export function coalesceFindingStats(parts: Array<{
  pValue?: number | null;
  testName?: string | null;
  text?: string | null;
}>): FindingStats {
  let pValue: number | null = null;
  let testName: string | null = null;
  for (const part of parts) {
    if (
      pValue == null &&
      part.pValue != null &&
      Number.isFinite(part.pValue) &&
      part.pValue > 0 &&
      part.pValue <= 1
    ) {
      pValue = Number(part.pValue);
    }
    if (!testName && part.testName && String(part.testName).trim()) {
      testName = String(part.testName).trim().slice(0, 80);
    }
  }
  for (const part of parts) {
    if (!part.text) continue;
    const parsed = extractFindingStats(part.text);
    if (pValue == null && parsed.pValue != null) pValue = parsed.pValue;
    if (!testName && parsed.testName) testName = parsed.testName;
  }
  return { pValue, testName };
}
