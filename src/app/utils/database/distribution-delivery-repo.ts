/**
 * Persistence for distribution_deliveries (W2 retry log).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from './db';

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'exhausted';

export type DistributionDeliveryRow = {
  id: number;
  stagedActionId: number;
  webhookId: number;
  organizationId: number;
  status: DeliveryStatus;
  httpStatus: number | null;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
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

function toIso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRow(row: RowDataPacket): DistributionDeliveryRow {
  return {
    id: Number(row.id),
    stagedActionId: Number(row.staged_action_id),
    webhookId: Number(row.webhook_id),
    organizationId: Number(row.organization_id),
    status: row.status as DeliveryStatus,
    httpStatus: row.http_status != null ? Number(row.http_status) : null,
    attempt: Number(row.attempt || 0),
    maxAttempts: Number(row.max_attempts || 3),
    nextAttemptAt: toIso(row.next_attempt_at),
    error: row.error != null ? String(row.error) : null,
    payload: parseJson(row.payload_json, null),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toMysqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export const DistributionDeliveryRepo = {
  create: async (input: {
    stagedActionId: number;
    webhookId: number;
    organizationId: number;
    payload: Record<string, unknown>;
    nextAttemptAt?: Date;
    maxAttempts?: number;
  }): Promise<DistributionDeliveryRow> => {
    const db = await openSql();
    const next = input.nextAttemptAt || new Date();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO distribution_deliveries
        (staged_action_id, webhook_id, organization_id, status, attempt,
         max_attempts, next_attempt_at, payload_json)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
      [
        input.stagedActionId,
        input.webhookId,
        input.organizationId,
        input.maxAttempts ?? 3,
        toMysqlDatetime(next),
        JSON.stringify(input.payload),
      ]
    );
    const row = await DistributionDeliveryRepo.getById(Number(result.insertId));
    if (!row) throw new Error('Failed to load created delivery');
    return row;
  },

  getById: async (id: number): Promise<DistributionDeliveryRow | null> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM distribution_deliveries WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  listByStagedAction: async (
    stagedActionId: number
  ): Promise<DistributionDeliveryRow[]> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM distribution_deliveries
       WHERE staged_action_id = ?
       ORDER BY id ASC`,
      [stagedActionId]
    );
    return rows.map(mapRow);
  },

  listDue: async (limit = 50): Promise<DistributionDeliveryRow[]> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM distribution_deliveries
       WHERE status IN ('pending', 'failed')
         AND attempt < max_attempts
         AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP())
       ORDER BY next_attempt_at ASC
       LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}`
    );
    return rows.map(mapRow);
  },

  markAttempt: async (input: {
    id: number;
    ok: boolean;
    httpStatus?: number | null;
    error?: string | null;
    nextAttemptAt?: Date | null;
    exhausted?: boolean;
  }): Promise<void> => {
    const db = await openSql();
    const status = input.ok
      ? 'success'
      : input.exhausted
        ? 'exhausted'
        : 'failed';
    await db.execute(
      `UPDATE distribution_deliveries
       SET status = ?,
           http_status = ?,
           attempt = attempt + 1,
           error = ?,
           next_attempt_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status,
        input.httpStatus ?? null,
        input.error ?? null,
        input.nextAttemptAt ? toMysqlDatetime(input.nextAttemptAt) : null,
        input.id,
      ]
    );
  },

  /** Reset a failed/exhausted row for manual retry (immediate). */
  resetForManualRetry: async (
    id: number
  ): Promise<DistributionDeliveryRow | null> => {
    const db = await openSql();
    await db.execute(
      `UPDATE distribution_deliveries
       SET status = 'pending',
           next_attempt_at = UTC_TIMESTAMP(),
           error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('failed', 'exhausted', 'pending')`,
      [id]
    );
    return DistributionDeliveryRepo.getById(id);
  },
};
