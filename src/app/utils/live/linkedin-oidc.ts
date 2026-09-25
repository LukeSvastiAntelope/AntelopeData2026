/**
 * LinkedIn OIDC helpers for Live join prefill.
 * Consented profile fields only (openid profile email) — never scraping.
 * When LINKEDIN_CLIENT_ID/SECRET are unset, callers use the mock prefill path.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export type LinkedInPrefill = {
  name: string | null;
  email: string | null;
  headline: string | null;
  picture: string | null;
  linkedinUrl: string | null;
  sub: string | null;
};

function secret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET_KEY ||
    'live-dev-secret'
  );
}

export function linkedInConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID?.trim() &&
      process.env.LINKEDIN_CLIENT_SECRET?.trim()
  );
}

export function signLiveOAuthState(payload: {
  code: string;
  nonce: string;
  returnPath: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp }),
    'utf8'
  ).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyLiveOAuthState(state: string): {
  code: string;
  nonce: string;
  returnPath: string;
} | null {
  const raw = String(state || '');
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
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed?.code || !parsed?.nonce || Number(parsed.exp) < Date.now() / 1000) {
      return null;
    }
    return {
      code: String(parsed.code),
      nonce: String(parsed.nonce),
      returnPath: String(parsed.returnPath || `/live/${parsed.code}`),
    };
  } catch {
    return null;
  }
}

export function newOAuthNonce(): string {
  return randomBytes(16).toString('base64url');
}

export function buildLinkedInAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID!.trim();
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('state', params.state);
  u.searchParams.set('scope', 'openid profile email');
  return u.toString();
}

export async function exchangeLinkedInCode(params: {
  code: string;
  redirectUri: string;
}): Promise<LinkedInPrefill> {
  const clientId = process.env.LINKEDIN_CLIENT_ID!.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!.trim();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`LinkedIn token exchange failed: ${t.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error('LinkedIn token missing');

  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    const t = await profileRes.text();
    throw new Error(`LinkedIn userinfo failed: ${t.slice(0, 200)}`);
  }
  const p = (await profileRes.json()) as Record<string, unknown>;
  const name =
    (typeof p.name === 'string' && p.name) ||
    [p.given_name, p.family_name].filter(Boolean).join(' ') ||
    null;
  const email = typeof p.email === 'string' ? p.email : null;
  const picture = typeof p.picture === 'string' ? p.picture : null;
  const sub = typeof p.sub === 'string' ? p.sub : null;
  // LinkedIn OIDC does not always return vanity URL; store profile when present
  const linkedinUrl =
    typeof p.profile === 'string'
      ? p.profile
      : sub
        ? `https://www.linkedin.com/in/${sub}`
        : null;

  return {
    name: name ? String(name).slice(0, 255) : null,
    email: email ? String(email).slice(0, 255) : null,
    headline: typeof p.headline === 'string' ? p.headline.slice(0, 255) : null,
    picture,
    linkedinUrl,
    sub,
  };
}

export function mockLinkedInPrefill(): LinkedInPrefill {
  return {
    name: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    headline: 'Founder · Demo Co',
    picture: null,
    linkedinUrl: 'https://www.linkedin.com/in/alex-rivera-demo',
    sub: 'mock-linkedin-sub',
  };
}

export const LINKEDIN_PREFILL_COOKIE = 'live_linkedin_prefill';
