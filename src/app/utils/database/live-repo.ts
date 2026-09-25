/**
 * Live L1 — Session + Participant spine (event-type-agnostic).
 *
 * Core objects are Session and Participant — never candidate/voter.
 * Identified participants may link to person_records (org-scoped).
 * Profiles are for segmentation + contact only — never static scoring.
 * session_events is append-only; live views are projections.
 */

import { createHash, randomBytes } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

// ── Types ──────────────────────────────────────────────────────────────

export type LiveEventType = 'expert_brief' | 'town_hall' | 'deliberation';
export type LiveIdentifyMode = 'identified' | 'anonymous' | 'per_question';
export type LiveSessionStatus = 'draft' | 'live' | 'ended';
export type LiveQuestionKind = 'poll' | 'wordcloud' | 'scale' | 'open' | 'qa';
export type LiveQuestionState = 'queued' | 'active' | 'closed';
export type LiveIdentifyOverride = 'identified' | 'anonymous';

/** Host-defined intake field (compatible with DemographicFieldConfig shape). */
export type LiveIntakeField = {
  id: string;
  label: string;
  type: 'text' | 'select' | 'multi-select' | 'number' | 'email' | 'url';
  required?: boolean;
  options?: string[];
  /** Optional map onto person_records / DemographicField key */
  mapsTo?: string;
};

export type LiveIntakeSchema = {
  fields: LiveIntakeField[];
  /** Shown at join when identify_mode !== anonymous */
  consentPrompt?: string;
};

export type LiveSession = {
  id: number;
  organizationId: number;
  code: string;
  title: string;
  hostName: string | null;
  eventType: LiveEventType;
  identifyMode: LiveIdentifyMode;
  status: LiveSessionStatus;
  intakeSchema: LiveIntakeSchema;
  consentText: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type LiveParticipant = {
  id: number;
  sessionId: number;
  organizationId: number;
  personRecordId: number | null;
  displayName: string | null;
  linkedinUrl: string | null;
  intake: Record<string, unknown>;
  isAnonymous: boolean;
  consentAt: string | null;
  joinedAt: string;
};

export type LiveQuestion = {
  id: number;
  sessionId: number;
  kind: LiveQuestionKind;
  prompt: string;
  options: unknown;
  identifyOverride: LiveIdentifyOverride | null;
  state: LiveQuestionState;
  orderIdx: number;
  createdAt: string;
  updatedAt: string;
};

export type LiveSessionEvent = {
  id: number;
  sessionId: number;
  organizationId: number;
  participantId: number | null;
  questionId: number | null;
  type: string;
  payload: unknown;
  createdAt: string;
};

export type CreateLiveSessionInput = {
  organizationId: number;
  createdBy: number;
  title: string;
  hostName?: string | null;
  eventType?: LiveEventType;
  identifyMode?: LiveIdentifyMode;
  intakeSchema?: LiveIntakeSchema | null;
  consentText?: string | null;
  /** Optional fixed code (tests); otherwise generated short + unique */
  code?: string | null;
};

export type UpdateLiveSessionInput = {
  title?: string;
  hostName?: string | null;
  eventType?: LiveEventType;
  identifyMode?: LiveIdentifyMode;
  status?: LiveSessionStatus;
  intakeSchema?: LiveIntakeSchema | null;
  consentText?: string | null;
};

export type AddParticipantInput = {
  sessionId: number;
  organizationId: number;
  displayName?: string | null;
  linkedinUrl?: string | null;
  intake?: Record<string, unknown> | null;
  isAnonymous?: boolean;
  consentAt?: Date | string | null;
  /** When identified, link/create a person_record in this org */
  personRecordId?: number | null;
  email?: string | null;
};

export type AddQuestionInput = {
  sessionId: number;
  organizationId: number;
  kind: LiveQuestionKind;
  prompt: string;
  options?: unknown;
  identifyOverride?: LiveIdentifyOverride | null;
  state?: LiveQuestionState;
  orderIdx?: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

const EVENT_TYPES: LiveEventType[] = [
  'expert_brief',
  'town_hall',
  'deliberation',
];
const IDENTIFY_MODES: LiveIdentifyMode[] = [
  'identified',
  'anonymous',
  'per_question',
];
const STATUSES: LiveSessionStatus[] = ['draft', 'live', 'ended'];
const QUESTION_KINDS: LiveQuestionKind[] = [
  'poll',
  'wordcloud',
  'scale',
  'open',
  'qa',
];
const QUESTION_STATES: LiveQuestionState[] = ['queued', 'active', 'closed'];

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function toIso(d: unknown): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

function normalizeOrgId(organizationId: number): number {
  if (!Number.isFinite(Number(organizationId)) || Number(organizationId) <= 0) {
    throw new Error('organizationId is required');
  }
  return Number(organizationId);
}

/** Ambiguity-safe alphabet for short join codes (no 0/O/1/I/L). */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateLiveJoinCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

function mapSession(row: RowDataPacket): LiveSession {
  const intake = parseJson<LiveIntakeSchema>(row.intake_schema, { fields: [] });
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    code: String(row.code),
    title: String(row.title),
    hostName: row.host_name != null ? String(row.host_name) : null,
    eventType: (EVENT_TYPES.includes(row.event_type)
      ? row.event_type
      : 'expert_brief') as LiveEventType,
    identifyMode: (IDENTIFY_MODES.includes(row.identify_mode)
      ? row.identify_mode
      : 'identified') as LiveIdentifyMode,
    status: (STATUSES.includes(row.status) ? row.status : 'draft') as LiveSessionStatus,
    intakeSchema: {
      fields: Array.isArray(intake.fields) ? intake.fields : [],
      consentPrompt: intake.consentPrompt,
    },
    consentText: row.consent_text != null ? String(row.consent_text) : null,
    createdBy: Number(row.created_by),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
  };
}

function mapParticipant(row: RowDataPacket): LiveParticipant {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    organizationId: Number(row.organization_id),
    personRecordId:
      row.person_record_id != null ? Number(row.person_record_id) : null,
    displayName: row.display_name != null ? String(row.display_name) : null,
    linkedinUrl: row.linkedin_url != null ? String(row.linkedin_url) : null,
    intake: parseJson<Record<string, unknown>>(row.intake, {}),
    isAnonymous: Boolean(row.is_anonymous),
    consentAt: toIso(row.consent_at),
    joinedAt: toIso(row.joined_at) || new Date().toISOString(),
  };
}

function mapQuestion(row: RowDataPacket): LiveQuestion {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    kind: (QUESTION_KINDS.includes(row.kind) ? row.kind : 'poll') as LiveQuestionKind,
    prompt: String(row.prompt || ''),
    options: parseJson(row.options, null),
    identifyOverride:
      row.identify_override === 'identified' || row.identify_override === 'anonymous'
        ? row.identify_override
        : null,
    state: (QUESTION_STATES.includes(row.state)
      ? row.state
      : 'queued') as LiveQuestionState,
    orderIdx: Number(row.order_idx) || 0,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

function mapEvent(row: RowDataPacket): LiveSessionEvent {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    organizationId: Number(row.organization_id),
    participantId:
      row.participant_id != null ? Number(row.participant_id) : null,
    questionId: row.question_id != null ? Number(row.question_id) : null,
    type: String(row.type),
    payload: parseJson(row.payload, null),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
  };
}

function clusterKeyForLive(orgId: number, seed: string): string {
  return createHash('sha256')
    .update(`live:${orgId}:${seed}`)
    .digest('hex')
    .slice(0, 32);
}

// ── Repo ───────────────────────────────────────────────────────────────

export class LiveRepo {
  // ── Sessions ─────────────────────────────────────────────────────────

  static async createSession(input: CreateLiveSessionInput): Promise<LiveSession> {
    const organizationId = normalizeOrgId(input.organizationId);
    const title = String(input.title || '').trim();
    if (!title) throw new Error('title is required');
    const createdBy = Number(input.createdBy);
    if (!Number.isFinite(createdBy) || createdBy <= 0) {
      throw new Error('createdBy is required');
    }

    const eventType: LiveEventType = EVENT_TYPES.includes(
      input.eventType as LiveEventType
    )
      ? (input.eventType as LiveEventType)
      : 'expert_brief';
    const identifyMode: LiveIdentifyMode = IDENTIFY_MODES.includes(
      input.identifyMode as LiveIdentifyMode
    )
      ? (input.identifyMode as LiveIdentifyMode)
      : 'identified';
    const intakeSchema: LiveIntakeSchema = input.intakeSchema?.fields
      ? {
          fields: input.intakeSchema.fields,
          consentPrompt: input.intakeSchema.consentPrompt,
        }
      : { fields: [] };

    const sql = await openSql();
    let code =
      input.code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) ||
      '';
    if (!code) code = generateLiveJoinCode(6);

    // Retry on rare code collision
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const [result] = await sql.execute<ResultSetHeader>(
          `INSERT INTO live_sessions
            (organization_id, code, title, host_name, event_type, identify_mode,
             status, intake_schema, consent_text, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
          [
            organizationId,
            code,
            title.slice(0, 255),
            input.hostName?.trim()?.slice(0, 255) || null,
            eventType,
            identifyMode,
            JSON.stringify(intakeSchema),
            input.consentText?.trim() || null,
            createdBy,
          ]
        );
        const session = await this.getSessionById(
          Number(result.insertId),
          organizationId
        );
        if (!session) throw new Error('Failed to create live session');
        await this.appendEvent({
          sessionId: session.id,
          organizationId,
          type: 'session.created',
          payload: {
            code: session.code,
            eventType: session.eventType,
            identifyMode: session.identifyMode,
          },
        });
        return session;
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY' && !input.code) {
          code = generateLiveJoinCode(6);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Could not allocate a unique join code');
  }

  static async getSessionById(
    id: number,
    organizationId: number
  ): Promise<LiveSession | null> {
    const orgId = normalizeOrgId(organizationId);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM live_sessions WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  /**
   * Public lookup by short join code — mirrors SurveyRepo.getSurveyBySlug.
   * Returns session + ordered questions. Tenant is on the session row;
   * callers must not cross-attach participants from another org.
   */
  static async getLiveSessionByCode(code: string): Promise<{
    session: LiveSession;
    questions: LiveQuestion[];
  } | null> {
    const normalized = String(code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!normalized) return null;

    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM live_sessions WHERE code = ? LIMIT 1`,
      [normalized]
    );
    if (!rows[0]) return null;
    const session = mapSession(rows[0]);
    const questions = await this.listQuestions(session.id);
    return { session, questions };
  }

  static async listSessions(
    organizationId: number,
    opts?: { status?: LiveSessionStatus | LiveSessionStatus[]; limit?: number }
  ): Promise<LiveSession[]> {
    const orgId = normalizeOrgId(organizationId);
    const sql = await openSql();
    const limit = Math.min(200, Math.max(1, Number(opts?.limit) || 50));
    const statuses = opts?.status
      ? Array.isArray(opts.status)
        ? opts.status
        : [opts.status]
      : null;

    let sqlText = `SELECT * FROM live_sessions WHERE organization_id = ?`;
    const params: unknown[] = [orgId];
    if (statuses?.length) {
      sqlText += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
    sqlText += ` ORDER BY updated_at DESC LIMIT ${limit}`;

    const [rows] = await sql.execute<RowDataPacket[]>(sqlText, params);
    return rows.map(mapSession);
  }

  static async updateSession(
    id: number,
    organizationId: number,
    patch: UpdateLiveSessionInput
  ): Promise<LiveSession> {
    const existing = await this.getSessionById(id, organizationId);
    if (!existing) throw new Error('Session not found');

    const title =
      patch.title != null ? String(patch.title).trim().slice(0, 255) : existing.title;
    if (!title) throw new Error('title is required');

    const hostName =
      patch.hostName !== undefined
        ? patch.hostName?.trim()?.slice(0, 255) || null
        : existing.hostName;
    const eventType =
      patch.eventType && EVENT_TYPES.includes(patch.eventType)
        ? patch.eventType
        : existing.eventType;
    const identifyMode =
      patch.identifyMode && IDENTIFY_MODES.includes(patch.identifyMode)
        ? patch.identifyMode
        : existing.identifyMode;
    const status =
      patch.status && STATUSES.includes(patch.status)
        ? patch.status
        : existing.status;
    const intakeSchema =
      patch.intakeSchema !== undefined
        ? {
            fields: Array.isArray(patch.intakeSchema?.fields)
              ? patch.intakeSchema!.fields
              : [],
            consentPrompt: patch.intakeSchema?.consentPrompt,
          }
        : existing.intakeSchema;
    const consentText =
      patch.consentText !== undefined
        ? patch.consentText?.trim() || null
        : existing.consentText;

    const startedAtSql =
      status === 'live' && !existing.startedAt
        ? ', started_at = UTC_TIMESTAMP()'
        : '';
    const endedAtSql =
      status === 'ended' && !existing.endedAt
        ? ', ended_at = UTC_TIMESTAMP()'
        : '';

    const sql = await openSql();
    await sql.execute(
      `UPDATE live_sessions
       SET title = ?, host_name = ?, event_type = ?, identify_mode = ?,
           status = ?, intake_schema = ?, consent_text = ?
           ${startedAtSql}${endedAtSql}
       WHERE id = ? AND organization_id = ?`,
      [
        title,
        hostName,
        eventType,
        identifyMode,
        status,
        JSON.stringify(intakeSchema),
        consentText,
        id,
        normalizeOrgId(organizationId),
      ]
    );

    if (status !== existing.status) {
      await this.appendEvent({
        sessionId: id,
        organizationId,
        type: `session.status.${status}`,
        payload: { from: existing.status, to: status },
      });
    }

    const updated = await this.getSessionById(id, organizationId);
    if (!updated) throw new Error('Session not found after update');
    return updated;
  }

  // ── Participants ─────────────────────────────────────────────────────

  /**
   * Join a participant. When not anonymous, optionally creates/links a
   * person_record in the session org (profiles for contact/segment only).
   */
  static async addParticipant(
    input: AddParticipantInput
  ): Promise<LiveParticipant> {
    const organizationId = normalizeOrgId(input.organizationId);
    const session = await this.getSessionById(input.sessionId, organizationId);
    if (!session) throw new Error('Session not found');

    const isAnonymous = Boolean(input.isAnonymous);
    let personRecordId =
      input.personRecordId != null ? Number(input.personRecordId) : null;

    if (!isAnonymous && !personRecordId) {
      personRecordId = await this.ensurePersonRecord({
        organizationId,
        displayName: input.displayName,
        email: input.email,
        linkedinUrl: input.linkedinUrl,
        intake: input.intake || {},
      });
    }

    const sql = await openSql();
    const consentAt =
      input.consentAt != null
        ? new Date(input.consentAt)
        : !isAnonymous && session.identifyMode !== 'anonymous'
          ? new Date()
          : null;

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO session_participants
        (session_id, organization_id, person_record_id, display_name,
         linkedin_url, intake, is_anonymous, consent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        organizationId,
        isAnonymous ? null : personRecordId,
        input.displayName?.trim()?.slice(0, 255) || null,
        input.linkedinUrl?.trim()?.slice(0, 512) || null,
        JSON.stringify(input.intake || {}),
        isAnonymous ? 1 : 0,
        consentAt && !Number.isNaN(consentAt.getTime()) ? consentAt : null,
      ]
    );

    const participant = await this.getParticipantById(
      Number(result.insertId),
      organizationId
    );
    if (!participant) throw new Error('Failed to add participant');

    await this.appendEvent({
      sessionId: session.id,
      organizationId,
      participantId: participant.id,
      type: 'participant.joined',
      payload: {
        isAnonymous: participant.isAnonymous,
        personRecordId: participant.personRecordId,
      },
    });

    return participant;
  }

  static async getParticipantById(
    id: number,
    organizationId: number
  ): Promise<LiveParticipant | null> {
    const orgId = normalizeOrgId(organizationId);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_participants
       WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    return rows[0] ? mapParticipant(rows[0]) : null;
  }

  static async listParticipants(
    sessionId: number,
    organizationId: number
  ): Promise<LiveParticipant[]> {
    const orgId = normalizeOrgId(organizationId);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_participants
       WHERE session_id = ? AND organization_id = ?
       ORDER BY joined_at ASC, id ASC`,
      [sessionId, orgId]
    );
    return rows.map(mapParticipant);
  }

  /**
   * Create a minimal org-scoped person_record for an identified participant.
   * Does not write any propensity/score fields.
   */
  static async ensurePersonRecord(params: {
    organizationId: number;
    displayName?: string | null;
    email?: string | null;
    linkedinUrl?: string | null;
    intake?: Record<string, unknown>;
  }): Promise<number | null> {
    const organizationId = normalizeOrgId(params.organizationId);
    const email =
      (params.email ||
        (typeof params.intake?.email === 'string' ? params.intake.email : null) ||
        '')
        .trim()
        .toLowerCase() || null;
    const displayName = (params.displayName || '').trim();
    const parts = displayName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || null;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

    if (!email && !displayName) return null;

    const sql = await openSql();

    if (email) {
      const [existing] = await sql.execute<RowDataPacket[]>(
        `SELECT id FROM person_records
         WHERE organization_id = ? AND LOWER(email) = ?
           AND merged_into_person_id IS NULL
         LIMIT 1`,
        [organizationId, email]
      );
      if (existing[0]) return Number(existing[0].id);
    }

    const seed = email || `name:${displayName.toLowerCase()}:${Date.now()}`;
    const clusterKey = clusterKeyForLive(organizationId, seed);
    const provenance = {
      source: 'live_session',
      linkedinUrl: params.linkedinUrl || null,
      intakeKeys: Object.keys(params.intake || {}),
    };

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO person_records (
        organization_id, cluster_key,
        first_name, last_name, full_name_normalized, email,
        match_confidence, field_provenance, source_row_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        clusterKey,
        firstName,
        lastName,
        displayName ? displayName.toUpperCase() : null,
        email,
        0.5,
        JSON.stringify(provenance),
        JSON.stringify([]),
      ]
    );
    return Number(result.insertId);
  }

  // ── Questions ────────────────────────────────────────────────────────

  static async addQuestion(input: AddQuestionInput): Promise<LiveQuestion> {
    const organizationId = normalizeOrgId(input.organizationId);
    const session = await this.getSessionById(input.sessionId, organizationId);
    if (!session) throw new Error('Session not found');

    const kind: LiveQuestionKind = QUESTION_KINDS.includes(input.kind)
      ? input.kind
      : 'poll';
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('prompt is required');

    const sql = await openSql();
    let orderIdx = input.orderIdx;
    if (orderIdx == null) {
      const [agg] = await sql.execute<RowDataPacket[]>(
        `SELECT COALESCE(MAX(order_idx), -1) AS m FROM session_questions WHERE session_id = ?`,
        [session.id]
      );
      orderIdx = Number(agg[0]?.m ?? -1) + 1;
    }

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO session_questions
        (session_id, kind, prompt, options, identify_override, state, order_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        kind,
        prompt,
        input.options != null ? JSON.stringify(input.options) : null,
        input.identifyOverride === 'identified' ||
        input.identifyOverride === 'anonymous'
          ? input.identifyOverride
          : null,
        input.state && QUESTION_STATES.includes(input.state)
          ? input.state
          : 'queued',
        orderIdx,
      ]
    );

    const question = await this.getQuestionById(Number(result.insertId));
    if (!question) throw new Error('Failed to create question');

    await this.appendEvent({
      sessionId: session.id,
      organizationId,
      questionId: question.id,
      type: 'question.added',
      payload: { kind: question.kind, state: question.state },
    });

    return question;
  }

  static async getQuestionById(id: number): Promise<LiveQuestion | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_questions WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapQuestion(rows[0]) : null;
  }

  static async listQuestions(sessionId: number): Promise<LiveQuestion[]> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_questions
       WHERE session_id = ?
       ORDER BY order_idx ASC, id ASC`,
      [sessionId]
    );
    return rows.map(mapQuestion);
  }

  static async updateQuestion(
    id: number,
    organizationId: number,
    patch: {
      prompt?: string;
      options?: unknown;
      identifyOverride?: LiveIdentifyOverride | null;
      state?: LiveQuestionState;
      orderIdx?: number;
      kind?: LiveQuestionKind;
    }
  ): Promise<LiveQuestion> {
    const existing = await this.getQuestionById(id);
    if (!existing) throw new Error('Question not found');
    const session = await this.getSessionById(existing.sessionId, organizationId);
    if (!session) throw new Error('Question not found');

    const prompt =
      patch.prompt != null ? String(patch.prompt).trim() : existing.prompt;
    if (!prompt) throw new Error('prompt is required');

    const kind =
      patch.kind && QUESTION_KINDS.includes(patch.kind)
        ? patch.kind
        : existing.kind;
    const state =
      patch.state && QUESTION_STATES.includes(patch.state)
        ? patch.state
        : existing.state;
    const identifyOverride =
      patch.identifyOverride !== undefined
        ? patch.identifyOverride === 'identified' ||
          patch.identifyOverride === 'anonymous'
          ? patch.identifyOverride
          : null
        : existing.identifyOverride;
    const options =
      patch.options !== undefined ? patch.options : existing.options;
    const orderIdx =
      patch.orderIdx != null ? Number(patch.orderIdx) : existing.orderIdx;

    const sql = await openSql();
    await sql.execute(
      `UPDATE session_questions
       SET kind = ?, prompt = ?, options = ?, identify_override = ?,
           state = ?, order_idx = ?
       WHERE id = ? AND session_id = ?`,
      [
        kind,
        prompt,
        options != null ? JSON.stringify(options) : null,
        identifyOverride,
        state,
        orderIdx,
        id,
        existing.sessionId,
      ]
    );

    if (state !== existing.state) {
      await this.appendEvent({
        sessionId: existing.sessionId,
        organizationId,
        questionId: id,
        type: `question.state.${state}`,
        payload: { from: existing.state, to: state },
      });
    }

    const updated = await this.getQuestionById(id);
    if (!updated) throw new Error('Question not found after update');
    return updated;
  }

  // ── Events (append-only) ─────────────────────────────────────────────

  static async appendEvent(params: {
    sessionId: number;
    organizationId: number;
    participantId?: number | null;
    questionId?: number | null;
    type: string;
    payload?: unknown;
  }): Promise<LiveSessionEvent> {
    const organizationId = normalizeOrgId(params.organizationId);
    const type = String(params.type || '').trim().slice(0, 64);
    if (!type) throw new Error('event type is required');

    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO session_events
        (session_id, organization_id, participant_id, question_id, type, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.sessionId,
        organizationId,
        params.participantId ?? null,
        params.questionId ?? null,
        type,
        params.payload != null ? JSON.stringify(params.payload) : null,
      ]
    );

    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_events WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    if (!rows[0]) throw new Error('Failed to append event');
    return mapEvent(rows[0]);
  }

  static async listEvents(
    sessionId: number,
    organizationId: number,
    opts?: { sinceId?: number; limit?: number; type?: string }
  ): Promise<LiveSessionEvent[]> {
    const orgId = normalizeOrgId(organizationId);
    const limit = Math.min(1000, Math.max(1, Number(opts?.limit) || 200));
    const sql = await openSql();

    let sqlText = `SELECT * FROM session_events
      WHERE session_id = ? AND organization_id = ?`;
    const params: unknown[] = [sessionId, orgId];
    if (opts?.sinceId != null && Number(opts.sinceId) > 0) {
      sqlText += ` AND id > ?`;
      params.push(Number(opts.sinceId));
    }
    if (opts?.type) {
      sqlText += ` AND type = ?`;
      params.push(String(opts.type));
    }
    sqlText += ` ORDER BY id ASC LIMIT ${limit}`;

    const [rows] = await sql.execute<RowDataPacket[]>(sqlText, params);
    return rows.map(mapEvent);
  }

  // ── L2 participant actions (append-only events) ──────────────────────

  /** Effective identify mode for a question (session default + override). */
  static resolveIdentifyMode(
    session: LiveSession,
    question: LiveQuestion | null
  ): LiveIdentifyOverride | 'per_question' {
    if (question?.identifyOverride) return question.identifyOverride;
    if (session.identifyMode === 'per_question') return 'per_question';
    return session.identifyMode === 'anonymous' ? 'anonymous' : 'identified';
  }

  static async getActiveQuestion(
    sessionId: number
  ): Promise<LiveQuestion | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM session_questions
       WHERE session_id = ? AND state = 'active'
       ORDER BY order_idx ASC, id ASC
       LIMIT 1`,
      [sessionId]
    );
    return rows[0] ? mapQuestion(rows[0]) : null;
  }

  /**
   * Record a poll / scale / open / wordcloud response.
   * Always appends; tallies project the latest answer per participant.
   */
  static async recordResponse(params: {
    sessionId: number;
    organizationId: number;
    participantId: number;
    questionId: number;
    value: unknown;
  }): Promise<LiveSessionEvent> {
    const orgId = normalizeOrgId(params.organizationId);
    const session = await this.getSessionById(params.sessionId, orgId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'ended') throw new Error('Session has ended');

    const participant = await this.getParticipantById(
      params.participantId,
      orgId
    );
    if (!participant || participant.sessionId !== session.id) {
      throw new Error('Participant not in this session');
    }

    const question = await this.getQuestionById(params.questionId);
    if (!question || question.sessionId !== session.id) {
      throw new Error('Question not in this session');
    }
    if (question.state !== 'active') {
      throw new Error('Question is not active');
    }
    if (question.kind === 'qa') {
      throw new Error('Use askQa for Q&A prompts');
    }

    const mode = this.resolveIdentifyMode(session, question);
    if (mode === 'identified' && participant.isAnonymous) {
      throw new Error('This question requires an identified participant');
    }

    return this.appendEvent({
      sessionId: session.id,
      organizationId: orgId,
      participantId: participant.id,
      questionId: question.id,
      type: `response.${question.kind}`,
      payload: {
        value: params.value,
        identified: !participant.isAnonymous && mode !== 'anonymous',
        kind: question.kind,
      },
    });
  }

  static async askQa(params: {
    sessionId: number;
    organizationId: number;
    participantId: number;
    text: string;
    questionId?: number | null;
  }): Promise<LiveSessionEvent> {
    const orgId = normalizeOrgId(params.organizationId);
    const session = await this.getSessionById(params.sessionId, orgId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'ended') throw new Error('Session has ended');

    const participant = await this.getParticipantById(
      params.participantId,
      orgId
    );
    if (!participant || participant.sessionId !== session.id) {
      throw new Error('Participant not in this session');
    }

    const text = String(params.text || '').trim().slice(0, 500);
    if (!text) throw new Error('Question text is required');

    return this.appendEvent({
      sessionId: session.id,
      organizationId: orgId,
      participantId: participant.id,
      questionId: params.questionId ?? null,
      type: 'qa.asked',
      payload: {
        text,
        identified: !participant.isAnonymous,
        displayName: participant.isAnonymous
          ? null
          : participant.displayName,
      },
    });
  }

  static async upvoteQa(params: {
    sessionId: number;
    organizationId: number;
    participantId: number;
    askEventId: number;
  }): Promise<LiveSessionEvent> {
    const orgId = normalizeOrgId(params.organizationId);
    const session = await this.getSessionById(params.sessionId, orgId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'ended') throw new Error('Session has ended');

    const participant = await this.getParticipantById(
      params.participantId,
      orgId
    );
    if (!participant || participant.sessionId !== session.id) {
      throw new Error('Participant not in this session');
    }

    const events = await this.listEvents(session.id, orgId, {
      limit: 1000,
    });
    const ask = events.find(
      (e) => e.id === params.askEventId && e.type === 'qa.asked'
    );
    if (!ask) throw new Error('Question not found');

    const already = events.some(
      (e) =>
        e.type === 'qa.upvoted' &&
        e.participantId === participant.id &&
        (e.payload as any)?.askEventId === params.askEventId
    );
    if (already) {
      throw new Error('Already upvoted');
    }

    return this.appendEvent({
      sessionId: session.id,
      organizationId: orgId,
      participantId: participant.id,
      questionId: ask.questionId,
      type: 'qa.upvoted',
      payload: { askEventId: params.askEventId },
    });
  }

  /** Project audience Q&A board from append-only events. */
  static async projectQaBoard(
    sessionId: number,
    organizationId: number
  ): Promise<
    Array<{
      askEventId: number;
      text: string;
      upvotes: number;
      displayName: string | null;
      identified: boolean;
      createdAt: string;
      upvotedByMe?: boolean;
    }>
  > {
    const events = await this.listEvents(sessionId, organizationId, {
      limit: 1000,
    });
    const asks = new Map<
      number,
      {
        askEventId: number;
        text: string;
        upvotes: number;
        displayName: string | null;
        identified: boolean;
        createdAt: string;
        upvoterIds: Set<number>;
      }
    >();

    for (const e of events) {
      if (e.type === 'qa.asked') {
        const p = (e.payload || {}) as Record<string, unknown>;
        asks.set(e.id, {
          askEventId: e.id,
          text: String(p.text || ''),
          upvotes: 0,
          displayName: p.displayName != null ? String(p.displayName) : null,
          identified: Boolean(p.identified),
          createdAt: e.createdAt,
          upvoterIds: new Set(),
        });
      } else if (e.type === 'qa.upvoted') {
        const askId = Number((e.payload as any)?.askEventId);
        const row = asks.get(askId);
        if (row && e.participantId != null) {
          if (!row.upvoterIds.has(e.participantId)) {
            row.upvoterIds.add(e.participantId);
            row.upvotes += 1;
          }
        }
      }
    }

    return Array.from(asks.values())
      .map(({ upvoterIds, ...rest }) => ({ ...rest }))
      .sort((a, b) => b.upvotes - a.upvotes || b.askEventId - a.askEventId);
  }

  /** Latest response value per participant for a question (projection). */
  static async latestResponseForParticipant(
    sessionId: number,
    organizationId: number,
    participantId: number,
    questionId: number
  ): Promise<unknown | null> {
    const events = await this.listEvents(sessionId, organizationId, {
      limit: 1000,
    });
    let latest: unknown | null = null;
    for (const e of events) {
      if (
        e.participantId === participantId &&
        e.questionId === questionId &&
        e.type.startsWith('response.')
      ) {
        latest = (e.payload as any)?.value ?? null;
      }
    }
    return latest;
  }

  // ── L3 screen projections ────────────────────────────────────────────

  static async countParticipants(
    sessionId: number,
    organizationId: number
  ): Promise<number> {
    const orgId = normalizeOrgId(organizationId);
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM session_participants
       WHERE session_id = ? AND organization_id = ?`,
      [sessionId, orgId]
    );
    return Number(rows[0]?.c) || 0;
  }

  /**
   * Latest answer per participant for a question, then aggregate.
   * Poll → option bars; scale → histogram + avg; open/wordcloud → token weights.
   */
  static async projectQuestionResults(
    sessionId: number,
    organizationId: number,
    question: LiveQuestion
  ): Promise<{
    responseCount: number;
    pollBars: Array<{ label: string; count: number; pct: number }>;
    scale: { average: number | null; count: number; buckets: number[] } | null;
    wordCloud: Array<{ text: string; weight: number }>;
  }> {
    const events = await this.listEvents(sessionId, organizationId, {
      limit: 2000,
    });
    const latestByParticipant = new Map<number, unknown>();
    for (const e of events) {
      if (
        e.questionId === question.id &&
        e.participantId != null &&
        e.type.startsWith('response.')
      ) {
        latestByParticipant.set(e.participantId, (e.payload as any)?.value);
      }
    }

    const values = Array.from(latestByParticipant.values());
    const responseCount = values.length;

    const pollBars: Array<{ label: string; count: number; pct: number }> = [];
    let scale: {
      average: number | null;
      count: number;
      buckets: number[];
    } | null = null;
    const wordCloud: Array<{ text: string; weight: number }> = [];

    if (question.kind === 'poll') {
      const opts = Array.isArray(question.options)
        ? question.options.map((o) =>
            typeof o === 'string'
              ? o
              : String((o as any)?.label ?? (o as any)?.value ?? o)
          )
        : [];
      const counts = new Map<string, number>();
      for (const o of opts) counts.set(o, 0);
      for (const v of values) {
        const label = String(v);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      for (const [label, count] of counts) {
        pollBars.push({
          label,
          count,
          pct: responseCount ? Math.round((count / responseCount) * 100) : 0,
        });
      }
      // Keep option order first, then write-ins
      pollBars.sort((a, b) => {
        const ai = opts.indexOf(a.label);
        const bi = opts.indexOf(b.label);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return b.count - a.count;
      });
    } else if (question.kind === 'scale') {
      const buckets = Array.from({ length: 10 }, () => 0);
      let sum = 0;
      let n = 0;
      for (const v of values) {
        const num = Number(v);
        if (!Number.isFinite(num)) continue;
        const idx = Math.min(9, Math.max(0, Math.round(num) - 1));
        buckets[idx]! += 1;
        sum += num;
        n += 1;
      }
      scale = {
        average: n ? Math.round((sum / n) * 10) / 10 : null,
        count: n,
        buckets,
      };
    } else if (question.kind === 'open' || question.kind === 'wordcloud') {
      const weights = new Map<string, number>();
      for (const v of values) {
        const raw = String(v || '').trim();
        if (!raw) continue;
        const tokens =
          question.kind === 'wordcloud'
            ? [raw.toLowerCase()]
            : raw
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .map((t) => t.trim())
                .filter((t) => t.length >= 3);
        for (const t of tokens) {
          weights.set(t, (weights.get(t) || 0) + 1);
        }
      }
      wordCloud.push(
        ...Array.from(weights.entries())
          .map(([text, weight]) => ({ text, weight }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 60)
      );
    }

    return { responseCount, pollBars, scale, wordCloud };
  }

  /** Full presenter / SSE snapshot for a session code. */
  static async buildScreenSnapshot(code: string): Promise<{
    asOf: string;
    session: {
      id: number;
      code: string;
      title: string;
      hostName: string | null;
      eventType: string;
      identifyMode: string;
      status: string;
    };
    participantCount: number;
    activeQuestion: null | {
      id: number;
      kind: string;
      prompt: string;
      options: unknown;
      identifyEffective: string;
      results: Awaited<ReturnType<typeof LiveRepo.projectQuestionResults>>;
    };
    questions: Array<{
      id: number;
      kind: string;
      prompt: string;
      state: string;
      orderIdx: number;
    }>;
    qa: Awaited<ReturnType<typeof LiveRepo.projectQaBoard>>;
    joinPath: string;
  } | null> {
    const found = await this.getLiveSessionByCode(code);
    if (!found) return null;
    const { session, questions } = found;
    const active =
      questions.find((q) => q.state === 'active') ||
      (await this.getActiveQuestion(session.id));
    const participantCount = await this.countParticipants(
      session.id,
      session.organizationId
    );
    const qa = await this.projectQaBoard(session.id, session.organizationId);
    let activePayload: {
      id: number;
      kind: string;
      prompt: string;
      options: unknown;
      identifyEffective: string;
      results: Awaited<ReturnType<typeof LiveRepo.projectQuestionResults>>;
    } | null = null;
    if (active) {
      const results = await this.projectQuestionResults(
        session.id,
        session.organizationId,
        active
      );
      activePayload = {
        id: active.id,
        kind: active.kind,
        prompt: active.prompt,
        options: active.options,
        identifyEffective: String(this.resolveIdentifyMode(session, active)),
        results,
      };
    }
    return {
      asOf: new Date().toISOString(),
      session: {
        id: session.id,
        code: session.code,
        title: session.title,
        hostName: session.hostName,
        eventType: session.eventType,
        identifyMode: session.identifyMode,
        status: session.status,
      },
      participantCount,
      activeQuestion: activePayload,
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        state: q.state,
        orderIdx: q.orderIdx,
      })),
      qa,
      joinPath: `/live/${session.code}`,
    };
  }

  /** Activate one question (closes other actives). */
  static async setQuestionState(params: {
    sessionId: number;
    organizationId: number;
    questionId: number;
    state: LiveQuestionState;
  }): Promise<LiveQuestion> {
    const orgId = normalizeOrgId(params.organizationId);
    const session = await this.getSessionById(params.sessionId, orgId);
    if (!session) throw new Error('Session not found');
    const question = await this.getQuestionById(params.questionId);
    if (!question || question.sessionId !== session.id) {
      throw new Error('Question not in this session');
    }

    if (params.state === 'active') {
      const sql = await openSql();
      const [actives] = await sql.execute<RowDataPacket[]>(
        `SELECT id FROM session_questions
         WHERE session_id = ? AND state = 'active' AND id <> ?`,
        [session.id, question.id]
      );
      for (const row of actives) {
        await this.updateQuestion(Number(row.id), orgId, { state: 'closed' });
      }
      if (session.status === 'draft') {
        await this.updateSession(session.id, orgId, { status: 'live' });
      }
    }

    return this.updateQuestion(question.id, orgId, { state: params.state });
  }
}
