import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PoolConnection } from 'mysql2/promise';
import { autoMergePersons } from '@/app/utils/database/person-merge';

export const runtime = 'nodejs';

/** GET /api/dashboard/merge-candidates — pending fuzzy-match review queue (FM3). */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const status = request.nextUrl.searchParams.get('status') || 'pending';
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get('limit') || 100), 1),
      500
    );
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT mc.id, mc.person_a_id, mc.person_b_id, mc.score, mc.field_scores,
              mc.status, mc.created_at,
              pa.full_name_normalized AS person_a_name,
              pb.full_name_normalized AS person_b_name,
              pa.cluster_key AS person_a_cluster,
              pb.cluster_key AS person_b_cluster
       FROM merge_candidates mc
       JOIN person_records pa ON pa.id = mc.person_a_id
       JOIN person_records pb ON pb.id = mc.person_b_id
       WHERE mc.organization_id = ? AND mc.status = ?
       ORDER BY mc.score DESC
       LIMIT ${limit}`,
      [orgId, status]
    );
    return NextResponse.json({ status: true, organizationId: orgId, candidates: rows });
  } catch (error) {
    console.error('[merge-candidates GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dashboard/merge-candidates
 * Body: { id, action: 'accept' | 'reject', notes? }
 * Accept runs the same auto-merge path as FM3 high-confidence.
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
    if (!Number.isFinite(id) || (action !== 'accept' && action !== 'reject')) {
      return NextResponse.json(
        { status: false, message: 'id and action=accept|reject required' },
        { status: 400 }
      );
    }

    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT id, person_a_id, person_b_id, score, status, match_candidate_id
       FROM merge_candidates
       WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    const row = (rows as any[])[0];
    if (!row) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    if (row.status !== 'pending') {
      return NextResponse.json(
        { status: false, message: `Already ${row.status}` },
        { status: 409 }
      );
    }

    if (action === 'reject') {
      await sql.execute(
        `UPDATE merge_candidates
         SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, notes = ?
         WHERE id = ? AND organization_id = ?`,
        [Number(userId), body.notes ?? null, id, orgId]
      );
      if (row.match_candidate_id) {
        await sql.execute(
          `UPDATE person_match_candidates SET decision = 'reject' WHERE id = ? AND organization_id = ?`,
          [row.match_candidate_id, orgId]
        );
      }
      return NextResponse.json({ status: true, action: 'rejected', id });
    }

    const conn = (await sql.getConnection()) as PoolConnection;
    try {
      await conn.beginTransaction();
      const merged = await autoMergePersons(
        conn,
        orgId,
        Number(row.person_a_id),
        Number(row.person_b_id),
        Number(row.score),
        {
          matchCandidateId: row.match_candidate_id
            ? Number(row.match_candidate_id)
            : null,
          mergeCandidateId: id,
          notes: body.notes ? String(body.notes) : null,
        }
      );
      await conn.execute(
        `UPDATE merge_candidates
         SET status = 'accepted', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, notes = ?
         WHERE id = ? AND organization_id = ?`,
        [Number(userId), body.notes ?? null, id, orgId]
      );
      if (row.match_candidate_id) {
        await conn.execute(
          `UPDATE person_match_candidates SET decision = 'auto_merge' WHERE id = ? AND organization_id = ?`,
          [row.match_candidate_id, orgId]
        );
      }
      await conn.commit();
      return NextResponse.json({ status: true, action: 'accepted', id, ...merged });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[merge-candidates PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
