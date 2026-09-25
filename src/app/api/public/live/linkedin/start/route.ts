import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import {
  buildLinkedInAuthorizeUrl,
  linkedInConfigured,
  mockLinkedInPrefill,
  newOAuthNonce,
  signLiveOAuthState,
  LINKEDIN_PREFILL_COOKIE,
} from '@/app/utils/live/linkedin-oidc';

export const runtime = 'nodejs';

function appOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    request.nextUrl.origin
  ).replace(/\/$/, '');
}

/**
 * GET /api/public/live/linkedin/start?code=JOINCODE
 * Starts LinkedIn OIDC (consented fields only). Mock prefill when unset.
 */
export async function GET(request: NextRequest) {
  try {
    const code = String(request.nextUrl.searchParams.get('code') || '')
      .trim()
      .toUpperCase();
    if (!code) {
      return NextResponse.json(
        { status: false, message: 'code required' },
        { status: 400 }
      );
    }
    const found = await LiveRepo.getLiveSessionByCode(code);
    if (!found) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }

    const returnPath = `/live/${found.session.code}`;
    const origin = appOrigin(request);

    // Local / unset credentials — mock consented prefill (never scrape)
    if (!linkedInConfigured()) {
      const mock = request.nextUrl.searchParams.get('mock') === '1' ||
        process.env.NODE_ENV !== 'production';
      if (!mock) {
        return NextResponse.json(
          {
            status: false,
            message:
              'LinkedIn sign-in is not configured (set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)',
          },
          { status: 503 }
        );
      }
      const prefill = mockLinkedInPrefill();
      const res = NextResponse.redirect(`${origin}${returnPath}?linkedin=1`);
      res.cookies.set(LINKEDIN_PREFILL_COOKIE, JSON.stringify(prefill), {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      });
      return res;
    }

    const redirectUri = `${origin}/api/public/live/linkedin/callback`;
    const state = signLiveOAuthState({
      code: found.session.code,
      nonce: newOAuthNonce(),
      returnPath,
    });
    const url = buildLinkedInAuthorizeUrl({ redirectUri, state });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[live linkedin start]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
