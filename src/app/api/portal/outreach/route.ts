import { NextRequest, NextResponse } from 'next/server';
import { requirePortalIdentity } from '@/app/utils/auth/portal-identity';
import {
  assignRelationalOutreach,
  stageRelationalSend,
  logRelationalOutcome,
  convertContactToVolunteer,
} from '@/app/utils/services/volunteer-relational-service';
import { VolunteerRelationalRepo } from '@/app/utils/database/volunteer-relational-repo';
import type { OutreachOutcome } from '@/app/utils/database/volunteer-relational-repo';

export const runtime = 'nodejs';

const OUTCOMES: OutreachOutcome[] = [
  'reached',
  'left_message',
  'no_answer',
  'not_interested',
  'will_help',
  'wants_to_volunteer',
  'other',
];

/** GET /api/portal/outreach — pending queue */
export async function GET() {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const queue = await VolunteerRelationalRepo.listOutreachQueue({
      organizationId: id.organizationId,
      ownerUserId: id.userId,
      limit: 50,
    });
    return NextResponse.json({ status: true, queue });
  } catch (error) {
    console.error('[portal outreach GET]', error);
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
 * POST /api/portal/outreach
 * actions: assign | stage | log | convert
 */
export async function POST(request: NextRequest) {
  try {
    const id = await requirePortalIdentity();
    if (id instanceof Response) return id;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'assign');

    if (action === 'assign') {
      const contactId = Number(body.contactId);
      if (!Number.isFinite(contactId)) {
        return NextResponse.json(
          { status: false, message: 'contactId required' },
          { status: 400 }
        );
      }
      const out = await assignRelationalOutreach({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        contactId,
        channel: body.channel,
        askHint: body.askHint ?? null,
      });
      return NextResponse.json({
        status: true,
        outreach: out.outreach,
        usedFallback: out.usedFallback,
      });
    }

    if (action === 'stage') {
      const outreachId = Number(body.outreachId);
      if (!Number.isFinite(outreachId)) {
        return NextResponse.json(
          { status: false, message: 'outreachId required' },
          { status: 400 }
        );
      }
      const out = await stageRelationalSend({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        outreachId,
      });
      return NextResponse.json({
        status: true,
        outreach: out.outreach,
        staged: out.staged,
        message: out.staged
          ? 'Staged for Outbound approval — nothing sent yet'
          : out.skippedReason || 'Nothing staged',
      });
    }

    if (action === 'log') {
      const outreachId = Number(body.outreachId);
      const outcome = String(body.outcome || '') as OutreachOutcome;
      if (!Number.isFinite(outreachId) || !OUTCOMES.includes(outcome)) {
        return NextResponse.json(
          { status: false, message: 'outreachId and valid outcome required' },
          { status: 400 }
        );
      }
      const outreach = await logRelationalOutcome({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        outreachId,
        outcome,
        outcomeNote: body.outcomeNote ?? null,
      });
      return NextResponse.json({ status: true, outreach });
    }

    if (action === 'convert') {
      const outreachId = Number(body.outreachId);
      if (!Number.isFinite(outreachId)) {
        return NextResponse.json(
          { status: false, message: 'outreachId required' },
          { status: 400 }
        );
      }
      const out = await convertContactToVolunteer({
        organizationId: id.organizationId,
        ownerUserId: id.userId,
        outreachId,
      });
      return NextResponse.json({
        status: true,
        outreach: out.outreach,
        joinPath: out.joinPath,
        email: out.email,
        message: `Magic link invite sent to ${out.email}`,
      });
    }

    return NextResponse.json(
      { status: false, message: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[portal outreach POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
