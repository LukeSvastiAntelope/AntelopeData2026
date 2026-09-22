import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import {
  PersonRepo,
  toMapPerson,
  type CanvassStatus,
} from '@/app/utils/database/person-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';

export const runtime = 'nodejs';

const ALLOWED: CanvassStatus[] = [
  'not_contacted',
  'contacted',
  'confirmed',
  'not_home',
  'refused',
  'moved',
  'wrong_address',
];

/** PATCH /api/dashboard/persons/[id] — door-knock confirmation (D3). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ status: false, message: 'Invalid id' }, { status: 400 });
    }

    const orgId = await ensurePrimaryOrgId(userId);

    const body = await request.json();
    const status = String(body.status || '') as CanvassStatus;
    if (!ALLOWED.includes(status)) {
      return NextResponse.json(
        { status: false, message: `status must be one of: ${ALLOWED.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = await PersonRepo.confirmInPerson({
      id,
      organizationId: orgId,
      userId: Number(userId),
      status,
      party: body.party ?? null,
      notes: body.notes ?? null,
      applyPartyToRecord: body.applyPartyToRecord !== false,
    });

    if (!updated) {
      return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ status: true, person: toMapPerson(updated) });
  } catch (error) {
    console.error('[dashboard/persons PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Confirm failed' },
      { status: 500 }
    );
  }
}
