/**
 * Admin A2 — cross-org accounts overview (read-only).
 * Super-admin is the sole cross-tenant reader; callers must audit.
 */

import type { RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type AccountOverview = {
  id: number;
  name: string;
  slug: string | null;
  officeType: string | null;
  state: string | null;
  districtCode: string | null;
  candidateName: string | null;
  party: string | null;
  electionYear: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastActiveAt: string | null;
  /** Derived plan label — Core + enabled add-ons (no Stripe yet). */
  plan: string;
  entitlements: string[];
  memberCount: number;
  surveyCount: number;
  contactCount: number;
  sendCount: number;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
};

export type AccountMember = {
  userId: number;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  acceptedAt: string | null;
};

export type AccountActivityRow = {
  id: number;
  userId: number | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
};

export type AccountDetail = AccountOverview & {
  members: AccountMember[];
  recentActivity: AccountActivityRow[];
  recentSurveys: Array<{
    id: number;
    title: string;
    status: string;
    responseCount: number;
    createdAt: string | null;
  }>;
};

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = new Date(v as string | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function planFromEntitlements(keys: string[]): string {
  if (!keys.length) return 'Core';
  const labels = keys.map((k) => {
    if (k === 'website_addon') return 'Website';
    return k.replace(/_/g, ' ');
  });
  return `Core + ${labels.join(', ')}`;
}

/**
 * List all organizations with usage counts (surveys / contacts / sends).
 */
export async function listAccountOverviews(): Promise<AccountOverview[]> {
  const sql = await openSql();

  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT
       o.id,
       o.name,
       o.slug,
       o.office_type,
       o.state,
       o.district_code,
       o.candidate_name,
       o.party,
       o.election_year,
       o.created_at,
       o.updated_at,
       (SELECT COUNT(*) FROM organization_members om
         WHERE om.organization_id = o.id AND om.status = 'active') AS member_count,
       (SELECT COUNT(*) FROM surveys s
         WHERE s.organization_id = o.id) AS survey_count,
       (SELECT COUNT(*) FROM person_records pr
         WHERE pr.organization_id = o.id
           AND (pr.merged_into_person_id IS NULL)) AS contact_count,
       (SELECT COUNT(*) FROM email_sends es
         WHERE es.organization_id = o.id) AS send_count,
       (SELECT MAX(a.created_at) FROM organization_activity_log a
         WHERE a.organization_id = o.id) AS last_activity_at,
       (SELECT MAX(s2.updated_at) FROM surveys s2
         WHERE s2.organization_id = o.id) AS last_survey_at,
       (SELECT MAX(pr2.updated_at) FROM person_records pr2
         WHERE pr2.organization_id = o.id) AS last_contact_at,
       (SELECT MAX(es2.created_at) FROM email_sends es2
         WHERE es2.organization_id = o.id) AS last_send_at,
       (SELECT u.email FROM organization_members om2
         JOIN users u ON u.id = om2.user_id
         WHERE om2.organization_id = o.id AND om2.status = 'active'
         ORDER BY om2.role = 'owner' DESC, om2.accepted_at ASC
         LIMIT 1) AS owner_email,
       (SELECT u.display_name FROM organization_members om3
         JOIN users u ON u.id = om3.user_id
         WHERE om3.organization_id = o.id AND om3.status = 'active'
         ORDER BY om3.role = 'owner' DESC, om3.accepted_at ASC
         LIMIT 1) AS owner_display_name
     FROM organizations o
     ORDER BY o.created_at DESC`
  );

  const [entRows] = await sql.execute<RowDataPacket[]>(
    `SELECT organization_id, entitlement
     FROM org_entitlements
     WHERE enabled = 1`
  );
  const entsByOrg = new Map<number, string[]>();
  for (const e of entRows) {
    const oid = Number(e.organization_id);
    const list = entsByOrg.get(oid) || [];
    list.push(String(e.entitlement));
    entsByOrg.set(oid, list);
  }

  return rows.map((r) => {
    const id = Number(r.id);
    const entitlements = entsByOrg.get(id) || [];
    const candidates = [
      iso(r.last_activity_at),
      iso(r.last_survey_at),
      iso(r.last_contact_at),
      iso(r.last_send_at),
      iso(r.updated_at),
      iso(r.created_at),
    ].filter(Boolean) as string[];
    const lastActiveAt =
      candidates.length > 0
        ? candidates.reduce((a, b) => (a > b ? a : b))
        : null;

    return {
      id,
      name: String(r.name || ''),
      slug: r.slug != null ? String(r.slug) : null,
      officeType: r.office_type != null ? String(r.office_type) : null,
      state: r.state != null ? String(r.state) : null,
      districtCode: r.district_code != null ? String(r.district_code) : null,
      candidateName:
        r.candidate_name != null ? String(r.candidate_name) : null,
      party: r.party != null ? String(r.party) : null,
      electionYear:
        r.election_year != null ? Number(r.election_year) : null,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      lastActiveAt,
      plan: planFromEntitlements(entitlements),
      entitlements,
      memberCount: Number(r.member_count) || 0,
      surveyCount: Number(r.survey_count) || 0,
      contactCount: Number(r.contact_count) || 0,
      sendCount: Number(r.send_count) || 0,
      ownerEmail: r.owner_email != null ? String(r.owner_email) : null,
      ownerDisplayName:
        r.owner_display_name != null ? String(r.owner_display_name) : null,
    };
  });
}

/**
 * Single account detail — overview + members + recent activity + surveys.
 */
export async function getAccountDetail(
  organizationId: number
): Promise<AccountDetail | null> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return null;
  const all = await listAccountOverviews();
  const base = all.find((a) => a.id === organizationId);
  if (!base) return null;

  const sql = await openSql();

  const [members] = await sql.execute<RowDataPacket[]>(
    `SELECT om.user_id, om.role, om.status, om.accepted_at,
            u.email, u.display_name
     FROM organization_members om
     LEFT JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = ?
     ORDER BY FIELD(om.role,'owner','admin','analyst','viewer','captain','volunteer'),
              om.accepted_at ASC`,
    [organizationId]
  );

  const [activity] = await sql.execute<RowDataPacket[]>(
    `SELECT id, user_id, action, resource_type, resource_id, created_at
     FROM organization_activity_log
     WHERE organization_id = ?
     ORDER BY id DESC
     LIMIT 40`,
    [organizationId]
  );

  const [surveys] = await sql.execute<RowDataPacket[]>(
    `SELECT s.id, s.title, s.status, s.created_at,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
     FROM surveys s
     WHERE s.organization_id = ?
     ORDER BY s.id DESC
     LIMIT 25`,
    [organizationId]
  );

  return {
    ...base,
    members: members.map((m) => ({
      userId: Number(m.user_id),
      email: m.email != null ? String(m.email) : null,
      displayName: m.display_name != null ? String(m.display_name) : null,
      role: String(m.role || ''),
      status: String(m.status || ''),
      acceptedAt: iso(m.accepted_at),
    })),
    recentActivity: activity.map((a) => ({
      id: Number(a.id),
      userId: a.user_id != null ? Number(a.user_id) : null,
      action: String(a.action || ''),
      resourceType:
        a.resource_type != null ? String(a.resource_type) : null,
      resourceId: a.resource_id != null ? String(a.resource_id) : null,
      createdAt: iso(a.created_at) || new Date().toISOString(),
    })),
    recentSurveys: surveys.map((s) => ({
      id: Number(s.id),
      title: String(s.title || ''),
      status: String(s.status || ''),
      responseCount: Number(s.response_count) || 0,
      createdAt: iso(s.created_at),
    })),
  };
}
