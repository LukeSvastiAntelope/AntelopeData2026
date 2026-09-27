/**
 * Shared HMAC secret for Live host / participant / OAuth-state tokens.
 * Production fails closed — never fall back to a known string.
 */

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * Resolve signing secret for Live tokens.
 * @throws in production when AUTH_SECRET / NEXTAUTH_SECRET / JWT_SECRET_KEY are all unset
 */
export function liveSigningSecret(): string {
  const resolved =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.JWT_SECRET_KEY?.trim() ||
    '';
  if (resolved) return resolved;
  if (isProductionRuntime()) {
    throw new Error(
      'AUTH_SECRET (or NEXTAUTH_SECRET / JWT_SECRET_KEY) must be set in production for Live tokens'
    );
  }
  return 'live-dev-secret';
}

/** Safe for verify paths — returns null instead of throwing when production secret is missing. */
export function liveSigningSecretOrNull(): string | null {
  try {
    return liveSigningSecret();
  } catch {
    return null;
  }
}
