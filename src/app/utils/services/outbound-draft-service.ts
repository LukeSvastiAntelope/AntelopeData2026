/**
 * MT2 — Tailored outbound draft generation.
 *
 * Tailoring inputs = segment observed attributes + survey-stated issue
 * positions from #2. Never invent a position the segment did not state.
 * Message tailoring only — not who/when to send (propensity quarantine).
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import {
  resolveVoterSegment,
  type ResolvedVoterSegment,
  type VoterSegmentDefinition,
} from '@/app/utils/services/voter-segments';

export type OutboundFormat = 'letter' | 'email' | 'sms' | 'ad_copy';

export const OUTBOUND_FORMATS: OutboundFormat[] = [
  'letter',
  'email',
  'sms',
  'ad_copy',
];

export type StatedIssuePosition = {
  label: string;
  key: string;
  value: string;
  /** How many voters in the resolved set share this current value */
  count: number;
  /** Optional change summary when available */
  changeSummary?: string | null;
};

export type SegmentTailoringContext = {
  segmentId: string;
  segmentName: string;
  segmentSource: 'preset' | 'saved';
  voterCount: number;
  /** Collation / map facts (gender, age, homeowner, …) — not issue positions */
  observedAttributes: string[];
  /** Only survey-stated issue positions aggregated from the live set */
  statedPositions: StatedIssuePosition[];
  definition: VoterSegmentDefinition;
  disclaimer: string;
};

export type OutboundDraft = {
  format: OutboundFormat;
  title: string;
  body: string;
  /** Which stated positions grounded this draft (empty if none known) */
  groundedIn: Array<{ label: string; value: string }>;
  /** True when we refused to invent issue claims */
  honest: boolean;
};

export type DraftOutboundResult = {
  context: SegmentTailoringContext;
  drafts: OutboundDraft[];
  modelUsed: string | null;
  usedFallback: boolean;
};

const TAILORING_DISCLAIMER =
  'Drafts tailored to observed segment attributes and survey-stated positions only. Not a persuasion score; send still requires loop + approval.';

function formatLabel(f: OutboundFormat): string {
  switch (f) {
    case 'letter':
      return 'Letter';
    case 'email':
      return 'Email';
    case 'sms':
      return 'SMS';
    case 'ad_copy':
      return 'Ad copy';
  }
}

function lengthGuidance(f: OutboundFormat): string {
  switch (f) {
    case 'sms':
      return 'Max ~320 characters. One short message, no subject.';
    case 'email':
      return 'Include a subject line as first line "Subject: …". Body under ~180 words.';
    case 'letter':
      return 'One page max (~350 words). Formal but warm. Include greeting and sign-off placeholders.';
    case 'ad_copy':
      return 'Headline + 1–2 short body lines + CTA. Under 90 words total.';
  }
}

/**
 * Aggregate survey-stated issue positions across the live segment set.
 * Only issue-category attributes with a non-empty current value count.
 */
export function aggregateStatedPositions(
  resolved: ResolvedVoterSegment
): StatedIssuePosition[] {
  const bag = new Map<
    string,
    { label: string; key: string; value: string; count: number; changeSummary?: string | null }
  >();

  const NON_ISSUE = new Set([
    'donation:status',
    'partisanship:confirmed',
    'engagement:contactability',
    'survey:last_participation',
  ]);

  for (const hit of resolved.people) {
    const fromState = hit.state?.issuePositions || [];
    const fromMatched = (hit.matchedAttributes || []).filter(
      (a) =>
        a.category === 'issue' ||
        String(a.key || '').startsWith('issue:') ||
        (!NON_ISSUE.has(a.key) &&
          !a.category &&
          String(a.key || '').startsWith('issue:'))
    );
    // Prefer full issue rollup from state; fall back to matched issue attrs
    const attrs = fromState.length ? fromState : fromMatched;

    for (const a of attrs) {
      if (!a.current) continue;
      if (NON_ISSUE.has(a.key)) continue;
      if (a.category && a.category !== 'issue') continue;
      const k = `${a.key}::${String(a.current).toLowerCase()}`;
      const prev = bag.get(k);
      if (prev) {
        prev.count += 1;
      } else {
        bag.set(k, {
          label: a.label,
          key: a.key,
          value: String(a.current),
          count: 1,
          changeSummary: a.changeSummary,
        });
      }
    }
  }

  return [...bag.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function observedAttributeLines(
  definition: VoterSegmentDefinition,
  resolved: ResolvedVoterSegment
): string[] {
  const lines: string[] = [];
  if (definition.gender?.length) {
    lines.push(`Gender filter: ${definition.gender.join(', ')}`);
  }
  if (definition.minAgeYears != null) {
    lines.push(`Age: ${definition.minAgeYears}+`);
  } else if (definition.ageBucket?.length) {
    lines.push(`Age buckets: ${definition.ageBucket.join(', ')}`);
  }
  if (definition.ownerOccupied === true) lines.push('Homeowners');
  if (definition.ownerOccupied === false) lines.push('Non-owner-occupied');
  if (definition.party?.length) lines.push(`Party lean (file/canvass): ${definition.party.join(', ')}`);
  if (definition.hasDonated) lines.push('Has observed donation/list capture event');
  if (definition.zip?.length) lines.push(`ZIP: ${definition.zip.join(', ')}`);
  if (definition.district?.length) lines.push(`District: ${definition.district.join(', ')}`);
  lines.push(`Live membership: ${resolved.count} voter${resolved.count === 1 ? '' : 's'}`);
  return lines;
}

export function buildTailoringContext(
  resolved: ResolvedVoterSegment
): SegmentTailoringContext {
  return {
    segmentId: resolved.id,
    segmentName: resolved.name,
    segmentSource: resolved.source,
    voterCount: resolved.count,
    observedAttributes: observedAttributeLines(resolved.definition, resolved),
    statedPositions: aggregateStatedPositions(resolved),
    definition: resolved.definition,
    disclaimer: TAILORING_DISCLAIMER,
  };
}

function pickModel(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return 'claude-sonnet-4-6';
  if (process.env.OPENAI_API_KEY) return 'gpt-4o';
  return null;
}

/** Deterministic drafts when LLM unavailable — still honest about known vs unknown. */
export function fallbackDrafts(
  ctx: SegmentTailoringContext,
  formats: OutboundFormat[]
): OutboundDraft[] {
  const who = ctx.observedAttributes.filter((l) => !l.startsWith('Live membership')).join('; ') ||
    ctx.segmentName;
  const top = ctx.statedPositions[0];
  const groundedIn = top
    ? [{ label: top.label, value: top.value }]
    : [];

  return formats.map((format) => {
    let body: string;
    if (top) {
      const issueLine = `You told us ${top.label.toLowerCase()} is “${top.value}.”`;
      switch (format) {
        case 'sms':
          body = `${issueLine} Here’s how we’re addressing it — reply YES for details.`;
          break;
        case 'email':
          body = [
            `Subject: On ${top.label.toLowerCase()}`,
            ``,
            `Hello,`,
            ``,
            `${issueLine} This note is for neighbors who shared that view — we are not guessing.`,
            ``,
            `We’ll keep you posted on concrete next steps. Thank you for taking the time to tell us.`,
            ``,
            `— The campaign`,
          ].join('\n');
          break;
        case 'ad_copy':
          body = [
            `Headline: You said ${top.label.toLowerCase()} matters`,
            `Body: For neighbors who called it “${top.value}” — here’s our plan. No invented concerns.`,
            `CTA: Learn more`,
          ].join('\n');
          break;
        case 'letter':
        default:
          body = [
            `Dear Neighbor,`,
            ``,
            `${issueLine}`,
            ``,
            `I’m writing specifically to people in “${ctx.segmentName}” (${who || 'observed attributes'}) who shared that position on our survey — not because a model guessed your views.`,
            ``,
            `If you’d like a deeper briefing, reply or visit our site. Grateful for your voice.`,
            ``,
            `Sincerely,`,
            `[Candidate name]`,
          ].join('\n');
          break;
      }
    } else {
      const known = who || 'your community';
      const caveat =
        'We do not have a survey-stated issue position for this segment yet, so this draft only uses known demographic/map attributes — it does not invent an issue concern.';
      switch (format) {
        case 'sms':
          body = `Quick note for ${known}: thanks for being part of this conversation. More soon.`;
          break;
        case 'email':
          body = [
            `Subject: Staying in touch`,
            ``,
            `Hello,`,
            ``,
            `${caveat}`,
            ``,
            `We’ll follow up when we have something concrete to share.`,
            ``,
            `— The campaign`,
          ].join('\n');
          break;
        case 'ad_copy':
          body = [
            `Headline: For ${known}`,
            `Body: ${caveat}`,
            `CTA: Stay informed`,
          ].join('\n');
          break;
        case 'letter':
        default:
          body = [
            `Dear Neighbor,`,
            ``,
            `${caveat}`,
            ``,
            `This message is for the “${ctx.segmentName}” segment based on observed attributes only.`,
            ``,
            `Sincerely,`,
            `[Candidate name]`,
          ].join('\n');
          break;
      }
    }

    return {
      format,
      title: `${formatLabel(format)} · ${ctx.segmentName}`,
      body,
      groundedIn,
      honest: true,
    };
  });
}

async function llmDrafts(
  ctx: SegmentTailoringContext,
  formats: OutboundFormat[],
  goal: string | null,
  model: string
): Promise<OutboundDraft[]> {
  const statedBlock =
    ctx.statedPositions.length > 0
      ? ctx.statedPositions
          .slice(0, 8)
          .map(
            (p) =>
              `- ${p.label}: “${p.value}” (n=${p.count}${
                p.changeSummary ? `; ${p.changeSummary}` : ''
              })`
          )
          .join('\n')
      : '(none — segment has no survey-stated issue positions)';

  const completion = await createCompletion({
    model,
    temperature: 0.35,
    maxTokens: 2800,
    messages: [
      {
        role: 'system',
        content: `You write campaign outbound drafts tailored to a voter SEGMENT.
Return ONLY valid JSON (no markdown fences):
{"drafts":[{"format":"letter"|"email"|"sms"|"ad_copy","title":string,"body":string,"groundedIn":[{"label":string,"value":string}]}]}

HARD RULES (honest tailoring):
- You may ONLY cite issue concerns that appear in STATED POSITIONS below.
- If STATED POSITIONS is empty, do NOT invent issues, fears, or policy preferences. Tailor only on observed demographic/map attributes and a generic civic tone.
- Never claim "you care about X" unless X is in stated positions.
- Never invent poll numbers, endorsements, or donation amounts.
- Microtargeting = message tailoring for this segment, not who to target.
- Match each requested format's length guidance.`,
      },
      {
        role: 'user',
        content: [
          `Segment: ${ctx.segmentName} (${ctx.segmentId}, ${ctx.segmentSource})`,
          `Voter count (live): ${ctx.voterCount}`,
          `Observed attributes:`,
          ...ctx.observedAttributes.map((l) => `- ${l}`),
          ``,
          `STATED POSITIONS (from surveys — only use these for issue claims):`,
          statedBlock,
          ``,
          goal ? `Campaign goal / CTA framing: ${goal}` : null,
          ``,
          `Formats to produce: ${formats.join(', ')}`,
          ...formats.map((f) => `- ${f}: ${lengthGuidance(f)}`),
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });

  const raw = (completion.content || '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]) as {
    drafts?: Array<{
      format?: string;
      title?: string;
      body?: string;
      groundedIn?: Array<{ label?: string; value?: string }>;
    }>;
  };

  const allowed = new Set(
    ctx.statedPositions.map((p) => `${p.label.toLowerCase()}::${p.value.toLowerCase()}`)
  );

  const out: OutboundDraft[] = [];
  for (const d of parsed.drafts || []) {
    const format = String(d.format || '').toLowerCase() as OutboundFormat;
    if (!OUTBOUND_FORMATS.includes(format)) continue;
    if (!formats.includes(format)) continue;
    const groundedIn = (d.groundedIn || [])
      .map((g) => ({
        label: String(g.label || '').trim(),
        value: String(g.value || '').trim(),
      }))
      .filter((g) => g.label && g.value)
      .filter((g) => {
        if (ctx.statedPositions.length === 0) return false;
        const key = `${g.label.toLowerCase()}::${g.value.toLowerCase()}`;
        // Allow soft match on label alone if value matches any stated for that label
        if (allowed.has(key)) return true;
        return ctx.statedPositions.some(
          (p) =>
            p.label.toLowerCase() === g.label.toLowerCase() &&
            p.value.toLowerCase().includes(g.value.toLowerCase())
        );
      });

    // If model claimed grounding but segment has no stated positions — strip
    const honestGrounded =
      ctx.statedPositions.length === 0 ? [] : groundedIn.length ? groundedIn : [];

    out.push({
      format,
      title: String(d.title || `${formatLabel(format)} · ${ctx.segmentName}`).slice(0, 200),
      body: String(d.body || '').trim().slice(0, format === 'sms' ? 500 : 6000),
      groundedIn: honestGrounded,
      honest: true,
    });
  }

  // Ensure every requested format exists
  const have = new Set(out.map((d) => d.format));
  const missing = formats.filter((f) => !have.has(f));
  if (missing.length) {
    out.push(...fallbackDrafts(ctx, missing));
  }
  return out;
}

export type DraftOutboundOptions = {
  organizationId: number;
  segmentId?: string | null;
  definition?: VoterSegmentDefinition | null;
  formats?: OutboundFormat[];
  goal?: string | null;
  /** Skip LLM — template drafts only (smoke). */
  mock?: boolean;
  limit?: number;
};

/**
 * Resolve segment → build honest tailoring context → draft per format.
 */
export async function draftOutboundForSegment(
  opts: DraftOutboundOptions
): Promise<DraftOutboundResult> {
  const formats = (opts.formats?.length ? opts.formats : OUTBOUND_FORMATS).filter((f) =>
    OUTBOUND_FORMATS.includes(f)
  ) as OutboundFormat[];

  const resolved = await resolveVoterSegment({
    organizationId: opts.organizationId,
    segmentId: opts.segmentId,
    definition: opts.definition || undefined,
    limit: opts.limit ?? 200,
  });

  const context = buildTailoringContext(resolved);
  const model = opts.mock ? null : pickModel();

  if (!model) {
    return {
      context,
      drafts: fallbackDrafts(context, formats),
      modelUsed: null,
      usedFallback: true,
    };
  }

  try {
    const drafts = await llmDrafts(
      context,
      formats,
      opts.goal ? String(opts.goal) : null,
      model
    );
    return { context, drafts, modelUsed: model, usedFallback: false };
  } catch (err) {
    console.warn('[draft-outbound] LLM failed, using fallback:', err);
    return {
      context,
      drafts: fallbackDrafts(context, formats),
      modelUsed: model,
      usedFallback: true,
    };
  }
}
