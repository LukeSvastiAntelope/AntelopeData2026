/**
 * Sites S5 — tenant-scoped site form capture.
 * Organization is ALWAYS derived from a published site slug (never trusted from the client).
 */

import { createHash } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import { SiteRepo } from '@/app/utils/database/site-repo';
import { PersonRepo } from '@/app/utils/database/person-repo';
import { normalizePhone } from '@/app/utils/services/twilio';
import type { SiteRecord } from '@/app/utils/types/site';

export type SiteFormType = 'signup' | 'contact' | 'volunteer' | 'donate';

export type ResolvedSiteTenant = {
  site: SiteRecord;
  organizationId: number;
};

/** Resolve published site → org. Client organizationId is ignored. */
export async function resolvePublishedSiteTenant(
  siteSlug: string | null | undefined
): Promise<ResolvedSiteTenant | null> {
  const slug = String(siteSlug || '').trim();
  if (!slug) return null;
  const site = await SiteRepo.getPublishedSiteBySlug(slug);
  if (!site) return null;
  if (!Number.isFinite(site.organizationId) || site.organizationId <= 0) {
    return null;
  }
  return { site, organizationId: site.organizationId };
}

function digitsOnly(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function splitName(name: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Org-scoped suppression: contact_suppression rows linked to person_records
 * in the SAME organization matching email or phone digits.
 */
export async function isOrgContactSuppressed(params: {
  organizationId: number;
  email?: string | null;
  phone?: string | null;
}): Promise<boolean> {
  const orgId = Number(params.organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return false;

  const email = normalizeEmail(params.email);
  const phoneDigits = digitsOnly(params.phone);
  if (!email && phoneDigits.length < 8) return false;

  const db = await openSql();
  const clauses: string[] = [];
  const values: unknown[] = [orgId, orgId];

  if (email) {
    clauses.push('LOWER(pr.email) = ?');
    values.push(email);
  }
  if (phoneDigits.length >= 8) {
    // Compare last 10 digits to tolerate country-code variance
    const tail = phoneDigits.slice(-10);
    clauses.push(
      `REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(pr.phone,''),'+',''),'-',''),' ',''),'(','') LIKE ?`
    );
    values.push(`%${tail}`);
  }

  if (!clauses.length) return false;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1
     FROM contact_suppression cs
     INNER JOIN person_records pr
       ON pr.id = cs.person_record_id
      AND pr.organization_id = ?
     WHERE cs.organization_id = ?
       AND (${clauses.join(' OR ')})
     LIMIT 1`,
    values
  );
  return Boolean(rows?.[0]);
}

export async function upsertSitePerson(params: {
  organizationId: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
}): Promise<number | null> {
  const orgId = Number(params.organizationId);
  const email = normalizeEmail(params.email);
  let phone: string | null = null;
  if (params.phone) {
    const n = normalizePhone(String(params.phone));
    if (n && digitsOnly(n).length >= 8) phone = n;
  }
  if (!email && !phone && !String(params.name || '').trim()) return null;

  const { firstName, lastName } = splitName(params.name);
  const clusterKey = createHash('sha1')
    .update(
      ['site', orgId, email || '', digitsOnly(phone), firstName || '', lastName || ''].join('|')
    )
    .digest('hex')
    .slice(0, 16);

  await PersonRepo.upsertFromUpload(orgId, [
    {
      clusterKey,
      firstName,
      lastName,
      email,
      phone,
      matchConfidence: 0.7,
      fieldProvenance: { source: params.source },
      sourceRowIds: [params.source],
    },
  ]);

  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM person_records
     WHERE organization_id = ? AND cluster_key = ?
     LIMIT 1`,
    [orgId, clusterKey]
  );
  const personId = rows?.[0]?.id != null ? Number(rows[0].id) : null;

  if (personId) {
    const sourceKey = createHash('sha1')
      .update([params.source, email || '', digitsOnly(phone), Date.now()].join('|'))
      .digest('hex')
      .slice(0, 24);
    await db.execute(
      `INSERT INTO person_source_rows
         (organization_id, source_name, source_row_key, person_record_id, payload)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         person_record_id = VALUES(person_record_id),
         payload = VALUES(payload),
         updated_at = CURRENT_TIMESTAMP`,
      [
        orgId,
        params.source,
        sourceKey,
        personId,
        JSON.stringify({
          name: params.name || null,
          email,
          phone,
          capturedAt: new Date().toISOString(),
        }),
      ]
    );
  }

  return personId;
}

export type CaptureSiteFormInput = {
  siteSlug: string;
  formType: SiteFormType;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  amountCents?: number | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  /** When true, skip person upsert (e.g. suppressed). Still stores the row. */
  skipPersonUpsert?: boolean;
};

export type CaptureSiteFormResult = {
  organizationId: number;
  siteId: number;
  siteSlug: string;
  formType: SiteFormType;
  submissionId: number;
  personRecordId: number | null;
  suppressed: boolean;
  /** Echo for callers that must not use a different org. */
  tenant: ResolvedSiteTenant;
};

export async function captureSiteForm(
  input: CaptureSiteFormInput
): Promise<CaptureSiteFormResult> {
  const tenant = await resolvePublishedSiteTenant(input.siteSlug);
  if (!tenant) {
    throw Object.assign(new Error('Site not found or not published'), {
      statusCode: 404,
      code: 'SITE_NOT_FOUND',
    });
  }

  const { organizationId, site } = tenant;
  const email = normalizeEmail(input.email);
  let phone: string | null = null;
  if (input.phone) {
    const n = normalizePhone(String(input.phone));
    if (n && digitsOnly(n).length >= 8) phone = n;
  }

  const suppressed = await isOrgContactSuppressed({
    organizationId,
    email,
    phone,
  });

  let personRecordId: number | null = null;
  if (!suppressed && !input.skipPersonUpsert) {
    personRecordId = await upsertSitePerson({
      organizationId,
      name: input.name,
      email,
      phone,
      source: `site_${input.formType}`,
    });
  } else if (suppressed) {
    // Still try to find existing person in THIS org only (for linkage) — never other orgs.
    const db = await openSql();
    if (email) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM person_records
         WHERE organization_id = ? AND LOWER(email) = ?
         LIMIT 1`,
        [organizationId, email]
      );
      if (rows?.[0]?.id) personRecordId = Number(rows[0].id);
    }
  }

  const db = await openSql();
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO site_form_submissions
       (organization_id, site_id, site_slug, form_type, name, email, phone,
        message, amount_cents, person_record_id, suppressed, metadata, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizationId,
      site.id,
      site.slug,
      input.formType,
      input.name?.trim() || null,
      email,
      phone,
      input.message?.trim() || null,
      input.amountCents ?? null,
      personRecordId,
      suppressed ? 1 : 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip || null,
      (input.userAgent || '').slice(0, 255) || null,
    ]
  );

  return {
    organizationId,
    siteId: site.id,
    siteSlug: site.slug,
    formType: input.formType,
    submissionId: Number(result.insertId),
    personRecordId,
    suppressed,
    tenant,
  };
}

/** Request helper: client IP + UA */
export function requestClientMeta(req: {
  headers: { get(name: string): string | null };
}): { ip: string | null; userAgent: string | null } {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 255) || null;
  return { ip, userAgent };
}

/** Org owner / campaign inbox for site contact notifications. */
export async function getOrgContactInbox(
  organizationId: number,
  siteFooterEmail?: string | null
): Promise<string | null> {
  const footer = normalizeEmail(siteFooterEmail);
  if (footer) return footer;

  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT u.email
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, om.role = 'admin' DESC, om.accepted_at ASC
     LIMIT 1`,
    [organizationId]
  );
  return normalizeEmail(rows?.[0]?.email);
}

/** Simple in-memory rate limit shared by site form endpoints. */
const rateBuckets = new Map<string, number[]>();

export function checkSiteFormRateLimit(
  key: string,
  limit = 8,
  windowMs = 60 * 60 * 1000
): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}
