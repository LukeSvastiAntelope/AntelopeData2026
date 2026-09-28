import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  clearSupportCookie,
  publicSupportPayload,
  resolveSupportSession,
  SUPPORT_COOKIE,
} from '@/app/utils/auth/support-session';
import { AdminSupportRepo } from '@/app/utils/database/admin-support-repo';

/**
 * GET /api/support/session — banner status for the signed-in actor.
 * Cookie-bound; not a cross-org admin list.
 *
 * DELETE /api/support/session — end from the banner (same actor only).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;

    await AdminSupportRepo.expireStale();
    const session = await resolveSupportSession(req, {
      actorUserId: Number(auth),
    });

    if (!session) {
      const res = NextResponse.json({ status: true, active: false, session: null });
      // Clear stale cookie if present
      if (req.cookies.get(SUPPORT_COOKIE)) {
        clearSupportCookie(res);
      }
      return res;
    }

    return NextResponse.json({
      status: true,
      active: true,
      session: publicSupportPayload(session),
    });
  } catch (error) {
    console.error('[support/session GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const actorUserId = Number(auth);

    const session = await resolveSupportSession(req, { actorUserId });
    let ended = session;
    if (ended && !ended.endedAt) {
      ended = (await AdminSupportRepo.end(ended.id, 'manual')) || ended;
    }

    // Lazy-import audit to avoid circular deps in edge-ish paths
    const { writeAdminAuditLog } = await import(
      '@/app/utils/database/admin-audit-repo'
    );
    if (ended) {
      await writeAdminAuditLog({
        actorUserId,
        action: 'support.stop',
        targetType: 'organization',
        targetId: ended.targetOrganizationId,
        metadata: {
          supportSessionId: ended.id,
          mode: ended.mode,
          durationSeconds: ended.durationSeconds,
          organizationName: ended.targetOrganizationName,
          endReason: ended.endReason || 'manual',
          via: 'banner',
        },
        ip:
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          req.headers.get('x-real-ip'),
      });
    }

    const res = NextResponse.json({
      status: true,
      ended: !!ended,
      durationSeconds: ended?.durationSeconds ?? null,
    });
    clearSupportCookie(res);
    return res;
  } catch (error) {
    console.error('[support/session DELETE]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
