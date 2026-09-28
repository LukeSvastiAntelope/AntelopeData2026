import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { getAccountDetail } from '@/app/utils/services/admin-accounts-service';

/**
 * GET /api/admin/accounts/[id]
 * Per-account drill-down (read-only). Super-admin only; audited.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const id = Number((await params).id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { status: false, message: 'Invalid organization id' },
        { status: 400 }
      );
    }

    const account = await getAccountDetail(id);
    if (!account) {
      return NextResponse.json(
        { status: false, message: 'Organization not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'accounts.view',
      targetType: 'org',
      targetId: id,
      metadata: {
        name: account.name,
        surveyCount: account.surveyCount,
        contactCount: account.contactCount,
        sendCount: account.sendCount,
      },
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, account });
  } catch (error) {
    console.error('[admin/accounts/:id]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
