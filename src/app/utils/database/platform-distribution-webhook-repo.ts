/**
 * Platform-scoped Zapier/Make destinations (Antelope own-growth).
 * No organization_id — super-admin only. Separate from campaign webhooks.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from './db';
import {
  generateWebhookSecret,
  maskSecret,
  maskWebhookUrl,
  type DistributionContentType,
} from './distribution-webhook-repo';

export type PlatformWebhookRow = {
  id: number;
  label: string;
  url: string;
  secret: string;
  contentTypes: DistributionContentType[];
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastSuccessAt: Date | string | null;
  lastFailureAt: Date | string | null;
};

export type PlatformWebhookPublic = {
  id: number;
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

function normalizeContentTypes(raw: unknown): DistributionContentType[] {
  const allowed = new Set<DistributionContentType>(['video', 'text']);
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
  return out.length ? Array.from(new Set(out)) : ['text'];
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function decodeRow(row: RowDataPacket): PlatformWebhookRow | null {
  const url = decryptUrl(row.url_encrypted as string);
  if (!url) return null;
  return {
    id: Number(row.id),
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

export function toPublicPlatformWebhook(
  row: PlatformWebhookRow
): PlatformWebhookPublic {
  return {
    id: row.id,
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

export const PlatformDistributionWebhookRepo = {
  listAll: async (): Promise<PlatformWebhookRow[]> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM platform_distribution_webhooks ORDER BY created_at ASC`
    );
    return rows
      .map(decodeRow)
      .filter((r): r is PlatformWebhookRow => r != null);
  },

  listEnabledForContent: async (
    contentType: DistributionContentType
  ): Promise<PlatformWebhookRow[]> => {
    const all = await PlatformDistributionWebhookRepo.listAll();
    return all.filter(
      (r) => r.enabled && r.contentTypes.includes(contentType)
    );
  },

  getById: async (id: number): Promise<PlatformWebhookRow | null> => {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM platform_distribution_webhooks WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows[0]) return null;
    return decodeRow(rows[0]);
  },

  create: async (input: {
    label: string;
    url: string;
    contentTypes?: DistributionContentType[];
    enabled?: boolean;
  }): Promise<PlatformWebhookRow> => {
    const db = await openSql();
    const secret = generateWebhookSecret();
    const contentTypes = normalizeContentTypes(
      input.contentTypes ?? ['text']
    );
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO platform_distribution_webhooks
        (label, url_encrypted, secret, content_types, enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.label.slice(0, 128),
        encryptUrl(input.url),
        secret,
        JSON.stringify(contentTypes),
        input.enabled === false ? 0 : 1,
      ]
    );
    const created = await PlatformDistributionWebhookRepo.getById(
      Number(result.insertId)
    );
    if (!created) throw new Error('Failed to load created platform webhook');
    return created;
  },

  update: async (
    id: number,
    patch: {
      label?: string;
      url?: string;
      contentTypes?: DistributionContentType[];
      enabled?: boolean;
      rotateSecret?: boolean;
    }
  ): Promise<PlatformWebhookRow | null> => {
    const existing = await PlatformDistributionWebhookRepo.getById(id);
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
      `UPDATE platform_distribution_webhooks
       SET label = ?, url_encrypted = ?, secret = ?, content_types = ?,
           enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        label,
        encryptUrl(url),
        secret,
        JSON.stringify(contentTypes),
        enabled ? 1 : 0,
        id,
      ]
    );
    return PlatformDistributionWebhookRepo.getById(id);
  },

  delete: async (id: number): Promise<boolean> => {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM platform_distribution_webhooks WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  },

  markDelivery: async (id: number, ok: boolean): Promise<void> => {
    const db = await openSql();
    const col = ok ? 'last_success_at' : 'last_failure_at';
    await db.execute(
      `UPDATE platform_distribution_webhooks
       SET ${col} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
  },
};
