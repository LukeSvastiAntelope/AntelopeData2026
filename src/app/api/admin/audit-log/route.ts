import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import {
  listAdminAuditLog,
  writeAdminAuditLog,
} from '@/app/utils/database/admin-audit-repo';

/**
 * GET /api/admin/audit-log — super-admin audit viewer (paginated).
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const sp = new URL(req.url).searchParams;
    const limit = Number(sp.get('limit') || 50);
    const offset = Number(sp.get('offset') || 0);

    const { entries, total } = await listAdminAuditLog({ limit, offset });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'audit.list',
      targetType: 'audit',
      metadata: { limit, offset, returned: entries.length, total },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      entries,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[admin/audit-log]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
