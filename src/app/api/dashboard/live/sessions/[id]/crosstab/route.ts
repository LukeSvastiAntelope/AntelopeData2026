import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { crossTabQuestion } from '@/app/utils/live/audience-intelligence';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/live/sessions/[id]/crosstab
 * ?questionId=&segmentField=&segmentValue=
 * Numbers + significance gate from postable-insight-service.
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
    const segmentField = String(
      request.nextUrl.searchParams.get('segmentField') || ''
    ).trim();
    const segmentValue = request.nextUrl.searchParams.get('segmentValue');
    if (!Number.isFinite(questionId) || !segmentField) {
      return NextResponse.json(
        { status: false, message: 'questionId and segmentField required' },
        { status: 400 }
      );
    }

    const crosstab = await crossTabQuestion({
      sessionId: Number(id),
      organizationId: orgId,
      questionId,
      segmentField,
      segmentValue,
    });
    return NextResponse.json({ status: true, crosstab });
  } catch (error) {
    console.error('[dashboard live crosstab]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
