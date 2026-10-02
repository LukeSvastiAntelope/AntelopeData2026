/**
 * Persist analytics → Spread content drafts.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type AnalyticsDraftKind =
  | 'chart_post'
  | 'explainer_video'
  | 'candidate_clip';

export type AnalyticsDraftFlag = 'publishable' | 'directional_only';

export type AnalyticsContentDraftRow = {
  id: number;
  userId: number;
  organizationId: number | null;
  conversationId: string | null;
  surveyId: number | null;
  draftKind: AnalyticsDraftKind;
  title: string;
  claim: string;
  honestCaveat: string | null;
  suggestedAngle: string | null;
  flag: AnalyticsDraftFlag;
  caption: string | null;
  scriptJson: Record<string, unknown> | null;
  blurb: string | null;
  figureStorageKey: string | null;
  figureMediaUrl: string | null;
  figureCaption: string | null;
  sampleN: number | null;
  sourceLine: string | null;
  status: 'ready' | 'opened' | 'staged' | 'used' | 'dismissed';
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsDraftLifecycleStatus =
  AnalyticsContentDraftRow['status'];

function decodeRow(row: RowDataPacket): AnalyticsContentDraftRow {
  const parseJson = (raw: unknown) => {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try {
      return JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    conversationId: row.conversation_id != null ? String(row.conversation_id) : null,
    surveyId: row.survey_id != null ? Number(row.survey_id) : null,
    draftKind: row.draft_kind as AnalyticsDraftKind,
    title: String(row.title || ''),
    claim: String(row.claim || ''),
    honestCaveat: row.honest_caveat != null ? String(row.honest_caveat) : null,
    suggestedAngle:
      row.suggested_angle != null ? String(row.suggested_angle) : null,
    flag: (row.flag as AnalyticsDraftFlag) || 'directional_only',
    caption: row.caption != null ? String(row.caption) : null,
    scriptJson: parseJson(row.script_json),
    blurb: row.blurb != null ? String(row.blurb) : null,
    figureStorageKey:
      row.figure_storage_key != null ? String(row.figure_storage_key) : null,
    figureMediaUrl:
      row.figure_media_url != null ? String(row.figure_media_url) : null,
    figureCaption:
      row.figure_caption != null ? String(row.figure_caption) : null,
    sampleN: row.sample_n != null ? Number(row.sample_n) : null,
    sourceLine: row.source_line != null ? String(row.source_line) : null,
    status: row.status as AnalyticsContentDraftRow['status'],
    payload: parseJson(row.payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type CreateAnalyticsDraftInput = {
  userId: number;
  organizationId?: number | null;
  conversationId?: string | null;
  surveyId?: number | null;
  draftKind: AnalyticsDraftKind;
  title: string;
  claim: string;
  honestCaveat?: string | null;
  suggestedAngle?: string | null;
  flag: AnalyticsDraftFlag;
  caption?: string | null;
  scriptJson?: Record<string, unknown> | null;
  blurb?: string | null;
  figureStorageKey?: string | null;
  figureMediaUrl?: string | null;
  figureCaption?: string | null;
  sampleN?: number | null;
  sourceLine?: string | null;
  payload?: Record<string, unknown> | null;
};

export const AnalyticsContentDraftRepo = {
  async create(input: CreateAnalyticsDraftInput): Promise<AnalyticsContentDraftRow> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO analytics_content_drafts (
         user_id, organization_id, conversation_id, survey_id, draft_kind,
         title, claim, honest_caveat, suggested_angle, flag, caption,
         script_json, blurb, figure_storage_key, figure_media_url, figure_caption,
         sample_n, source_line, payload
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.organizationId ?? null,
        input.conversationId ?? null,
        input.surveyId ?? null,
        input.draftKind,
        input.title,
        input.claim,
        input.honestCaveat ?? null,
        input.suggestedAngle ?? null,
        input.flag,
        input.caption ?? null,
        input.scriptJson ? JSON.stringify(input.scriptJson) : null,
        input.blurb ?? null,
        input.figureStorageKey ?? null,
        input.figureMediaUrl ?? null,
        input.figureCaption ?? null,
        input.sampleN ?? null,
        input.sourceLine ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
      ]
    );
    const created = await this.getById(Number(result.insertId), input.userId);
    if (!created) throw new Error('Failed to load created content draft');
    return created;
  },

  async getById(
    id: number,
    userId: number
  ): Promise<AnalyticsContentDraftRow | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM analytics_content_drafts WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );
    return rows[0] ? decodeRow(rows[0]) : null;
  },

  async listForUser(
    userId: number,
    opts?: { limit?: number; status?: string; includeTerminal?: boolean }
  ): Promise<AnalyticsContentDraftRow[]> {
    const db = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 40, 1), 100);
    const status = opts?.status;
    const [rows] = status
      ? await db.execute<RowDataPacket[]>(
          `SELECT * FROM analytics_content_drafts
            WHERE user_id = ? AND status = ?
            ORDER BY created_at DESC LIMIT ${limit}`,
          [userId, status]
        )
      : opts?.includeTerminal
        ? await db.execute<RowDataPacket[]>(
            `SELECT * FROM analytics_content_drafts
              WHERE user_id = ?
              ORDER BY created_at DESC LIMIT ${limit}`,
            [userId]
          )
        : await db.execute<RowDataPacket[]>(
            `SELECT * FROM analytics_content_drafts
              WHERE user_id = ? AND status NOT IN ('dismissed', 'used')
              ORDER BY created_at DESC LIMIT ${limit}`,
            [userId]
          );
    return rows.map(decodeRow);
  },

  /**
   * Campaign Flow "Next: Spread" only cares about untouched ready drafts.
   * Opened / staged / used / dismissed must not keep the nudge sticky.
   */
  async countReadyForUser(userId: number): Promise<number> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM analytics_content_drafts
        WHERE user_id = ? AND status = 'ready'`,
      [userId]
    );
    return Number(rows[0]?.cnt || 0);
  },

  /** @deprecated Prefer countReadyForUser for flow nudges. */
  async countForUser(userId: number): Promise<number> {
    return this.countReadyForUser(userId);
  },

  async markOpened(id: number, userId: number): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE analytics_content_drafts SET status = 'opened'
        WHERE id = ? AND user_id = ? AND status = 'ready'`,
      [id, userId]
    );
  },

  /** Mark draft consumed so Campaign Flow stops nudging Spread. */
  async markUsed(id: number, userId: number): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE analytics_content_drafts SET status = 'used'
        WHERE id = ? AND user_id = ?
          AND status IN ('ready', 'opened', 'staged')`,
      [id, userId]
    );
  },

  async markDismissed(id: number, userId: number): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE analytics_content_drafts SET status = 'dismissed'
        WHERE id = ? AND user_id = ?
          AND status IN ('ready', 'opened', 'staged', 'used')`,
      [id, userId]
    );
  },

  async markStaged(id: number, userId: number): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE analytics_content_drafts SET status = 'staged'
        WHERE id = ? AND user_id = ?
          AND status IN ('ready', 'opened')`,
      [id, userId]
    );
  },

  async setStatus(
    id: number,
    userId: number,
    status: AnalyticsDraftLifecycleStatus
  ): Promise<AnalyticsContentDraftRow | null> {
    if (status === 'used') await this.markUsed(id, userId);
    else if (status === 'dismissed') await this.markDismissed(id, userId);
    else if (status === 'staged') await this.markStaged(id, userId);
    else if (status === 'opened') await this.markOpened(id, userId);
    else return this.getById(id, userId);
    return this.getById(id, userId);
  },
};
