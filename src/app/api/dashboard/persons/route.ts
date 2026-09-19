import { NextRequest, NextResponse } from 'next/server';
import { PersonRepo, toMapPerson } from '@/app/utils/database/person-repo';
import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PropensityTier } from '@/app/utils/propensity/config';

export const runtime = 'nodejs';

function csvList(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

/** GET /api/dashboard/persons — filtered household pins for the map (D2 + P3 tier). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await ensurePrimaryOrgId(userId);

    const sp = request.nextUrl.searchParams;
    const tierRaw = csvList(sp.get('tier') || sp.get('propensityTier'));
    const propensityTier = tierRaw?.filter((t): t is PropensityTier =>
      t === 'hot' || t === 'warm' || t === 'cold'
    );

    const people = await PersonRepo.listForMap({
      organizationId: orgId,
      party: csvList(sp.get('party')),
      ageBucket: csvList(sp.get('ageBucket')),
      voterStatus: csvList(sp.get('voterStatus')),
      district: csvList(sp.get('district')),
      zip: csvList(sp.get('zip')),
      canvassStatus: csvList(sp.get('canvassStatus')),
      ownerOccupied:
        sp.get('ownerOccupied') == null
          ? null
          : sp.get('ownerOccupied') === '1' || sp.get('ownerOccupied') === 'true',
      minConfidence: sp.get('minConfidence') ? Number(sp.get('minConfidence')) : undefined,
      propensityTier,
      excludeSuppressed:
        sp.get('excludeSuppressed') === '1' || sp.get('excludeSuppressed') === 'true',
      includeFenceLabels: csvList(sp.get('includeArea') || sp.get('includeAreas')),
      includeFenceIds: csvList(sp.get('includeFenceIds'))?.map(Number).filter(Number.isFinite),
      excludeFenceLabels: csvList(sp.get('excludeArea') || sp.get('excludeAreas')),
      limit: sp.get('limit') ? Number(sp.get('limit')) : 5000,
    });

    // Enrich from materialized view when available
    const stored = await PropensityRepo.listByOrg(orgId, { limit: 5000 });
    const byId = new Map(
      stored.map((r) => [
        r.person_record_id,
        {
          propensity: r.propensity,
          confidence: r.confidence,
          tier: r.tier,
          priorWeight: r.prior_weight,
          priorP0: r.p0,
          posteriorQ: r.posterior_q,
          evidenceE: r.evidence_e,
        },
      ])
    );

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      count: people.length,
      people: people.map((p) => toMapPerson(p, byId.get(p.id) || null)),
      filters: {
        tier: propensityTier || [],
        excludeSuppressed:
          sp.get('excludeSuppressed') === '1' || sp.get('excludeSuppressed') === 'true',
        includeArea: csvList(sp.get('includeArea') || sp.get('includeAreas')) || [],
      },
    });
  } catch (error) {
    console.error('[dashboard/persons GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/persons — upload mock/unified CSV rows into person_records (D2).
 * Body: { rows: Record<string,string>[] } matching MOCK_district_records / D1 schema.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await ensurePrimaryOrgId(userId);

    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ status: false, message: 'rows[] required' }, { status: 400 });
    }

    const mapped = rows.map((raw: Record<string, string>, i: number) => {
      const lat = raw.latitude || raw.lat;
      const lng = raw.longitude || raw.lng || raw.lon;
      const ageYears = raw.age_years || raw.age ? Number(raw.age_years || raw.age) : null;
      const ownerRaw = (raw.owner_occupied || '').toLowerCase();
      const ownerOccupied =
        ownerRaw === ''
          ? null
          : ['1', 'true', 'yes', 'y'].includes(ownerRaw);
      return {
        clusterKey: raw.cluster_key || `upload_${i + 1}`,
        firstName: raw.first_name || raw.firstname || '',
        lastName: raw.last_name || raw.lastname || '',
        email: raw.email || '',
        phone: (raw.phone || '').replace(/\D/g, ''),
        street: raw.street || raw.address || '',
        unit: raw.unit || '',
        city: raw.city || '',
        state: (raw.state || '').toUpperCase().slice(0, 2),
        zip: (raw.zip || raw.zipcode || '').replace(/\D/g, '').slice(0, 5),
        birthdate: raw.birthdate || null,
        ageYears: Number.isFinite(ageYears as number) ? (ageYears as number) : null,
        ageBucket: raw.age_bucket || null,
        party: raw.party || '',
        gender: raw.gender || '',
        voterStatus: raw.voter_status || raw.registration_status || '',
        district: raw.district || '',
        ownerOccupied,
        propertyType: raw.property_type || '',
        matchConfidence: raw.match_confidence ? Number(raw.match_confidence) : 0.9,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        fieldProvenance: { source: 'dashboard_upload' },
        sourceRowIds: (raw.source_row_ids || `upload:${i + 1}`).split('|'),
      };
    });

    const withCoords = mapped.filter(
      (r) =>
        r.latitude != null &&
        r.longitude != null &&
        !Number.isNaN(r.latitude) &&
        !Number.isNaN(r.longitude)
    );
    if (!withCoords.length) {
      return NextResponse.json(
        {
          status: false,
          message:
            'No rows with latitude/longitude — household map needs geocoded addresses (use MOCK_district_records.csv or add lat/lng columns)',
        },
        { status: 400 }
      );
    }

    const result = await PersonRepo.upsertFromUpload(orgId, withCoords);
    // Refresh propensity for uploaded set (bounded)
    try {
      await PropensityRepo.refreshOrganization(orgId, { limit: Math.min(withCoords.length, 2000) });
    } catch (e) {
      console.warn('[persons POST propensity refresh]', e);
    }
    const people = await PersonRepo.listForMap({ organizationId: orgId, limit: 5000 });

    return NextResponse.json({
      status: true,
      upserted: result.upserted,
      skippedWithoutCoords: mapped.length - withCoords.length,
      count: people.length,
      people: people.map((p) => toMapPerson(p)),
    });
  } catch (error) {
    console.error('[dashboard/persons POST]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
