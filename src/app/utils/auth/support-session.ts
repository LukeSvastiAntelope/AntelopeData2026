/**
 * Admin A4 — support impersonation helpers (cookie + active session resolution).
 * Server-only. Read-first: write mode is opt-in and always audited.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  AdminSupportRepo,
  SUPPORT_COOKIE,
  SUPPORT_DEFAULT_MINUTES,
  SUPPORT_MAX_MINUTES,
  type SupportMode,
  type SupportSession,
} from '@/app/utils/database/admin-support-repo';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import {
  SUPPORT_CTX_COOKIE,
  signSupportCtx,
} from '@/app/utils/auth/support-ctx-cookie';

export {
  SUPPORT_COOKIE,
  SUPPORT_DEFAULT_MINUTES,
  SUPPORT_MAX_MINUTES,
  type SupportMode,
  type SupportSession,
};
export { SUPPORT_CTX_COOKIE };

export function readSupportCookie(req: NextRequest): string | null {
  const raw = req.cookies.get(SUPPORT_COOKIE)?.value;
  if (!raw) return null;
  const id = String(raw).trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

export function supportCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function clearSupportCookie(res: NextResponse): void {
  const cleared = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
  res.cookies.set(SUPPORT_COOKIE, '', cleared);
  res.cookies.set(SUPPORT_CTX_COOKIE, '', cleared);
}

export async function setSupportCookie(
  res: NextResponse,
  session: SupportSession
): Promise<void> {
  const expires = new Date(session.expiresAt);
  const opts = supportCookieOptions(expires);
  res.cookies.set(SUPPORT_COOKIE, session.id, opts);
  const ctx = await signSupportCtx({
    sid: session.id,
    mode: session.mode,
    orgId: session.targetOrganizationId,
    orgName: session.targetOrganizationName || '',
    exp: expires.getTime(),
  });
  if (ctx) {
    res.cookies.set(SUPPORT_CTX_COOKIE, ctx, opts);
  }
}

/**
 * Resolve the caller's active support session from cookie.
 * Auto-ends expired rows. Optionally require actor match.
 */
export async function resolveSupportSession(
  req: NextRequest,
  opts?: { actorUserId?: number | string | null }
): Promise<SupportSession | null> {
  const sid = readSupportCookie(req);
  if (!sid) return null;

  let session = await AdminSupportRepo.getById(sid);
  if (!session) return null;

  if (opts?.actorUserId != null) {
    if (Number(session.actorUserId) !== Number(opts.actorUserId)) {
      return null;
    }
  }

  if (session.endedAt) return null;

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    session =
      (await AdminSupportRepo.end(session.id, 'expired')) || session;
    return null;
  }

  return session.active ? session : null;
}

/** Org row for support overlay (name + campaign fields). */
export async function loadOrganizationSummary(orgId: number): Promise<{
  id: number;
  name: string;
  officeType: string | null;
  state: string | null;
  districtCode: string | null;
  candidateName: string | null;
  party: string | null;
  electionYear: number | null;
} | null> {
  if (!Number.isFinite(orgId) || orgId <= 0) return null;
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, office_type, state, district_code,
            candidate_name, party, election_year
     FROM organizations WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    officeType: row.office_type != null ? String(row.office_type) : null,
    state: row.state != null ? String(row.state) : null,
    districtCode: row.district_code != null ? String(row.district_code) : null,
    candidateName:
      row.candidate_name != null ? String(row.candidate_name) : null,
    party: row.party != null ? String(row.party) : null,
    electionYear:
      row.election_year != null ? Number(row.election_year) : null,
  };
}

/**
 * Read-first write gate for mutating handlers.
 * Returns null when allowed; otherwise a 403 response.
 * Always audits when write-mode support session performs a mutation.
 */
export async function assertSupportAllowsMutation(
  req: NextRequest,
  actorUserId: number,
  meta?: { path?: string; method?: string }
): Promise<NextResponse | null> {
  const session = await resolveSupportSession(req, { actorUserId });
  if (!session) return null; // no support overlay → normal ACL applies

  if (session.mode === 'read') {
    return NextResponse.json(
      {
        status: false,
        message:
          'Support session is read-only. End the session or start write mode (audited) to make changes.',
        supportSessionId: session.id,
      },
      { status: 403 }
    );
  }

  // Write mode — always log.
  await writeAdminAuditLog({
    actorUserId,
    action: 'support.write',
    targetType: 'organization',
    targetId: session.targetOrganizationId,
    metadata: {
      supportSessionId: session.id,
      path: meta?.path || req.nextUrl.pathname,
      method: meta?.method || req.method,
      mode: session.mode,
    },
    ip:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip'),
  });
  return null;
}

/** Paths that may mutate even during read-only support (session control + auth). */
export function isSupportMutationAllowlisted(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/api/admin/support')) return true;
  if (p === '/api/support/session') return true;
  if (p.startsWith('/api/auth')) return true;
  if (p === '/api/signin' || p === '/api/signout') return true;
  return false;
}

export function publicSupportPayload(session: SupportSession) {
  const expiresMs = new Date(session.expiresAt).getTime();
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresMs - Date.now()) / 1000)
  );
  return {
    id: session.id,
    mode: session.mode,
    targetOrganizationId: session.targetOrganizationId,
    targetOrganizationName: session.targetOrganizationName,
    actorEmail: session.actorEmail,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    remainingSeconds,
  };
}
