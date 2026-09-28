/**
 * Admin A1 — write/list platform super-admin audit entries.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type AdminAuditEntry = {
  id: number;
  actor_user_id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  actor_email?: string | null;
};

export async function writeAdminAuditLog(input: {
  actorUserId: number;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  try {
    const sql = await openSql();
    await sql.execute<ResultSetHeader>(
      `INSERT INTO admin_audit_log
        (actor_user_id, action, target_type, target_id, metadata, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        input.actorUserId,
        String(input.action).slice(0, 64),
        input.targetType != null
          ? String(input.targetType).slice(0, 64)
          : null,
        input.targetId != null
          ? String(input.targetId).slice(0, 64)
          : null,
        input.metadata != null ? JSON.stringify(input.metadata) : null,
        input.ip != null ? String(input.ip).slice(0, 64) : null,
      ]
    );
  } catch (err) {
    // Never fail the primary action because audit insert failed — log loudly.
    console.error('[admin_audit_log] write failed', err);
  }
}

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function listAdminAuditLog(input?: {
  limit?: number;
  offset?: number;
}): Promise<{ entries: AdminAuditEntry[]; total: number }> {
  const limit = Math.min(200, Math.max(1, Number(input?.limit) || 50));
  const offset = Math.max(0, Number(input?.offset) || 0);
  const sql = await openSql();

  const [countRows] = await sql.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM admin_audit_log`
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT a.id, a.actor_user_id, a.action, a.target_type, a.target_id,
            a.metadata, a.ip, a.created_at, u.email AS actor_email
     FROM admin_audit_log a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.id DESC
     LIMIT ${limit} OFFSET ${offset}`
  );

  const entries: AdminAuditEntry[] = rows.map((r) => ({
    id: Number(r.id),
    actor_user_id: Number(r.actor_user_id),
    action: String(r.action),
    target_type: r.target_type != null ? String(r.target_type) : null,
    target_id: r.target_id != null ? String(r.target_id) : null,
    metadata: parseMetadata(r.metadata),
    ip: r.ip != null ? String(r.ip) : null,
    created_at: r.created_at
      ? new Date(r.created_at).toISOString()
      : new Date().toISOString(),
    actor_email: r.actor_email != null ? String(r.actor_email) : null,
  }));

  return { entries, total };
}
