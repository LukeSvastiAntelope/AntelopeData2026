/**
 * Guardrails for Spread video (generate + clip).
 * - Reference conditioning must stay on the candidate's own assets.
 * - Block prompts that ask to generate/animate other real public figures.
 * - Surface AI disclosure at the post step.
 */

const PUBLIC_FIGURE_PATTERNS: RegExp[] = [
  /\b(president|senator|governor|mayor)\s+[A-Z][a-z]+/i,
  /\b(trump|biden|obama|harris|clinton|desantis|newsom|musk|putin|zelensky)\b/i,
  /\banimate\b.{0,40}\b(opponent|rival|senator|governor|president)\b/i,
  /\b(deepfake|impersonat(e|ing)|face.?swap)\b/i,
  /\bmake\s+(him|her|them)\s+say\b/i,
  /\busing\s+(his|her|their)\s+(face|likeness|voice)\b/i,
];

export type GuardrailResult = {
  ok: boolean;
  reason?: string;
};

/**
 * Reject generation/clipping briefs that appear to target other real people.
 * Own-candidate photos/footage are fine — callers should not pass opponent assets.
 */
export function assertOwnAssetUse(params: {
  prompt?: string | null;
  caption?: string | null;
  mode?: string | null;
}): GuardrailResult {
  const text = [params.prompt, params.caption].filter(Boolean).join('\n');
  if (!text.trim()) return { ok: true };
  for (const re of PUBLIC_FIGURE_PATTERNS) {
    if (re.test(text)) {
      return {
        ok: false,
        reason:
          'Blocked: generating or animating other real public figures / opponents is not allowed (deepfake & impersonation risk). Use only your own photos, footage, or clearly synthetic scenes.',
      };
    }
  }
  return { ok: true };
}

export const AI_DISCLOSURE_DEFAULT =
  'This video includes AI-generated or AI-edited content.';

/** Append disclosure to a caption when the candidate opts in (or jurisdiction requires it). */
export function applyAiDisclosure(params: {
  caption: string;
  includeDisclosure: boolean;
  disclosureText?: string;
}): string {
  const caption = String(params.caption || '').trim();
  if (!params.includeDisclosure) return caption;
  const disclosure = String(
    params.disclosureText || AI_DISCLOSURE_DEFAULT
  ).trim();
  if (!disclosure) return caption;
  if (caption.toLowerCase().includes('ai-generated') || caption.includes(disclosure)) {
    return caption;
  }
  return caption ? `${caption}\n\n${disclosure}` : disclosure;
}
