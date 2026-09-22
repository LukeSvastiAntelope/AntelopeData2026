import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PoolConnection } from 'mysql2/promise';
import { undoPersonMerge } from '@/app/utils/database/person-merge';

export const runtime = 'nodejs';

/** GET /api/dashboard/merge-audits — FM4 merged_from trail (reversible merges). */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const status = request.nextUrl.searchParams.get('status') || 'applied';
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get('limit') || 50), 1),
      200
    );
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, survivor_person_id, loser_person_id, match_score, merged_from,
              status, created_at, undone_at, undone_by, notes
       FROM person_merge_audit
       WHERE organization_id = ? AND status = ?
       ORDER BY id DESC
       LIMIT ${limit}`,
      [orgId, status]
    );
    return NextResponse.json({ status: true, organizationId: orgId, audits: rows });
  } catch (error) {
    console.error('[merge-audits GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dashboard/merge-audits
 * Body: { id, action: 'undo' }
 * Restores loser from snapshot and reverses FK moves via merged_from audit.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json();
    const id = Number(body.id);
    const action = String(body.action || '');
    if (!Number.isFinite(id) || action !== 'undo') {
      return NextResponse.json(
        { status: false, message: 'id and action=undo required' },
        { status: 400 }
      );
    }

    const sql = await openSql();
    const conn = (await sql.getConnection()) as PoolConnection;
    try {
      await conn.beginTransaction();
      const result = await undoPersonMerge(conn, orgId, id, Number(userId));
      await conn.commit();
      return NextResponse.json({ status: true, action: 'undone', id, ...result });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[merge-audits PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
