/**
 * Time-limited signed URLs for private media (Zapier/Make fetch).
 * Token proves possession; route streams bytes — never expose storage paths.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_SECONDS = 72 * 60 * 60; // 72h

function signingSecret(): string {
  const resolved =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET_KEY ||
    process.env.SECURE_STORAGE_KEY ||
    '';
  if (resolved) return resolved;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No signing secret for distribution media tokens');
  }
  return 'distribution-media-dev-secret';
}

export type DistributionMediaClaims = {
  /** Logical storage key (userId/folder/file) */
  key: string;
  userId: number;
  organizationId: number;
  exp: number;
};

function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    '';
  return String(raw).replace(/\/+$/, '') || 'http://localhost:3000';
}

export function issueDistributionMediaToken(
  claims: Omit<DistributionMediaClaims, 'exp'> & { ttlSeconds?: number }
): { token: string; expiresAt: string; url: string } {
  const ttl = Math.min(
    DEFAULT_TTL_SECONDS,
    Math.max(60, Number(claims.ttlSeconds) || DEFAULT_TTL_SECONDS)
  );
  const payload: DistributionMediaClaims = {
    key: String(claims.key).replace(/^\/+/, ''),
    userId: Number(claims.userId),
    organizationId: Number(claims.organizationId),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = createHmac('sha256', signingSecret())
    .update(body)
    .digest('base64url');
  const token = `${body}.${sig}`;
  const expiresAt = new Date(payload.exp * 1000).toISOString();
  const url = `${appBaseUrl()}/api/public/distribution-media?token=${encodeURIComponent(token)}`;
  return { token, expiresAt, url };
}

export function verifyDistributionMediaToken(
  token: string | null | undefined
): DistributionMediaClaims | null {
  if (!token) return null;
  const raw = String(token).trim();
  const i = raw.lastIndexOf('.');
  if (i <= 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = createHmac('sha256', signingSecret())
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
    ) as DistributionMediaClaims;
    if (
      !parsed?.key ||
      !Number.isFinite(parsed.userId) ||
      !Number.isFinite(parsed.organizationId) ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Turn an internal /api/media/... path or absolute app media URL into a signed public URL.
 * External https URLs (already fetchable) are returned as-is.
 */
export function resolvePublicMediaUrl(params: {
  mediaUrl: string | null | undefined;
  userId: number;
  organizationId: number;
  ttlSeconds?: number;
}): { mediaUrl: string | null; expiresAt: string | null } {
  const raw = String(params.mediaUrl || '').trim();
  if (!raw) return { mediaUrl: null, expiresAt: null };

  // Already absolute public http(s) that is not our private media proxy
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      if (!u.pathname.startsWith('/api/media/')) {
        return { mediaUrl: raw, expiresAt: null };
      }
      const key = u.pathname.replace(/^\/api\/media\//, '');
      const issued = issueDistributionMediaToken({
        key,
        userId: params.userId,
        organizationId: params.organizationId,
        ttlSeconds: params.ttlSeconds,
      });
      return { mediaUrl: issued.url, expiresAt: issued.expiresAt };
    }
  } catch {
    /* fall through */
  }

  // Relative /api/media/...
  if (raw.startsWith('/api/media/')) {
    const key = raw.replace(/^\/api\/media\//, '').replace(/^\/+/, '');
    const issued = issueDistributionMediaToken({
      key,
      userId: params.userId,
      organizationId: params.organizationId,
      ttlSeconds: params.ttlSeconds,
    });
    return { mediaUrl: issued.url, expiresAt: issued.expiresAt };
  }

  // Bare storage key (userId/folder/file)
  if (/^[a-zA-Z0-9_-]+\//.test(raw) && !raw.includes('://')) {
    const issued = issueDistributionMediaToken({
      key: raw.replace(/^\/+/, ''),
      userId: params.userId,
      organizationId: params.organizationId,
      ttlSeconds: params.ttlSeconds,
    });
    return { mediaUrl: issued.url, expiresAt: issued.expiresAt };
  }

  return { mediaUrl: raw, expiresAt: null };
}
