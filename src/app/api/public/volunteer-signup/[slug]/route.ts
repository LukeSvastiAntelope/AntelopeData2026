import { NextRequest, NextResponse } from 'next/server';
import {
  VolunteerRepo,
  DEFAULT_VOLUNTEER_INTAKE,
} from '@/app/utils/database/volunteer-repo';
import { EmailService } from '@/app/utils/services/email-service';
import { recordVolunteerOptIn } from '@/app/utils/services/volunteer-engagement';
import {
  checkSiteFormRateLimit,
  requestClientMeta,
} from '@/app/utils/services/site-form-capture';

export const runtime = 'nodejs';

/**
 * GET /api/public/volunteer-signup/[slug]
 * Public join page config (campaign name + host intake schema).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const org = await VolunteerRepo.getOrgBySlug(slug);
    if (!org) {
      return NextResponse.json(
        { status: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }
    if (!org.signupEnabled) {
      return NextResponse.json(
        { status: false, message: 'Volunteer signup is closed for this campaign' },
        { status: 403 }
      );
    }
    return NextResponse.json({
      status: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      intakeSchema: org.intakeSchema || DEFAULT_VOLUNTEER_INTAKE,
      joinPath: `/join/${org.slug}`,
    });
  } catch (error) {
    console.error('[public volunteer-signup GET]', error);
    return NextResponse.json(
      { status: false, message: 'Failed to load signup' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/public/volunteer-signup/[slug]
 * Self-serve volunteer signup → person_record + opt-in + magic link email.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const org = await VolunteerRepo.getOrgBySlug(slug);
    if (!org) {
      return NextResponse.json(
        { status: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }
    if (!org.signupEnabled) {
      return NextResponse.json(
        { status: false, message: 'Volunteer signup is closed for this campaign' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const answers =
      body.answers && typeof body.answers === 'object' ? body.answers : body;
    const consent = Boolean(body.consent ?? answers.consent);

    const schema = org.intakeSchema || DEFAULT_VOLUNTEER_INTAKE;
    for (const field of schema.fields) {
      if (!field.required) continue;
      const v = answers[field.id];
      if (v == null || String(v).trim() === '') {
        return NextResponse.json(
          { status: false, message: `${field.label} is required` },
          { status: 400 }
        );
      }
    }

    const email = String(
      answers.email || answers[schema.fields.find((f) => f.type === 'email')?.id || ''] || ''
    )
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { status: false, message: 'A valid email is required so we can send your magic link' },
        { status: 400 }
      );
    }

    if (!consent) {
      return NextResponse.json(
        { status: false, message: 'Consent is required to join' },
        { status: 400 }
      );
    }

    const { ip, userAgent } = requestClientMeta(request);
    const rateKey = `volunteer-signup:${org.slug}:${ip || email}`;
    if (!checkSiteFormRateLimit(rateKey, 6)) {
      return NextResponse.json(
        { status: false, message: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const displayName = answers.name
      ? String(answers.name).trim()
      : answers.full_name
        ? String(answers.full_name).trim()
        : null;
    const phone = answers.phone ? String(answers.phone).trim() : null;

    const issued = await VolunteerRepo.publicSignup({
      organizationId: org.id,
      email,
      displayName,
      phone,
      intake: answers as Record<string, unknown>,
    });

    try {
      await recordVolunteerOptIn({
        organizationId: org.id,
        email,
        phone,
        name: displayName,
        consent: true,
        disclosure: schema.consentPrompt || null,
        ip,
        userAgent,
      });
    } catch (optErr) {
      console.warn('[public volunteer-signup] opt-in record failed', optErr);
    }

    await EmailService.sendVolunteerMagicLink(
      issued.email,
      displayName || undefined,
      issued.rawToken,
      org.name
    );

    return NextResponse.json({
      status: true,
      message:
        'Thanks for signing up! Check your email for a magic link to open the volunteer portal.',
      organizationId: org.id,
      personRecordId: issued.personRecordId,
      expiresAt: issued.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[public volunteer-signup POST]', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error ? error.message : 'Failed to complete signup',
      },
      { status: 500 }
    );
  }
}
