/**
 * Shared API auth helpers — server-only.
 * Middleware injects `x-user-id`; routes must not re-parse the session token.
 */

import { NextRequest, NextResponse } from 'next/server';

export type AuthContext = { userId: string };

/** Normalize middleware user id (same charset as storage tenant keys). */
export function normalizeUserId(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Returns the caller userId, or a 401 NextResponse to return directly.
 * Blank / missing / empty-after-sanitize → 401.
 */
export function requireUserId(req: NextRequest): string | NextResponse {
  const header = req.headers.get('x-user-id');
  if (header == null || !String(header).trim()) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = normalizeUserId(header);
  if (!userId) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }
  return userId;
}

/**
 * Assert the caller owns a resource (first path segment / owner id == userId).
 * Returns a 403 NextResponse on mismatch; null when ownership holds.
 * Org-shared ACL can wrap this later without changing the 403 shape.
 */
export function assertOwnership(
  userId: string,
  ownerId: string
): NextResponse | null {
  const caller = normalizeUserId(userId);
  const owner = normalizeUserId(ownerId);
  if (!caller || !owner || caller !== owner) {
    return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
  }
  return null;
}
