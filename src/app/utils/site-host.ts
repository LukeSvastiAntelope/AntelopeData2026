/**
 * Edge-safe host helpers for Sites S6 (middleware + UI).
 * No Node/DB imports — safe for Edge middleware.
 */

/** Reserved labels under the platform site root (never tenant slugs). */
export const RESERVED_SITE_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'send',
  'smtp',
  'ftp',
  'cdn',
  'static',
  'assets',
  'status',
  'docs',
  'blog',
  'help',
  'support',
  'dev',
  'staging',
  'preview',
  'vercel',
]);

function parseHostFromUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const withProto = raw.includes('://') ? raw : `https://${raw}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Platform apex / dashboard hosts — tenant routing must never apply here. */
export function getAppHosts(): Set<string> {
  const hosts = new Set<string>();

  const fromList = (process.env.APP_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const h of fromList) hosts.add(h.replace(/:\d+$/, ''));

  for (const key of [
    'NEXT_PUBLIC_APP_URL',
    'AUTH_URL',
    'NEXTAUTH_URL',
    'PUBLIC_BASE_URL',
  ] as const) {
    const parsed = parseHostFromUrl(process.env[key]);
    if (parsed) hosts.add(parsed);
  }

  // Sensible defaults so local + prod apex never collide with tenants
  for (const h of [
    'localhost',
    '127.0.0.1',
    'antelopedata.org',
    'www.antelopedata.org',
    'getantelope.com',
    'www.getantelope.com',
  ]) {
    hosts.add(h);
  }

  return hosts;
}

/** Root domain for platform subdomains: {slug}.antelopedata.org */
export function getSiteRootDomain(): string {
  const explicit = (process.env.SITE_ROOT_DOMAIN || '').trim().toLowerCase();
  if (explicit) return explicit.replace(/^\./, '');
  return 'antelopedata.org';
}

export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).split(':')[0].trim().toLowerCase();
}

export function isAppHost(host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  const apps = getAppHosts();
  if (apps.has(h)) return true;
  // Vercel preview / deployment hosts stay on the dashboard app
  if (h.endsWith('.vercel.app')) return true;
  return false;
}

/**
 * If host is {slug}.{SITE_ROOT_DOMAIN}, return slug; else null.
 * Does not apply on apex www / reserved labels.
 */
export function slugFromPlatformSubdomain(host: string): string | null {
  const h = normalizeHost(host);
  if (!h || isAppHost(h)) return null;

  const root = getSiteRootDomain();
  const suffix = `.${root}`;
  if (!h.endsWith(suffix)) return null;
  if (h === root) return null;

  const sub = h.slice(0, -suffix.length);
  if (!sub || sub.includes('.')) return null; // only one label
  if (RESERVED_SITE_SUBDOMAINS.has(sub)) return null;
  // Site slugs are kebab-case with optional uuid suffix
  if (!/^[a-z0-9]([a-z0-9-]{0,94}[a-z0-9])?$/.test(sub)) return null;
  return sub;
}

/** Public URL helpers for the builder UI. */
export function platformSubdomainUrl(slug: string, path = '/'): string {
  const root = getSiteRootDomain();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `https://${slug}.${root}${p === '/' ? '' : p}`;
}

export function isValidCustomHost(host: string): boolean {
  const h = normalizeHost(host);
  if (!h || h.length > 253) return false;
  if (isAppHost(h)) return false;
  if (h.endsWith(`.${getSiteRootDomain()}`)) return false; // use platform subdomain, not "custom"
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)) return false;
  if (h.includes('..')) return false;
  return true;
}
