/**
 * Volunteer V4 — private friends-and-family contacts + relational outreach.
 * Contacts are volunteer-owned and never written into the org voter file.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type ContactSource = 'manual' | 'device_import';
export type OutreachChannel = 'sms' | 'email' | 'in_person' | 'call';
export type OutreachStatus =
  | 'draft'
  | 'ready'
  | 'staged'
  | 'logged'
  | 'skipped';
export type OutreachOutcome =
  | 'reached'
  | 'left_message'
  | 'no_answer'
  | 'not_interested'
  | 'will_help'
  | 'wants_to_volunteer'
  | 'other';

export type PrivateContact = {
  id: number;
  organizationId: number;
  ownerUserId: number;
  displayName: string;
  email: string | null;
  phone: string | null;
  relationshipNote: string | null;
  notes: string | null;
  source: ContactSource;
  createdAt: string;
  /** Latest outreach summary (optional join) */
  outreachStatus?: OutreachStatus | null;
  outreachId?: number | null;
  outcome?: OutreachOutcome | null;
};

export type RelationalOutreach = {
  id: number;
  organizationId: number;
  ownerUserId: number;
  contactId: number;
  channel: OutreachChannel;
  scriptText: string;
  scriptGeneratedAt: string | null;
  status: OutreachStatus;
  outcome: OutreachOutcome | null;
  outcomeNote: string | null;
  outcomeLoggedAt: string | null;
  stagedActionId: number | null;
  convertedAt: string | null;
  contactName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  relationshipNote?: string | null;
};

function toIso(d: unknown): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function mapContact(row: RowDataPacket): PrivateContact {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    ownerUserId: Number(row.owner_user_id),
    displayName: String(row.display_name),
    email: row.email != null ? String(row.email) : null,
    phone: row.phone != null ? String(row.phone) : null,
    relationshipNote:
      row.relationship_note != null ? String(row.relationship_note) : null,
    notes: row.notes != null ? String(row.notes) : null,
    source: String(row.source) as ContactSource,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    outreachStatus: row.outreach_status
      ? (String(row.outreach_status) as OutreachStatus)
      : null,
    outreachId: row.outreach_id != null ? Number(row.outreach_id) : null,
    outcome: row.outcome ? (String(row.outcome) as OutreachOutcome) : null,
  };
}

function mapOutreach(row: RowDataPacket): RelationalOutreach {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    ownerUserId: Number(row.owner_user_id),
    contactId: Number(row.contact_id),
    channel: String(row.channel) as OutreachChannel,
    scriptText: String(row.script_text || ''),
    scriptGeneratedAt: toIso(row.script_generated_at),
    status: String(row.status) as OutreachStatus,
    outcome: row.outcome ? (String(row.outcome) as OutreachOutcome) : null,
    outcomeNote: row.outcome_note != null ? String(row.outcome_note) : null,
    outcomeLoggedAt: toIso(row.outcome_logged_at),
    stagedActionId:
      row.staged_action_id != null ? Number(row.staged_action_id) : null,
    convertedAt: toIso(row.converted_at),
    contactName:
      row.contact_name != null ? String(row.contact_name) : undefined,
    contactEmail: row.contact_email != null ? String(row.contact_email) : null,
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : null,
    relationshipNote:
      row.relationship_note != null ? String(row.relationship_note) : null,
  };
}

export class VolunteerRelationalRepo {
  static async addContact(input: {
    organizationId: number;
    ownerUserId: number;
    displayName: string;
    email?: string | null;
    phone?: string | null;
    relationshipNote?: string | null;
    notes?: string | null;
    source?: ContactSource;
  }): Promise<PrivateContact> {
    const name = String(input.displayName || '').trim();
    if (!name) throw new Error('displayName is required');
    const email = input.email
      ? String(input.email).trim().toLowerCase()
      : null;
    const phone = input.phone ? String(input.phone).trim() : null;
    if (!email && !phone) {
      throw new Error('Provide an email or phone so you can reach them');
    }

    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_private_contacts
        (organization_id, owner_user_id, display_name, email, phone,
         relationship_note, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        input.ownerUserId,
        name.slice(0, 255),
        email,
        phone,
        input.relationshipNote?.trim().slice(0, 255) || null,
        input.notes?.trim() || null,
        input.source || 'manual',
      ]
    );
    const created = await this.getContact(
      Number(result.insertId),
      input.ownerUserId,
      input.organizationId
    );
    if (!created) throw new Error('Failed to create contact');
    return created;
  }

  static async addContactsBulk(
    input: {
      organizationId: number;
      ownerUserId: number;
      source?: ContactSource;
      contacts: Array<{
        displayName: string;
        email?: string | null;
        phone?: string | null;
        relationshipNote?: string | null;
      }>;
    }
  ): Promise<{ created: number; skipped: number; contacts: PrivateContact[] }> {
    const out: PrivateContact[] = [];
    let skipped = 0;
    for (const c of input.contacts.slice(0, 100)) {
      try {
        const name = String(c.displayName || '').trim();
        if (!name || (!c.email && !c.phone)) {
          skipped++;
          continue;
        }
        const row = await this.addContact({
          organizationId: input.organizationId,
          ownerUserId: input.ownerUserId,
          displayName: name,
          email: c.email,
          phone: c.phone,
          relationshipNote: c.relationshipNote,
          source: input.source || 'device_import',
        });
        out.push(row);
      } catch {
        skipped++;
      }
    }
    return { created: out.length, skipped, contacts: out };
  }

  static async getContact(
    contactId: number,
    ownerUserId: number,
    organizationId: number
  ): Promise<PrivateContact | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM volunteer_private_contacts
       WHERE id = ? AND owner_user_id = ? AND organization_id = ?
       LIMIT 1`,
      [contactId, ownerUserId, organizationId]
    );
    return rows.length ? mapContact(rows[0]) : null;
  }

  static async listContacts(input: {
    organizationId: number;
    ownerUserId: number;
    limit?: number;
  }): Promise<PrivateContact[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 300);
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT c.*,
              o.id AS outreach_id,
              o.status AS outreach_status,
              o.outcome
       FROM volunteer_private_contacts c
       LEFT JOIN volunteer_relational_outreach o
         ON o.id = (
           SELECT o2.id FROM volunteer_relational_outreach o2
           WHERE o2.contact_id = c.id
           ORDER BY o2.id DESC LIMIT 1
         )
       WHERE c.organization_id = ? AND c.owner_user_id = ?
       ORDER BY c.display_name ASC
       LIMIT ${limit}`,
      [input.organizationId, input.ownerUserId]
    );
    return rows.map(mapContact);
  }

  static async deleteContact(input: {
    contactId: number;
    ownerUserId: number;
    organizationId: number;
  }): Promise<boolean> {
    const sql = await openSql();
    await sql.execute(
      `DELETE FROM volunteer_relational_outreach
       WHERE contact_id = ? AND owner_user_id = ? AND organization_id = ?`,
      [input.contactId, input.ownerUserId, input.organizationId]
    );
    const [result] = await sql.execute<ResultSetHeader>(
      `DELETE FROM volunteer_private_contacts
       WHERE id = ? AND owner_user_id = ? AND organization_id = ?`,
      [input.contactId, input.ownerUserId, input.organizationId]
    );
    return result.affectedRows > 0;
  }

  static async createOutreach(input: {
    organizationId: number;
    ownerUserId: number;
    contactId: number;
    channel: OutreachChannel;
    scriptText: string;
  }): Promise<RelationalOutreach> {
    const contact = await this.getContact(
      input.contactId,
      input.ownerUserId,
      input.organizationId
    );
    if (!contact) throw new Error('Contact not found');

    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_relational_outreach
        (organization_id, owner_user_id, contact_id, channel, script_text,
         script_generated_at, status)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), 'ready')`,
      [
        input.organizationId,
        input.ownerUserId,
        input.contactId,
        input.channel,
        input.scriptText,
      ]
    );
    const row = await this.getOutreach(
      Number(result.insertId),
      input.ownerUserId,
      input.organizationId
    );
    if (!row) throw new Error('Failed to create outreach');
    return row;
  }

  static async getOutreach(
    outreachId: number,
    ownerUserId: number,
    organizationId: number
  ): Promise<RelationalOutreach | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT o.*,
              c.display_name AS contact_name,
              c.email AS contact_email,
              c.phone AS contact_phone,
              c.relationship_note
       FROM volunteer_relational_outreach o
       JOIN volunteer_private_contacts c ON c.id = o.contact_id
       WHERE o.id = ? AND o.owner_user_id = ? AND o.organization_id = ?
       LIMIT 1`,
      [outreachId, ownerUserId, organizationId]
    );
    return rows.length ? mapOutreach(rows[0]) : null;
  }

  static async listOutreachQueue(input: {
    organizationId: number;
    ownerUserId: number;
    pendingOnly?: boolean;
    limit?: number;
  }): Promise<RelationalOutreach[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
    const pendingSql = input.pendingOnly
      ? `AND o.status IN ('draft','ready','staged') AND o.outcome IS NULL`
      : '';
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT o.*,
              c.display_name AS contact_name,
              c.email AS contact_email,
              c.phone AS contact_phone,
              c.relationship_note
       FROM volunteer_relational_outreach o
       JOIN volunteer_private_contacts c ON c.id = o.contact_id
       WHERE o.organization_id = ? AND o.owner_user_id = ?
         ${pendingSql}
       ORDER BY
         CASE WHEN o.outcome IS NULL THEN 0 ELSE 1 END,
         o.updated_at DESC
       LIMIT ${limit}`,
      [input.organizationId, input.ownerUserId]
    );
    return rows.map(mapOutreach);
  }

  static async markStaged(input: {
    outreachId: number;
    ownerUserId: number;
    organizationId: number;
    stagedActionId: number;
  }): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE volunteer_relational_outreach
       SET status = 'staged', staged_action_id = ?
       WHERE id = ? AND owner_user_id = ? AND organization_id = ?`,
      [
        input.stagedActionId,
        input.outreachId,
        input.ownerUserId,
        input.organizationId,
      ]
    );
  }

  static async logOutcome(input: {
    outreachId: number;
    ownerUserId: number;
    organizationId: number;
    outcome: OutreachOutcome;
    outcomeNote?: string | null;
  }): Promise<RelationalOutreach> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE volunteer_relational_outreach
       SET status = 'logged',
           outcome = ?,
           outcome_note = ?,
           outcome_logged_at = UTC_TIMESTAMP()
       WHERE id = ? AND owner_user_id = ? AND organization_id = ?`,
      [
        input.outcome,
        input.outcomeNote?.trim().slice(0, 500) || null,
        input.outreachId,
        input.ownerUserId,
        input.organizationId,
      ]
    );
    const row = await this.getOutreach(
      input.outreachId,
      input.ownerUserId,
      input.organizationId
    );
    if (!row) throw new Error('Outreach not found');
    return row;
  }

  static async markConverted(input: {
    outreachId: number;
    ownerUserId: number;
    organizationId: number;
  }): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE volunteer_relational_outreach
       SET converted_at = UTC_TIMESTAMP(),
           outcome = COALESCE(outcome, 'wants_to_volunteer')
       WHERE id = ? AND owner_user_id = ? AND organization_id = ?`,
      [input.outreachId, input.ownerUserId, input.organizationId]
    );
  }

  /**
   * Staff reach metrics only — never returns private contact PII.
   */
  static async orgReachStats(organizationId: number): Promise<{
    privateContactCount: number;
    outreachAssigned: number;
    outreachLogged: number;
    reached: number;
    converted: number;
    volunteersWithNetwork: number;
  }> {
    const sql = await openSql();
    const [c] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n,
              COUNT(DISTINCT owner_user_id) AS owners
       FROM volunteer_private_contacts
       WHERE organization_id = ?`,
      [organizationId]
    );
    const [o] = await sql.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS assigned,
         SUM(outcome IS NOT NULL) AS logged,
         SUM(outcome IN ('reached','will_help','wants_to_volunteer')) AS reached,
         SUM(converted_at IS NOT NULL) AS converted
       FROM volunteer_relational_outreach
       WHERE organization_id = ?`,
      [organizationId]
    );
    return {
      privateContactCount: Number(c[0]?.n) || 0,
      volunteersWithNetwork: Number(c[0]?.owners) || 0,
      outreachAssigned: Number(o[0]?.assigned) || 0,
      outreachLogged: Number(o[0]?.logged) || 0,
      reached: Number(o[0]?.reached) || 0,
      converted: Number(o[0]?.converted) || 0,
    };
  }
}
