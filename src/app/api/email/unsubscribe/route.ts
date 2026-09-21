/**
 * Public one-click unsubscribe (CAN-SPAM / RFC 8058).
 * GET  — browser / mailto-free link from footer
 * POST — List-Unsubscribe=One-Click from mail clients
 *
 * Suppresses only the candidate (user_id) encoded in the HMAC token.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  EmailEventRepo,
  EmailSuppressionRepo,
  verifyUnsubscribeToken,
} from '@/app/utils/database/email-send-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

async function applyUnsubscribe(token: string | null): Promise<{
  ok: boolean;
  message: string;
  email?: string;
}> {
  if (!token) return { ok: false, message: 'Missing unsubscribe token' };
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return { ok: false, message: 'Invalid or expired unsubscribe link' };

  let organizationId = 0;
  try {
    organizationId = await ensurePrimaryOrgId(String(parsed.userId));
  } catch {
    organizationId = 0;
  }

  await EmailSuppressionRepo.add({
    userId: parsed.userId,
    organizationId,
    email: parsed.email,
    reason: 'unsubscribe',
    source: 'one_click',
    notes: parsed.sendId ? `send_id=${parsed.sendId}` : null,
  });

  await EmailEventRepo.record({
    userId: parsed.userId,
    organizationId,
    sendId: parsed.sendId || null,
    email: parsed.email,
    eventType: 'email.unsubscribed',
    payload: { source: 'one_click' },
  });

  return {
    ok: true,
    message: 'You have been unsubscribed from this campaign.',
    email: parsed.email,
  };
}

function extractToken(request: NextRequest, body?: Record<string, unknown>): string | null {
  const fromQuery = request.nextUrl.searchParams.get('token');
  if (fromQuery) return fromQuery;
  if (body?.token != null) return String(body.token);
  // Some MUAs POST List-Unsubscribe=One-Click with token still in query
  return null;
}

export async function GET(request: NextRequest) {
  const result = await applyUnsubscribe(extractToken(request));
  if (!result.ok) {
    return NextResponse.json({ status: false, message: result.message }, { status: 400 });
  }
  // Redirect to friendly page when opened in a browser
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    const url = new URL('/unsubscribe', request.url);
    url.searchParams.set('token', extractToken(request) || '');
    url.searchParams.set('done', '1');
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ status: true, message: result.message, email: result.email });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  let body: Record<string, unknown> = {};
  try {
    if (contentType.includes('application/json')) {
      body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData();
      body = Object.fromEntries(form.entries()) as Record<string, unknown>;
    } else {
      // RFC 8058 one-click may POST with empty/List-Unsubscribe body; token in query
      body = {};
    }
  } catch {
    body = {};
  }

  const result = await applyUnsubscribe(extractToken(request, body));
  if (!result.ok) {
    return NextResponse.json({ status: false, message: result.message }, { status: 400 });
  }
  return NextResponse.json({ status: true, message: result.message });
}
