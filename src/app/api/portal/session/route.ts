import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

/** GET /api/portal/session — lightweight portal session probe (public route). */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ status: false, authenticated: false });
  }
  return NextResponse.json({
    status: true,
    authenticated: true,
    user: {
      id: (session.user as any).id,
      email: session.user.email,
      name: session.user.name,
      orgRole: (session.user as any).orgRole ?? null,
      organizationId: (session.user as any).organizationId ?? null,
      personRecordId: (session.user as any).personRecordId ?? null,
    },
  });
}
