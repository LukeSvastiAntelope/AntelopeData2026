/**
 * Live L4 — audience intelligence (host-only).
 * Attribution + cross-tabs computed in code; anonymity enforced at the query layer.
 * Significance floors from postable-insight-service (never asserted by a model).
 */

import { LiveRepo, type LiveQuestion, type LiveSession } from '@/app/utils/database/live-repo';
import {
  POSTABLE_INSIGHT_THRESHOLDS,
  benjaminiHochberg,
  contrastPassesPublishGate,
  isBelowTotalResponseFloor,
  twoProportionZTest,
} from '@/app/utils/services/postable-insight-service';
import { needsSmallSampleDisclaimer } from '@/app/utils/services/autotrigger-outputs';

export const LIVE_SMALL_N_DISCLAIMER =
  'Small-sample caveat: cell sizes or total N are below Antelope’s publish floors (N≥80 / cell≥25). Treat as directional only — not publishable.';

export type AudienceParticipantRow = {
  id: number;
  displayName: string | null;
  linkedinUrl: string | null;
  email: string | null;
  headline: string | null;
  personRecordId: number | null;
  isAnonymous: boolean;
  consentAt: string | null;
  joinedAt: string;
  intake: Record<string, unknown>;
  /** Flattened columns for the table (intake + LinkedIn fields). */
  profile: Record<string, string | null>;
};

export type AttributionResult =
  | {
      attributed: false;
      reason: 'anonymous_question' | 'per_question_unresolved';
      message: string;
      aggregate: { value: string; count: number; pct: number }[];
      responseCount: number;
    }
  | {
      attributed: true;
      value: string;
      responseCount: number;
      participants: AudienceParticipantRow[];
    };

function intakeString(
  intake: Record<string, unknown>,
  key: string
): string | null {
  const v = intake[key];
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(String).join(', ') || null;
  const s = String(v).trim();
  return s || null;
}

function buildProfile(
  p: {
    displayName: string | null;
    linkedinUrl: string | null;
    intake: Record<string, unknown>;
    isAnonymous: boolean;
  },
  intakeFieldIds: string[]
): Record<string, string | null> {
  if (p.isAnonymous) {
    return { name: 'Anonymous', linkedin: null, email: null, headline: null };
  }
  const profile: Record<string, string | null> = {
    name: p.displayName || intakeString(p.intake, 'name'),
    email: intakeString(p.intake, 'email'),
    headline: intakeString(p.intake, 'headline'),
    linkedin: p.linkedinUrl || intakeString(p.intake, 'linkedin') || null,
    role: intakeString(p.intake, 'role'),
    company: intakeString(p.intake, 'company'),
  };
  for (const id of intakeFieldIds) {
    if (profile[id] === undefined) {
      profile[id] = intakeString(p.intake, id);
    }
  }
  return profile;
}

function toAudienceRow(
  p: Awaited<ReturnType<typeof LiveRepo.listParticipants>>[number],
  intakeFieldIds: string[]
): AudienceParticipantRow {
  return {
    id: p.id,
    displayName: p.isAnonymous ? null : p.displayName,
    linkedinUrl: p.isAnonymous ? null : p.linkedinUrl,
    email: p.isAnonymous ? null : intakeString(p.intake, 'email'),
    headline: p.isAnonymous ? null : intakeString(p.intake, 'headline'),
    personRecordId: p.isAnonymous ? null : p.personRecordId,
    isAnonymous: p.isAnonymous,
    consentAt: p.consentAt,
    joinedAt: p.joinedAt,
    intake: p.isAnonymous ? {} : p.intake,
    profile: buildProfile(p, intakeFieldIds),
  };
}

/** True only when the host may see named respondents for this question. */
export function questionAllowsAttribution(
  session: LiveSession,
  question: LiveQuestion
): boolean {
  const mode = LiveRepo.resolveIdentifyMode(session, question);
  return mode === 'identified';
}

export async function listAudienceParticipants(
  sessionId: number,
  organizationId: number
): Promise<{
  participants: AudienceParticipantRow[];
  intakeFields: Array<{ id: string; label: string }>;
  segmentKeys: string[];
}> {
  const session = await LiveRepo.getSessionById(sessionId, organizationId);
  if (!session) throw new Error('Session not found');
  const intakeFields = (session.intakeSchema.fields || []).map((f) => ({
    id: f.id,
    label: f.label,
  }));
  const fieldIds = intakeFields.map((f) => f.id);
  const raw = await LiveRepo.listParticipants(sessionId, organizationId);
  const participants = raw.map((p) => toAudienceRow(p, fieldIds));

  const segmentKeys = Array.from(
    new Set([
      'role',
      'company',
      'headline',
      ...fieldIds,
    ])
  );

  return { participants, intakeFields, segmentKeys };
}

/**
 * Latest response value per participant for a question (internal).
 * Does not strip identity — callers must gate attribution.
 */
async function latestAnswersByParticipant(
  sessionId: number,
  organizationId: number,
  questionId: number
): Promise<Map<number, string>> {
  const events = await LiveRepo.listEvents(sessionId, organizationId, {
    limit: 2000,
  });
  const map = new Map<number, string>();
  for (const e of events) {
    if (
      e.questionId === questionId &&
      e.participantId != null &&
      e.type.startsWith('response.')
    ) {
      map.set(e.participantId, String((e.payload as any)?.value ?? ''));
    }
  }
  return map;
}

export async function attributePollOption(params: {
  sessionId: number;
  organizationId: number;
  questionId: number;
  value: string;
}): Promise<AttributionResult> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');
  const question = await LiveRepo.getQuestionById(params.questionId);
  if (!question || question.sessionId !== session.id) {
    throw new Error('Question not in this session');
  }

  const answers = await latestAnswersByParticipant(
    session.id,
    params.organizationId,
    question.id
  );
  const responseCount = answers.size;

  // Aggregate always available
  const counts = new Map<string, number>();
  for (const v of answers.values()) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const aggregate = Array.from(counts.entries()).map(([value, count]) => ({
    value,
    count,
    pct: responseCount ? Math.round((count / responseCount) * 100) : 0,
  }));

  if (!questionAllowsAttribution(session, question)) {
    return {
      attributed: false,
      reason: 'anonymous_question',
      message:
        'This question is anonymous — aggregate results only. Individual respondents are not available.',
      aggregate,
      responseCount,
    };
  }

  const fieldIds = (session.intakeSchema.fields || []).map((f) => f.id);
  const all = await LiveRepo.listParticipants(session.id, params.organizationId);
  const matchIds = new Set(
    Array.from(answers.entries())
      .filter(([, v]) => v === params.value)
      .map(([pid]) => pid)
  );
  const participants = all
    .filter((p) => matchIds.has(p.id) && !p.isAnonymous)
    .map((p) => toAudienceRow(p, fieldIds));

  return {
    attributed: true,
    value: params.value,
    responseCount: matchIds.size,
    participants,
  };
}

export async function getParticipantDrawer(params: {
  sessionId: number;
  organizationId: number;
  participantId: number;
}): Promise<{
  participant: AudienceParticipantRow;
  trail: Array<{
    id: number;
    type: string;
    questionId: number | null;
    payload: unknown;
    createdAt: string;
    /** Redacted when the related question is anonymous */
    redacted: boolean;
  }>;
}> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');
  const p = await LiveRepo.getParticipantById(
    params.participantId,
    params.organizationId
  );
  if (!p || p.sessionId !== session.id) throw new Error('Participant not found');

  const fieldIds = (session.intakeSchema.fields || []).map((f) => f.id);
  const questions = await LiveRepo.listQuestions(session.id);
  const qById = new Map(questions.map((q) => [q.id, q]));

  const events = await LiveRepo.listEvents(session.id, params.organizationId, {
    limit: 2000,
  });
  const trail = events
    .filter((e) => e.participantId === p.id)
    .map((e) => {
      const q = e.questionId != null ? qById.get(e.questionId) : null;
      const anon = q ? !questionAllowsAttribution(session, q) : false;
      // Never expose response payload content for anonymous questions
      const redacted =
        anon && (e.type.startsWith('response.') || e.type === 'qa.asked');
      return {
        id: e.id,
        type: e.type,
        questionId: e.questionId,
        payload: redacted
          ? { redacted: true, reason: 'anonymous_question' }
          : e.payload,
        createdAt: e.createdAt,
        redacted,
      };
    })
    .reverse();

  return {
    participant: toAudienceRow(p, fieldIds),
    trail,
  };
}

export type CrossTabSegment = {
  key: string;
  label: string;
  n: number;
  bars: Array<{ label: string; count: number; pct: number }>;
  belowMinCell: boolean;
};

export type CrossTabContrast = {
  groupA: string;
  groupB: string;
  outcomeValue: string;
  nA: number;
  nB: number;
  estimateA: number;
  estimateB: number;
  absoluteEffect: number;
  pValue: number;
  pCorrected: number;
  publishable: boolean;
  flag: 'publishable' | 'directional_only';
  smallSampleDisclaimer: boolean;
};

/**
 * Split a poll/scale/open result by an intake attribute.
 * Numbers + significance computed here (postable-insight thresholds).
 */
export async function crossTabQuestion(params: {
  sessionId: number;
  organizationId: number;
  questionId: number;
  segmentField: string;
  /** Optional: only include this segment value (filter mode) */
  segmentValue?: string | null;
}): Promise<{
  questionId: number;
  prompt: string;
  kind: string;
  attributed: boolean;
  segmentField: string;
  totalResponses: number;
  thresholds: typeof POSTABLE_INSIGHT_THRESHOLDS;
  insufficientData: boolean;
  insufficientDataMessage: string | null;
  smallSampleDisclaimer: string | null;
  segments: CrossTabSegment[];
  contrasts: CrossTabContrast[];
}> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');
  const question = await LiveRepo.getQuestionById(params.questionId);
  if (!question || question.sessionId !== session.id) {
    throw new Error('Question not in this session');
  }

  const attributed = questionAllowsAttribution(session, question);
  const answers = await latestAnswersByParticipant(
    session.id,
    params.organizationId,
    question.id
  );
  const participants = await LiveRepo.listParticipants(
    session.id,
    params.organizationId
  );
  const pById = new Map(participants.map((p) => [p.id, p]));

  type Row = { participantId: number; answer: string; segment: string };
  const rows: Row[] = [];
  for (const [pid, answer] of answers) {
    const p = pById.get(pid);
    if (!p) continue;
    // For attributed questions, skip anonymous (should be rare)
    if (attributed && p.isAnonymous) continue;
    const profile = buildProfile(p, (session.intakeSchema.fields || []).map((f) => f.id));
    const segRaw = profile[params.segmentField];
    const segment = (segRaw && String(segRaw).trim()) || 'Unknown';
    if (
      params.segmentValue != null &&
      params.segmentValue !== '' &&
      segment !== params.segmentValue
    ) {
      continue;
    }
    rows.push({ participantId: pid, answer, segment });
  }

  const totalResponses = rows.length;
  const thresholds = POSTABLE_INSIGHT_THRESHOLDS;
  const insufficientData = isBelowTotalResponseFloor(totalResponses, thresholds);

  // Build per-segment bars
  const bySeg = new Map<string, string[]>();
  for (const r of rows) {
    const list = bySeg.get(r.segment) || [];
    list.push(r.answer);
    bySeg.set(r.segment, list);
  }

  const optionLabels =
    question.kind === 'poll' && Array.isArray(question.options)
      ? question.options.map((o) =>
          typeof o === 'string'
            ? o
            : String((o as any)?.label ?? (o as any)?.value ?? o)
        )
      : [];

  const segments: CrossTabSegment[] = Array.from(bySeg.entries()).map(
    ([key, answersInSeg]) => {
      const n = answersInSeg.length;
      const counts = new Map<string, number>();
      for (const o of optionLabels) counts.set(o, 0);
      for (const a of answersInSeg) counts.set(a, (counts.get(a) || 0) + 1);
      const bars = Array.from(counts.entries()).map(([label, count]) => ({
        label,
        count,
        pct: n ? Math.round((count / n) * 100) : 0,
      }));
      if (optionLabels.length) {
        bars.sort((a, b) => {
          const ai = optionLabels.indexOf(a.label);
          const bi = optionLabels.indexOf(b.label);
          if (ai >= 0 && bi >= 0) return ai - bi;
          if (ai >= 0) return -1;
          if (bi >= 0) return 1;
          return b.count - a.count;
        });
      } else {
        bars.sort((a, b) => b.count - a.count);
      }
      return {
        key,
        label: key,
        n,
        bars,
        belowMinCell: n < thresholds.minCellSize,
      };
    }
  );
  segments.sort((a, b) => b.n - a.n);

  // Pairwise contrasts per outcome value (poll proportions) — code-computed
  const contrastsRaw: Array<Omit<CrossTabContrast, 'pCorrected' | 'publishable' | 'flag' | 'smallSampleDisclaimer'> & { pValue: number }> = [];
  const segKeys = segments.map((s) => s.key);
  const outcomeValues =
    optionLabels.length > 0
      ? optionLabels
      : Array.from(new Set(rows.map((r) => r.answer)));

  if (question.kind === 'poll' || question.kind === 'wordcloud' || question.kind === 'open') {
    for (const outcomeValue of outcomeValues.slice(0, 8)) {
      for (let i = 0; i < segKeys.length; i++) {
        for (let j = i + 1; j < segKeys.length; j++) {
          const a = segKeys[i]!;
          const b = segKeys[j]!;
          const answersA = bySeg.get(a) || [];
          const answersB = bySeg.get(b) || [];
          const nA = answersA.length;
          const nB = answersB.length;
          if (nA === 0 || nB === 0) continue;
          const sA = answersA.filter((x) => x === outcomeValue).length;
          const sB = answersB.filter((x) => x === outcomeValue).length;
          const z = twoProportionZTest(sA, nA, sB, nB);
          contrastsRaw.push({
            groupA: a,
            groupB: b,
            outcomeValue,
            nA,
            nB,
            estimateA: z.pA,
            estimateB: z.pB,
            absoluteEffect: z.absoluteEffect,
            pValue: z.pValue,
          });
        }
      }
    }
  }

  const corrected = benjaminiHochberg(contrastsRaw.map((c) => c.pValue));
  const contrasts: CrossTabContrast[] = contrastsRaw.map((c, idx) => {
    const pCorrected = corrected[idx] ?? c.pValue;
    const publishable =
      !insufficientData &&
      contrastPassesPublishGate(
        { nA: c.nA, nB: c.nB, absoluteEffect: c.absoluteEffect },
        pCorrected,
        thresholds
      );
    const smallSampleDisclaimer = needsSmallSampleDisclaimer(
      {
        nA: c.nA,
        nB: c.nB,
        flag: publishable ? 'publishable' : 'directional_only',
        totalResponses,
      } as any,
      thresholds
    );
    return {
      ...c,
      pCorrected,
      publishable,
      flag: publishable ? 'publishable' : 'directional_only',
      smallSampleDisclaimer,
    };
  });

  // Sort publishable first, then by effect
  contrasts.sort((a, b) => {
    if (a.publishable !== b.publishable) return a.publishable ? -1 : 1;
    return b.absoluteEffect - a.absoluteEffect;
  });

  const anyThin = segments.some((s) => s.belowMinCell) || insufficientData;

  return {
    questionId: question.id,
    prompt: question.prompt,
    kind: question.kind,
    attributed,
    segmentField: params.segmentField,
    totalResponses,
    thresholds,
    insufficientData,
    insufficientDataMessage: insufficientData
      ? `Total responses (${totalResponses}) are below the publish floor of ${thresholds.minTotalResponses}. Cross-tabs are shown as directional only.`
      : null,
    smallSampleDisclaimer: anyThin ? LIVE_SMALL_N_DISCLAIMER : null,
    segments,
    contrasts: contrasts.slice(0, 40),
  };
}

export async function questionResultsForHost(params: {
  sessionId: number;
  organizationId: number;
  questionId: number;
}): Promise<{
  question: {
    id: number;
    kind: string;
    prompt: string;
    state: string;
    identifyEffective: string;
    attributed: boolean;
  };
  results: Awaited<ReturnType<typeof LiveRepo.projectQuestionResults>>;
}> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');
  const question = await LiveRepo.getQuestionById(params.questionId);
  if (!question || question.sessionId !== session.id) {
    throw new Error('Question not in this session');
  }
  const results = await LiveRepo.projectQuestionResults(
    session.id,
    params.organizationId,
    question
  );
  const attributed = questionAllowsAttribution(session, question);
  return {
    question: {
      id: question.id,
      kind: question.kind,
      prompt: question.prompt,
      state: question.state,
      identifyEffective: String(LiveRepo.resolveIdentifyMode(session, question)),
      attributed,
    },
    results,
  };
}
