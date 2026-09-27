/**
 * Shared volunteer-portal session identity (V3+).
 * Staff JWT never qualifies — portal roles only.
 */

import { auth } from '@/auth';
import { isPortalRole } from '@/app/utils/database/volunteer-repo';

export type PortalIdentity = {
  userId: number;
  organizationId: number;
  personRecordId: number | null;
  orgRole: string;
};

export function portalIdentityFromSession(session: unknown): PortalIdentity | null {
  const user = (session as { user?: Record<string, unknown> } | null)?.user;
  if (!user) return null;
  const userId = Number(user.id);
  const organizationId = Number(user.organizationId);
  const personRecordId =
    user.personRecordId != null ? Number(user.personRecordId) : null;
  const orgRole = (user.orgRole as string | null) ?? null;
  if (!isPortalRole(orgRole) || !organizationId || !userId) return null;
  return {
    userId,
    organizationId,
    personRecordId: Number.isFinite(personRecordId) ? personRecordId : null,
    orgRole: String(orgRole),
  };
}

export async function requirePortalIdentity(): Promise<
  PortalIdentity | Response
> {
  const session = await auth();
  const id = portalIdentityFromSession(session);
  if (!id) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json(
      { status: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }
  return id;
}
