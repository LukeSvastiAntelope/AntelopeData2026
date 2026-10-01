/**
 * Org-scoped Zapier/Make distribution webhook destinations.
 * URLs are encrypted at rest; clients only ever see a masked form after save.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from './db';

export type DistributionContentType = 'video' | 'text' | 'image';

export type DistributionWebhookRow = {
  id: number;
  organizationId: number;
  label: string;
  /** Decrypted URL — server-only; never send to client. */
  url: string;
  secret: string;
  contentTypes: DistributionContentType[];
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastSuccessAt: Date | string | null;
  lastFailureAt: Date | string | null;
};

/** Safe client projection — URL masked, secret masked. */
export type DistributionWebhookPublic = {
  id: number;
  organizationId: number;
  label: string;
  urlMasked: string;
  secretMasked: string;
  contentTypes: DistributionContentType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

function getEncryptionKey(): Buffer {
  const key = process.env.SECURE_STORAGE_KEY || '';
  if (!key || key.length < 32) {
    throw new Error('SECURE_STORAGE_KEY must be set to a 32+ char value');
  }
  return Buffer.from(key.substring(0, 32));
}

function encryptUrl(url: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(url, 'utf8')),
    cipher.final(),
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptUrl(enc: string | null): string | null {
  if (!enc) return null;
  const [ivHex, dataHex] = String(enc).split(':');
  if (!ivHex || !dataHex) return null;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function maskWebhookUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname || '/';
    const tail =
      path.length <= 8 ? path : `…${path.slice(-6)}`;
    return `https://${host}${tail}`;
  } catch {
    if (url.length <= 12) return '••••••••';
    return `${url.slice(0, 12)}…••••`;
  }
}

export function maskSecret(secret: string): string {
  if (!secret) return '••••';
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)}`;
}

function normalizeContentTypes(
  raw: unknown
): DistributionContentType[] {
  const allowed = new Set<DistributionContentType>(['video', 'text', 'image']);
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }
  const out = arr
    .map((v) => String(v).toLowerCase())
    .filter((v): v is DistributionContentType =>
      allowed.has(v as DistributionContentType)
    );
  return out.length ? Array.from(new Set(out)) : ['video', 'text'];
}

function decodeRow(row: RowDataPacket): DistributionWebhookRow | null {
  const url = decryptUrl(row.url_encrypted as string);
  if (!url) return null;
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    label: String(row.label || ''),
    url,
    secret: String(row.secret || ''),
    contentTypes: normalizeContentTypes(row.content_types),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
  };
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

export function toPublicWebhook(
  row: DistributionWebhookRow
): DistributionWebhookPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    label: row.label,
    urlMasked: maskWebhookUrl(row.url),
    secretMasked: maskSecret(row.secret),
    contentTypes: row.contentTypes,
    enabled: row.enabled,
    createdAt: toIso(row.createdAt) || '',
    updatedAt: toIso(row.updatedAt) || '',
    lastSuccessAt: toIso(row.lastSuccessAt),
    lastFailureAt: toIso(row.lastFailureAt),
  };
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}

export const DistributionWebhookRepo = {
  listByOrg: async (
    organizationId: number
  ): Promise<DistributionWebhookRow[]> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM distribution_webhooks
       WHERE organization_id = ?
       ORDER BY created_at ASC`,
      [organizationId]
    );
    return rows
      .map(decodeRow)
      .filter((r): r is DistributionWebhookRow => r != null);
  },

  listEnabledForContent: async (
    organizationId: number,
    contentType: DistributionContentType
  ): Promise<DistributionWebhookRow[]> => {
    const all = await DistributionWebhookRepo.listByOrg(organizationId);
    return all.filter(
      (r) => r.enabled && r.contentTypes.includes(contentType)
    );
  },

  getById: async (
    organizationId: number,
    id: number
  ): Promise<DistributionWebhookRow | null> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM distribution_webhooks
       WHERE id = ? AND organization_id = ?
       LIMIT 1`,
      [id, organizationId]
    );
    if (!rows[0]) return null;
    return decodeRow(rows[0]);
  },

  create: async (input: {
    organizationId: number;
    label: string;
    url: string;
    contentTypes: DistributionContentType[];
    enabled?: boolean;
    secret?: string;
  }): Promise<DistributionWebhookRow> => {
    const db = await openSql();
    const secret = input.secret || generateWebhookSecret();
    const contentTypes = normalizeContentTypes(input.contentTypes);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO distribution_webhooks
        (organization_id, label, url_encrypted, secret, content_types, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        input.label.slice(0, 128),
        encryptUrl(input.url),
        secret,
        JSON.stringify(contentTypes),
        input.enabled === false ? 0 : 1,
      ]
    );
    const created = await DistributionWebhookRepo.getById(
      input.organizationId,
      Number(result.insertId)
    );
    if (!created) throw new Error('Failed to load created webhook');
    return created;
  },

  update: async (
    organizationId: number,
    id: number,
    patch: {
      label?: string;
      url?: string;
      contentTypes?: DistributionContentType[];
      enabled?: boolean;
      rotateSecret?: boolean;
    }
  ): Promise<DistributionWebhookRow | null> => {
    const existing = await DistributionWebhookRepo.getById(
      organizationId,
      id
    );
    if (!existing) return null;

    const label =
      patch.label != null ? patch.label.slice(0, 128) : existing.label;
    const url = patch.url != null ? patch.url : existing.url;
    const contentTypes =
      patch.contentTypes != null
        ? normalizeContentTypes(patch.contentTypes)
        : existing.contentTypes;
    const enabled =
      patch.enabled != null ? Boolean(patch.enabled) : existing.enabled;
    const secret = patch.rotateSecret
      ? generateWebhookSecret()
      : existing.secret;

    const db = await openSql();
    await db.execute(
      `UPDATE distribution_webhooks
       SET label = ?, url_encrypted = ?, secret = ?, content_types = ?,
           enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [
        label,
        encryptUrl(url),
        secret,
        JSON.stringify(contentTypes),
        enabled ? 1 : 0,
        id,
        organizationId,
      ]
    );
    return DistributionWebhookRepo.getById(organizationId, id);
  },

  delete: async (
    organizationId: number,
    id: number
  ): Promise<boolean> => {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM distribution_webhooks
       WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
    return result.affectedRows > 0;
  },

  markDelivery: async (
    organizationId: number,
    id: number,
    ok: boolean
  ): Promise<void> => {
    const db = await openSql();
    const col = ok ? 'last_success_at' : 'last_failure_at';
    await db.execute(
      `UPDATE distribution_webhooks
       SET ${col} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [id, organizationId]
    );
  },
};
