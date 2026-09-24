/**
 * PayrollRepo — MiniVAN M3 GPS breadcrumbs + daily miles/hours/doors rollup.
 * Breadcrumbs are tenant-scoped and never joined to voter PII.
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader } from 'mysql2';

export type BreadcrumbInput = {
  clientEventId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  recordedAt: string | Date;
};

export type PayrollDayRow = {
  canvasserUserId: number;
  canvasserName: string | null;
  canvasserEmail: string | null;
  workDate: string; // YYYY-MM-DD
  miles: number;
  hours: number;
  doors: number;
  breadcrumbCount: number;
  firstAt: string | null;
  lastAt: string | null;
  isPaid: boolean;
};

/** Earth-mean haversine distance in miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class PayrollRepo {
  static async isPaidCanvasser(
    organizationId: number,
    userId: number
  ): Promise<boolean> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT is_paid_canvasser AS paid
       FROM organization_members
       WHERE organization_id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`,
      [organizationId, userId]
    );
    const r = (rows as any[])[0];
    return Boolean(r && Number(r.paid) === 1);
  }

  static async setPaidCanvasser(params: {
    organizationId: number;
    userId: number;
    paid: boolean;
  }): Promise<boolean> {
    const sql = await openSql();
    const [result] = await sql.execute<ResultSetHeader>(
      `UPDATE organization_members
       SET is_paid_canvasser = ?
       WHERE organization_id = ? AND user_id = ? AND status IN ('active', 'pending')`,
      [params.paid ? 1 : 0, params.organizationId, params.userId]
    );
    return result.affectedRows > 0;
  }

  static async listPaidFlags(
    organizationId: number
  ): Promise<Array<{ userId: number; paid: boolean; displayName: string | null; email: string | null }>> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT om.user_id, om.is_paid_canvasser AS paid, u.display_name, u.email
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = ? AND om.status = 'active'
       ORDER BY u.display_name, u.email`,
      [organizationId]
    );
    return (rows as any[]).map((r) => ({
      userId: Number(r.user_id),
      paid: Number(r.paid) === 1,
      displayName: r.display_name ? String(r.display_name) : null,
      email: r.email ? String(r.email) : null,
    }));
  }

  /**
   * Insert breadcrumbs idempotently (skip duplicate client_event_id).
   * Returns accepted count.
   */
  static async ingestBreadcrumbs(params: {
    organizationId: number;
    canvasserUserId: number;
    turfId?: number | null;
    walkTokenId?: number | null;
    points: BreadcrumbInput[];
  }): Promise<{ accepted: number; skipped: number; errors: string[] }> {
    const sql = await openSql();
    let accepted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of params.points) {
      const clientEventId = String(p.clientEventId || '').trim().slice(0, 64);
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!clientEventId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        errors.push('invalid point');
        continue;
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        errors.push(`${clientEventId}: bad coords`);
        continue;
      }
      const recordedAt = new Date(p.recordedAt);
      if (Number.isNaN(recordedAt.getTime())) {
        errors.push(`${clientEventId}: bad recordedAt`);
        continue;
      }
      try {
        const [result] = await sql.execute<ResultSetHeader>(
          `INSERT INTO canvass_gps_breadcrumbs
            (organization_id, canvasser_user_id, turf_id, walk_token_id,
             client_event_id, latitude, longitude, accuracy_m, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [
            params.organizationId,
            params.canvasserUserId,
            params.turfId ?? null,
            params.walkTokenId ?? null,
            clientEventId,
            lat,
            lng,
            p.accuracyM != null && Number.isFinite(Number(p.accuracyM))
              ? Number(p.accuracyM)
              : null,
            recordedAt,
          ]
        );
        if (result.affectedRows === 1) accepted += 1;
        else skipped += 1; // duplicate
      } catch (e) {
        errors.push(
          `${clientEventId}: ${e instanceof Error ? e.message : 'insert failed'}`
        );
      }
    }
    return { accepted, skipped, errors };
  }

  /**
   * Recompute + upsert daily rollups for an org over [fromDate, toDate] (inclusive, UTC dates).
   */
  static async recomputeRange(params: {
    organizationId: number;
    fromDate: string;
    toDate: string;
  }): Promise<PayrollDayRow[]> {
    const sql = await openSql();
    const from = String(params.fromDate).slice(0, 10);
    const to = String(params.toDate).slice(0, 10);

    // Breadcrumbs ordered for haversine
    const [crumbs] = await sql.execute(
      `SELECT canvasser_user_id, latitude, longitude, recorded_at
       FROM canvass_gps_breadcrumbs
       WHERE organization_id = ?
         AND recorded_at >= ?
         AND recorded_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY canvasser_user_id, recorded_at ASC, id ASC`,
      [params.organizationId, `${from} 00:00:00`, to]
    );

    // Door outcomes (activity + door count)
    const [doors] = await sql.execute(
      `SELECT canvasser_id AS canvasser_user_id, recorded_at
       FROM canvass_contacts
       WHERE organization_id = ?
         AND recorded_at >= ?
         AND recorded_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [params.organizationId, `${from} 00:00:00`, to]
    );

    type Acc = {
      miles: number;
      doors: number;
      crumbs: number;
      first: Date | null;
      last: Date | null;
      prev?: { lat: number; lng: number; t: number };
    };
    const map = new Map<string, Acc>(); // key = `${userId}|${ymd}`

    const touch = (userId: number, at: Date) => {
      const key = `${userId}|${ymdUTC(at)}`;
      let acc = map.get(key);
      if (!acc) {
        acc = { miles: 0, doors: 0, crumbs: 0, first: at, last: at };
        map.set(key, acc);
      }
      if (!acc.first || at < acc.first) acc.first = at;
      if (!acc.last || at > acc.last) acc.last = at;
      return acc;
    };

    for (const r of crumbs as any[]) {
      const userId = Number(r.canvasser_user_id);
      const at = new Date(r.recorded_at);
      if (Number.isNaN(at.getTime())) continue;
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      const acc = touch(userId, at);
      acc.crumbs += 1;
      if (acc.prev) {
        const dtMin = (at.getTime() - acc.prev.t) / 60000;
        // Ignore huge jumps (device sleep / teleport) > 45 min
        if (dtMin >= 0 && dtMin <= 45) {
          acc.miles += haversineMiles(acc.prev.lat, acc.prev.lng, lat, lng);
        }
      }
      acc.prev = { lat, lng, t: at.getTime() };
    }

    for (const r of doors as any[]) {
      const userId = Number(r.canvasser_user_id);
      const at = new Date(r.recorded_at);
      if (Number.isNaN(at.getTime())) continue;
      const acc = touch(userId, at);
      acc.doors += 1;
    }

    // Upsert rollup rows
    for (const [key, acc] of map) {
      const [userIdStr, workDate] = key.split('|');
      const userId = Number(userIdStr);
      const hours =
        acc.first && acc.last
          ? Math.max(0, (acc.last.getTime() - acc.first.getTime()) / 3600000)
          : 0;
      await sql.execute(
        `INSERT INTO canvass_payroll_days
          (organization_id, canvasser_user_id, work_date, miles, hours, doors,
           breadcrumb_count, first_at, last_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           miles = VALUES(miles),
           hours = VALUES(hours),
           doors = VALUES(doors),
           breadcrumb_count = VALUES(breadcrumb_count),
           first_at = VALUES(first_at),
           last_at = VALUES(last_at)`,
        [
          params.organizationId,
          userId,
          workDate,
          Math.round(acc.miles * 1000) / 1000,
          Math.round(hours * 1000) / 1000,
          acc.doors,
          acc.crumbs,
          acc.first,
          acc.last,
        ]
      );
    }

    // Read back with names + paid flag
    const [rows] = await sql.execute(
      `SELECT p.canvasser_user_id, p.work_date, p.miles, p.hours, p.doors,
              p.breadcrumb_count, p.first_at, p.last_at,
              u.display_name, u.email,
              COALESCE(om.is_paid_canvasser, 0) AS is_paid
       FROM canvass_payroll_days p
       LEFT JOIN users u ON u.id = p.canvasser_user_id
       LEFT JOIN organization_members om
         ON om.organization_id = p.organization_id AND om.user_id = p.canvasser_user_id
       WHERE p.organization_id = ?
         AND p.work_date >= ?
         AND p.work_date <= ?
       ORDER BY p.work_date DESC, u.display_name ASC, p.canvasser_user_id ASC`,
      [params.organizationId, from, to]
    );

    return (rows as any[]).map((r) => ({
      canvasserUserId: Number(r.canvasser_user_id),
      canvasserName: r.display_name ? String(r.display_name) : null,
      canvasserEmail: r.email ? String(r.email) : null,
      workDate:
        r.work_date instanceof Date
          ? ymdUTC(r.work_date)
          : String(r.work_date).slice(0, 10),
      miles: Number(r.miles) || 0,
      hours: Number(r.hours) || 0,
      doors: Number(r.doors) || 0,
      breadcrumbCount: Number(r.breadcrumb_count) || 0,
      firstAt: r.first_at ? new Date(r.first_at).toISOString() : null,
      lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
      isPaid: Number(r.is_paid) === 1,
    }));
  }

  /** Drop raw breadcrumbs older than retentionDays (default 90). Keeps rollup rows. */
  static async pruneBreadcrumbs(
    organizationId: number,
    retentionDays = 90
  ): Promise<number> {
    const sql = await openSql();
    const days = Math.max(14, Math.min(365, retentionDays));
    const [result] = await sql.execute<ResultSetHeader>(
      `DELETE FROM canvass_gps_breadcrumbs
       WHERE organization_id = ?
         AND recorded_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [organizationId, days]
    );
    return result.affectedRows;
  }
}
