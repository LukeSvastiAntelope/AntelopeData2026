/**
 * Admin A4 — time-boxed support impersonation sessions ("view as" campaign).
 */

import { randomUUID } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import { SUPPORT_COOKIE } from '@/app/utils/auth/support-ctx-cookie';

export type SupportMode = 'read' | 'write';

export type SupportSession = {
  id: string;
  actorUserId: number;
  actorEmail: string;
  targetOrganizationId: number;
  targetOrganizationName: string | null;
  mode: SupportMode;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationSeconds: number | null;
  active: boolean;
};

export { SUPPORT_COOKIE };
/** Default window: 30 minutes. */
export const SUPPORT_DEFAULT_MINUTES = 30;
/** Hard cap: 2 hours. */
export const SUPPORT_MAX_MINUTES = 120;

function mapRow(row: RowDataPacket, now = Date.now()): SupportSession {
  const endedAt = row.ended_at ? new Date(row.ended_at).toISOString() : null;
  const expiresAt = new Date(row.expires_at).toISOString();
  const expired = new Date(row.expires_at).getTime() <= now;
  const active = !endedAt && !expired;
  return {
    id: String(row.id),
    actorUserId: Number(row.actor_user_id),
    actorEmail: String(row.actor_email || ''),
    targetOrganizationId: Number(row.target_organization_id),
    targetOrganizationName:
      row.target_organization_name != null
        ? String(row.target_organization_name)
        : null,
    mode: row.mode === 'write' ? 'write' : 'read',
    startedAt: new Date(row.started_at).toISOString(),
    expiresAt,
    endedAt,
    endReason: row.end_reason != null ? String(row.end_reason) : null,
    durationSeconds:
      row.duration_seconds != null ? Number(row.duration_seconds) : null,
    active,
  };
}

export const AdminSupportRepo = {
  async getById(id: string): Promise<SupportSession | null> {
    if (!id) return null;
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM admin_support_sessions WHERE id = ? LIMIT 1`,
      [String(id)]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /** Active session for actor (not ended, not expired). */
  async getActiveForActor(actorUserId: number): Promise<SupportSession | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM admin_support_sessions
       WHERE actor_user_id = ?
         AND ended_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       ORDER BY started_at DESC
       LIMIT 1`,
      [Number(actorUserId)]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async start(input: {
    actorUserId: number;
    actorEmail: string;
    targetOrganizationId: number;
    targetOrganizationName?: string | null;
    mode?: SupportMode;
    durationMinutes?: number;
    metadata?: Record<string, unknown> | null;
  }): Promise<SupportSession> {
    const minutes = Math.min(
      SUPPORT_MAX_MINUTES,
      Math.max(
        5,
        Number(input.durationMinutes) || SUPPORT_DEFAULT_MINUTES
      )
    );
    const mode: SupportMode = input.mode === 'write' ? 'write' : 'read';
    const id = randomUUID();

    const db = await openSql();

    // End any prior active session for this actor (replaced).
    await db.execute<ResultSetHeader>(
      `UPDATE admin_support_sessions
       SET ended_at = UTC_TIMESTAMP(),
           end_reason = 'replaced',
           duration_seconds = TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP())
       WHERE actor_user_id = ?
         AND ended_at IS NULL`,
      [Number(input.actorUserId)]
    );

    await db.execute<ResultSetHeader>(
      `INSERT INTO admin_support_sessions
        (id, actor_user_id, actor_email, target_organization_id,
         target_organization_name, mode, started_at, expires_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(),
               DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?)`,
      [
        id,
        Number(input.actorUserId),
        String(input.actorEmail).slice(0, 255),
        Number(input.targetOrganizationId),
        input.targetOrganizationName
          ? String(input.targetOrganizationName).slice(0, 255)
          : null,
        mode,
        minutes,
        input.metadata != null ? JSON.stringify(input.metadata) : null,
      ]
    );

    const created = await this.getById(id);
    if (!created) throw new Error('Failed to create support session');
    return created;
  },

  async end(
    id: string,
    reason: 'manual' | 'expired' | 'replaced' | 'revoked' = 'manual'
  ): Promise<SupportSession | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.endedAt) return existing;

    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `UPDATE admin_support_sessions
       SET ended_at = UTC_TIMESTAMP(),
           end_reason = ?,
           duration_seconds = TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP())
       WHERE id = ? AND ended_at IS NULL`,
      [reason, id]
    );
    return this.getById(id);
  },

  /** Mark expired-but-not-ended rows; returns sessions closed this pass. */
  async expireStale(): Promise<number> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE admin_support_sessions
       SET ended_at = expires_at,
           end_reason = 'expired',
           duration_seconds = TIMESTAMPDIFF(SECOND, started_at, expires_at)
       WHERE ended_at IS NULL
         AND expires_at <= UTC_TIMESTAMP()`
    );
    return result.affectedRows;
  },
};
