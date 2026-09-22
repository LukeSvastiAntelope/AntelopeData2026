import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  OUTBOUND_FORMATS,
  type OutboundDraft,
  type OutboundFormat,
  type SegmentTailoringContext,
} from '@/app/utils/services/outbound-draft-service';
import { stageOutboundDraftSend } from '@/app/utils/services/outbound-send-governance';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/outbound/stage
 * Stage a tailored draft through the same approval gate as every other send.
 * Body: { draft, context, segmentId?, fullAutoSend?, dryRun?, recipientOverride? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await ensurePrimaryOrgId(String(userId));
    const body = await request.json().catch(() => ({}));

    const draftRaw = body?.draft;
    if (!draftRaw || typeof draftRaw !== 'object') {
      return NextResponse.json(
        { status: false, message: 'draft is required' },
        { status: 400 }
      );
    }
    const format = String(draftRaw.format || '')
      .toLowerCase()
      .replace(/-/g, '_') as OutboundFormat;
    if (!OUTBOUND_FORMATS.includes(format)) {
      return NextResponse.json(
        { status: false, message: 'draft.format must be letter|email|sms|ad_copy' },
        { status: 400 }
      );
    }

    const draft: OutboundDraft = {
      format,
      title: String(draftRaw.title || `${format} draft`),
      body: String(draftRaw.body || '').trim(),
      groundedIn: Array.isArray(draftRaw.groundedIn)
        ? draftRaw.groundedIn.map((g: { label?: string; value?: string }) => ({
            label: String(g.label || ''),
            value: String(g.value || ''),
          }))
        : [],
      honest: draftRaw.honest !== false,
      smallSampleDisclaimerApplied: Boolean(draftRaw.smallSampleDisclaimerApplied),
    };
    if (!draft.body) {
      return NextResponse.json(
        { status: false, message: 'draft.body is required' },
        { status: 400 }
      );
    }

    const ctxRaw = body?.context || {};
    const context: SegmentTailoringContext = {
      segmentId: String(ctxRaw.segmentId || body?.segmentId || 'unknown'),
      segmentName: String(ctxRaw.segmentName || 'Segment'),
      segmentSource: ctxRaw.segmentSource === 'saved' ? 'saved' : 'preset',
      voterCount: Number(ctxRaw.voterCount || 0),
      thinSegment: Boolean(ctxRaw.thinSegment),
      observedAttributes: Array.isArray(ctxRaw.observedAttributes)
        ? ctxRaw.observedAttributes.map(String)
        : [],
      statedPositions: Array.isArray(ctxRaw.statedPositions)
        ? ctxRaw.statedPositions.map(
            (p: { label?: string; key?: string; value?: string; count?: number }) => ({
              label: String(p.label || ''),
              key: String(p.key || ''),
              value: String(p.value || ''),
              count: Number(p.count || 0),
            })
          )
        : [],
      definition: ctxRaw.definition || {},
      disclaimer: String(ctxRaw.disclaimer || ''),
    };

    const result = await stageOutboundDraftSend({
      userId,
      organizationId: orgId,
      draft,
      context,
      segmentId: body?.segmentId ? String(body.segmentId) : context.segmentId,
      fullAutoSend: body?.fullAutoSend === true,
      dryRun: body?.dryRun === true,
      recipientOverride: body?.recipientOverride || undefined,
      recipientLimit:
        body?.recipientLimit != null ? Number(body.recipientLimit) : undefined,
    });

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      ...result,
      gate:
        'Public send is approval-gated (Auto-Post cards). Auto only when fullAutoSend is opted in under loop autonomy auto_within_limits. Who/when = propensity quarantine; what = tailored draft.',
    });
  } catch (error) {
    console.error('[outbound/stage POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
