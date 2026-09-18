import { NextRequest, NextResponse } from 'next/server';
import { ContactSuppressionRepo } from '@/app/utils/database/turf-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

/** GET /api/dashboard/contact-suppression — list DNC rows for the org. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const rows = await ContactSuppressionRepo.list(orgId);
    return NextResponse.json({ status: true, organizationId: orgId, suppressions: rows });
  } catch (error) {
    console.error('[contact-suppression GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/** POST — add a do-not-contact entry (universal exclude layer). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const body = await request.json();
    const row = await ContactSuppressionRepo.add({
      organizationId: orgId,
      voterGeoId: body.voterGeoId ?? null,
      voterFileId: body.voterFileId ?? null,
      personRecordId: body.personRecordId ?? null,
      responderAgentId: body.responderAgentId ?? null,
      reason: body.reason,
      source: body.source || 'manual',
      notes: body.notes ?? null,
      createdBy: Number(userId),
    });
    return NextResponse.json({ status: true, suppression: row });
  } catch (error) {
    console.error('[contact-suppression POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    );
  }
}

/** DELETE ?id= — remove a suppression row. */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const orgId = await ensurePrimaryOrgId(userId);
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'id required' }, { status: 400 });
    }
    const ok = await ContactSuppressionRepo.remove(id, orgId);
    if (!ok) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[contact-suppression DELETE]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
