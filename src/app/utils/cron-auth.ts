/**
 * Cron route auth — require CRON_SECRET in production (fail closed).
 * Dev/test may omit the secret for local convenience; if set, it is always enforced.
 */

import { NextRequest, NextResponse } from 'next/server';

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

export function assertCronAuthorized(
  req: NextRequest
): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim() || '';
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';

  if (isProductionRuntime()) {
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET not configured' },
        { status: 503 }
      );
    }
    if (provided !== secret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return null;
  }

  // Non-production: enforce only when configured
  if (secret && provided !== secret) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  return null;
}
