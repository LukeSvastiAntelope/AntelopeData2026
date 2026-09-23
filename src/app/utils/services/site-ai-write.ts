/**
 * "Write with AI" for site text slots — Anthropic seeded with campaign context.
 * Facts stay editable; this only suggests copy into the form fields.
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import type { OrgCampaignContext } from '@/app/utils/services/site-access';
import type {
  SiteAiSlotPath,
  SiteContent,
  SiteEndorsementItem,
  SiteIssueItem,
} from '@/app/utils/types/site';

export type { SiteAiSlotPath } from '@/app/utils/types/site';
export { isSiteAiSlotPath, SITE_AI_SLOT_PATHS } from '@/app/utils/types/site';

function buildCampaignBrief(org: OrgCampaignContext | null, content: SiteContent): string {
  const lines: string[] = [];
  const candidate =
    content.meta.candidateName?.trim() ||
    org?.candidateName?.trim() ||
    org?.name?.trim() ||
    'the candidate';
  const office =
    content.meta.office?.trim() || org?.officeType?.trim() || 'local office';
  lines.push(`Candidate: ${candidate}`);
  lines.push(`Office: ${office}`);
  if (org?.state) lines.push(`State: ${org.state}`);
  if (org?.districtCode) lines.push(`District: ${org.districtCode}`);
  if (content.meta.partyLabel || org?.party) {
    lines.push(`Party: ${content.meta.partyLabel || org?.party}`);
  }
  if (content.meta.electionDate || org?.electionYear) {
    lines.push(
      `Election: ${content.meta.electionDate || String(org?.electionYear)}`
    );
  }
  if (org?.description?.trim()) {
    lines.push(`Campaign notes: ${org.description.trim().slice(0, 800)}`);
  }
  const issueTitles = content.slots.issues.items
    .map((i) => i.title)
    .filter(Boolean);
  if (issueTitles.length) {
    lines.push(`Current issue themes: ${issueTitles.join('; ')}`);
  }
  return lines.join('\n');
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(body.slice(start, end + 1));
  }
  return JSON.parse(body);
}

export type SiteAiWriteResult =
  | { kind: 'string'; value: string }
  | { kind: 'issues'; items: SiteIssueItem[] }
  | { kind: 'endorsements'; items: SiteEndorsementItem[] };

const SLOT_INSTRUCTIONS: Record<SiteAiSlotPath, string> = {
  'hero.headline':
    'Write a short campaign headline (max 12 words). Return JSON: {"value":"..."}',
  'hero.subheadline':
    'Write a one-sentence subheadline (max 28 words) under the hero. Return JSON: {"value":"..."}',
  'about.body':
    'Write a 2–3 paragraph About section in first or third person as appropriate for a campaign site. Keep facts editable and avoid inventing votes or endorsements. Return JSON: {"value":"..."}',
  'issues.items':
    'Propose exactly 3 local issues as JSON: {"items":[{"title":"...","summary":"..."}]} — title ≤6 words, summary ≤28 words each. Prefer practical district concerns.',
  'cta.headline':
    'Write a short call-to-action headline (max 10 words). Return JSON: {"value":"..."}',
  'cta.body':
    'Write one supportive CTA sentence (max 22 words). Return JSON: {"value":"..."}',
  'endorsements.items':
    'Propose 2 plausible placeholder endorsement blurbs as JSON: {"items":[{"name":"...","role":"...","quote":"..."}]} — clearly generic community roles, do not invent real named officials.',
};

export async function writeSiteSlotWithAi(options: {
  slotPath: SiteAiSlotPath;
  content: SiteContent;
  org: OrgCampaignContext | null;
}): Promise<SiteAiWriteResult> {
  const { slotPath, content, org } = options;
  const brief = buildCampaignBrief(org, content);

  const system = `You write concise campaign website copy for AntelopeCM.
Stay truthful to the provided campaign context. Do not invent legislation, vote records, polling numbers, or real people's endorsements.
Tone: confident, local, neighborly — not corporate or hyperbolic.
Return ONLY valid JSON matching the requested shape.`;

  const user = `Campaign context:
${brief}

Current hero headline: ${content.slots.hero.headline || '(empty)'}
Current about excerpt: ${(content.slots.about.body || '').slice(0, 280) || '(empty)'}

Task for slot "${slotPath}":
${SLOT_INSTRUCTIONS[slotPath]}`;

  const result = await createCompletion({
    model: 'claude-sonnet-4-6',
    maxTokens: 1200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const parsed = extractJson(result.content) as Record<string, unknown>;

  if (slotPath === 'issues.items') {
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const cleaned: SiteIssueItem[] = items
      .slice(0, 5)
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          title: String(item.title || '').trim() || 'Issue',
          summary: String(item.summary || '').trim() || '',
          icon: typeof item.icon === 'string' ? item.icon : undefined,
        };
      })
      .filter((i) => i.title);
    if (!cleaned.length) throw new Error('AI returned no issues');
    return { kind: 'issues', items: cleaned };
  }

  if (slotPath === 'endorsements.items') {
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const cleaned: SiteEndorsementItem[] = items
      .slice(0, 4)
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          name: String(item.name || '').trim() || 'Supporter',
          role: item.role != null ? String(item.role).trim() : undefined,
          quote: item.quote != null ? String(item.quote).trim() : undefined,
        };
      })
      .filter((i) => i.name);
    if (!cleaned.length) throw new Error('AI returned no endorsements');
    return { kind: 'endorsements', items: cleaned };
  }

  const value = String(parsed.value ?? '').trim();
  if (!value) throw new Error('AI returned empty copy');
  return { kind: 'string', value };
}
