/**
 * Sites S1 — CRUD + public published lookup by slug.
 * Mirrors survey-repo slug uniqueness (base + UUID segment).
 */

import { randomUUID } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import {
  type CreateSiteInput,
  type SiteContent,
  type SitePageKey,
  type SiteRecord,
  type SiteStatus,
  type SiteTemplateId,
  type SiteTheme,
  type UpdateSiteInput,
  defaultSiteContent,
  defaultSiteTheme,
} from '@/app/utils/types/site';

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function normalizeOrgId(organizationId: number): number {
  if (!Number.isFinite(Number(organizationId)) || Number(organizationId) <= 0) {
    throw new Error('organizationId is required');
  }
  return Number(organizationId);
}

/** Survey-style slug: title → kebab base + 8-char UUID segment. */
export function buildSiteSlug(source: string): string {
  const baseSlug = String(source || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'campaign';
  const uniqueId = randomUUID().split('-')[0];
  return `${baseSlug}-${uniqueId}`;
}

function mapRow(row: RowDataPacket): SiteRecord {
  const templateId = String(row.template_id || 'classic_civic') as SiteTemplateId;
  const theme = parseJson<SiteTheme>(
    row.theme,
    defaultSiteTheme(templateId)
  );
  const content = parseJson<SiteContent>(row.content, defaultSiteContent());
  const enabledPages = parseJson<SitePageKey[]>(row.enabled_pages, ['home']);

  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    slug: String(row.slug),
    templateId,
    theme,
    content,
    enabledPages: Array.isArray(enabledPages) && enabledPages.length
      ? enabledPages
      : ['home'],
    status: (row.status === 'published' ? 'published' : 'draft') as SiteStatus,
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : null,
    createdBy: row.created_by != null ? Number(row.created_by) : null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : null,
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : null,
  };
}

export const SiteRepo = {
  async createSite(input: CreateSiteInput): Promise<number> {
    const db = await openSql();
    const organizationId = normalizeOrgId(input.organizationId);
    const templateId = input.templateId || 'classic_civic';
    const theme = defaultSiteTheme(templateId, input.theme);
    const content = defaultSiteContent(
      input.content as Partial<SiteContent> | undefined
    );
    const enabledPages: SitePageKey[] =
      input.enabledPages && input.enabledPages.length
        ? input.enabledPages
        : ['home'];
    const status: SiteStatus = input.status === 'published' ? 'published' : 'draft';

    const slugSource =
      input.slug?.trim() ||
      content.meta.candidateName ||
      content.meta.office ||
      'campaign';
    // If caller passed a bare title-like slug without UUID, uniquify it.
    const slug =
      input.slug && /-[a-f0-9]{8}$/i.test(input.slug.trim())
        ? input.slug.trim().substring(0, 96)
        : buildSiteSlug(slugSource);

    const publishedAt = status === 'published' ? new Date() : null;

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO sites
        (organization_id, slug, template_id, theme, content, enabled_pages, status, published_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        slug,
        templateId,
        JSON.stringify(theme),
        JSON.stringify(content),
        JSON.stringify(enabledPages),
        status,
        publishedAt,
        input.createdBy ?? null,
      ]
    );

    return Number(result.insertId);
  },

  async getSiteById(
    siteId: number,
    organizationId?: number | null
  ): Promise<SiteRecord | null> {
    const db = await openSql();
    if (organizationId != null && Number(organizationId) > 0) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM sites WHERE id = ? AND organization_id = ? LIMIT 1`,
        [siteId, Number(organizationId)]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM sites WHERE id = ? LIMIT 1`,
      [siteId]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async listSitesByOrganization(
    organizationId: number
  ): Promise<SiteRecord[]> {
    const db = await openSql();
    const orgId = normalizeOrgId(organizationId);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM sites WHERE organization_id = ? ORDER BY updated_at DESC`,
      [orgId]
    );
    return (rows || []).map(mapRow);
  },

  /**
   * Public serving lookup — published only (mirrors getSurveyBySlug).
   */
  async getPublishedSiteBySlug(slug: string): Promise<SiteRecord | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM sites WHERE slug = ? AND status = 'published' LIMIT 1`,
      [String(slug || '').trim()]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /** Any status — builder/preview. */
  async getSiteBySlugAny(
    slug: string,
    organizationId?: number | null
  ): Promise<SiteRecord | null> {
    const db = await openSql();
    if (organizationId != null && Number(organizationId) > 0) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM sites WHERE slug = ? AND organization_id = ? LIMIT 1`,
        [String(slug || '').trim(), Number(organizationId)]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM sites WHERE slug = ? LIMIT 1`,
      [String(slug || '').trim()]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async updateSite(
    siteId: number,
    organizationId: number,
    data: UpdateSiteInput
  ): Promise<boolean> {
    const db = await openSql();
    const orgId = normalizeOrgId(organizationId);
    const existing = await this.getSiteById(siteId, orgId);
    if (!existing) return false;

    const templateId = data.templateId ?? existing.templateId;
    const theme = data.theme
      ? { ...existing.theme, ...data.theme }
      : existing.theme;
    const content = data.content ?? existing.content;
    const enabledPages = data.enabledPages ?? existing.enabledPages;

    let slug = existing.slug;
    if (data.slug?.trim()) {
      slug = data.slug.trim().substring(0, 96);
    } else if (data.regenerateSlugFrom?.trim()) {
      slug = buildSiteSlug(data.regenerateSlugFrom.trim());
    }

    let status = existing.status;
    let publishedAt: Date | string | null = existing.publishedAt
      ? new Date(existing.publishedAt)
      : null;
    if (data.status === 'published' || data.status === 'draft') {
      status = data.status;
      if (status === 'published' && !publishedAt) {
        publishedAt = new Date();
      }
      if (status === 'draft') {
        // Keep published_at for history; status gates public serve.
      }
    }

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE sites
       SET slug = ?, template_id = ?, theme = ?, content = ?, enabled_pages = ?,
           status = ?, published_at = ?
       WHERE id = ? AND organization_id = ?`,
      [
        slug,
        templateId,
        JSON.stringify(theme),
        JSON.stringify(content),
        JSON.stringify(enabledPages),
        status,
        publishedAt,
        siteId,
        orgId,
      ]
    );

    return result.affectedRows > 0;
  },

  async deleteSite(
    siteId: number,
    organizationId: number
  ): Promise<boolean> {
    const db = await openSql();
    const orgId = normalizeOrgId(organizationId);
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM sites WHERE id = ? AND organization_id = ?`,
      [siteId, orgId]
    );
    return result.affectedRows > 0;
  },
};
