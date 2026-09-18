/**
 * H2.3 Cross-cycle discipline — code-enforced, not prompt.
 * Conviction gate, respondent-fatigue budget, self-confirmation guard.
 */

import type { LoopBudgetsConfig, LoopMemoryConfig } from '@/app/utils/database/loop-config-repo';
import type {
  HumanDirective,
  SituationFinding,
} from '@/app/utils/services/agent-situation-service';
import { openSql } from '@/app/utils/database/db';

/** Channels that typically mean the sample was shaped by outbound marketing. */
const MARKETING_CHANNEL_MARKERS = [
  'sms',
  'email',
  'mailchimp',
  'telegram',
  'webhook',
  'outbound',
  'marketing',
  'ad',
  'ads',
  'facebook',
  'meta',
  'tiktok',
  'instagram',
  'paid',
  'broadcast',
];

export type WeightedFinding = SituationFinding & {
  /** Memory-decayed + self-confirmation-adjusted weight used for decisions. */
  decisionWeight: number;
  selfConfirmationDownweighted: boolean;
  ageDays: number;
};

export type LoopRecommendationAction =
  | 'improved_survey'
  | 'iterate'
  | 'pivot'
  | 'hold';

function ageDays(iso: string | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / (1000 * 60 * 60 * 24));
}

/**
 * Self-confirmation guard: downweight findings whose sample was shaped by
 * the prior cycle's own marketing. Do not let the loop manufacture evidence.
 */
export function applySelfConfirmationGuard(
  finding: SituationFinding
): { weightMultiplier: number; downweighted: boolean; reason?: string } {
  const channels = (finding.sampleProvenance?.channels || []).map((c) =>
    String(c).toLowerCase()
  );
  const note = String(finding.sampleProvenance?.samplingNote || '').toLowerCase();
  const hit = channels.some((c) =>
    MARKETING_CHANNEL_MARKERS.some((m) => c.includes(m))
  );
  const noteHit =
    /prior cycle|own marketing|self[- ]select|outbound|broadcast|paid reach/.test(
      note
    );

  if (hit || noteHit) {
    return {
      weightMultiplier: 0.35,
      downweighted: true,
      reason:
        'Sample provenance suggests responses were shaped by prior outbound/marketing — downweighted to avoid self-confirmation.',
    };
  }
  return { weightMultiplier: 1, downweighted: false };
}

/**
 * Weight findings by loop_config.memory (lookback + decay) and self-confirmation.
 */
export function weightFindingsByMemory(
  findings: SituationFinding[],
  memory: LoopMemoryConfig,
  now = Date.now()
): WeightedFinding[] {
  const halfLife = Math.max(1, Number(memory.decayHalfLife) || 14);
  const lookback = Math.max(1, Number(memory.lookbackCycles) || 3);
  // Approximate: keep findings that fall within lookback * halfLife window
  const maxAgeDays = lookback * halfLife;

  const weighted: WeightedFinding[] = [];
  for (const f of findings) {
    const age = ageDays(f.timestamp, now);
    if (age > maxAgeDays && f.role !== 'conviction') continue;

    const decay = Math.pow(0.5, age / halfLife);
    const guard = applySelfConfirmationGuard(f);
    const base =
      f.role === 'conviction'
        ? Math.max(0, Number(f.confidence?.effect) || 0) *
          (1 - Math.min(1, Number(f.confidence?.pCorrected) || 1))
        : 0.05 * Math.max(0, Number(f.confidence?.effect) || 0);

    weighted.push({
      ...f,
      ageDays: age,
      selfConfirmationDownweighted: guard.downweighted,
      decisionWeight: base * decay * guard.weightMultiplier,
    });
  }

  return weighted.sort((a, b) => b.decisionWeight - a.decisionWeight);
}

/**
 * Conviction gate for pivot: do not pivot on a single soft signal.
 * Require replication (2+ weighted convictions) or a real effect across cycles.
 */
export function canRecommendPivot(
  weighted: WeightedFinding[]
): { ok: boolean; reason: string } {
  const convictions = weighted.filter(
    (f) => f.role === 'conviction' && !f.selfConfirmationDownweighted
  );
  const strong = convictions.filter(
    (f) =>
      f.decisionWeight >= 0.08 &&
      (f.confidence?.effect || 0) >= 0.12 &&
      (f.confidence?.pCorrected || 1) <= 0.05
  );

  if (strong.length >= 2) {
    // Replication across distinct surveys or distinct timestamps
    const surveys = new Set(
      strong.map((f) => f.sampleProvenance?.surveyId).filter((id) => id && id > 0)
    );
    const days = new Set(strong.map((f) => Math.floor(f.ageDays)));
    if (surveys.size >= 2 || days.size >= 2) {
      return {
        ok: true,
        reason: `Replication: ${strong.length} strong convictions across ${surveys.size} survey(s) / ${days.size} cycle-day(s).`,
      };
    }
  }

  if (strong.length === 1 && convictions.length >= 2) {
    const second = convictions[1];
    if (second.decisionWeight >= 0.04) {
      return {
        ok: true,
        reason:
          'One strong conviction plus supporting conviction across cycles — pivot allowed.',
      };
    }
  }

  return {
    ok: false,
    reason:
      'Conviction gate: pivot blocked — need replicated or multi-cycle effect; holding instead of pivoting on a soft/single signal.',
  };
}

/**
 * Respondent-fatigue budget: "ask" is costly.
 * Returns whether a new survey recommendation is allowed.
 */
export async function checkFatigueBudget(params: {
  orgId: number;
  budgets: LoopBudgetsConfig;
}): Promise<{
  ok: boolean;
  surveysInWindow: number;
  maxAllowed: number;
  windowDays: number;
  reason: string;
}> {
  const windowDays = Math.max(1, Number(params.budgets.windowDays) || 30);
  const maxAllowed = Math.max(
    0,
    Number(params.budgets.maxSurveysPerListPerWindow) || 2
  );
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM surveys
     WHERE organization_id = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [params.orgId, windowDays]
  );
  const surveysInWindow = Number(rows?.[0]?.cnt || 0);
  const ok = surveysInWindow < maxAllowed;
  return {
    ok,
    surveysInWindow,
    maxAllowed,
    windowDays,
    reason: ok
      ? `Fatigue budget OK: ${surveysInWindow}/${maxAllowed} surveys in last ${windowDays}d.`
      : `Fatigue budget exceeded: ${surveysInWindow}/${maxAllowed} surveys in last ${windowDays}d — will not recommend a new survey ask.`,
  };
}

/** Human directives are first-class high-priority steering. */
export function steeringBiasFromDirectives(
  directives: HumanDirective[] | undefined
): { topics: string[]; note: string } {
  const recent = (directives || []).slice(0, 5);
  if (!recent.length) {
    return { topics: [], note: 'No human directives on file.' };
  }
  return {
    topics: recent.map((d) => d.text),
    note: `Human directives (high priority): ${recent.map((d) => `"${d.text}"`).join('; ')}`,
  };
}
