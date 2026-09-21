/**
 * MT4 — Outbound goal / CTA prompt-assist.
 * Expands plain candidate language into a tight framing line for draft_outbound.
 * Reuses ai-service (same pattern as video prompt-assist). Does not invent
 * issue positions — framing only; stated positions still come from voter-state.
 */

import { createCompletion } from '@/app/utils/services/ai-service';

export type OutboundGoalTemplateId =
  | 'town_hall'
  | 'issue_brief'
  | 'gotv'
  | 'volunteer'
  | 'custom';

export type OutboundGoalTemplate = {
  id: OutboundGoalTemplateId;
  label: string;
  description: string;
  starterGoal: string;
};

export const OUTBOUND_GOAL_TEMPLATES: OutboundGoalTemplate[] = [
  {
    id: 'town_hall',
    label: 'Town hall invite',
    description: 'Invite to a local meeting on a stated issue',
    starterGoal: 'Invite neighbors to Thursday town hall on public safety.',
  },
  {
    id: 'issue_brief',
    label: 'Issue briefing',
    description: 'Share a short plan brief tied to a stated concern',
    starterGoal: 'Share a one-page briefing on how we address their stated concern.',
  },
  {
    id: 'gotv',
    label: 'GOTV',
    description: 'Turnout reminder with clear next step',
    starterGoal: 'Remind them election day is Tuesday; polls open 7am–8pm.',
  },
  {
    id: 'volunteer',
    label: 'Volunteer ask',
    description: 'Soft ask to help canvass or phone bank',
    starterGoal: 'Invite them to join Saturday morning canvass for two hours.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from your own wording',
    starterGoal: '',
  },
];

export type AssistedOutboundGoal = {
  goal: string;
  explanation: string;
  usedFallback: boolean;
};

/**
 * Turn rough candidate wording into a concise goal/CTA for draft_outbound.
 * Never invents voter issue positions — only clarifies campaign ask / CTA.
 */
export async function assistOutboundGoal(params: {
  plainDescription: string;
  segmentName?: string | null;
  formats?: string[];
  mock?: boolean;
}): Promise<AssistedOutboundGoal> {
  const plain = String(params.plainDescription || '').trim();
  if (!plain) {
    throw new Error('plainDescription is required');
  }

  const fallbackGoal = plain.slice(0, 240);
  if (params.mock || (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)) {
    return {
      goal: fallbackGoal,
      explanation:
        'Using your wording as-is (no LLM). Drafts will still ground only in survey-stated positions.',
      usedFallback: true,
    };
  }

  const model = process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-6' : 'gpt-4o';
  try {
    const completion = await createCompletion({
      model,
      temperature: 0.3,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: `You help a campaign candidate sharpen a GOAL/CTA line for outbound drafts.
Return ONLY JSON: {"goal":string,"explanation":string}
Rules:
- goal: one tight sentence (≤160 chars) describing the ask or CTA — not the full letter.
- Do NOT invent voter issue concerns, poll numbers, or who to target.
- Microtargeting = message framing; who/when is decided elsewhere.
- Keep civic, concrete, local.`,
        },
        {
          role: 'user',
          content: [
            `Candidate wording: ${plain}`,
            params.segmentName ? `Segment (message audience label only): ${params.segmentName}` : null,
            params.formats?.length ? `Formats: ${params.formats.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });
    const raw = (completion.content || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON');
    const parsed = JSON.parse(match[0]) as { goal?: string; explanation?: string };
    const goal = String(parsed.goal || '').trim().slice(0, 240) || fallbackGoal;
    return {
      goal,
      explanation:
        String(parsed.explanation || '').trim().slice(0, 400) ||
        'Clarified CTA for drafting — still grounded only in stated segment positions.',
      usedFallback: false,
    };
  } catch (e) {
    console.warn('[outbound-prompt-assist] LLM failed:', e);
    return {
      goal: fallbackGoal,
      explanation: 'Assist unavailable — using your wording as the goal.',
      usedFallback: true,
    };
  }
}
