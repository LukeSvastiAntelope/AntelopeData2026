import { NextRequest, NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import { VolunteerRelationalRepo } from '@/app/utils/database/volunteer-relational-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';

export const runtime = 'nodejs';

/** GET /api/portal/contacts — list private contacts (owner only) */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;

    const contacts = await VolunteerRelationalRepo.listContacts({
      organizationId: id.organizationId,
      ownerUserId: id.userId,
    });
    const queue = await VolunteerRelationalRepo.listOutreachQueue({
      organizationId: id.organizationId,
      ownerUserId: id.userId,
      pendingOnly: true,
      limit: 20,
    });

    return NextResponse.json({ status: true, contacts, queue });
  } catch (error) {
    console.error('[portal contacts GET]', error);
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
 * POST /api/portal/contacts
 * body: { displayName, email?, phone?, relationshipNote?, notes? }
 *    or { action: 'import', contacts: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const body = await request.json().catch(() => ({}));

    if (body.action === 'import' && Array.isArray(body.contacts)) {
      const result = await VolunteerRelationalRepo.addContactsBulk({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        source: 'device_import',
        contacts: body.contacts.map((c: any) => ({
          displayName: String(c.displayName || c.name || ''),
          email: c.email ?? null,
          phone: c.phone ?? c.tel ?? null,
          relationshipNote: c.relationshipNote ?? c.relationship ?? null,
        })),
      });
      for (const _ of result.contacts) {
        await VolunteerEventsRepo.append({
          organizationId: id.organizationId,
          userId: id.userId,
          kind: 'contact_added',
          points: 0,
          relatedType: 'contact',
          payload: { source: 'device_import' },
        });
      }
      return NextResponse.json({
        status: true,
        created: result.created,
        skipped: result.skipped,
        contacts: result.contacts,
        message: `Imported ${result.created} contact${result.created === 1 ? '' : 's'}`,
      });
    }

    const contact = await VolunteerRelationalRepo.addContact({
      organizationId: id.organizationId,
      ownerUserId: id.userId,
      displayName: String(body.displayName || body.name || ''),
      email: body.email ?? null,
      phone: body.phone ?? null,
      relationshipNote: body.relationshipNote ?? null,
      notes: body.notes ?? null,
      source: 'manual',
    });

    await VolunteerEventsRepo.append({
      organizationId: id.organizationId,
      userId: id.userId,
      kind: 'contact_added',
      points: 0,
      relatedType: 'contact',
      relatedId: contact.id,
      payload: { source: 'manual' },
    });

    return NextResponse.json({ status: true, contact });
  } catch (error) {
    console.error('[portal contacts POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

/** DELETE /api/portal/contacts?id= */
export async function DELETE(request: NextRequest) {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const contactId = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(contactId)) {
      return NextResponse.json(
        { status: false, message: 'id required' },
        { status: 400 }
      );
    }
    const ok = await VolunteerRelationalRepo.deleteContact({
      contactId,
      ownerUserId: id.userId,
      organizationId: id.organizationId,
    });
    return NextResponse.json({ status: ok });
  } catch (error) {
    console.error('[portal contacts DELETE]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
