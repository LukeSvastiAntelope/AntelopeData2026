/**
 * GET /api/python-analysis/analytics-context?surveyId=
 * Returns buildAnalyticsContext bundle for python-analysis planning/prompts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  buildAnalyticsContext,
  formatAnalyticsContextForPrompt,
  isContextInjectionEnabled,
} from '@/app/utils/services/analytics-context-service';

export async function GET(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;

    const surveyId = Number(req.nextUrl.searchParams.get('surveyId'));
    if (!Number.isFinite(surveyId) || surveyId <= 0) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
    }

    const campaignIdRaw = req.nextUrl.searchParams.get('campaignId');
    const campaignId =
      campaignIdRaw != null && campaignIdRaw !== ''
        ? Number(campaignIdRaw)
        : null;

    // Always build for python-analysis parity (flag only gates other surfaces)
    const bundle = await buildAnalyticsContext(
      surveyId,
      Number.isFinite(campaignId as number) ? campaignId : null
    );

    return NextResponse.json({
      status: true,
      context: bundle,
      promptBlock: formatAnalyticsContextForPrompt(bundle),
      injectionFlag: isContextInjectionEnabled(),
    });
  } catch (error) {
    console.error('[python-analysis/analytics-context]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
