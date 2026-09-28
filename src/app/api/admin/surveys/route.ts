import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

/**
 * GET /api/admin/surveys
 * List all surveys across all users (super-admin only). Cross-org read — audited.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const db = await openSql();

    const [surveys]: any = await db.execute(
      `SELECT 
        s.id,
        s.title,
        s.slug,
        s.status,
        s.created_by,
        s.created_at,
        COUNT(sr.id) AS response_count
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.id DESC`
    );

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'surveys.list',
      targetType: 'survey',
      metadata: { count: Array.isArray(surveys) ? surveys.length : 0 },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      surveys: surveys.map((s: any) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        status: s.status,
        created_by: s.created_by,
        created_at: s.created_at,
        response_count: Number(s.response_count) || 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching admin surveys:', error);
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { status: false, message: 'Failed to fetch surveys', error: message },
      { status: 500 }
    );
  }
}
