import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  buildLiveLeadList,
  leadsToCsv,
  syncLeadsToOptinRails,
  stageLiveFollowUp,
  generateLivePostEventReport,
} from '@/app/utils/live/live-funnel-service';
import { notifyLiveSession } from '@/app/utils/live/notify';
import { LiveRepo } from '@/app/utils/database/live-repo';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/live/sessions/[id]/funnel
 * Funnel metrics + lead list (suppression-aware).
 * ?format=csv → downloadable lead export.
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
    const data = await buildLiveLeadList({
      sessionId: Number(id),
      organizationId: orgId,
    });

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      const csv = leadsToCsv(data.leads);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="live-${data.session.code}-leads.csv"`,
        },
      });
    }

    return NextResponse.json({
      status: true,
      session: {
        id: data.session.id,
        code: data.session.code,
        title: data.session.title,
        eventType: data.session.eventType,
        status: data.session.status,
      },
      metrics: data.metrics,
      leads: data.leads,
    });
  } catch (error) {
    console.error('[live funnel GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/live/sessions/[id]/funnel
 * action: sync_optin | stage_followup | generate_report | end
 * Nothing auto-sends — follow-up is approval-gated.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(auth);
    const { id } = await context.params;
    const sessionId = Number(id);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    const session = await LiveRepo.getSessionById(sessionId, orgId);
    if (!session) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }

    if (action === 'sync_optin') {
      const result = await syncLeadsToOptinRails({
        sessionId,
        organizationId: orgId,
      });
      return NextResponse.json({ status: true, ...result });
    }

    if (action === 'stage_followup') {
      const result = await stageLiveFollowUp({
        userId,
        sessionId,
        organizationId: orgId,
        format: body.format === 'sms' ? 'sms' : 'email',
        subject: body.subject,
        body: body.body,
      });
      return NextResponse.json({
        status: true,
        metrics: result.metrics,
        stagedActionId: result.stage.stagedActionId,
        heldAtGate: result.stage.heldAtGate,
        stageStatus: result.stage.status,
        recipients: result.stage.recipients,
        outboundPath: '/outbound',
        note: 'Follow-up staged for approval — nothing was sent.',
      });
    }

    if (action === 'generate_report') {
      const result = await generateLivePostEventReport({
        userId: auth,
        sessionId,
        organizationId: orgId,
        endSession: body.endSession !== false,
      });
      await notifyLiveSession(session.code);
      return NextResponse.json({ status: true, ...result });
    }

    if (action === 'end') {
      const updated = await LiveRepo.updateSession(sessionId, orgId, {
        status: 'ended',
      });
      await notifyLiveSession(session.code);
      return NextResponse.json({ status: true, session: updated });
    }

    return NextResponse.json(
      { status: false, message: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[live funnel POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
