import { NextRequest, NextResponse } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import { issueParticipantToken } from '@/app/utils/live/participant-token';

export const runtime = 'nodejs';

/**
 * POST /api/public/live/[code]/join
 * Create session_participant (+ person_record when identified) after intake + consent.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code: raw } = await context.params;
    const found = await LiveRepo.getLiveSessionByCode(raw);
    if (!found) {
      return NextResponse.json(
        { status: false, message: 'Session not found' },
        { status: 404 }
      );
    }
    const { session } = found;
    if (session.status === 'ended') {
      return NextResponse.json(
        { status: false, message: 'This session has ended' },
        { status: 410 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const linkedinUrl =
      typeof body.linkedinUrl === 'string' ? body.linkedinUrl.trim() : '';
    const email =
      typeof body.email === 'string'
        ? body.email.trim()
        : typeof body.intake?.email === 'string'
          ? String(body.intake.email).trim()
          : '';
    const intake =
      body.intake && typeof body.intake === 'object' && !Array.isArray(body.intake)
        ? (body.intake as Record<string, unknown>)
        : {};
    const consent = Boolean(body.consent);
    const forceAnonymous = Boolean(body.anonymous);

    // Validate required intake fields
    for (const field of session.intakeSchema.fields || []) {
      if (!field.required) continue;
      const v = intake[field.id];
      const empty =
        v == null ||
        (typeof v === 'string' && !v.trim()) ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        return NextResponse.json(
          { status: false, message: `${field.label} is required` },
          { status: 400 }
        );
      }
    }

    const wantsIdentified =
      !forceAnonymous && session.identifyMode !== 'anonymous';

    if (wantsIdentified && !consent) {
      return NextResponse.json(
        {
          status: false,
          message:
            'Consent is required to join with your profile. Share who you are to join.',
        },
        { status: 400 }
      );
    }

    if (wantsIdentified && !displayName && !intake.name) {
      return NextResponse.json(
        { status: false, message: 'Name is required to join identified' },
        { status: 400 }
      );
    }

    const nameFromIntake =
      typeof intake.name === 'string' ? String(intake.name).trim() : '';

    const participant = await LiveRepo.addParticipant({
      sessionId: session.id,
      organizationId: session.organizationId,
      displayName: displayName || nameFromIntake || null,
      linkedinUrl: linkedinUrl || null,
      email: email || null,
      intake: {
        ...intake,
        ...(typeof body.headline === 'string'
          ? { headline: body.headline }
          : {}),
      },
      isAnonymous: !wantsIdentified,
      consentAt: wantsIdentified ? new Date() : null,
    });

    const token = issueParticipantToken({
      participantId: participant.id,
      sessionId: session.id,
      organizationId: session.organizationId,
    });

    // L3 — bump presenter screens
    const { notifyLiveSession } = await import('@/app/utils/live/notify');
    void notifyLiveSession(session.code);

    return NextResponse.json({
      status: true,
      participantToken: token,
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        isAnonymous: participant.isAnonymous,
        personRecordId: participant.personRecordId,
        consentAt: participant.consentAt,
      },
    });
  } catch (error) {
    console.error('[public live join]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Join failed',
      },
      { status: 500 }
    );
  }
}
