/**
 * Live L2 — signed participant tokens (no login; phone join).
 * Format: base64url(json).sig
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

export type LiveParticipantClaims = {
  participantId: number;
  sessionId: number;
  organizationId: number;
  exp: number;
};

export function issueParticipantToken(
  claims: Omit<LiveParticipantClaims, 'exp'> & { ttlSeconds?: number }
): string {
  const ttl = Math.min(
    60 * 60 * 24 * 7,
    Math.max(3600, Number(claims.ttlSeconds) || 60 * 60 * 24 * 2)
  );
  const payload: LiveParticipantClaims = {
    participantId: Number(claims.participantId),
    sessionId: Number(claims.sessionId),
    organizationId: Number(claims.organizationId),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyParticipantToken(
  token: string | null | undefined
): LiveParticipantClaims | null {
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
    ) as LiveParticipantClaims;
    if (
      !Number.isFinite(parsed.participantId) ||
      !Number.isFinite(parsed.sessionId) ||
      !Number.isFinite(parsed.organizationId) ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      participantId: Number(parsed.participantId),
      sessionId: Number(parsed.sessionId),
      organizationId: Number(parsed.organizationId),
      exp: Number(parsed.exp),
    };
  } catch {
    return null;
  }
}
