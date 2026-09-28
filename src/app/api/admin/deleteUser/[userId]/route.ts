import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const userIdString = (await params).userId;
    if (!userIdString) {
      return NextResponse.json(
        { status: false, message: 'User ID is required.' },
        { status: 400 }
      );
    }

    const userId = parseInt(userIdString, 10);
    if (isNaN(userId)) {
      return NextResponse.json(
        { status: false, message: 'Invalid User ID format.' },
        { status: 400 }
      );
    }

    // Never allow deleting the acting super-admin via this endpoint
    if (userId === gate.numericUserId) {
      return NextResponse.json(
        { status: false, message: 'Cannot delete your own super-admin account.' },
        { status: 400 }
      );
    }

    const deleteResult = await UserRepo.deleteUserById(userId);

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'user.delete',
      targetType: 'user',
      targetId: userId,
      metadata: { success: deleteResult.success, message: deleteResult.message },
      ip: clientIp(req),
    });

    if (deleteResult.success) {
      return NextResponse.json({
        status: true,
        message: 'User deleted successfully.',
      });
    }
    return NextResponse.json(
      {
        status: false,
        message: deleteResult.message || 'Failed to delete user.',
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Error in deleteUser API:', error);
    if (
      error.message &&
      (error.message.includes('foreign key constraint fails') ||
        error.message.includes('FOREIGN KEY constraint failed'))
    ) {
      return NextResponse.json(
        {
          status: false,
          message:
            'Cannot delete user: This user has associated records that must be handled or removed first.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        status: false,
        message: error.message || 'An unexpected error occurred.',
      },
      { status: 500 }
    );
  }
}
