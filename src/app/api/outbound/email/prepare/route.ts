import { NextRequest, NextResponse } from 'next/server';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  EMAIL_SEND_MAX_RECIPIENTS,
  prepareRecipientList,
} from '@/app/utils/services/email/recipient-list';

export const runtime = 'nodejs';

/**
 * POST /api/outbound/email/prepare
 * Validate / dedupe / drop suppressed — preview before send.
 * Body: { emails: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));
    const raw = Array.isArray(body?.emails)
      ? body.emails.map((e: unknown) => String(e))
      : [];

    if (raw.length > EMAIL_SEND_MAX_RECIPIENTS) {
      return NextResponse.json(
        {
          status: false,
          message: `Maximum ${EMAIL_SEND_MAX_RECIPIENTS} addresses per send`,
        },
        { status: 400 }
      );
    }

    const prepared = await prepareRecipientList({
      organizationId: orgId,
      raw,
    });

    return NextResponse.json({
      status: true,
      maxRecipients: EMAIL_SEND_MAX_RECIPIENTS,
      ...prepared,
      /** Don't bounce huge lists back — sample only */
      emails: prepared.emails.slice(0, 200),
      emailsTruncated: prepared.emails.length > 200,
      readyCount: prepared.emails.length,
    });
  } catch (error) {
    console.error('[outbound/email/prepare]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
