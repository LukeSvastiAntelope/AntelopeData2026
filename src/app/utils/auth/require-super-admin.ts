/**
 * Server-only: requireSuperAdmin for /api/admin/* routes.
 * Email allowlist is the gate (DB role alone never grants access).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { isSuperAdminEmail } from '@/app/utils/auth/super-admin';
import { UserRepo } from '@/app/utils/database/user-repo';

export type SuperAdminContext = {
  userId: string;
  numericUserId: number;
  email: string;
};

/**
 * Returns super-admin context, or a 401/403 NextResponse to return directly.
 * Loads the user from DB so header spoofing / unverified accounts cannot pass.
 */
export async function requireSuperAdmin(
  req: NextRequest
): Promise<SuperAdminContext | NextResponse> {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;

  let user: Awaited<ReturnType<typeof UserRepo.getUserById>>;
  try {
    user = await UserRepo.getUserById(auth);
  } catch (err) {
    console.error('[requireSuperAdmin] user lookup failed', err);
    return NextResponse.json(
      { status: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { status: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Login already blocks is_verified === 0; belt-and-suspenders here.
  if (user.is_verified === 0) {
    return NextResponse.json(
      { status: false, message: 'Forbidden' },
      { status: 403 }
    );
  }

  const email = String(user.email || '')
    .trim()
    .toLowerCase();
  // Email is the gate — users.role === 'admin' alone never grants access.
  if (!isSuperAdminEmail(email)) {
    return NextResponse.json(
      { status: false, message: 'Forbidden' },
      { status: 403 }
    );
  }

  return {
    userId: auth,
    numericUserId: Number(user.id),
    email,
  };
}

export function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip');
}
