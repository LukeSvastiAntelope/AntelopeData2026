/**
 * Volunteer V2 — 360° engagement history.
 * Projects person_records streams + volunteer signup / site forms / magic links.
 * Reuses voterTimeline; never invents scores.
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import {
  voterTimeline,
  type TimelineEvent,
} from '@/app/utils/services/voter-timeline';
import { VolunteerRepo } from '@/app/utils/database/volunteer-repo';

export type VolunteerEngagementEvent = TimelineEvent & {
  source: TimelineEvent['source'] | 'volunteer' | 'site_form_submissions';
};

export type VolunteerProfile = {
  userId: number;
  organizationId: number;
  organizationName: string | null;
  orgRole: string;
  status: string;
  source: string | null;
  intake: Record<string, unknown> | null;
  personRecordId: number | null;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  acceptedAt: string | null;
  invitedAt: string | null;
};

function toIso(d: unknown): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export async function getVolunteerProfile(input: {
  organizationId: number;
  userId?: number;
  personRecordId?: number;
}): Promise<VolunteerProfile | null> {
  const sql = await openSql();
  const clauses: string[] = ['om.organization_id = ?'];
  const params: unknown[] = [input.organizationId];
  if (input.userId != null) {
    clauses.push('om.user_id = ?');
    params.push(input.userId);
  } else if (input.personRecordId != null) {
    clauses.push('om.person_record_id = ?');
    params.push(input.personRecordId);
  } else {
    return null;
  }
  clauses.push(`om.role IN ('volunteer', 'captain')`);

  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT om.user_id, om.organization_id, om.role, om.status,
            om.volunteer_source, om.volunteer_intake, om.person_record_id,
            om.invited_at, om.accepted_at,
            u.email AS user_email, u.display_name,
            pr.email AS person_email, pr.phone, pr.first_name, pr.last_name,
            o.name AS org_name
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     JOIN organizations o ON o.id = om.organization_id
     LEFT JOIN person_records pr ON pr.id = om.person_record_id
     WHERE ${clauses.join(' AND ')}
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  const r = rows[0];
  const nameFromPerson = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return {
    userId: Number(r.user_id),
    organizationId: Number(r.organization_id),
    organizationName: r.org_name ? String(r.org_name) : null,
    orgRole: String(r.role),
    status: String(r.status),
    source: r.volunteer_source != null ? String(r.volunteer_source) : null,
    intake:
      r.volunteer_intake == null
        ? null
        : typeof r.volunteer_intake === 'object'
          ? (r.volunteer_intake as Record<string, unknown>)
          : JSON.parse(String(r.volunteer_intake)),
    personRecordId:
      r.person_record_id != null ? Number(r.person_record_id) : null,
    email: (r.user_email || r.person_email || null) as string | null,
    displayName: (r.display_name as string) || nameFromPerson || null,
    phone: r.phone != null ? String(r.phone) : null,
    acceptedAt: toIso(r.accepted_at),
    invitedAt: toIso(r.invited_at),
  };
}

export async function volunteerEngagementHistory(
  personRecordId: number,
  organizationId: number
): Promise<VolunteerEngagementEvent[]> {
  const events: VolunteerEngagementEvent[] = [];

  try {
    const base = await voterTimeline(personRecordId);
    for (const e of base) {
      events.push(e as VolunteerEngagementEvent);
    }
  } catch (err) {
    console.warn('[volunteerEngagementHistory] voterTimeline failed', err);
  }

  const sql = await openSql();

  // Site form submissions tied to this person
  try {
    const [forms] = await sql.execute<RowDataPacket[]>(
      `SELECT id, form_type, name, email, phone, message, metadata, created_at
       FROM site_form_submissions
       WHERE organization_id = ? AND person_record_id = ?
       ORDER BY created_at ASC`,
      [organizationId, personRecordId]
    );
    for (const r of forms) {
      const ts = toIso(r.created_at);
      if (!ts) continue;
      events.push({
        ts,
        source: 'site_form_submissions',
        type: `site.${r.form_type || 'form'}`,
        summary: `Site ${r.form_type || 'form'} submission`,
        payload: {
          submissionId: Number(r.id),
          formType: r.form_type,
          name: r.name,
          email: r.email,
          phone: r.phone,
          message: r.message,
          metadata: r.metadata,
        },
      });
    }
  } catch {
    // table may be missing on older envs
  }

  // Volunteer magic-link invites / consumption for this person
  try {
    const [links] = await sql.execute<RowDataPacket[]>(
      `SELECT id, source, email, created_at, consumed_at, expires_at, intake
       FROM volunteer_magic_links
       WHERE organization_id = ? AND person_record_id = ?
       ORDER BY created_at ASC`,
      [organizationId, personRecordId]
    );
    for (const r of links) {
      const created = toIso(r.created_at);
      if (created) {
        events.push({
          ts: created,
          source: 'volunteer',
          type: 'volunteer.invite',
          summary: `Volunteer invite (${r.source || 'invite'}) sent to ${r.email}`,
          payload: {
            magicLinkId: Number(r.id),
            source: r.source,
            email: r.email,
            intake: r.intake,
          },
        });
      }
      const consumed = toIso(r.consumed_at);
      if (consumed) {
        events.push({
          ts: consumed,
          source: 'volunteer',
          type: 'volunteer.joined',
          summary: 'Opened magic link and joined the volunteer portal',
          payload: { magicLinkId: Number(r.id), source: r.source },
        });
      }
    }
  } catch {
    // ignore
  }

  // Membership accepted
  try {
    const [mem] = await sql.execute<RowDataPacket[]>(
      `SELECT invited_at, accepted_at, volunteer_source, status
       FROM organization_members
       WHERE organization_id = ? AND person_record_id = ?
         AND role IN ('volunteer', 'captain')
       LIMIT 1`,
      [organizationId, personRecordId]
    );
    if (mem[0]) {
      const accepted = toIso(mem[0].accepted_at);
      if (accepted) {
        events.push({
          ts: accepted,
          source: 'volunteer',
          type: 'volunteer.membership_active',
          summary: `Volunteer membership active (${mem[0].volunteer_source || 'unknown source'})`,
          payload: {
            status: mem[0].status,
            source: mem[0].volunteer_source,
          },
        });
      }
    }
  } catch {
    // ignore
  }

  events.sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    if (ta !== tb) return ta - tb;
    return `${a.source}:${a.type}`.localeCompare(`${b.source}:${b.type}`);
  });

  return events;
}

export async function recordVolunteerOptIn(input: {
  organizationId: number;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  consent: boolean;
  disclosure?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!input.consent) return;
  const sql = await openSql();
  // Soft-ensure columns used by live/site opt-ins
  try {
    await sql.execute(
      `INSERT INTO survey_optins
        (survey_slug, survey_id, phone, email, consent, disclosure, source,
         ip, user_agent, organization_id)
       VALUES (NULL, NULL, ?, ?, 1, ?, 'volunteer_signup', ?, ?, ?)`,
      [
        input.phone?.trim() || null,
        input.email?.trim().toLowerCase() || null,
        input.disclosure || 'Volunteer signup consent',
        input.ip || null,
        input.userAgent || null,
        input.organizationId,
      ]
    );
  } catch (err: any) {
    // Older schemas may lack email column — retry minimal insert
    if (err?.errno === 1054 || String(err?.message || '').includes('email')) {
      await sql.execute(
        `INSERT INTO survey_optins
          (survey_slug, survey_id, phone, consent, disclosure, source,
           ip, user_agent, organization_id)
         VALUES (NULL, NULL, ?, 1, ?, 'volunteer_signup', ?, ?, ?)`,
        [
          input.phone?.trim() || input.email?.trim() || 'unknown',
          input.disclosure || 'Volunteer signup consent',
          input.ip || null,
          input.userAgent || null,
          input.organizationId,
        ]
      );
      return;
    }
    throw err;
  }
}

/** Re-export for callers that need org lookup */
export { VolunteerRepo };
