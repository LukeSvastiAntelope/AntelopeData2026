import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const users = await UserRepo.getAllUsersBasic();
    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'users.list',
      targetType: 'user',
      metadata: { count: users.length },
      ip: clientIp(req),
    });
    return NextResponse.json({ status: true, users });
  } catch (error) {
    console.error('Error fetching users for admin:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { status: false, message: 'Failed to fetch users', error: errorMessage },
      { status: 500 }
    );
  }
}
