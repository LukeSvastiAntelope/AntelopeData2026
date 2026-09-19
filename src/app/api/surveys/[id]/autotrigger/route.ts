import { NextRequest, NextResponse } from 'next/server';
import {
  SurveyAutotriggerRepo,
  type AutotriggerAction,
  type AutotriggerAutonomy,
} from '@/app/utils/database/survey-autotrigger-repo';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { maybeFireSurveyAutotrigger } from '@/app/utils/services/autotrigger-service';

export const runtime = 'nodejs';

async function requireSurveyAccess(surveyId: number, userId: string | null) {
  if (!userId) return { error: NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 }) };
  const survey = await SurveyRepo.getSurveyById(surveyId, Number(userId));
  if (!survey) {
    return { error: NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 }) };
  }
  return { survey, userId: Number(userId) };
}

/** GET /api/surveys/[id]/autotrigger — AT1 config + recent events */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = Number(id);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }
    const access = await requireSurveyAccess(surveyId, request.headers.get('x-user-id'));
    if ('error' in access && access.error) return access.error;

    const config = await SurveyAutotriggerRepo.ensure(surveyId);
    const responseCount = await SurveyAutotriggerRepo.countResponses(surveyId);
    const events = await SurveyAutotriggerRepo.listEvents(surveyId, 10);
    return NextResponse.json({
      status: true,
      config,
      responseCount,
      events,
    });
  } catch (error) {
    console.error('[autotrigger GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/surveys/[id]/autotrigger
 * Body: { enabled?, threshold?, actions?, autonomy? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = Number(id);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }
    const access = await requireSurveyAccess(surveyId, request.headers.get('x-user-id'));
    if ('error' in access && access.error) return access.error;

    const body = await request.json().catch(() => ({}));
    const patch: {
      enabled?: boolean;
      threshold?: number;
      actions?: AutotriggerAction[];
      autonomy?: AutotriggerAutonomy;
    } = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.threshold != null) patch.threshold = Number(body.threshold);
    if (Array.isArray(body.actions)) {
      patch.actions = body.actions
        .map((a: unknown) => String(a))
        .filter((a: string): a is AutotriggerAction =>
          a === 'analytics' || a === 'newsletter' || a === 'video'
        );
    }
    if (body.autonomy === 'propose' || body.autonomy === 'auto') {
      patch.autonomy = body.autonomy;
    }

    const config = await SurveyAutotriggerRepo.upsert(surveyId, patch);
    const responseCount = await SurveyAutotriggerRepo.countResponses(surveyId);

    // If just enabled and already above threshold, fire once (idempotent claim)
    let fire: Awaited<ReturnType<typeof maybeFireSurveyAutotrigger>> | null = null;
    if (config.enabled && responseCount >= config.threshold) {
      fire = await maybeFireSurveyAutotrigger(surveyId, { source: 'manual' });
    }

    return NextResponse.json({ status: true, config, responseCount, fire });
  } catch (error) {
    console.error('[autotrigger PUT]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
