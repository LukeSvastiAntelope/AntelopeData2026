/**
 * Volunteer V5 — teams + shoutouts.
 * Points and ladder status live on volunteer_events (event-sourced).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';

export type VolunteerTeam = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  memberCount: number;
  myMembership?: boolean;
};

export type VolunteerShoutout = {
  id: number;
  organizationId: number;
  fromUserId: number;
  toUserId: number;
  message: string;
  createdAt: string;
  fromName?: string | null;
  toName?: string | null;
};

function toIso(d: unknown): string {
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
}

export class VolunteerGamificationRepo {
  static async createTeam(input: {
    organizationId: number;
    createdBy: number;
    name: string;
    description?: string | null;
  }): Promise<VolunteerTeam> {
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new Error('Team name is required');
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_teams
        (organization_id, name, description, created_by)
       VALUES (?, ?, ?, ?)`,
      [
        input.organizationId,
        name,
        input.description?.trim().slice(0, 500) || null,
        input.createdBy,
      ]
    );
    return {
      id: Number(result.insertId),
      organizationId: input.organizationId,
      name,
      description: input.description?.trim() || null,
      memberCount: 0,
    };
  }

  static async listTeams(input: {
    organizationId: number;
    forUserId?: number;
  }): Promise<VolunteerTeam[]> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM volunteer_team_members m WHERE m.team_id = t.id) AS member_count
              ${
                input.forUserId
                  ? `, EXISTS(
                      SELECT 1 FROM volunteer_team_members mx
                      WHERE mx.team_id = t.id AND mx.user_id = ?
                    ) AS my_membership`
                  : ', 0 AS my_membership'
              }
       FROM volunteer_teams t
       WHERE t.organization_id = ?
       ORDER BY t.name ASC`,
      input.forUserId
        ? [input.forUserId, input.organizationId]
        : [input.organizationId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      organizationId: Number(r.organization_id),
      name: String(r.name),
      description: r.description != null ? String(r.description) : null,
      memberCount: Number(r.member_count) || 0,
      myMembership: Boolean(r.my_membership),
    }));
  }

  static async joinTeam(input: {
    teamId: number;
    organizationId: number;
    userId: number;
  }): Promise<void> {
    const sql = await openSql();
    const [teams] = await sql.execute<RowDataPacket[]>(
      `SELECT id FROM volunteer_teams
       WHERE id = ? AND organization_id = ? LIMIT 1`,
      [input.teamId, input.organizationId]
    );
    if (!teams.length) throw new Error('Team not found');

    // One team at a time — leave others in this org
    await sql.execute(
      `DELETE FROM volunteer_team_members
       WHERE organization_id = ? AND user_id = ?`,
      [input.organizationId, input.userId]
    );
    await sql.execute(
      `INSERT INTO volunteer_team_members (team_id, organization_id, user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP`,
      [input.teamId, input.organizationId, input.userId]
    );
    await VolunteerEventsRepo.append({
      organizationId: input.organizationId,
      userId: input.userId,
      kind: 'team_joined',
      points: 0,
      relatedType: 'team',
      relatedId: input.teamId,
    });
  }

  static async leaveTeam(input: {
    organizationId: number;
    userId: number;
  }): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `DELETE FROM volunteer_team_members
       WHERE organization_id = ? AND user_id = ?`,
      [input.organizationId, input.userId]
    );
  }

  static async createShoutout(input: {
    organizationId: number;
    fromUserId: number;
    toUserId: number;
    message: string;
  }): Promise<VolunteerShoutout> {
    const message = String(input.message || '').trim().slice(0, 280);
    if (!message) throw new Error('Shoutout message required');
    const sql = await openSql();

    const [vol] = await sql.execute<RowDataPacket[]>(
      `SELECT user_id FROM organization_members
       WHERE organization_id = ? AND user_id = ?
         AND role IN ('volunteer', 'captain') AND status = 'active'
       LIMIT 1`,
      [input.organizationId, input.toUserId]
    );
    if (!vol.length) throw new Error('Recipient is not an active volunteer');

    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_shoutouts
        (organization_id, from_user_id, to_user_id, message)
       VALUES (?, ?, ?, ?)`,
      [input.organizationId, input.fromUserId, input.toUserId, message]
    );

    await VolunteerEventsRepo.append({
      organizationId: input.organizationId,
      userId: input.toUserId,
      kind: 'shoutout_received',
      points: 5,
      relatedType: 'shoutout',
      relatedId: Number(result.insertId),
      payload: { fromUserId: input.fromUserId, message },
    });

    return {
      id: Number(result.insertId),
      organizationId: input.organizationId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      message,
      createdAt: new Date().toISOString(),
    };
  }

  static async listShoutouts(input: {
    organizationId: number;
    toUserId?: number;
    limit?: number;
  }): Promise<VolunteerShoutout[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
    const params: unknown[] = [input.organizationId];
    let toSql = '';
    if (input.toUserId != null) {
      toSql = 'AND s.to_user_id = ?';
      params.push(input.toUserId);
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT s.*,
              uf.display_name AS from_name,
              ut.display_name AS to_name
       FROM volunteer_shoutouts s
       LEFT JOIN users uf ON uf.id = s.from_user_id
       LEFT JOIN users ut ON ut.id = s.to_user_id
       WHERE s.organization_id = ? ${toSql}
       ORDER BY s.created_at DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => ({
      id: Number(r.id),
      organizationId: Number(r.organization_id),
      fromUserId: Number(r.from_user_id),
      toUserId: Number(r.to_user_id),
      message: String(r.message),
      createdAt: toIso(r.created_at),
      fromName: r.from_name != null ? String(r.from_name) : null,
      toName: r.to_name != null ? String(r.to_name) : null,
    }));
  }

  /** Team leaderboard by summed member points. */
  static async teamLeaderboard(input: {
    organizationId: number;
    sinceDays?: number;
    limit?: number;
  }): Promise<
    Array<{ teamId: number; name: string; points: number; members: number }>
  > {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
    const days =
      input.sinceDays != null && input.sinceDays > 0
        ? Math.floor(input.sinceDays)
        : null;
    const sinceSql =
      days != null
        ? 'AND e.created_at >= UTC_TIMESTAMP() - INTERVAL ' + days + ' DAY'
        : '';
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT t.id AS team_id, t.name,
              COALESCE(SUM(e.points), 0) AS points,
              COUNT(DISTINCT m.user_id) AS members
       FROM volunteer_teams t
       LEFT JOIN volunteer_team_members m ON m.team_id = t.id
       LEFT JOIN volunteer_events e
         ON e.user_id = m.user_id
        AND e.organization_id = t.organization_id
        AND e.points > 0
        ${sinceSql}
       WHERE t.organization_id = ?
       GROUP BY t.id, t.name
       ORDER BY points DESC, members DESC
       LIMIT ${limit}`,
      [input.organizationId]
    );
    return rows.map((r) => ({
      teamId: Number(r.team_id),
      name: String(r.name),
      points: Number(r.points) || 0,
      members: Number(r.members) || 0,
    }));
  }
}
