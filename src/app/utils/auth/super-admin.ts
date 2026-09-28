/**
 * Platform super-admin identity — email-pinned allowlist.
 *
 * Super-admin is NOT users.role / org admin. It is the verified email
 * lukesvasti@antelope.org (configurable via SUPERADMIN_EMAILS, with that
 * address always present as the built-in default). Edge-safe — no DB.
 */

export const DEFAULT_SUPERADMIN_EMAIL = 'lukesvasti@antelope.org';

/** Canonical allowlist: env SUPERADMIN_EMAILS (comma-separated) + built-in default. */
export function getSuperAdminEmails(): string[] {
  const fromEnv = String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set<string>(fromEnv);
  set.add(DEFAULT_SUPERADMIN_EMAIL.toLowerCase());
  return [...set];
}

export function isSuperAdminEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return false;
  return getSuperAdminEmails().includes(normalized);
}
