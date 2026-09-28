import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/app/utils/cron-auth';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import { DEFAULT_SUPERADMIN_EMAIL } from '@/app/utils/auth/super-admin';
import { runScheduledMarketingDraft } from '@/app/utils/services/antelope-growth-service';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

/**
 * POST /api/cron/antelope-marketing
 *
 * Scheduler: draft Antelope own-growth posts into pending_approval only.
 * Never posts to X. Uses Luke's user id as actor when present.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = assertCronAuthorized(req);
    if (denied) return denied;

    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1`,
      [DEFAULT_SUPERADMIN_EMAIL.toLowerCase()]
    );
    const actorUserId = Number(rows[0]?.id);
    if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Super-admin user not found — cannot attribute drafts',
        },
        { status: 500 }
      );
    }

    const result = await runScheduledMarketingDraft(actorUserId);

    await writeAdminAuditLog({
      actorUserId,
      action: 'growth.scheduler_tick',
      targetType: 'growth',
      targetId: result.draft?.id ?? null,
      metadata: {
        created: result.created,
        reason: result.reason || null,
        neverAutoPost: true,
      },
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      reason: result.reason || null,
      draftId: result.draft?.id ?? null,
      note: 'Drafts only — nothing posted to X',
    });
  } catch (error) {
    console.error('[cron/antelope-marketing]', error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
