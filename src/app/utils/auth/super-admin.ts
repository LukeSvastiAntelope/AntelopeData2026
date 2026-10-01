/**
 * Platform super-admin identity — email-pinned allowlist.
 *
 * Super-admin is NOT users.role / org admin. It is exactly one verified
 * email: lukesvasti@antelope.org. SUPERADMIN_EMAILS is ignored and cannot
 * widen (or shrink) this set — Vercel env access must not grant super-admin.
 * Edge-safe — no DB.
 */

export const DEFAULT_SUPERADMIN_EMAIL = 'lukesvasti@antelope.org';

/** Canonical allowlist: always exactly the locked super-admin email. */
export function getSuperAdminEmails(): string[] {
  return [DEFAULT_SUPERADMIN_EMAIL.toLowerCase()];
}

export function isSuperAdminEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return false;
  return getSuperAdminEmails().includes(normalized);
}
