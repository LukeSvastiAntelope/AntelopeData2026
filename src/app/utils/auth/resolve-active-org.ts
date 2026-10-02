/**
 * Server-side org resolution for API routes that accept body/query organizationId.
 * Never trust a client-supplied org id without membership (or an active
 * super-admin support session for that org).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { resolveSupportSession } from '@/app/utils/auth/support-session';
import { userBelongsToOrganization } from '@/app/utils/services/site-access';

function parseOrgId(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function canAccessOrg(
  req: NextRequest,
  userId: number,
  organizationId: number
): Promise<boolean> {
  if (await userBelongsToOrganization(userId, organizationId)) {
    return true;
  }
  const support = await resolveSupportSession(req, { actorUserId: userId });
  return Boolean(
    support && Number(support.targetOrganizationId) === organizationId
  );
}

function forbidden(message = 'Forbidden: not a member of that organization') {
  return NextResponse.json({ error: message, status: false }, { status: 403 });
}

/**
 * Resolve the active organization for an authenticated user.
 *
 * - If `requestedOrgId` is given: require an active `organization_members` row
 *   or a valid super-admin support session for that org; otherwise 403.
 * - If absent: fall back to `x-organization-id` (session/support header),
 *   verifying access the same way; then `ensurePrimaryOrgId`.
 *
 * Returns the organization id, or a NextResponse error (401/403).
 */
export async function resolveActiveOrgForUser(
  req: NextRequest,
  userId: number | string,
  requestedOrgId?: number | string | null
): Promise<number | NextResponse> {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requested = parseOrgId(requestedOrgId);
  if (requested != null) {
    if (!(await canAccessOrg(req, uid, requested))) {
      return forbidden();
    }
    return requested;
  }

  const headerOrg = parseOrgId(req.headers.get('x-organization-id'));
  if (headerOrg != null) {
    if (!(await canAccessOrg(req, uid, headerOrg))) {
      return forbidden();
    }
    return headerOrg;
  }

  return ensurePrimaryOrgId(uid);
}
