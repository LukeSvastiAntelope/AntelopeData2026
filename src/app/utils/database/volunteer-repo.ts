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
};

export type MagicLinkIssue = {
  rawToken: string;
  expiresAt: Date;
  email: string;
  organizationId: number;
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

export class VolunteerRepo {
  /** Primary active membership for a user (lowest id wins as stable pick). */
  static async getPrimaryMembership(
    userId: number
  ): Promise<VolunteerMembership | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT organization_id, user_id, role, person_record_id, status
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
    };
  }

  /**
   * Staff-issued invite: upsert person_record + mint magic-link token.
   * Does not create the user yet — that happens on consume (tap on phone).
   */
  static async issueMagicLink(input: {
    organizationId: number;
    email: string;
    displayName?: string | null;
    invitedBy: number;
    /** Hours until expiry (default 72). */
    ttlHours?: number;
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
    });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const ttlHours = input.ttlHours && input.ttlHours > 0 ? input.ttlHours : 72;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const sql = await openSql();
    await sql.execute(
      `INSERT INTO volunteer_magic_links
        (organization_id, email, display_name, token_hash, invited_by,
         person_record_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        email,
        displayName,
        tokenHash,
        input.invitedBy,
        personRecordId,
        expiresAt,
      ]
    );

    return { rawToken, expiresAt, email, organizationId };
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
  }): Promise<number> {
    const sql = await openSql();
    const email = input.email.trim().toLowerCase();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id FROM person_records
       WHERE organization_id = ? AND email = ?
         AND (merged_into_person_id IS NULL)
       ORDER BY id ASC LIMIT 1`,
      [input.organizationId, email]
    );
    if (existing.length) return Number(existing[0].id);

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
         full_name_normalized, email, match_confidence, field_provenance)
       VALUES (?, ?, ?, ?, ?, ?, 1.0, ?)`,
      [
        input.organizationId,
        clusterKey,
        first,
        last,
        name ? name.toLowerCase() : null,
        email,
        JSON.stringify({
          source: 'volunteer_invite',
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
  }): Promise<void> {
    const sql = await openSql();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id, role, status FROM organization_members
       WHERE organization_id = ? AND user_id = ? LIMIT 1`,
      [input.organizationId, input.userId]
    );

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
             accepted_at = COALESCE(accepted_at, UTC_TIMESTAMP())
         WHERE id = ?`,
        [input.personRecordId, row.id]
      );
      return;
    }

    await sql.execute(
      `INSERT INTO organization_members
        (organization_id, user_id, person_record_id, role, invited_by,
         status, accepted_at)
       VALUES (?, ?, ?, 'volunteer', ?, 'active', UTC_TIMESTAMP())`,
      [
        input.organizationId,
        input.userId,
        input.personRecordId,
        input.invitedBy ?? null,
      ]
    );
  }
}
