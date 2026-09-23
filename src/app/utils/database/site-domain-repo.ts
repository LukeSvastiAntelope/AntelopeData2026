/**
 * site_domains CRUD + published-host → slug resolve (Sites S6).
 */

import { randomBytes } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import { normalizeHost } from '@/app/utils/site-host';

export type SiteDomainRecord = {
  id: number;
  siteId: number;
  organizationId: number;
  host: string;
  verified: boolean;
  verificationToken: string;
  vercelDomainId: string | null;
  dnsInstructions: Record<string, unknown> | null;
  createdAt: string | null;
  verifiedAt: string | null;
  updatedAt: string | null;
  /** Joined when listing */
  siteSlug?: string;
  siteStatus?: string;
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

function mapRow(row: RowDataPacket): SiteDomainRecord {
  return {
    id: Number(row.id),
    siteId: Number(row.site_id),
    organizationId: Number(row.organization_id),
    host: String(row.host),
    verified: Boolean(row.verified),
    verificationToken: String(row.verification_token),
    vercelDomainId: row.vercel_domain_id != null ? String(row.vercel_domain_id) : null,
    dnsInstructions: parseJson(row.dns_instructions, null),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    verifiedAt: row.verified_at
      ? new Date(row.verified_at).toISOString()
      : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    siteSlug: row.site_slug != null ? String(row.site_slug) : undefined,
    siteStatus: row.site_status != null ? String(row.site_status) : undefined,
  };
}

export function newVerificationToken(): string {
  return randomBytes(16).toString('hex');
}

export const SiteDomainRepo = {
  async listBySite(
    siteId: number,
    organizationId: number
  ): Promise<SiteDomainRecord[]> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT d.*, s.slug AS site_slug, s.status AS site_status
       FROM site_domains d
       JOIN sites s ON s.id = d.site_id
       WHERE d.site_id = ? AND d.organization_id = ?
       ORDER BY d.created_at DESC`,
      [siteId, organizationId]
    );
    return (rows || []).map(mapRow);
  },

  async getById(
    id: number,
    organizationId?: number
  ): Promise<SiteDomainRecord | null> {
    const db = await openSql();
    if (organizationId != null) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT d.*, s.slug AS site_slug, s.status AS site_status
         FROM site_domains d
         JOIN sites s ON s.id = d.site_id
         WHERE d.id = ? AND d.organization_id = ?
         LIMIT 1`,
        [id, organizationId]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT d.*, s.slug AS site_slug, s.status AS site_status
       FROM site_domains d
       JOIN sites s ON s.id = d.site_id
       WHERE d.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async getByHost(host: string): Promise<SiteDomainRecord | null> {
    const h = normalizeHost(host);
    if (!h) return null;
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT d.*, s.slug AS site_slug, s.status AS site_status
       FROM site_domains d
       JOIN sites s ON s.id = d.site_id
       WHERE d.host = ?
       LIMIT 1`,
      [h]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /**
   * Public resolve: verified custom host → published site slug only.
   */
  async resolvePublishedSlugByHost(host: string): Promise<string | null> {
    const h = normalizeHost(host);
    if (!h) return null;
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT s.slug
       FROM site_domains d
       JOIN sites s ON s.id = d.site_id AND s.organization_id = d.organization_id
       WHERE d.host = ?
         AND d.verified = 1
         AND s.status = 'published'
       LIMIT 1`,
      [h]
    );
    return rows[0]?.slug ? String(rows[0].slug) : null;
  },

  async create(params: {
    siteId: number;
    organizationId: number;
    host: string;
    verificationToken: string;
    vercelDomainId?: string | null;
    dnsInstructions?: Record<string, unknown> | null;
  }): Promise<number> {
    const db = await openSql();
    const host = normalizeHost(params.host);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO site_domains
         (site_id, organization_id, host, verified, verification_token,
          vercel_domain_id, dns_instructions)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
      [
        params.siteId,
        params.organizationId,
        host,
        params.verificationToken,
        params.vercelDomainId ?? null,
        params.dnsInstructions
          ? JSON.stringify(params.dnsInstructions)
          : null,
      ]
    );
    return Number(result.insertId);
  },

  async markVerified(id: number, organizationId: number): Promise<boolean> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE site_domains
       SET verified = 1,
           verified_at = COALESCE(verified_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return result.affectedRows > 0;
  },

  async updateVercelMeta(
    id: number,
    organizationId: number,
    data: {
      vercelDomainId?: string | null;
      dnsInstructions?: Record<string, unknown> | null;
    }
  ): Promise<boolean> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE site_domains
       SET vercel_domain_id = COALESCE(?, vercel_domain_id),
           dns_instructions = COALESCE(?, dns_instructions),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [
        data.vercelDomainId ?? null,
        data.dnsInstructions ? JSON.stringify(data.dnsInstructions) : null,
        id,
        organizationId,
      ]
    );
    return result.affectedRows > 0;
  },

  async delete(
    id: number,
    organizationId: number
  ): Promise<SiteDomainRecord | null> {
    const existing = await this.getById(id, organizationId);
    if (!existing) return null;
    const db = await openSql();
    await db.execute(
      `DELETE FROM site_domains WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return existing;
  },
};
