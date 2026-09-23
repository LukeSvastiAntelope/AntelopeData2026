import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { normalizePhone } from '@/app/utils/services/twilio';
import {
  captureSiteForm,
  checkSiteFormRateLimit,
  requestClientMeta,
} from '@/app/utils/services/site-form-capture';

export const runtime = 'nodejs';

/**
 * POST /api/optin — SMS / list signup consent.
 *
 * Survey path (legacy): { surveySlug?, surveyId?, phone, consent, disclosure? }
 * Site path (Sites S5): { siteSlug, phone?, email?, name?, consent, disclosure? }
 *   → organization_id derived from published site slug (client orgId ignored).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      surveySlug,
      surveyId,
      siteSlug,
      phone,
      email,
      name,
      consent,
      disclosure,
      organizationId: clientOrgId,
    } = body as {
      surveySlug?: string;
      surveyId?: number;
      siteSlug?: string;
      phone?: string;
      email?: string;
      name?: string;
      consent?: boolean;
      disclosure?: string;
      organizationId?: number;
    };

    if (!consent) {
      return NextResponse.json(
        { status: false, message: 'Consent is required to record an opt-in.' },
        { status: 400 }
      );
    }

    const { ip, userAgent } = requestClientMeta(req);

    // ── Site signup path (tenant-scoped) ──────────────────────────────
    if (siteSlug && String(siteSlug).trim()) {
      const rateKey = `optin:site:${String(siteSlug).trim()}:${ip || email || phone || 'anon'}`;
      if (!checkSiteFormRateLimit(rateKey)) {
        return NextResponse.json(
          { status: false, message: 'Too many submissions. Please try again later.' },
          { status: 429 }
        );
      }

      const hasPhone = Boolean(phone && String(phone).trim());
      const hasEmail = Boolean(email && String(email).trim());
      if (!hasPhone && !hasEmail) {
        return NextResponse.json(
          { status: false, message: 'Email or phone is required.' },
          { status: 400 }
        );
      }

      // Explicitly discard client organizationId — tenant comes from published slug only.
      void clientOrgId;

      try {
        const captured = await captureSiteForm({
          siteSlug: String(siteSlug).trim(),
          formType: 'signup',
          name: name || null,
          email: email || null,
          phone: phone || null,
          metadata: {
            disclosure: disclosure || null,
            consent: true,
            source: 'site_optin',
            // Prove we never used the client-supplied org
            rejectedClientOrganizationId:
              clientOrgId != null ? Number(clientOrgId) : null,
          },
          ip,
          userAgent,
        });

        // Also keep a consent row with organization_id for TCPA audit.
        const db = await openSql();
        await ensureSurveyOptinsTable(db);
        await ensureOptinOrgColumns(db);
        const normalized = phone ? normalizePhone(String(phone)) : null;
        // phone column is VARCHAR(32) — never store a full email there
        const phoneForConsent =
          normalized && normalized.replace(/\D/g, '').length >= 8
            ? normalized
            : 'email-only';
        await db.execute(
          `INSERT INTO survey_optins
             (survey_slug, survey_id, phone, consent, disclosure, source, ip, user_agent, organization_id, site_slug)
           VALUES (?, NULL, ?, 1, ?, 'site_signup', ?, ?, ?, ?)`,
          [
            `site:${captured.siteSlug}`,
            phoneForConsent,
            disclosure ||
              (email ? `email:${String(email).slice(0, 200)}` : null),
            ip,
            userAgent,
            captured.organizationId,
            captured.siteSlug,
          ]
        );

        return NextResponse.json({
          status: true,
          message: captured.suppressed
            ? 'We received your signup. This contact is on the campaign do-not-contact list — no further outreach will be sent.'
            : 'Opt-in recorded.',
          organizationId: captured.organizationId,
          siteSlug: captured.siteSlug,
          suppressed: captured.suppressed,
          submissionId: captured.submissionId,
        });
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode: number }).statusCode)
            : 500;
        if (statusCode === 404) {
          return NextResponse.json(
            { status: false, message: 'Site not found or not published.' },
            { status: 404 }
          );
        }
        throw err;
      }
    }

    // ── Legacy survey opt-in path ─────────────────────────────────────
    const normalized = normalizePhone(String(phone || ''));
    if (!normalized || normalized.replace(/\D/g, '').length < 8) {
      return NextResponse.json(
        {
          status: false,
          message: 'A valid phone number with country code is required.',
        },
        { status: 400 }
      );
    }

    const db = await openSql();
    await ensureSurveyOptinsTable(db);
    await ensureOptinOrgColumns(db);

    await db.execute(
      `INSERT INTO survey_optins (survey_slug, survey_id, phone, consent, disclosure, ip, user_agent)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [
        surveySlug || null,
        surveyId || null,
        normalized,
        disclosure || null,
        ip,
        userAgent,
      ]
    );

    return NextResponse.json({ status: true, message: 'Opt-in recorded.' });
  } catch (error) {
    console.error('Opt-in record error:', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error ? error.message : 'Failed to record opt-in',
      },
      { status: 500 }
    );
  }
}

async function ensureSurveyOptinsTable(db: Awaited<ReturnType<typeof openSql>>) {
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
}

async function ensureOptinOrgColumns(db: Awaited<ReturnType<typeof openSql>>) {
  try {
    await db.execute(
      `ALTER TABLE survey_optins
         ADD COLUMN organization_id INT NULL,
         ADD COLUMN site_slug VARCHAR(96) NULL`
    );
  } catch {
    // columns already exist
  }
}
