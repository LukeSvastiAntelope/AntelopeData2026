import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { AdminSupportRepo } from '@/app/utils/database/admin-support-repo';
import {
  clearSupportCookie,
  loadOrganizationSummary,
  publicSupportPayload,
  resolveSupportSession,
  setSupportCookie,
  SUPPORT_DEFAULT_MINUTES,
  SUPPORT_MAX_MINUTES,
} from '@/app/utils/auth/support-session';

/**
 * GET /api/admin/support — current support session (super-admin).
 * POST /api/admin/support — start time-boxed "view as" session.
 * DELETE /api/admin/support — end session (audited with duration).
 */

export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    await AdminSupportRepo.expireStale();
    const session = await resolveSupportSession(req, {
      actorUserId: gate.numericUserId,
    });

    return NextResponse.json({
      status: true,
      active: !!session,
      session: session ? publicSupportPayload(session) : null,
    });
  } catch (error) {
    console.error('[admin/support GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const body = await req.json().catch(() => ({}));
    const organizationId = Number(body.organizationId ?? body.orgId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return NextResponse.json(
        { status: false, message: 'organizationId is required' },
        { status: 400 }
      );
    }

    const org = await loadOrganizationSummary(organizationId);
    if (!org) {
      return NextResponse.json(
        { status: false, message: 'Organization not found' },
        { status: 404 }
      );
    }

    // Write mode is opt-in and explicit — default read.
    const mode = body.mode === 'write' ? 'write' : 'read';
    if (mode === 'write' && body.confirmWrite !== true) {
      return NextResponse.json(
        {
          status: false,
          message:
            'Write mode requires confirmWrite: true. Prefer read-only support access.',
        },
        { status: 400 }
      );
    }

    let durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes)) {
      durationMinutes = SUPPORT_DEFAULT_MINUTES;
    }
    durationMinutes = Math.min(
      SUPPORT_MAX_MINUTES,
      Math.max(5, Math.floor(durationMinutes))
    );

    const session = await AdminSupportRepo.start({
      actorUserId: gate.numericUserId,
      actorEmail: gate.email,
      targetOrganizationId: org.id,
      targetOrganizationName: org.name,
      mode,
      durationMinutes,
      metadata: {
        requestedBy: gate.email,
        confirmWrite: mode === 'write',
      },
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'support.start',
      targetType: 'organization',
      targetId: org.id,
      metadata: {
        supportSessionId: session.id,
        mode: session.mode,
        durationMinutes,
        organizationName: org.name,
        expiresAt: session.expiresAt,
      },
      ip: clientIp(req),
    });

    const res = NextResponse.json({
      status: true,
      session: publicSupportPayload(session),
    });
    await setSupportCookie(res, session);
    return res;
  } catch (error) {
    console.error('[admin/support POST]', error);
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
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const session = await resolveSupportSession(req, {
      actorUserId: gate.numericUserId,
    });

    // Also end any DB-active session for actor even if cookie missing.
    let ended = session;
    if (!ended) {
      ended = await AdminSupportRepo.getActiveForActor(gate.numericUserId);
    }

    if (ended && !ended.endedAt) {
      ended = (await AdminSupportRepo.end(ended.id, 'manual')) || ended;
    }

    const durationSeconds =
      ended?.durationSeconds ??
      (ended
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(ended.startedAt).getTime()) / 1000
            )
          )
        : null);

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'support.stop',
      targetType: 'organization',
      targetId: ended?.targetOrganizationId ?? null,
      metadata: {
        supportSessionId: ended?.id ?? null,
        mode: ended?.mode ?? null,
        durationSeconds,
        organizationName: ended?.targetOrganizationName ?? null,
        endReason: ended?.endReason ?? 'manual',
      },
      ip: clientIp(req),
    });

    const res = NextResponse.json({
      status: true,
      ended: !!ended,
      durationSeconds,
      session: ended
        ? {
            ...publicSupportPayload(ended),
            endedAt: ended.endedAt,
            endReason: ended.endReason,
            durationSeconds,
          }
        : null,
    });
    clearSupportCookie(res);
    return res;
  } catch (error) {
    console.error('[admin/support DELETE]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
