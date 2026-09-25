import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  attributePollOption,
  questionResultsForHost,
} from '@/app/utils/live/audience-intelligence';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/live/sessions/[id]/attribution
 * ?questionId=&value=  — named respondents for a poll option (query-layer anonymity).
 * Without value: returns question results + attributed flag.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const questionId = Number(request.nextUrl.searchParams.get('questionId'));
    const value = request.nextUrl.searchParams.get('value');
    if (!Number.isFinite(questionId)) {
      return NextResponse.json(
        { status: false, message: 'questionId required' },
        { status: 400 }
      );
    }

    if (value == null || value === '') {
      const results = await questionResultsForHost({
        sessionId: Number(id),
        organizationId: orgId,
        questionId,
      });
      return NextResponse.json({ status: true, ...results });
    }

    const attribution = await attributePollOption({
      sessionId: Number(id),
      organizationId: orgId,
      questionId,
      value,
    });
    return NextResponse.json({ status: true, attribution });
  } catch (error) {
    console.error('[dashboard live attribution]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
