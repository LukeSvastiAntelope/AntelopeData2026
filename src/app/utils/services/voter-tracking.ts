/**
 * VT4 helpers — resolve a digital-twin agent_token to a person_records id
 * (email/phone collation), then load VT1 timeline + VT2 state.
 * Projection only; no new store.
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import {
  voterTimeline,
  type TimelineEvent,
} from '@/app/utils/services/voter-timeline';
import {
  voterState,
  voterStateFromTimeline,
  type VoterState,
} from '@/app/utils/services/voter-state';

export type TwinTrackingBundle = {
  agentToken: string;
  personId: number | null;
  linked: boolean;
  email: string | null;
  timeline: TimelineEvent[];
  state: VoterState;
  /** Observability disclaimer for UI */
  disclaimer: string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function lookupAgent(
  agentToken: string
): Promise<{ email: string | null; phone: string | null } | null> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT email, base_profile FROM responder_agents WHERE agent_token = ? LIMIT 1`,
    [agentToken]
  );
  const row = rows[0];
  if (!row) return null;

  let email = row.email != null ? String(row.email).trim() : null;
  let phone: string | null = null;
  try {
    const profile =
      typeof row.base_profile === 'string'
        ? JSON.parse(row.base_profile)
        : row.base_profile;
    const demo = profile?.demographics || {};
    if (!email && demo.email) email = String(demo.email).trim();
    if (demo.phone) phone = String(demo.phone).trim();
  } catch {
    /* ignore */
  }
  return { email: email || null, phone };
}

/**
 * Soft-link twin → live person_records via email (collation), else phone digits.
 */
export async function resolvePersonIdForAgentToken(
  agentToken: string
): Promise<number | null> {
  const agent = await lookupAgent(agentToken);
  if (!agent) return null;

  const db = await openSql();

  if (agent.email) {
    const [byEmail] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM person_records
       WHERE merged_into_person_id IS NULL
         AND email IS NOT NULL
         AND LOWER(email) COLLATE utf8mb4_unicode_ci = LOWER(?) COLLATE utf8mb4_unicode_ci
       ORDER BY id ASC LIMIT 1`,
      [agent.email]
    );
    if (byEmail[0]?.id != null) return Number(byEmail[0].id);
  }

  if (agent.phone) {
    const digits = agent.phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      const [byPhone] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM person_records
         WHERE merged_into_person_id IS NULL
           AND phone IS NOT NULL
           AND (
             REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')',''),'+','') LIKE ?
             OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')',''),'+','') = ?
           )
         ORDER BY id ASC LIMIT 1`,
        [`%${last10}`, digits]
      );
      if (byPhone[0]?.id != null) return Number(byPhone[0].id);
    }
  }

  return null;
}

/** Survey-only timeline when no person_records link exists yet. */
async function surveyTimelineForAgentToken(
  agentToken: string
): Promise<TimelineEvent[]> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT sr.id, sr.survey_id, sr.agent_token, sr.source, sr.submitted_at,
            s.title AS survey_title
     FROM survey_responses sr
     LEFT JOIN surveys s ON s.id = sr.survey_id
     WHERE sr.agent_token COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
     ORDER BY sr.submitted_at ASC`,
    [agentToken]
  );

  const events: TimelineEvent[] = [];
  const responseIds = rows.map((r) => Number(r.id));
  const answersByResponse = new Map<
    number,
    Array<{
      questionId: number;
      prompt: string | null;
      answerValue: string | null;
      answerCode: string | null;
    }>
  >();

  if (responseIds.length) {
    const ph = responseIds.map(() => '?').join(',');
    const [answers] = await db.execute<RowDataPacket[]>(
      `SELECT sa.response_id, sa.question_id, sa.answer_value, sa.answer_code, sq.prompt
       FROM survey_answers sa
       LEFT JOIN survey_questions sq ON sq.id = sa.question_id
       WHERE sa.response_id IN (${ph})`,
      responseIds
    );
    for (const a of answers) {
      const rid = Number(a.response_id);
      const list = answersByResponse.get(rid) || [];
      list.push({
        questionId: Number(a.question_id),
        prompt: a.prompt != null ? String(a.prompt) : null,
        answerValue: a.answer_value != null ? String(a.answer_value) : null,
        answerCode: a.answer_code != null ? String(a.answer_code) : null,
      });
      answersByResponse.set(rid, list);
    }
  }

  for (const r of rows) {
    const rid = Number(r.id);
    const answers = answersByResponse.get(rid) || [];
    const title = r.survey_title ? String(r.survey_title) : `survey #${r.survey_id}`;
    const ts = toIso(r.submitted_at);
    if (!ts) continue;
    events.push({
      ts,
      source: 'survey_responses',
      type: 'survey.response',
      summary: `Survey response on “${title}” (${answers.length} answer${answers.length === 1 ? '' : 's'})`,
      payload: {
        responseId: rid,
        surveyId: Number(r.survey_id),
        surveyTitle: r.survey_title,
        agentToken: r.agent_token,
        channel: r.source,
        answerCount: answers.length,
        answers,
      },
    });
  }

  return events;
}

const DISCLAIMER =
  'Observed history recomputed from events — context for canvassing, not a targeting score. Propensity quarantine still owns targeting.';

/**
 * Load VT1 + VT2 for a Voter Profile (agent_token), optionally forced to a person id.
 */
export async function loadTwinTracking(
  agentToken: string,
  personIdOverride?: number | null
): Promise<TwinTrackingBundle | null> {
  const token = String(agentToken || '').trim();
  if (!token) return null;

  const agent = await lookupAgent(token);
  if (!agent) return null;

  let personId =
    personIdOverride != null && Number.isFinite(Number(personIdOverride))
      ? Number(personIdOverride)
      : await resolvePersonIdForAgentToken(token);

  if (personId != null && personId > 0) {
    const [timeline, state] = await Promise.all([
      voterTimeline(personId),
      voterState(personId),
    ]);
    return {
      agentToken: token,
      personId,
      linked: true,
      email: agent.email,
      timeline,
      state,
      disclaimer: DISCLAIMER,
    };
  }

  const timeline = await surveyTimelineForAgentToken(token);
  const state = voterStateFromTimeline(0, timeline);
  return {
    agentToken: token,
    personId: null,
    linked: false,
    email: agent.email,
    timeline,
    state,
    disclaimer: DISCLAIMER,
  };
}
