/**
 * Volunteer V3 — shifts, tasks, claims.
 * Shifts may bind to a MiniVAN turf; claims are org-scoped volunteer identity.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type ShiftStatus = 'open' | 'full' | 'cancelled' | 'completed';
export type TaskStatus = 'open' | 'cancelled' | 'completed';
export type ShiftClaimStatus = 'claimed' | 'checked_in' | 'no_show' | 'cancelled';
export type TaskClaimStatus = 'claimed' | 'done' | 'cancelled';

export type VolunteerShift = {
  id: number;
  organizationId: number;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationText: string | null;
  turfId: number | null;
  turfLabel: string | null;
  capacity: number | null;
  status: ShiftStatus;
  reminderHoursBefore: number;
  reminderStagedAt: string | null;
  checkinPromptStagedAt: string | null;
  createdBy: number;
  claimCount: number;
  myClaimStatus?: ShiftClaimStatus | null;
};

export type VolunteerTask = {
  id: number;
  organizationId: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  shiftId: number | null;
  status: TaskStatus;
  createdBy: number;
  claimCount: number;
  myClaimStatus?: TaskClaimStatus | null;
};

function toIso(d: unknown): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function mapShift(row: RowDataPacket, claimCount = 0): VolunteerShift {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    startsAt: toIso(row.starts_at) || new Date().toISOString(),
    endsAt: toIso(row.ends_at),
    locationText: row.location_text != null ? String(row.location_text) : null,
    turfId: row.turf_id != null ? Number(row.turf_id) : null,
    turfLabel: row.turf_label != null ? String(row.turf_label) : null,
    capacity: row.capacity != null ? Number(row.capacity) : null,
    status: String(row.status) as ShiftStatus,
    reminderHoursBefore: Number(row.reminder_hours_before) || 24,
    reminderStagedAt: toIso(row.reminder_staged_at),
    checkinPromptStagedAt: toIso(row.checkin_prompt_staged_at),
    createdBy: Number(row.created_by),
    claimCount,
    myClaimStatus: row.my_claim_status
      ? (String(row.my_claim_status) as ShiftClaimStatus)
      : null,
  };
}

function mapTask(row: RowDataPacket, claimCount = 0): VolunteerTask {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    dueAt: toIso(row.due_at),
    shiftId: row.shift_id != null ? Number(row.shift_id) : null,
    status: String(row.status) as TaskStatus,
    createdBy: Number(row.created_by),
    claimCount,
    myClaimStatus: row.my_claim_status
      ? (String(row.my_claim_status) as TaskClaimStatus)
      : null,
  };
}

export class VolunteerShiftsRepo {
  static async createShift(input: {
    organizationId: number;
    createdBy: number;
    title: string;
    description?: string | null;
    startsAt: string | Date;
    endsAt?: string | Date | null;
    locationText?: string | null;
    turfId?: number | null;
    capacity?: number | null;
    reminderHoursBefore?: number;
  }): Promise<VolunteerShift> {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('title is required');
    const starts = new Date(input.startsAt);
    if (Number.isNaN(starts.getTime())) throw new Error('startsAt is invalid');
    const ends =
      input.endsAt != null && input.endsAt !== ''
        ? new Date(input.endsAt)
        : null;
    if (ends && Number.isNaN(ends.getTime())) throw new Error('endsAt is invalid');

    let turfId: number | null =
      input.turfId != null ? Number(input.turfId) : null;
    if (turfId) {
      const sql = await openSql();
      const [turf] = await sql.execute<RowDataPacket[]>(
        `SELECT id FROM turfs WHERE id = ? AND organization_id = ? LIMIT 1`,
        [turfId, input.organizationId]
      );
      if (!turf.length) throw new Error('Turf not found in this organization');
    }

    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_shifts
        (organization_id, title, description, starts_at, ends_at, location_text,
         turf_id, capacity, reminder_hours_before, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        title,
        input.description?.trim() || null,
        starts,
        ends,
        input.locationText?.trim() || null,
        turfId,
        input.capacity != null && input.capacity > 0
          ? Number(input.capacity)
          : null,
        input.reminderHoursBefore != null
          ? Math.max(1, Number(input.reminderHoursBefore))
          : 24,
        input.createdBy,
      ]
    );
    const created = await this.getShift(Number(result.insertId), input.organizationId);
    if (!created) throw new Error('Shift not found after create');
    return created;
  }

  static async getShift(
    shiftId: number,
    organizationId: number,
    forUserId?: number
  ): Promise<VolunteerShift | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT s.*, t.label AS turf_label,
              (SELECT COUNT(*) FROM volunteer_shift_claims c
               WHERE c.shift_id = s.id AND c.status IN ('claimed','checked_in')) AS claim_count
              ${
                forUserId
                  ? `,(SELECT c2.status FROM volunteer_shift_claims c2
                     WHERE c2.shift_id = s.id AND c2.user_id = ?
                     ORDER BY c2.id DESC LIMIT 1) AS my_claim_status`
                  : ''
              }
       FROM volunteer_shifts s
       LEFT JOIN turfs t ON t.id = s.turf_id
       WHERE s.id = ? AND s.organization_id = ?
       LIMIT 1`,
      forUserId
        ? [forUserId, shiftId, organizationId]
        : [shiftId, organizationId]
    );
    if (!rows.length) return null;
    return mapShift(rows[0], Number(rows[0].claim_count) || 0);
  }

  static async listShifts(
    organizationId: number,
    opts?: {
      upcomingOnly?: boolean;
      includeCancelled?: boolean;
      forUserId?: number;
      limit?: number;
    }
  ): Promise<VolunteerShift[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 300);
    const clauses = ['s.organization_id = ?'];
    const params: unknown[] = [];
    if (opts?.forUserId) params.push(opts.forUserId);
    params.push(organizationId);
    if (opts?.upcomingOnly) {
      clauses.push('s.starts_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY');
    }
    if (!opts?.includeCancelled) {
      clauses.push(`s.status <> 'cancelled'`);
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT s.*, t.label AS turf_label,
              (SELECT COUNT(*) FROM volunteer_shift_claims c
               WHERE c.shift_id = s.id AND c.status IN ('claimed','checked_in')) AS claim_count
              ${
                opts?.forUserId
                  ? `,(SELECT c2.status FROM volunteer_shift_claims c2
                     WHERE c2.shift_id = s.id AND c2.user_id = ?
                     ORDER BY c2.id DESC LIMIT 1) AS my_claim_status`
                  : ''
              }
       FROM volunteer_shifts s
       LEFT JOIN turfs t ON t.id = s.turf_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.starts_at ASC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => mapShift(r, Number(r.claim_count) || 0));
  }

  static async claimShift(input: {
    shiftId: number;
    organizationId: number;
    userId: number;
    personRecordId?: number | null;
  }): Promise<VolunteerShift> {
    const shift = await this.getShift(input.shiftId, input.organizationId);
    if (!shift) throw new Error('Shift not found');
    if (shift.status === 'cancelled') throw new Error('Shift was cancelled');
    if (shift.status === 'completed') throw new Error('Shift already completed');
    if (
      shift.capacity != null &&
      shift.claimCount >= shift.capacity &&
      shift.status === 'full'
    ) {
      throw new Error('Shift is full');
    }

    const sql = await openSql();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id, status FROM volunteer_shift_claims
       WHERE shift_id = ? AND user_id = ? LIMIT 1`,
      [input.shiftId, input.userId]
    );
    if (existing.length) {
      if (existing[0].status === 'cancelled') {
        await sql.execute(
          `UPDATE volunteer_shift_claims
           SET status = 'claimed', claimed_at = UTC_TIMESTAMP(),
               cancelled_at = NULL, person_record_id = COALESCE(?, person_record_id)
           WHERE id = ?`,
          [input.personRecordId ?? null, existing[0].id]
        );
      }
      // already claimed / checked_in — idempotent
    } else {
      if (shift.capacity != null && shift.claimCount >= shift.capacity) {
        throw new Error('Shift is full');
      }
      await sql.execute(
        `INSERT INTO volunteer_shift_claims
          (shift_id, organization_id, user_id, person_record_id, status)
         VALUES (?, ?, ?, ?, 'claimed')`,
        [
          input.shiftId,
          input.organizationId,
          input.userId,
          input.personRecordId ?? null,
        ]
      );
    }

    await this.refreshShiftCapacity(input.shiftId);
    const refreshed = await this.getShift(
      input.shiftId,
      input.organizationId,
      input.userId
    );
    if (!refreshed) throw new Error('Shift not found');
    return refreshed;
  }

  static async unclaimShift(input: {
    shiftId: number;
    organizationId: number;
    userId: number;
  }): Promise<VolunteerShift> {
    const sql = await openSql();
    await sql.execute(
      `UPDATE volunteer_shift_claims
       SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP()
       WHERE shift_id = ? AND organization_id = ? AND user_id = ?
         AND status IN ('claimed', 'checked_in')`,
      [input.shiftId, input.organizationId, input.userId]
    );
    await this.refreshShiftCapacity(input.shiftId);
    const shift = await this.getShift(
      input.shiftId,
      input.organizationId,
      input.userId
    );
    if (!shift) throw new Error('Shift not found');
    return shift;
  }

  static async checkIn(input: {
    shiftId: number;
    organizationId: number;
    userId: number;
  }): Promise<VolunteerShift> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `UPDATE volunteer_shift_claims
       SET status = 'checked_in', checked_in_at = UTC_TIMESTAMP()
       WHERE shift_id = ? AND organization_id = ? AND user_id = ?
         AND status IN ('claimed', 'checked_in')`,
      [input.shiftId, input.organizationId, input.userId]
    );
    if (!result.affectedRows) {
      throw new Error('Claim this shift before checking in');
    }
    const shift = await this.getShift(
      input.shiftId,
      input.organizationId,
      input.userId
    );
    if (!shift) throw new Error('Shift not found');
    return shift;
  }

  static async refreshShiftCapacity(shiftId: number): Promise<void> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT capacity, status,
              (SELECT COUNT(*) FROM volunteer_shift_claims c
               WHERE c.shift_id = s.id AND c.status IN ('claimed','checked_in')) AS n
       FROM volunteer_shifts s WHERE s.id = ? LIMIT 1`,
      [shiftId]
    );
    if (!rows.length) return;
    const capacity =
      rows[0].capacity != null ? Number(rows[0].capacity) : null;
    const n = Number(rows[0].n) || 0;
    const status = String(rows[0].status);
    if (status === 'cancelled' || status === 'completed') return;
    const next =
      capacity != null && n >= capacity ? 'full' : 'open';
    if (next !== status) {
      await sql.execute(`UPDATE volunteer_shifts SET status = ? WHERE id = ?`, [
        next,
        shiftId,
      ]);
    }
  }

  static async listActiveClaimsForShift(shiftId: number): Promise<
    Array<{
      userId: number;
      personRecordId: number | null;
      email: string | null;
      phone: string | null;
      displayName: string | null;
      status: string;
    }>
  > {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT c.user_id, c.person_record_id, c.status,
              u.email AS user_email, u.display_name,
              pr.email AS person_email, pr.phone
       FROM volunteer_shift_claims c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN person_records pr ON pr.id = c.person_record_id
       WHERE c.shift_id = ? AND c.status IN ('claimed', 'checked_in')`,
      [shiftId]
    );
    return rows.map((r) => ({
      userId: Number(r.user_id),
      personRecordId:
        r.person_record_id != null ? Number(r.person_record_id) : null,
      email: (r.user_email || r.person_email || null) as string | null,
      phone: r.phone != null ? String(r.phone) : null,
      displayName: (r.display_name as string) || null,
      status: String(r.status),
    }));
  }

  static async createTask(input: {
    organizationId: number;
    createdBy: number;
    title: string;
    description?: string | null;
    dueAt?: string | Date | null;
    shiftId?: number | null;
  }): Promise<VolunteerTask> {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('title is required');
    const due =
      input.dueAt != null && input.dueAt !== ''
        ? new Date(input.dueAt)
        : null;
    if (due && Number.isNaN(due.getTime())) throw new Error('dueAt is invalid');
    if (input.shiftId != null) {
      const shift = await this.getShift(Number(input.shiftId), input.organizationId);
      if (!shift) throw new Error('Linked shift not found');
    }
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO volunteer_tasks
        (organization_id, title, description, due_at, shift_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        title,
        input.description?.trim() || null,
        due,
        input.shiftId != null ? Number(input.shiftId) : null,
        input.createdBy,
      ]
    );
    const task = await this.getTask(Number(result.insertId), input.organizationId);
    if (!task) throw new Error('Task not found after create');
    return task;
  }

  static async getTask(
    taskId: number,
    organizationId: number,
    forUserId?: number
  ): Promise<VolunteerTask | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM volunteer_task_claims c
               WHERE c.task_id = t.id AND c.status IN ('claimed','done')) AS claim_count
              ${
                forUserId
                  ? `,(SELECT c2.status FROM volunteer_task_claims c2
                     WHERE c2.task_id = t.id AND c2.user_id = ?
                     ORDER BY c2.id DESC LIMIT 1) AS my_claim_status`
                  : ''
              }
       FROM volunteer_tasks t
       WHERE t.id = ? AND t.organization_id = ?
       LIMIT 1`,
      forUserId ? [forUserId, taskId, organizationId] : [taskId, organizationId]
    );
    if (!rows.length) return null;
    return mapTask(rows[0], Number(rows[0].claim_count) || 0);
  }

  static async listTasks(
    organizationId: number,
    opts?: { forUserId?: number; openOnly?: boolean; limit?: number }
  ): Promise<VolunteerTask[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 300);
    const params: unknown[] = [];
    if (opts?.forUserId) params.push(opts.forUserId);
    params.push(organizationId);
    const clauses = ['t.organization_id = ?'];
    if (opts?.openOnly) clauses.push(`t.status = 'open'`);
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM volunteer_task_claims c
               WHERE c.task_id = t.id AND c.status IN ('claimed','done')) AS claim_count
              ${
                opts?.forUserId
                  ? `,(SELECT c2.status FROM volunteer_task_claims c2
                     WHERE c2.task_id = t.id AND c2.user_id = ?
                     ORDER BY c2.id DESC LIMIT 1) AS my_claim_status`
                  : ''
              }
       FROM volunteer_tasks t
       WHERE ${clauses.join(' AND ')}
       ORDER BY COALESCE(t.due_at, t.created_at) ASC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => mapTask(r, Number(r.claim_count) || 0));
  }

  static async claimTask(input: {
    taskId: number;
    organizationId: number;
    userId: number;
    personRecordId?: number | null;
  }): Promise<VolunteerTask> {
    const task = await this.getTask(input.taskId, input.organizationId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'open') throw new Error('Task is not open');
    const sql = await openSql();
    const [existing] = await sql.execute<RowDataPacket[]>(
      `SELECT id, status FROM volunteer_task_claims
       WHERE task_id = ? AND user_id = ? LIMIT 1`,
      [input.taskId, input.userId]
    );
    if (existing.length) {
      if (existing[0].status === 'cancelled') {
        await sql.execute(
          `UPDATE volunteer_task_claims
           SET status = 'claimed', claimed_at = UTC_TIMESTAMP(),
               cancelled_at = NULL, completed_at = NULL,
               person_record_id = COALESCE(?, person_record_id)
           WHERE id = ?`,
          [input.personRecordId ?? null, existing[0].id]
        );
      }
    } else {
      await sql.execute(
        `INSERT INTO volunteer_task_claims
          (task_id, organization_id, user_id, person_record_id, status)
         VALUES (?, ?, ?, ?, 'claimed')`,
        [
          input.taskId,
          input.organizationId,
          input.userId,
          input.personRecordId ?? null,
        ]
      );
    }
    const refreshed = await this.getTask(
      input.taskId,
      input.organizationId,
      input.userId
    );
    if (!refreshed) throw new Error('Task not found');
    return refreshed;
  }

  static async completeTask(input: {
    taskId: number;
    organizationId: number;
    userId: number;
  }): Promise<VolunteerTask> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `UPDATE volunteer_task_claims
       SET status = 'done', completed_at = UTC_TIMESTAMP()
       WHERE task_id = ? AND organization_id = ? AND user_id = ?
         AND status IN ('claimed', 'done')`,
      [input.taskId, input.organizationId, input.userId]
    );
    if (!result.affectedRows) throw new Error('Claim this task first');
    const task = await this.getTask(
      input.taskId,
      input.organizationId,
      input.userId
    );
    if (!task) throw new Error('Task not found');
    return task;
  }

  static async markReminderStaged(
    shiftId: number,
    kind: 'pre_shift' | 'post_shift_checkin'
  ): Promise<void> {
    const sql = await openSql();
    const col =
      kind === 'pre_shift' ? 'reminder_staged_at' : 'checkin_prompt_staged_at';
    await sql.execute(
      `UPDATE volunteer_shifts SET ${col} = UTC_TIMESTAMP() WHERE id = ?`,
      [shiftId]
    );
  }

  static async logReminder(input: {
    organizationId: number;
    kind: 'pre_shift' | 'post_shift_checkin';
    shiftId: number;
    stagedActionId: number | null;
    recipientCount: number;
  }): Promise<void> {
    const sql = await openSql();
    await sql.execute(
      `INSERT INTO volunteer_reminder_log
        (organization_id, kind, shift_id, staged_action_id, recipient_count)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.organizationId,
        input.kind,
        input.shiftId,
        input.stagedActionId,
        input.recipientCount,
      ]
    );
  }

  /** Shifts needing a pre-shift reminder (starts within window, not yet staged). */
  static async listShiftsNeedingPreReminder(opts?: {
    organizationId?: number;
    limit?: number;
  }): Promise<VolunteerShift[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 100);
    const params: unknown[] = [];
    let orgSql = '';
    if (opts?.organizationId) {
      orgSql = 'AND s.organization_id = ?';
      params.push(opts.organizationId);
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT s.*, t.label AS turf_label, 0 AS claim_count
       FROM volunteer_shifts s
       LEFT JOIN turfs t ON t.id = s.turf_id
       WHERE s.status IN ('open', 'full')
         AND s.reminder_staged_at IS NULL
         AND s.starts_at > UTC_TIMESTAMP()
         AND s.starts_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL s.reminder_hours_before HOUR)
         ${orgSql}
       ORDER BY s.starts_at ASC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => mapShift(r, 0));
  }

  /** Shifts that ended recently and need a post-shift check-in prompt. */
  static async listShiftsNeedingCheckinPrompt(opts?: {
    organizationId?: number;
    limit?: number;
  }): Promise<VolunteerShift[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 100);
    const params: unknown[] = [];
    let orgSql = '';
    if (opts?.organizationId) {
      orgSql = 'AND s.organization_id = ?';
      params.push(opts.organizationId);
    }
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT s.*, t.label AS turf_label, 0 AS claim_count
       FROM volunteer_shifts s
       LEFT JOIN turfs t ON t.id = s.turf_id
       WHERE s.status IN ('open', 'full', 'completed')
         AND s.checkin_prompt_staged_at IS NULL
         AND COALESCE(s.ends_at, s.starts_at) <= UTC_TIMESTAMP()
         AND COALESCE(s.ends_at, s.starts_at) >= UTC_TIMESTAMP() - INTERVAL 36 HOUR
         ${orgSql}
       ORDER BY COALESCE(s.ends_at, s.starts_at) DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map((r) => mapShift(r, 0));
  }

  static async resolveOrgOwnerUserId(
    organizationId: number
  ): Promise<number | null> {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT user_id FROM organization_members
       WHERE organization_id = ? AND status = 'active'
         AND role IN ('owner', 'admin')
       ORDER BY role = 'owner' DESC, id ASC
       LIMIT 1`,
      [organizationId]
    );
    return rows.length ? Number(rows[0].user_id) : null;
  }
}
