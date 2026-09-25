/**
 * Live L3 — host capability token for presenter controls on /live/[code]/screen.
 */

import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET_KEY ||
    'live-dev-secret'
  );
}

export type LiveHostClaims = {
  sessionId: number;
  organizationId: number;
  code: string;
  exp: number;
};

export function issueHostToken(claims: {
  sessionId: number;
  organizationId: number;
  code: string;
  ttlSeconds?: number;
}): string {
  const ttl = Math.min(
    60 * 60 * 24 * 14,
    Math.max(3600, Number(claims.ttlSeconds) || 60 * 60 * 12)
  );
  const payload: LiveHostClaims = {
    sessionId: Number(claims.sessionId),
    organizationId: Number(claims.organizationId),
    code: String(claims.code).toUpperCase(),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyHostToken(
  token: string | null | undefined
): LiveHostClaims | null {
  if (!token) return null;
  const raw = String(token).trim();
  const i = raw.lastIndexOf('.');
  if (i <= 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = createHmac('sha256', secret())
    .update(body)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as LiveHostClaims;
    if (
      !Number.isFinite(parsed.sessionId) ||
      !Number.isFinite(parsed.organizationId) ||
      !parsed.code ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sessionId: Number(parsed.sessionId),
      organizationId: Number(parsed.organizationId),
      code: String(parsed.code).toUpperCase(),
      exp: Number(parsed.exp),
    };
  } catch {
    return null;
  }
}
