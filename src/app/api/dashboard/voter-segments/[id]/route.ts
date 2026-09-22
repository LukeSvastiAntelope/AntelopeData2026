import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import {
  deleteVoterSegment,
  resolveVoterSegment,
  type VoterSegmentDefinition,
} from '@/app/utils/services/voter-segments';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/voter-segments/[id]/resolve
 * Live membership for preset id or saved slug/id (recomputed).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const { id } = await params;
    const orgId = await ensurePrimaryOrgId(userId);
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const resolved = await resolveVoterSegment({
      organizationId: orgId,
      segmentId: id,
      limit: Number.isFinite(limit as number) ? limit : undefined,
    });

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      segment: {
        id: resolved.id,
        name: resolved.name,
        description: resolved.description,
        source: resolved.source,
        definition: resolved.definition,
        disclaimer: resolved.disclaimer,
      },
      count: resolved.count,
      candidateCount: resolved.candidateCount,
      people: resolved.people.map((h) => ({
        personId: h.personId,
        firstName: h.person.first_name,
        lastName: h.person.last_name,
        email: h.person.email,
        gender: h.person.gender,
        ageYears: h.person.age_years,
        party: h.person.canvass_party || h.person.party,
        ownerOccupied: h.person.owner_occupied,
        zip: h.person.zip,
        latitude: h.person.latitude,
        longitude: h.person.longitude,
        matchedAttributes: h.matchedAttributes.map((a) => ({
          key: a.key,
          label: a.label,
          current: a.current,
          changeSummary: a.changeSummary,
        })),
      })),
    });
  } catch (error) {
    console.error('[voter-segments resolve]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dashboard/voter-segments/[id] — remove a saved segment definition.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const { id } = await params;
    const orgId = await ensurePrimaryOrgId(userId);
    const ok = await deleteVoterSegment(orgId, id);
    return NextResponse.json({ status: ok, deleted: ok });
  } catch (error) {
    console.error('[voter-segments DELETE]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/voter-segments/[id]/resolve with optional definition overlay.
 * Also supports body { definition, limit } without relying on query string.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const { id } = await params;
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json().catch(() => ({}));
    const definition = (body?.definition || undefined) as VoterSegmentDefinition | undefined;
    const limit = body?.limit != null ? Number(body.limit) : undefined;

    const resolved = await resolveVoterSegment({
      organizationId: orgId,
      segmentId: id === 'ad-hoc' ? null : id,
      definition,
      limit: Number.isFinite(limit as number) ? limit : undefined,
    });

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      count: resolved.count,
      candidateCount: resolved.candidateCount,
      segment: {
        id: resolved.id,
        name: resolved.name,
        source: resolved.source,
        definition: resolved.definition,
        disclaimer: resolved.disclaimer,
      },
      people: resolved.people.map((h) => ({
        personId: h.personId,
        firstName: h.person.first_name,
        lastName: h.person.last_name,
        matchedAttributes: h.matchedAttributes.map((a) => ({
          key: a.key,
          label: a.label,
          current: a.current,
        })),
      })),
    });
  } catch (error) {
    console.error('[voter-segments resolve POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
