import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';
import {
  getDistrictIntelJob,
  scheduleDistrictIntelGeneration,
  toOnboardingReportView,
  sourcesHealthFromExternal,
  parseCampaignDistrict,
  type OnboardingReportView,
} from '@/app/utils/services/district-intel-service';

export const runtime = 'nodejs';

async function getOrgDistrict(orgId: number): Promise<{
  districtCode: string | null;
  state: string | null;
  officeType: string | null;
}> {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT district_code, state, office_type FROM organizations WHERE id = ? LIMIT 1`,
    [orgId]
  );
  if (!rows.length) return { districtCode: null, state: null, officeType: null };
  return {
    districtCode: rows[0].district_code
      ? String(rows[0].district_code)
      : null,
    state: rows[0].state ? String(rows[0].state) : null,
    officeType: rows[0].office_type ? String(rows[0].office_type) : null,
  };
}

async function setOrgDistrict(input: {
  orgId: number;
  districtCode: string;
  state: string;
  officeType?: string | null;
}): Promise<void> {
  const sql = await openSql();
  if (input.officeType) {
    await sql.execute(
      `UPDATE organizations
       SET district_code = ?,
           state = COALESCE(state, ?),
           office_type = COALESCE(office_type, ?)
       WHERE id = ?`,
      [input.districtCode, input.state, input.officeType, input.orgId]
    );
  } else {
    await sql.execute(
      `UPDATE organizations
       SET district_code = ?, state = COALESCE(state, ?)
       WHERE id = ?`,
      [input.districtCode, input.state, input.orgId]
    );
  }
}

/**
 * GET /api/dashboard/district-intel/onboarding
 * Poll District Intelligence Report for the caller's org.
 * Kicks async generation when district is known but no snapshot yet.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const org = await getOrgDistrict(orgId);

    if (!org.districtCode) {
      return NextResponse.json({
        status: true,
        jobStatus: 'none' as const,
        needsDistrict: true,
        message:
          'Select your district on the map (or add it at signup) to generate your District Intelligence Report.',
      });
    }

    const parsed = parseCampaignDistrict(org.districtCode);
    const districtKey = parsed?.label || org.districtCode.toUpperCase();
    const officeType =
      org.officeType || parsed?.officeType || 'federal_house';
    const job = await getDistrictIntelJob({
      organizationId: orgId,
      districtKey,
    });

    if (!job || job.status === 'none') {
      const kick = scheduleDistrictIntelGeneration({
        organizationId: orgId,
        districtCode: districtKey,
        state: parsed?.state || org.state,
        districtNumber: parsed?.districtNumber ?? null,
        officeType,
      });
      return NextResponse.json({
        status: true,
        jobStatus: 'pending' as const,
        needsDistrict: false,
        districtCode: districtKey,
        gathering: true,
        message: 'Gathering your district data…',
        started: kick.started,
      });
    }

    if (job.status === 'pending') {
      return NextResponse.json({
        status: true,
        jobStatus: 'pending' as const,
        needsDistrict: false,
        districtCode: districtKey,
        gathering: true,
        message: 'Gathering your district data…',
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        status: true,
        jobStatus: 'failed' as const,
        needsDistrict: false,
        districtCode: districtKey,
        message: job.errorMessage || 'Could not gather district data.',
        canRetry: true,
      });
    }

    // ready
    if (!job.payload) {
      scheduleDistrictIntelGeneration({
        organizationId: orgId,
        districtCode: districtKey,
        state: parsed?.state || org.state,
        districtNumber: parsed?.districtNumber ?? null,
        officeType,
      });
      return NextResponse.json({
        status: true,
        jobStatus: 'pending' as const,
        gathering: true,
        districtCode: districtKey,
        message: 'Gathering your district data…',
      });
    }

    const health =
      job.sourcesHealth || sourcesHealthFromExternal(job.payload.external);
    const report: OnboardingReportView = toOnboardingReportView(
      job.payload,
      health,
      job.generatedAt || new Date().toISOString()
    );

    return NextResponse.json({
      status: true,
      jobStatus: 'ready' as const,
      needsDistrict: false,
      districtCode: districtKey,
      gathering: false,
      report,
    });
  } catch (error) {
    console.error('[district-intel onboarding GET]', error);
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
 * POST /api/dashboard/district-intel/onboarding
 * Bind district on first selection + kick async generation.
 * body: { districtCode, state?, districtNumber?, officeType?, retry? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const orgId = await ensurePrimaryOrgId(auth);
    const body = await request.json().catch(() => ({}));

    if (body.retry) {
      const org = await getOrgDistrict(orgId);
      if (!org.districtCode) {
        return NextResponse.json(
          { status: false, message: 'No district on organization' },
          { status: 400 }
        );
      }
      const parsed = parseCampaignDistrict(org.districtCode);
      const kick = scheduleDistrictIntelGeneration({
        organizationId: orgId,
        districtCode: parsed?.label || org.districtCode,
        state: parsed?.state || org.state,
        districtNumber: parsed?.districtNumber ?? null,
        officeType: org.officeType || parsed?.officeType || null,
      });
      return NextResponse.json({
        status: true,
        jobStatus: 'pending',
        gathering: true,
        districtCode: kick.districtKey,
        message: 'Gathering your district data…',
      });
    }

    const rawCode = String(body.districtCode || '').trim();
    const parsed = parseCampaignDistrict(rawCode);
    const state =
      (parsed?.state || String(body.state || '').trim().toUpperCase() || null) as
        | string
        | null;
    const districtNumber =
      parsed?.districtNumber ??
      (body.districtNumber != null ? Number(body.districtNumber) : null);
    const officeType =
      (body.officeType != null ? String(body.officeType) : null) ||
      parsed?.officeType ||
      null;
    const districtKey =
      parsed?.label ||
      (state && districtNumber != null
        ? `${state}-${districtNumber}`
        : rawCode.toUpperCase());

    if (!districtKey || !state) {
      return NextResponse.json(
        {
          status: false,
          message: 'districtCode required (e.g. NJ-5 or NJ-LD-12)',
        },
        { status: 400 }
      );
    }

    const existing = await getOrgDistrict(orgId);
    // Persist on first selection (or when empty); don't overwrite a different bound district silently
    if (!existing.districtCode) {
      await setOrgDistrict({
        orgId,
        districtCode: districtKey,
        state,
        officeType,
      });
    }

    const kick = scheduleDistrictIntelGeneration({
      organizationId: orgId,
      districtCode: districtKey,
      state,
      districtNumber,
      officeType: officeType || existing.officeType,
    });

    return NextResponse.json({
      status: true,
      jobStatus: 'pending',
      gathering: true,
      districtCode: kick.districtKey,
      message: 'Gathering your district data…',
      boundToOrg: !existing.districtCode,
    });
  } catch (error) {
    console.error('[district-intel onboarding POST]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
