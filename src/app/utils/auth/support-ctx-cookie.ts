/**
 * Edge-safe signed support-session context (middleware + Node setters).
 * DB session remains source of truth; this cookie only carries mode/org/expiry
 * for edge write-blocking and header injection.
 */

export const SUPPORT_COOKIE = 'antelope_support_sid';
export const SUPPORT_CTX_COOKIE = 'antelope_support_ctx';

export type SupportCtxPayload = {
  sid: string;
  mode: 'read' | 'write';
  orgId: number;
  orgName: string;
  exp: number; // unix ms
};

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa !== 'undefined'
      ? btoa(bin)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof atob !== 'undefined') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function supportSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET_KEY ||
    ''
  );
}

export async function signSupportCtx(
  payload: SupportCtxPayload
): Promise<string | null> {
  const secret = supportSecret();
  if (!secret) return null;
  const body = b64url(
    JSON.stringify({
      sid: payload.sid,
      mode: payload.mode,
      orgId: payload.orgId,
      orgName: String(payload.orgName || '').slice(0, 120),
      exp: payload.exp,
    })
  );
  const key = await hmacKey(secret);
  const sig = b64url(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  );
  return `${body}.${sig}`;
}

export async function verifySupportCtx(
  token: string | null | undefined
): Promise<SupportCtxPayload | null> {
  if (!token) return null;
  const secret = supportSecret();
  if (!secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const json = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(body))
    ) as SupportCtxPayload;
    if (!json?.sid || !json.orgId || !json.exp) return null;
    if (Number(json.exp) <= Date.now()) return null;
    return {
      sid: String(json.sid),
      mode: json.mode === 'write' ? 'write' : 'read',
      orgId: Number(json.orgId),
      orgName: String(json.orgName || ''),
      exp: Number(json.exp),
    };
  } catch {
    return null;
  }
}
