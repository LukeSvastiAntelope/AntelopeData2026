/**
 * Admin A5 — Antelope-owned growth channel + marketing drafts (platform-level).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type GrowthProvider = 'twitter';
export type GrowthChannelStatus = 'draft' | 'connected' | 'paused' | 'revoked';
export type MarketingDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'cancelled';
export type MarketingDraftSource = 'manual' | 'agent' | 'scheduler';

export type GrowthChannel = {
  id: number;
  provider: GrowthProvider;
  handle: string;
  displayName: string | null;
  status: GrowthChannelStatus;
  settings: Record<string, unknown>;
  hasCredentials: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MarketingDraft = {
  id: number;
  channelId: number;
  provider: GrowthProvider;
  status: MarketingDraftStatus;
  body: string;
  topic: string | null;
  tone: string | null;
  source: MarketingDraftSource;
  stagedActionId: number | null;
  scheduledFor: string | null;
  approvedAt: string | null;
  approvedBy: number | null;
  rejectedAt: string | null;
  rejectedBy: number | null;
  postedAt: string | null;
  postExternalId: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function mapChannel(row: RowDataPacket): GrowthChannel {
  return {
    id: Number(row.id),
    provider: 'twitter',
    handle: String(row.handle || 'antelopeHQ'),
    displayName: row.display_name != null ? String(row.display_name) : null,
    status: (row.status as GrowthChannelStatus) || 'draft',
    settings: parseJson(row.settings, {}),
    hasCredentials: row.encrypted_credentials != null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function mapDraft(row: RowDataPacket): MarketingDraft {
  return {
    id: Number(row.id),
    channelId: Number(row.channel_id),
    provider: 'twitter',
    status: row.status as MarketingDraftStatus,
    body: String(row.body || ''),
    topic: row.topic != null ? String(row.topic) : null,
    tone: row.tone != null ? String(row.tone) : null,
    source: (row.source as MarketingDraftSource) || 'agent',
    stagedActionId:
      row.staged_action_id != null ? Number(row.staged_action_id) : null,
    scheduledFor: row.scheduled_for
      ? new Date(row.scheduled_for).toISOString()
      : null,
    approvedAt: row.approved_at
      ? new Date(row.approved_at).toISOString()
      : null,
    approvedBy: row.approved_by != null ? Number(row.approved_by) : null,
    rejectedAt: row.rejected_at
      ? new Date(row.rejected_at).toISOString()
      : null,
    rejectedBy: row.rejected_by != null ? Number(row.rejected_by) : null,
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
    postExternalId:
      row.post_external_id != null ? String(row.post_external_id) : null,
    metadata: parseJson(row.metadata, null),
    createdBy: row.created_by != null ? Number(row.created_by) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export const AntelopeGrowthRepo = {
  async ensureTwitterChannel(): Promise<GrowthChannel> {
    const existing = await this.getChannelByProvider('twitter');
    if (existing) return existing;
    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `INSERT INTO antelope_growth_channels
         (provider, handle, display_name, status, settings)
       VALUES ('twitter', 'antelopeHQ', 'Antelope', 'connected', ?)`,
      [
        JSON.stringify({
          autoDraftEnabled: true,
          tone: 'plainspoken civic-tech',
          topics: [
            'downballot tools',
            'listen-analyze-act loop',
            'transparent pricing',
            'district intelligence',
          ],
        }),
      ]
    );
    const created = await this.getChannelByProvider('twitter');
    if (!created) throw new Error('Failed to seed Antelope Twitter channel');
    return created;
  },

  async getChannelByProvider(
    provider: GrowthProvider = 'twitter'
  ): Promise<GrowthChannel | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM antelope_growth_channels WHERE provider = ? LIMIT 1`,
      [provider]
    );
    return rows[0] ? mapChannel(rows[0]) : null;
  },

  async updateChannelSettings(
    provider: GrowthProvider,
    patch: {
      handle?: string;
      displayName?: string | null;
      status?: GrowthChannelStatus;
      settings?: Record<string, unknown>;
    }
  ): Promise<GrowthChannel | null> {
    const existing = await this.getChannelByProvider(provider);
    if (!existing) return null;
    const db = await openSql();
    await db.execute(
      `UPDATE antelope_growth_channels SET
         handle = ?,
         display_name = ?,
         status = ?,
         settings = ?
       WHERE id = ?`,
      [
        patch.handle != null
          ? String(patch.handle).replace(/^@/, '').slice(0, 64)
          : existing.handle,
        patch.displayName !== undefined
          ? patch.displayName
          : existing.displayName,
        patch.status || existing.status,
        JSON.stringify(patch.settings ?? existing.settings),
        existing.id,
      ]
    );
    return this.getChannelByProvider(provider);
  },

  async listDrafts(opts?: {
    status?: MarketingDraftStatus | MarketingDraftStatus[];
    limit?: number;
  }): Promise<MarketingDraft[]> {
    const db = await openSql();
    const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 50));
    if (!opts?.status) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM antelope_marketing_drafts
         ORDER BY created_at DESC LIMIT ${limit}`
      );
      return rows.map(mapDraft);
    }
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    const ph = statuses.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM antelope_marketing_drafts
       WHERE status IN (${ph})
       ORDER BY created_at DESC LIMIT ${limit}`,
      statuses
    );
    return rows.map(mapDraft);
  },

  async getDraft(id: number): Promise<MarketingDraft | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM antelope_marketing_drafts WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapDraft(rows[0]) : null;
  },

  async createDraft(input: {
    channelId: number;
    body: string;
    topic?: string | null;
    tone?: string | null;
    source?: MarketingDraftSource;
    status?: MarketingDraftStatus;
    stagedActionId?: number | null;
    scheduledFor?: string | null;
    metadata?: Record<string, unknown> | null;
    createdBy?: number | null;
  }): Promise<MarketingDraft> {
    const body = String(input.body || '').trim().slice(0, 560);
    if (!body) throw new Error('Draft body is required');
    const status: MarketingDraftStatus =
      input.status === 'pending_approval' ||
      input.status === 'draft' ||
      input.status === 'approved'
        ? input.status
        : 'pending_approval';
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO antelope_marketing_drafts
        (channel_id, provider, status, body, topic, tone, source,
         staged_action_id, scheduled_for, metadata, created_by)
       VALUES (?, 'twitter', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.channelId,
        status,
        body,
        input.topic ? String(input.topic).slice(0, 255) : null,
        input.tone ? String(input.tone).slice(0, 64) : null,
        input.source || 'agent',
        input.stagedActionId ?? null,
        input.scheduledFor ? new Date(input.scheduledFor) : null,
        input.metadata != null ? JSON.stringify(input.metadata) : null,
        input.createdBy ?? null,
      ]
    );
    const created = await this.getDraft(Number(result.insertId));
    if (!created) throw new Error('Failed to create marketing draft');
    return created;
  },

  async setStagedActionId(
    draftId: number,
    stagedActionId: number
  ): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE antelope_marketing_drafts SET staged_action_id = ? WHERE id = ?`,
      [stagedActionId, draftId]
    );
  },

  async approve(
    id: number,
    actorUserId: number
  ): Promise<MarketingDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft || draft.status !== 'pending_approval') return null;
    const db = await openSql();
    await db.execute(
      `UPDATE antelope_marketing_drafts SET
         status = 'approved',
         approved_at = UTC_TIMESTAMP(),
         approved_by = ?,
         rejected_at = NULL,
         rejected_by = NULL
       WHERE id = ? AND status = 'pending_approval'`,
      [actorUserId, id]
    );
    return this.getDraft(id);
  },

  async reject(
    id: number,
    actorUserId: number
  ): Promise<MarketingDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft || draft.status !== 'pending_approval') return null;
    const db = await openSql();
    await db.execute(
      `UPDATE antelope_marketing_drafts SET
         status = 'rejected',
         rejected_at = UTC_TIMESTAMP(),
         rejected_by = ?
       WHERE id = ? AND status = 'pending_approval'`,
      [actorUserId, id]
    );
    return this.getDraft(id);
  },

  /**
   * Mark as posted after human approval — never called by automation.
   * Live X API publish is intentionally not wired (OpenClaw follow-on).
   */
  async markPosted(
    id: number,
    opts?: { externalId?: string | null; metadata?: Record<string, unknown> }
  ): Promise<MarketingDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft || draft.status !== 'approved') return null;
    const db = await openSql();
    const meta = {
      ...(draft.metadata || {}),
      ...(opts?.metadata || {}),
      markedPostedManually: true,
    };
    await db.execute(
      `UPDATE antelope_marketing_drafts SET
         status = 'posted',
         posted_at = UTC_TIMESTAMP(),
         post_external_id = ?,
         metadata = ?
       WHERE id = ? AND status = 'approved'`,
      [opts?.externalId ?? null, JSON.stringify(meta), id]
    );
    return this.getDraft(id);
  },

  async countPending(): Promise<number> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM antelope_marketing_drafts
       WHERE status = 'pending_approval'`
    );
    return Number(rows[0]?.n || 0);
  },
};
