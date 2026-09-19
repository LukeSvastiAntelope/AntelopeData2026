/**
 * AT1 — survey_autotrigger config + fire-state repo.
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export type AutotriggerAction = 'analytics' | 'newsletter' | 'video';
export type AutotriggerAutonomy = 'propose' | 'auto';

export type SurveyAutotrigger = {
  id: number;
  surveyId: number;
  enabled: boolean;
  threshold: number;
  actions: AutotriggerAction[];
  autonomy: AutotriggerAutonomy;
  lastFiredAt: string | null;
  lastFiredResponseCount: number;
  firedCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AutotriggerEvent = {
  id: number;
  surveyId: number;
  organizationId: number | null;
  eventType: string;
  responseCount: number;
  threshold: number;
  band: number;
  actions: AutotriggerAction[] | null;
  autonomy: string | null;
  result: Record<string, unknown> | null;
  createdAt: string | null;
};

const DEFAULT_ACTIONS: AutotriggerAction[] = ['analytics'];

function parseActions(raw: unknown): AutotriggerAction[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [...DEFAULT_ACTIONS];
    const allowed = new Set<AutotriggerAction>(['analytics', 'newsletter', 'video']);
    const out = arr
      .map((a) => String(a) as AutotriggerAction)
      .filter((a) => allowed.has(a));
    return out.length ? out : [...DEFAULT_ACTIONS];
  } catch {
    return [...DEFAULT_ACTIONS];
  }
}

function mapRow(r: any): SurveyAutotrigger {
  return {
    id: Number(r.id),
    surveyId: Number(r.survey_id),
    enabled: Boolean(r.enabled),
    threshold: Math.max(1, Number(r.threshold) || 20),
    actions: parseActions(r.actions),
    autonomy: r.autonomy === 'auto' ? 'auto' : 'propose',
    lastFiredAt: r.last_fired_at ? new Date(r.last_fired_at).toISOString() : null,
    lastFiredResponseCount: Number(r.last_fired_response_count || 0),
    firedCount: Number(r.fired_count || 0),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export class SurveyAutotriggerRepo {
  static async getBySurveyId(surveyId: number): Promise<SurveyAutotrigger | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_autotrigger WHERE survey_id = ? LIMIT 1`,
      [surveyId]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Ensure a row exists (defaults: disabled, threshold 20, analytics only). */
  static async ensure(surveyId: number): Promise<SurveyAutotrigger> {
    const existing = await this.getBySurveyId(surveyId);
    if (existing) return existing;
    const db = await openSql();
    try {
      await db.execute(
        `INSERT INTO survey_autotrigger (survey_id, enabled, threshold, actions, autonomy)
         VALUES (?, 0, 20, ?, 'propose')`,
        [surveyId, JSON.stringify(DEFAULT_ACTIONS)]
      );
    } catch (e: any) {
      // Race: another writer created the row
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
    }
    const row = await this.getBySurveyId(surveyId);
    if (!row) throw new Error('Failed to ensure survey_autotrigger');
    return row;
  }

  static async upsert(
    surveyId: number,
    patch: {
      enabled?: boolean;
      threshold?: number;
      actions?: AutotriggerAction[];
      autonomy?: AutotriggerAutonomy;
    }
  ): Promise<SurveyAutotrigger> {
    await this.ensure(surveyId);
    const current = (await this.getBySurveyId(surveyId))!;
    const enabled = patch.enabled ?? current.enabled;
    const threshold = Math.max(1, Math.min(100000, patch.threshold ?? current.threshold));
    const actions = patch.actions?.length ? patch.actions : current.actions;
    const autonomy = patch.autonomy ?? current.autonomy;
    const db = await openSql();
    await db.execute(
      `UPDATE survey_autotrigger
       SET enabled = ?, threshold = ?, actions = ?, autonomy = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE survey_id = ?`,
      [enabled ? 1 : 0, threshold, JSON.stringify(actions), autonomy, surveyId]
    );
    return (await this.getBySurveyId(surveyId))!;
  }

  /**
   * Atomic claim for a threshold-band crossing.
   * Returns claimed config + band if this caller won the race; null if already settled.
   * Band = floor(responseCount / threshold); fire only when band advances.
   */
  static async tryClaimFire(
    surveyId: number,
    responseCount: number
  ): Promise<{ config: SurveyAutotrigger; band: number } | null> {
    const config = await this.getBySurveyId(surveyId);
    if (!config || !config.enabled) return null;
    const threshold = config.threshold;
    if (responseCount < threshold) return null;
    const band = Math.floor(responseCount / threshold);
    const lastBand = Math.floor(config.lastFiredResponseCount / threshold);
    if (band <= lastBand) return null;

    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE survey_autotrigger
       SET last_fired_at = CURRENT_TIMESTAMP,
           last_fired_response_count = ?,
           fired_count = fired_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE survey_id = ?
         AND enabled = 1
         AND FLOOR(? / GREATEST(threshold, 1)) > FLOOR(last_fired_response_count / GREATEST(threshold, 1))
         AND ? >= threshold`,
      [responseCount, surveyId, responseCount, responseCount]
    );
    if (!result.affectedRows) return null;
    const updated = await this.getBySurveyId(surveyId);
    if (!updated) return null;
    return { config: updated, band };
  }

  static async emitEvent(params: {
    surveyId: number;
    organizationId?: number | null;
    eventType: string;
    responseCount: number;
    threshold: number;
    band: number;
    actions?: AutotriggerAction[];
    autonomy?: string;
    result?: Record<string, unknown>;
  }): Promise<number> {
    const db = await openSql();
    const [res] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_autotrigger_events
        (survey_id, organization_id, event_type, response_count, threshold, band,
         actions, autonomy, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.surveyId,
        params.organizationId ?? null,
        params.eventType,
        params.responseCount,
        params.threshold,
        params.band,
        params.actions ? JSON.stringify(params.actions) : null,
        params.autonomy ?? null,
        params.result ? JSON.stringify(params.result) : null,
      ]
    );
    return Number(res.insertId);
  }

  static async listEvents(
    surveyId: number,
    limit = 20
  ): Promise<AutotriggerEvent[]> {
    const db = await openSql();
    const lim = Math.min(Math.max(limit, 1), 100);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_autotrigger_events
       WHERE survey_id = ?
       ORDER BY id DESC
       LIMIT ${lim}`,
      [surveyId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      surveyId: Number(r.survey_id),
      organizationId: r.organization_id != null ? Number(r.organization_id) : null,
      eventType: String(r.event_type),
      responseCount: Number(r.response_count),
      threshold: Number(r.threshold),
      band: Number(r.band),
      actions: r.actions ? parseActions(r.actions) : null,
      autonomy: r.autonomy ? String(r.autonomy) : null,
      result:
        typeof r.result === 'string'
          ? JSON.parse(r.result)
          : (r.result as Record<string, unknown> | null),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  }

  /** Enabled configs for scheduler backstop (org-scoped optional). */
  static async listEnabled(orgId?: number | null): Promise<
    Array<SurveyAutotrigger & { organizationId: number | null; createdBy: number }>
  > {
    const db = await openSql();
    const where = orgId != null ? 'AND s.organization_id = ?' : '';
    const params = orgId != null ? [orgId] : [];
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT at.*, s.organization_id, s.created_by
       FROM survey_autotrigger at
       JOIN surveys s ON s.id = at.survey_id
       WHERE at.enabled = 1 ${where}
       ORDER BY at.id ASC`,
      params
    );
    return rows.map((r) => ({
      ...mapRow(r),
      organizationId: r.organization_id != null ? Number(r.organization_id) : null,
      createdBy: Number(r.created_by),
    }));
  }

  static async listForOrganization(orgId: number): Promise<
    Array<
      SurveyAutotrigger & {
        surveyTitle: string;
        responseCount: number;
      }
    >
  > {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT at.*, s.title AS survey_title,
              (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
       FROM survey_autotrigger at
       JOIN surveys s ON s.id = at.survey_id
       WHERE s.organization_id = ?
       ORDER BY at.enabled DESC, at.updated_at DESC`,
      [orgId]
    );
    return rows.map((r) => ({
      ...mapRow(r),
      surveyTitle: String(r.survey_title || ''),
      responseCount: Number(r.response_count || 0),
    }));
  }

  static async countResponses(surveyId: number): Promise<number> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?`,
      [surveyId]
    );
    return Number(rows[0]?.c || 0);
  }
}
