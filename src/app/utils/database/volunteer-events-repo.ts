/**
 * Volunteer event stream — event-sourced spine for V4 outreach,
 * V5 points/ladder, and V6 retention.
 * No per-person scoring of voters; points are volunteer activity only.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type VolunteerEventKind =
  | 'contact_added'
  | 'outreach_scripted'
  | 'outreach_staged'
  | 'outreach_logged'
  | 'contact_converted'
  | 'shift_claimed'
  | 'shift_checked_in'
  | 'task_claimed'
  | 'task_completed'
  | 'shoutout_received'
  | 'team_joined';

/** Tasteful point awards for meaningful actions. */
export const VOLUNTEER_POINT_VALUES: Partial<Record<VolunteerEventKind, number>> =
  {
    shift_checked_in: 25,
    task_completed: 15,
    outreach_logged: 10,
    contact_converted: 50,
  };

export type VolunteerEvent = {
  id: number;
  organizationId: number;
  userId: number;
  kind: string;
  points: number;
  relatedType: string | null;
  relatedId: number | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

function toIso(d: unknown): string {
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
}

function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export class VolunteerEventsRepo {
  static async append(input: {
    organizationId: number;
    userId: number;
    kind: VolunteerEventKind | string;
    points?: number;
    relatedType?: string | null;
    relatedId?: number | null;
    payload?: Record<string, unknown> | null;
  }): Promise<VolunteerEvent> {
    const kind = String(input.kind);
    const defaultPts =
      VOLUNTEER_POINT_VALUES[kind as VolunteerEventKind] ?? 0;
    const points =
      input.points != null ? Number(input.points) : defaultPts;
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_events
        (organization_id, user_id, kind, points, related_type, related_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        input.userId,
        kind.slice(0, 64),
        points,
        input.relatedType ?? null,
        input.relatedId ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
      ]
    );
    return {
      id: Number(result.insertId),
      organizationId: input.organizationId,
      userId: input.userId,
      kind,
      points,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      payload: input.payload ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  static async listForUser(input: {
    organizationId: number;
    userId: number;
    limit?: number;
  }): Promise<VolunteerEvent[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT * FROM volunteer_events
       WHERE organization_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      [input.organizationId, input.userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      organizationId: Number(r.organization_id),
      userId: Number(r.user_id),
      kind: String(r.kind),
      points: Number(r.points) || 0,
      relatedType: r.related_type != null ? String(r.related_type) : null,
      relatedId: r.related_id != null ? Number(r.related_id) : null,
      payload: parsePayload(r.payload),
      createdAt: toIso(r.created_at),
    }));
  }

  static async sumPoints(input: {
    organizationId: number;
    userId?: number;
    sinceDays?: number;
  }): Promise<number> {
    const sql = await openSql();
    const params: unknown[] = [input.organizationId];
    let userSql = '';
    if (input.userId != null) {
      userSql = 'AND user_id = ?';
      params.push(input.userId);
    }
    let sinceSql = '';
    if (input.sinceDays != null && input.sinceDays > 0) {
      sinceSql = 'AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY';
      params.push(Math.floor(input.sinceDays));
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(points), 0) AS pts
       FROM volunteer_events
       WHERE organization_id = ? ${userSql} ${sinceSql}`,
      params
    );
    return Number(rows[0]?.pts) || 0;
  }

  /** Leaderboard: top volunteers by points (tasteful, org-scoped). */
  static async leaderboard(input: {
    organizationId: number;
    sinceDays?: number;
    limit?: number;
  }): Promise<
    Array<{
      userId: number;
      displayName: string | null;
      email: string | null;
      points: number;
      eventCount: number;
    }>
  > {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
    const params: unknown[] = [input.organizationId];
    let sinceSql = '';
    if (input.sinceDays != null && input.sinceDays > 0) {
      sinceSql = 'AND e.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY';
      params.push(Math.floor(input.sinceDays));
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT e.user_id,
              COALESCE(SUM(e.points), 0) AS points,
              COUNT(*) AS event_count,
              u.display_name, u.email
       FROM volunteer_events e
       JOIN users u ON u.id = e.user_id
       JOIN organization_members om
         ON om.user_id = e.user_id
        AND om.organization_id = e.organization_id
        AND om.role IN ('volunteer', 'captain')
       WHERE e.organization_id = ?
         AND e.points > 0
         ${sinceSql}
       GROUP BY e.user_id, u.display_name, u.email
       ORDER BY points DESC, event_count DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => ({
      userId: Number(r.user_id),
      displayName: r.display_name != null ? String(r.display_name) : null,
      email: r.email != null ? String(r.email) : null,
      points: Number(r.points) || 0,
      eventCount: Number(r.event_count) || 0,
    }));
  }

  /**
   * Retention: distinct volunteers with ≥1 meaningful event in a window,
   * compared across rolling periods (active-through-time).
   */
  static async retentionMetric(organizationId: number): Promise<{
    active7d: number;
    active30d: number;
    active60d: number;
    sustained: number;
    totalVolunteers: number;
  }> {
    const sql = await openSql();
    const meaningful = `kind IN (
      'shift_checked_in','task_completed','outreach_logged','contact_converted'
    )`;

    const countActive = async (days: number) => {
      const [rows] = await sql.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT user_id) AS n
         FROM volunteer_events
         WHERE organization_id = ?
           AND ${meaningful}
           AND created_at >= UTC_TIMESTAMP() - INTERVAL ${Math.floor(days)} DAY`,
        [organizationId]
      );
      return Number(rows[0]?.n) || 0;
    };

    const [sustainedRows] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM (
         SELECT user_id
         FROM volunteer_events
         WHERE organization_id = ?
           AND ${meaningful}
           AND created_at >= UTC_TIMESTAMP() - INTERVAL 60 DAY
         GROUP BY user_id
         HAVING COUNT(DISTINCT YEARWEEK(created_at, 3)) >= 3
            OR COUNT(*) >= 5
       ) t`,
      [organizationId]
    );

    const [totRows] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM organization_members
       WHERE organization_id = ?
         AND role IN ('volunteer', 'captain')
         AND status = 'active'`,
      [organizationId]
    );

    return {
      active7d: await countActive(7),
      active30d: await countActive(30),
      active60d: await countActive(60),
      sustained: Number(sustainedRows[0]?.n) || 0,
      totalVolunteers: Number(totRows[0]?.n) || 0,
    };
  }

  /** Ladder status from event stream: recruited | active | sustained. */
  static async ladderStatus(input: {
    organizationId: number;
    userId: number;
  }): Promise<'recruited' | 'active' | 'sustained'> {
    const sql = await openSql();
    const [recent] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n
       FROM volunteer_events
       WHERE organization_id = ? AND user_id = ?
         AND kind IN (
           'shift_checked_in','task_completed','outreach_logged','contact_converted'
         )
         AND created_at >= UTC_TIMESTAMP() - INTERVAL 14 DAY`,
      [input.organizationId, input.userId]
    );
    const [weeks] = await sql.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT YEARWEEK(created_at, 3)) AS w, COUNT(*) AS n
       FROM volunteer_events
       WHERE organization_id = ? AND user_id = ?
         AND kind IN (
           'shift_checked_in','task_completed','outreach_logged','contact_converted'
         )
         AND created_at >= UTC_TIMESTAMP() - INTERVAL 60 DAY`,
      [input.organizationId, input.userId]
    );
    const w = Number(weeks[0]?.w) || 0;
    const n = Number(weeks[0]?.n) || 0;
    if (w >= 3 || n >= 5) return 'sustained';
    if (Number(recent[0]?.n) > 0) return 'active';
    return 'recruited';
  }
}
