import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { listAccountOverviews } from '@/app/utils/services/admin-accounts-service';

/**
 * GET /api/admin/accounts
 * Cross-org accounts overview (read-only). Super-admin only; audited.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const accounts = await listAccountOverviews();

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'accounts.list',
      targetType: 'org',
      metadata: { count: accounts.length },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      accounts,
      total: accounts.length,
    });
  } catch (error) {
    console.error('[admin/accounts]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
