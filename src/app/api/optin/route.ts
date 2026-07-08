import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { normalizePhone } from '@/app/utils/services/twilio';

export const runtime = 'nodejs';

/**
 * POST /api/optin — record a respondent's SMS follow-up opt-in for a survey.
 *
 * Public endpoint (reached from the /optin page). Stores a consent record with
 * the disclosure the person agreed to, per TCPA best practice. The table is
 * created lazily so this works without a separate migration.
 *
 * Body: { surveySlug?, surveyId?, phone, consent: boolean, disclosure?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { surveySlug, surveyId, phone, consent, disclosure } = body as {
      surveySlug?: string;
      surveyId?: number;
      phone?: string;
      consent?: boolean;
      disclosure?: string;
    };

    if (!consent) {
      return NextResponse.json(
        { status: false, message: 'Consent is required to record an opt-in.' },
        { status: 400 }
      );
    }
    const normalized = normalizePhone(String(phone || ''));
    if (!normalized || normalized.replace(/\D/g, '').length < 8) {
      return NextResponse.json(
        { status: false, message: 'A valid phone number with country code is required.' },
        { status: 400 }
      );
    }

    const db = await openSql();
    // Lazy-create the consent table (no separate migration needed).
    await db.execute(`
      CREATE TABLE IF NOT EXISTS survey_optins (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        survey_slug VARCHAR(255) NULL,
        survey_id BIGINT NULL,
        phone VARCHAR(32) NOT NULL,
        consent TINYINT(1) NOT NULL DEFAULT 1,
        disclosure TEXT NULL,
        source VARCHAR(64) NOT NULL DEFAULT 'optin_page',
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_slug (survey_slug)
      )
    `);

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const ua = (req.headers.get('user-agent') || '').slice(0, 255);

    await db.execute(
      `INSERT INTO survey_optins (survey_slug, survey_id, phone, consent, disclosure, ip, user_agent)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [surveySlug || null, surveyId || null, normalized, disclosure || null, ip, ua]
    );

    return NextResponse.json({ status: true, message: 'Opt-in recorded.' });
  } catch (error) {
    console.error('Opt-in record error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to record opt-in' },
      { status: 500 }
    );
  }
}
