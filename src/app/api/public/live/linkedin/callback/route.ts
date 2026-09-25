import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeLinkedInCode,
  LINKEDIN_PREFILL_COOKIE,
  verifyLiveOAuthState,
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
 * GET /api/public/live/linkedin/callback
 * LinkedIn OIDC callback — stores consented profile in a short-lived cookie.
 */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  try {
    const err = request.nextUrl.searchParams.get('error');
    if (err) {
      return NextResponse.redirect(
        `${origin}/live?linkedin_error=${encodeURIComponent(err)}`
      );
    }

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const verified = state ? verifyLiveOAuthState(state) : null;
    if (!code || !verified) {
      return NextResponse.redirect(`${origin}/live?linkedin_error=invalid_state`);
    }

    const redirectUri = `${origin}/api/public/live/linkedin/callback`;
    const prefill = await exchangeLinkedInCode({
      code,
      redirectUri,
    });

    const res = NextResponse.redirect(
      `${origin}${verified.returnPath}?linkedin=1`
    );
    res.cookies.set(LINKEDIN_PREFILL_COOKIE, JSON.stringify(prefill), {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (error) {
    console.error('[live linkedin callback]', error);
    return NextResponse.redirect(
      `${origin}/live?linkedin_error=${encodeURIComponent(
        error instanceof Error ? error.message : 'oauth_failed'
      )}`
    );
  }
}
