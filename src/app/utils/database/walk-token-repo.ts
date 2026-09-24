/**
 * WalkTokenRepo — MiniVAN M2 scoped canvasser access tokens.
 * Raw token is shown once at create; only sha256(hash) is persisted.
 */

import { createHash, randomBytes } from 'crypto';
import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader } from 'mysql2';

export type WalkTokenRow = {
  id: number;
  organization_id: number;
  turf_id: number;
  canvasser_user_id: number;
  token_hash: string;
  label: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_by: number;
  created_at: Date;
  last_used_at: Date | null;
};

export function hashWalkToken(raw: string): string {
  return createHash('sha256').update(String(raw).trim()).digest('hex');
}

export function generateWalkTokenRaw(): string {
  return randomBytes(32).toString('base64url');
}

function normalize(row: any): WalkTokenRow {
  return {
    id: Number(row.id),
    organization_id: Number(row.organization_id),
    turf_id: Number(row.turf_id),
    canvasser_user_id: Number(row.canvasser_user_id),
    token_hash: String(row.token_hash),
    label: row.label ?? null,
    expires_at: new Date(row.expires_at),
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
    created_by: Number(row.created_by),
    created_at: new Date(row.created_at),
    last_used_at: row.last_used_at ? new Date(row.last_used_at) : null,
  };
}

export class WalkTokenRepo {
  static async create(params: {
    organizationId: number;
    turfId: number;
    canvasserUserId: number;
    createdBy: number;
    label?: string | null;
    /** Default 14 days */
    expiresInDays?: number;
  }): Promise<{ row: WalkTokenRow; rawToken: string }> {
    const rawToken = generateWalkTokenRaw();
    const tokenHash = hashWalkToken(rawToken);
    const days = Math.min(90, Math.max(1, Number(params.expiresInDays) || 14));
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO walk_tokens
        (organization_id, turf_id, canvasser_user_id, token_hash, label, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), ?)`,
      [
        params.organizationId,
        params.turfId,
        params.canvasserUserId,
        tokenHash,
        params.label ?? null,
        days,
        params.createdBy,
      ]
    );
    const row = await this.getById(Number(result.insertId), params.organizationId);
    if (!row) throw new Error('Failed to create walk token');
    return { row, rawToken };
  }

  static async getById(
    id: number,
    organizationId: number
  ): Promise<WalkTokenRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT * FROM walk_tokens WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, organizationId]
    );
    const r = (rows as any[])[0];
    return r ? normalize(r) : null;
  }

  static async listByTurf(
    turfId: number,
    organizationId: number
  ): Promise<WalkTokenRow[]> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT * FROM walk_tokens
       WHERE turf_id = ? AND organization_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [turfId, organizationId]
    );
    return (rows as any[]).map(normalize);
  }

  /**
   * Resolve a raw token for public walk access.
   * Returns null if unknown, revoked, or expired.
   */
  static async resolveActive(rawToken: string): Promise<WalkTokenRow | null> {
    const tokenHash = hashWalkToken(rawToken);
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT * FROM walk_tokens
       WHERE token_hash = ?
         AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [tokenHash]
    );
    const r = (rows as any[])[0];
    return r ? normalize(r) : null;
  }

  static async touchLastUsed(id: number): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE walk_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?`,
      [id]
    );
  }

  static async revoke(
    id: number,
    organizationId: number
  ): Promise<WalkTokenRow | null> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE walk_tokens SET revoked_at = UTC_TIMESTAMP()
       WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`,
      [id, organizationId]
    );
    return this.getById(id, organizationId);
  }

  /** True if voter_geo_id is on this turf's walk-list (hard scope gate). */
  static async isDoorOnTurf(
    turfId: number,
    voterGeoId: number
  ): Promise<boolean> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT 1 AS ok FROM turf_addresses
       WHERE turf_id = ? AND voter_geo_id = ? LIMIT 1`,
      [turfId, voterGeoId]
    );
    return (rows as any[]).length > 0;
  }
}
