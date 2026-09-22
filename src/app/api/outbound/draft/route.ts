import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  draftOutboundForSegment,
  OUTBOUND_FORMATS,
  type OutboundFormat,
} from '@/app/utils/services/outbound-draft-service';
import type { VoterSegmentDefinition } from '@/app/utils/services/voter-segments';
import { listSegmentCatalog } from '@/app/utils/services/voter-segments';
import { resolveSegmentHint } from '@/app/utils/voter-segment-presets';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** GET /api/outbound/draft — list formats + segment catalog for the UI. */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const catalog = await listSegmentCatalog(orgId);
    return NextResponse.json({
      status: true,
      formats: OUTBOUND_FORMATS,
      catalog,
      disclaimer:
        'Drafts use survey-stated positions only — never invented concerns. Send goes through the approval gate on /outbound or stage_outbound_send.',
    });
  } catch (error) {
    console.error('[outbound/draft GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/outbound/draft
 * Body: { segmentId?, audience?, definition?, formats?, goal?, mock? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));
    const fromAudience = body?.audience ? resolveSegmentHint(String(body.audience)) : null;
    const segmentId = body?.segmentId ? String(body.segmentId) : fromAudience;
    const definition = (body?.definition || undefined) as VoterSegmentDefinition | undefined;
    if (!segmentId && !definition) {
      return NextResponse.json(
        { status: false, message: 'segmentId, audience, or definition required' },
        { status: 400 }
      );
    }

    const formats = Array.isArray(body?.formats)
      ? (body.formats as string[])
          .map((f) => String(f).toLowerCase().replace(/-/g, '_') as OutboundFormat)
          .filter((f) => OUTBOUND_FORMATS.includes(f))
      : undefined;

    const result = await draftOutboundForSegment({
      organizationId: orgId,
      segmentId,
      definition,
      formats,
      goal: body?.goal ? String(body.goal) : null,
      mock: body?.mock === true,
      limit: body?.limit != null ? Number(body.limit) : 200,
    });

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      resolvedFromAudience: fromAudience && !body?.segmentId ? fromAudience : null,
      ...result,
    });
  } catch (error) {
    console.error('[outbound/draft POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
