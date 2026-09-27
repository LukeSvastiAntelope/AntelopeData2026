/**
 * Volunteer V1 — identity + passwordless magic-link spine.
 *
 * Persistent volunteer identity = person_record (org-scoped) +
 * organization_members.role = 'volunteer'. Contact rails stay tenant-scoped;
 * no per-person scoring. Captain is reserved in the role enum only.
 */

import { createHash, randomBytes } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type StaffOrgRole = 'owner' | 'admin' | 'analyst' | 'viewer';
export type VolunteerOrgRole = 'volunteer';
/** Reserved for a future tier — do not build its view in v1. */
export type FutureOrgRole = 'captain';
export type OrgMemberRole = StaffOrgRole | VolunteerOrgRole | FutureOrgRole;

export const STAFF_ROLES: readonly StaffOrgRole[] = [
  'owner',
  'admin',
  'analyst',
  'viewer',
] as const;

export const PORTAL_ROLES: readonly OrgMemberRole[] = [
  'volunteer',
  'captain',
] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isPortalRole(role: string | null | undefined): boolean {
  return !!role && (PORTAL_ROLES as readonly string[]).includes(role);
}

export type VolunteerMembership = {
  organizationId: number;
  userId: number;
  role: OrgMemberRole;
  personRecordId: number | null;
  status: string;
  volunteerSource?: string | null;
  volunteerIntake?: Record<string, unknown> | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
};

export type VolunteerIntakeField = {
  id: string;
  label: string;
  type: 'text' | 'select' | 'multi-select' | 'number' | 'email' | 'url' | 'tel';
  required?: boolean;
  options?: string[];
  mapsTo?: string;
};

export type VolunteerIntakeSchema = {
  fields: VolunteerIntakeField[];
  consentPrompt?: string;
  /** Shown on public join page */
  headline?: string;
  body?: string;
};

export const DEFAULT_VOLUNTEER_INTAKE: VolunteerIntakeSchema = {
  headline: 'Join as a volunteer',
  body: 'Tell us a bit about yourself — we will email you a magic link to open the volunteer portal on your phone.',
  consentPrompt:
    'I agree to be contacted by this campaign about volunteering. I can opt out anytime.',
  fields: [
    { id: 'name', label: 'Full name', type: 'text', required: true, mapsTo: 'name' },
    { id: 'email', label: 'Email', type: 'email', required: true, mapsTo: 'email' },
    { id: 'phone', label: 'Phone', type: 'tel', required: false, mapsTo: 'phone' },
    {
      id: 'availability',
      label: 'When can you help?',
      type: 'text',
      required: false,
    },
  ],
};

export type MagicLinkIssue = {
  rawToken: string;
  expiresAt: Date;
  email: string;
  organizationId: number;
  personRecordId: number;
};

export type VolunteerRosterRow = {
  membershipId: number;
  userId: number;
  personRecordId: number | null;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  source: string | null;
  intake: Record<string, unknown> | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  phone: string | null;
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function clusterKeyForVolunteer(orgId: number, email: string): string {
  return createHash('sha256')
    .update(`volunteer:${orgId}:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function toIso(d: unknown): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export class VolunteerRepo {
  /** Primary active membership for a user (lowest id wins as stable pick). */
  static async getPrimaryMembership(
    userId: number
  ): Promise<VolunteerMembership | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT organization_id, user_id, role, person_record_id, status,
              volunteer_source, volunteer_intake, invited_at, accepted_at
       FROM organization_members
       WHERE user_id = ? AND status = 'active'
       ORDER BY
         CASE role
           WHEN 'owner' THEN 0
           WHEN 'admin' THEN 1
           WHEN 'analyst' THEN 2
           WHEN 'viewer' THEN 3
           WHEN 'captain' THEN 4
           WHEN 'volunteer' THEN 5
           ELSE 9
         END,
         id ASC
       LIMIT 1`,
      [userId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      organizationId: Number(r.organization_id),
      userId: Number(r.user_id),
      role: String(r.role) as OrgMemberRole,
      personRecordId:
        r.person_record_id != null ? Number(r.person_record_id) : null,
      status: String(r.status),
      volunteerSource: r.volunteer_source != null ? String(r.volunteer_source) : null,
      volunteerIntake: parseJson<Record<string, unknown> | null>(
        r.volunteer_intake,
        null
      ),
      invitedAt: toIso(r.invited_at),
      acceptedAt: toIso(r.accepted_at),
    };
  }

  static async getOrgBySlug(slug: string): Promise<{
    id: number;
    name: string;
    slug: string;
    signupEnabled: boolean;
    intakeSchema: VolunteerIntakeSchema;
  } | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT id, name, slug, volunteer_signup_enabled, volunteer_intake_schema
       FROM organizations WHERE slug = ? LIMIT 1`,
      [String(slug || '').trim()]
    );
    if (!rows.length) return null;
    const r = rows[0];
    const schema = parseJson<VolunteerIntakeSchema | null>(
      r.volunteer_intake_schema,
      null
    );
    return {
      id: Number(r.id),
      name: String(r.name),
      slug: String(r.slug),
      signupEnabled: Number(r.volunteer_signup_enabled) !== 0,
      intakeSchema:
        schema && Array.isArray(schema.fields) && schema.fields.length
          ? {
              ...DEFAULT_VOLUNTEER_INTAKE,
              ...schema,
              fields: schema.fields,
            }
          : DEFAULT_VOLUNTEER_INTAKE,
    };
  }

  static async getIntakeSchema(
    organizationId: number
  ): Promise<VolunteerIntakeSchema> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT volunteer_intake_schema FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    if (!rows.length) return DEFAULT_VOLUNTEER_INTAKE;
    const schema = parseJson<VolunteerIntakeSchema | null>(
      rows[0].volunteer_intake_schema,
      null
    );
    if (!schema?.fields?.length) return DEFAULT_VOLUNTEER_INTAKE;
    return { ...DEFAULT_VOLUNTEER_INTAKE, ...schema, fields: schema.fields };
  }

  static async updateIntakeSchema(
    organizationId: number,
    schema: VolunteerIntakeSchema,
    signupEnabled?: boolean
  ): Promise<VolunteerIntakeSchema> {
    const normalized: VolunteerIntakeSchema = {
      headline: schema.headline?.trim() || DEFAULT_VOLUNTEER_INTAKE.headline,
      body: schema.body?.trim() || DEFAULT_VOLUNTEER_INTAKE.body,
      consentPrompt:
        schema.consentPrompt?.trim() || DEFAULT_VOLUNTEER_INTAKE.consentPrompt,
      fields: Array.isArray(schema.fields)
        ? schema.fields
            .filter((f) => f?.id && f?.label)
            .map((f) => ({
              id: String(f.id).slice(0, 64),
              label: String(f.label).slice(0, 120),
              type: f.type || 'text',
              required: Boolean(f.required),
              options: Array.isArray(f.options)
                ? f.options.map(String)
                : undefined,
              mapsTo: f.mapsTo,
            }))
        : DEFAULT_VOLUNTEER_INTAKE.fields!,
    };
    const sql = await openSql();
    if (signupEnabled !== undefined) {
      await sql.execute(
        `UPDATE organizations
         SET volunteer_intake_schema = ?, volunteer_signup_enabled = ?
         WHERE id = ?`,
        [JSON.stringify(normalized), signupEnabled ? 1 : 0, organizationId]
      );
    } else {
      await sql.execute(
        `UPDATE organizations SET volunteer_intake_schema = ? WHERE id = ?`,
        [JSON.stringify(normalized), organizationId]
      );
    }
    return normalized;
  }

  static async listVolunteers(
    organizationId: number,
    opts?: { limit?: number; status?: string }
  ): Promise<VolunteerRosterRow[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500);
    const params: unknown[] = [organizationId];
    let statusSql = `AND om.role IN ('volunteer', 'captain')`;
    if (opts?.status) {
      statusSql += ` AND om.status = ?`;
      params.push(opts.status);
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT om.id AS membership_id, om.user_id, om.person_record_id,
              om.role, om.status, om.volunteer_source, om.volunteer_intake,
              om.invited_at, om.accepted_at,
              u.email AS user_email, u.display_name,
              pr.email AS person_email, pr.phone,
              pr.first_name, pr.last_name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       LEFT JOIN person_records pr ON pr.id = om.person_record_id
       WHERE om.organization_id = ?
         ${statusSql}
       ORDER BY COALESCE(om.accepted_at, om.invited_at) DESC, om.id DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => {
      const nameFromPerson = [r.first_name, r.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      return {
        membershipId: Number(r.membership_id),
        userId: Number(r.user_id),
        personRecordId:
          r.person_record_id != null ? Number(r.person_record_id) : null,
        email: (r.user_email || r.person_email || null) as string | null,
        displayName:
          (r.display_name as string) || nameFromPerson || null,
        role: String(r.role),
        status: String(r.status),
        source: r.volunteer_source != null ? String(r.volunteer_source) : null,
        intake: parseJson<Record<string, unknown> | null>(
          r.volunteer_intake,
          null
        ),
        invitedAt: toIso(r.invited_at),
        acceptedAt: toIso(r.accepted_at),
        phone: r.phone != null ? String(r.phone) : null,
      };
    });
  }


  /**
   * Staff-issued invite: upsert person_record + mint magic-link token.
   * Does not create the user yet — that happens on consume (tap on phone).
   */
  static async issueMagicLink(input: {
    organizationId: number;
    email: string;
    displayName?: string | null;
    invitedBy?: number | null;
    /** Hours until expiry (default 72). */
    ttlHours?: number;
    source?:
      | 'staff_invite'
      | 'public_signup'
      | 'site_form'
      | 'relational_recruit';
    intake?: Record<string, unknown> | null;
    phone?: string | null;
  }): Promise<MagicLinkIssue> {
    const organizationId = Number(input.organizationId);
    const email = String(input.email || '')
      .trim()
      .toLowerCase();
    if (!organizationId || !email || !email.includes('@')) {
      throw new Error('organizationId and valid email are required');
    }

    const displayName = input.displayName?.trim() || null;
    const personRecordId = await this.ensurePersonRecord({
      organizationId,
      email,
      displayName,
      phone: input.phone,
      source: input.source || 'staff_invite',
    });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const ttlHours = input.ttlHours && input.ttlHours > 0 ? input.ttlHours : 72;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    const source = input.source || 'staff_invite';
    const intake = input.intake || null;

    const sql = await openSql();
    await sql.execute(
      `INSERT INTO volunteer_magic_links
        (organization_id, email, display_name, token_hash, invited_by,
         source, intake, person_record_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        email,
        displayName,
        tokenHash,
        input.invitedBy ?? null,
        source,
        intake ? JSON.stringify(intake) : null,
        personRecordId,
        expiresAt,
      ]
    );

    return { rawToken, expiresAt, email, organizationId, personRecordId };
  }

  /**
   * Consume a magic link: create/link user + volunteer membership + person_record.
   * One-time use. Returns session fields for NextAuth authorize().
   */
  static async consumeMagicLink(rawToken: string): Promise<{
    userId: number;
    email: string;
    name: string | null;
    organizationId: number;
    orgRole: VolunteerOrgRole;
    personRecordId: number;
  }> {
    const token = String(rawToken || '').trim();
    if (!token) throw new Error('Invalid magic link');
    const tokenHash = hashToken(token);
    const sql = await openSql();

    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM volunteer_magic_links WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) throw new Error('Magic link not found');
    const link = rows[0];
    if (link.consumed_at) throw new Error('Magic link already used');
    if (new Date(link.expires_at).getTime() < Date.now()) {
      throw new Error('Magic link expired');
    }

    const organizationId = Number(link.organization_id);
    const email = String(link.email).trim().toLowerCase();
    const displayName =
      (link.display_name && String(link.display_name).trim()) || null;

    const personRecordId =
      link.person_record_id != null
        ? Number(link.person_record_id)
        : await this.ensurePersonRecord({
            organizationId,
            email,
            displayName,
          });

    const userId = await this.ensurePasswordlessUser({
      email,
      displayName,
    });

    await this.ensureVolunteerMembership({
      organizationId,
      userId,
      personRecordId,
      invitedBy: link.invited_by != null ? Number(link.invited_by) : null,
      source: (link.source as any) || 'staff_invite',
      intake: parseJson<Record<string, unknown> | null>(link.intake, null),
    });

    await sql.execute(
      `UPDATE volunteer_magic_links
       SET consumed_at = UTC_TIMESTAMP(), person_record_id = ?
       WHERE id = ? AND consumed_at IS NULL`,
      [personRecordId, link.id]
    );

    return {
      userId,
      email,
      name: displayName,
      organizationId,
      orgRole: 'volunteer',
      personRecordId,
    };
  }

  static async ensurePersonRecord(input: {
    organizationId: number;
    email: string;
    displayName?: string | null;
    phone?: string | null;
    source?: string;
  }): Promise<number> {
    const sql = await openSql();
    const email = input.email.trim().toLowerCase();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id, phone FROM person_records
       WHERE organization_id = ? AND email = ?
         AND (merged_into_person_id IS NULL)
       ORDER BY id ASC LIMIT 1`,
      [input.organizationId, email]
    );
    if (existing.length) {
      const id = Number(existing[0].id);
      if (input.phone?.trim() && !existing[0].phone) {
        await sql.execute(
          `UPDATE person_records SET phone = ? WHERE id = ?`,
          [input.phone.trim(), id]
        );
      }
      return id;
    }

    const name = input.displayName?.trim() || null;
    let first: string | null = null;
    let last: string | null = null;
    if (name) {
      const parts = name.split(/\s+/);
      first = parts[0] || null;
      last = parts.length > 1 ? parts.slice(1).join(' ') : null;
    }
    const clusterKey = clusterKeyForVolunteer(input.organizationId, email);
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO person_records
        (organization_id, cluster_key, first_name, last_name,
         full_name_normalized, email, phone, match_confidence, field_provenance)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?)`,
      [
        input.organizationId,
        clusterKey,
        first,
        last,
        name ? name.toLowerCase() : null,
        email,
        input.phone?.trim() || null,
        JSON.stringify({
          source: input.source || 'volunteer_invite',
          at: new Date().toISOString(),
        }),
      ]
    );
    return Number(result.insertId);
  }

  static async ensurePasswordlessUser(input: {
    email: string;
    displayName?: string | null;
  }): Promise<number> {
    const sql = await openSql();
    const email = input.email.trim().toLowerCase();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (existing.length) {
      const userId = Number(existing[0].id);
      // Magic-link volunteers are verified by email possession
      await sql.execute(
        `UPDATE users SET is_verified = 1 WHERE id = ? AND (is_verified IS NULL OR is_verified = 0)`,
        [userId]
      );
      if (input.displayName?.trim()) {
        await sql.execute(
          `UPDATE users SET display_name = COALESCE(NULLIF(display_name, ''), ?) WHERE id = ?`,
          [input.displayName.trim(), userId]
        );
      }
      return userId;
    }

    const displayName = input.displayName?.trim() || email.split('@')[0];
    // Username must be unique — derive from email local-part + short suffix
    const base =
      email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 24) || 'volunteer';
    let username = base;
    for (let i = 0; i < 8; i++) {
      const candidate =
        i === 0 ? base : `${base}_${randomBytes(2).toString('hex')}`;
      const [clash] = await sql.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        [candidate]
      );
      if (!clash.length) {
        username = candidate;
        break;
      }
      username = `${base}_${randomBytes(3).toString('hex')}`;
    }

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO users (username, email, password, display_name, is_verified)
       VALUES (?, ?, '', ?, 1)`,
      [username, email, displayName]
    );
    return Number(result.insertId);
  }

  static async ensureVolunteerMembership(input: {
    organizationId: number;
    userId: number;
    personRecordId: number;
    invitedBy?: number | null;
    source?: string | null;
    intake?: Record<string, unknown> | null;
  }): Promise<void> {
    const sql = await openSql();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id, role, status FROM organization_members
       WHERE organization_id = ? AND user_id = ? LIMIT 1`,
      [input.organizationId, input.userId]
    );

    const source = input.source || 'staff_invite';
    const intakeJson = input.intake ? JSON.stringify(input.intake) : null;

    if (existing.length) {
      const row = existing[0];
      // Never demote staff to volunteer via magic link
      if (isStaffRole(String(row.role))) {
        throw new Error(
          'This email already has a staff account for this campaign. Use the main app sign-in.'
        );
      }
      await sql.execute(
        `UPDATE organization_members
         SET role = 'volunteer',
             status = 'active',
             person_record_id = ?,
             volunteer_source = COALESCE(volunteer_source, ?),
             volunteer_intake = COALESCE(?, volunteer_intake),
             accepted_at = COALESCE(accepted_at, UTC_TIMESTAMP())
         WHERE id = ?`,
        [input.personRecordId, source, intakeJson, row.id]
      );
      return;
    }

    await sql.execute(
      `INSERT INTO organization_members
        (organization_id, user_id, person_record_id, volunteer_source,
         volunteer_intake, role, invited_by, status, accepted_at)
       VALUES (?, ?, ?, ?, ?, 'volunteer', ?, 'active', UTC_TIMESTAMP())`,
      [
        input.organizationId,
        input.userId,
        input.personRecordId,
        source,
        intakeJson,
        input.invitedBy ?? null,
      ]
    );
  }

  /**
   * Public self-signup: create identity spine + magic link (email later).
   * Does not create the user session — that happens when they tap the link.
   */
  static async publicSignup(input: {
    organizationId: number;
    email: string;
    displayName?: string | null;
    phone?: string | null;
    intake: Record<string, unknown>;
  }): Promise<MagicLinkIssue> {
    return this.issueMagicLink({
      organizationId: input.organizationId,
      email: input.email,
      displayName: input.displayName,
      phone: input.phone,
      invitedBy: null,
      source: 'public_signup',
      intake: input.intake,
    });
  }
}
