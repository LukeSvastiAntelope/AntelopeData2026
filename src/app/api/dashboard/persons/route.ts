import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { PersonRepo, toMapPerson } from '@/app/utils/database/person-repo';
import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import type { PropensityTier } from '@/app/utils/propensity/config';
import {
  queryVoters,
  type TrackedAttributeFilter,
} from '@/app/utils/services/voter-query';

export const runtime = 'nodejs';

function csvList(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function truthy(v: string | null): boolean {
  return v === '1' || v === 'true';
}

/** Build VT3 tracked filters from map/query search params. */
function trackedFromSearchParams(sp: URLSearchParams): TrackedAttributeFilter[] {
  const tracked: TrackedAttributeFilter[] = [];

  const issue = sp.get('issue') || sp.get('issueKey');
  const issueEquals = sp.get('issueEquals') || sp.get('issueValue');
  if (issue || issueEquals || truthy(sp.get('issueChanged')) || sp.get('issueWas') || sp.get('issueChangedSince')) {
    tracked.push({
      issue: issue || undefined,
      category: 'issue',
      equals: issueEquals || undefined,
      changed: truthy(sp.get('issueChanged')) || undefined,
      was: sp.get('issueWas') || undefined,
      changedSince: sp.get('issueChangedSince') || undefined,
    });
  }

  if (truthy(sp.get('hasDonated'))) {
    tracked.push({ hasDonated: true, category: 'donation' });
  }

  const partyEquals = sp.get('confirmedParty') || sp.get('partisanship');
  if (partyEquals || truthy(sp.get('partisanshipChanged'))) {
    tracked.push({
      key: 'partisanship:confirmed',
      category: 'partisanship',
      equals: partyEquals || undefined,
      changed: truthy(sp.get('partisanshipChanged')) || undefined,
      was: sp.get('partisanshipWas') || undefined,
    });
  }

  const engagement = sp.get('engagement') || sp.get('contactability');
  if (engagement) {
    tracked.push({
      key: 'engagement:contactability',
      category: 'engagement',
      equals: engagement,
    });
  }

  // Raw JSON escape hatch: tracked=[{...}]
  const raw = sp.get('tracked');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') tracked.push(item as TrackedAttributeFilter);
        }
      }
    } catch {
      /* ignore malformed */
    }
  }

  return tracked;
}

/**
 * GET /api/dashboard/persons — filtered household pins (D2 + P3 + VT3 tracked attrs).
 *
 * Collation/D2: party, ageBucket, minAge, gender, district, zip, …
 * VT3 tracked: issue / issueEquals / issueChanged / issueWas / hasDonated /
 *              confirmedParty / engagement — composed with D2 in one query.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const orgId = await ensurePrimaryOrgId(userId);

    const sp = request.nextUrl.searchParams;
    const tierRaw = csvList(sp.get('tier') || sp.get('propensityTier'));
    const propensityTier = tierRaw?.filter((t): t is PropensityTier =>
      t === 'hot' || t === 'warm' || t === 'cold'
    );

    const tracked = trackedFromSearchParams(sp);
    const useVt3 = tracked.length > 0 || truthy(sp.get('includeState'));

    const baseFilters = {
      organizationId: orgId,
      party: csvList(sp.get('party')),
      ageBucket: csvList(sp.get('ageBucket')),
      minAgeYears: sp.get('minAge') || sp.get('minAgeYears')
        ? Number(sp.get('minAge') || sp.get('minAgeYears'))
        : undefined,
      maxAgeYears: sp.get('maxAge') || sp.get('maxAgeYears')
        ? Number(sp.get('maxAge') || sp.get('maxAgeYears'))
        : undefined,
      gender: csvList(sp.get('gender')),
      voterStatus: csvList(sp.get('voterStatus')),
      district: csvList(sp.get('district')),
      zip: csvList(sp.get('zip')),
      canvassStatus: csvList(sp.get('canvassStatus')),
      ownerOccupied:
        sp.get('ownerOccupied') == null
          ? null
          : truthy(sp.get('ownerOccupied')),
      minConfidence: sp.get('minConfidence') ? Number(sp.get('minConfidence')) : undefined,
      propensityTier,
      excludeSuppressed: truthy(sp.get('excludeSuppressed')),
      includeFenceLabels: csvList(sp.get('includeArea') || sp.get('includeAreas')),
      includeFenceIds: csvList(sp.get('includeFenceIds'))?.map(Number).filter(Number.isFinite),
      excludeFenceLabels: csvList(sp.get('excludeArea') || sp.get('excludeAreas')),
      requireCoordinates: sp.get('requireCoordinates') == null
        ? true
        : truthy(sp.get('requireCoordinates')),
      limit: sp.get('limit') ? Number(sp.get('limit')) : 5000,
    };

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

    if (!useVt3) {
      const people = await PersonRepo.listForMap(baseFilters);
      return NextResponse.json({
        status: true,
        organizationId: orgId,
        count: people.length,
        people: people.map((p) => toMapPerson(p, byId.get(p.id) || null)),
        filters: {
          tier: propensityTier || [],
          excludeSuppressed: truthy(sp.get('excludeSuppressed')),
          includeArea: csvList(sp.get('includeArea') || sp.get('includeAreas')) || [],
          gender: baseFilters.gender || [],
          minAgeYears: baseFilters.minAgeYears ?? null,
        },
      });
    }

    // VT3 path: D2 + collation + tracked attribute / change-state rollup
    const result = await queryVoters({
      ...baseFilters,
      tracked,
      hasDonated: truthy(sp.get('hasDonated')),
      includeState: true,
      candidateLimit: baseFilters.limit,
      // Selection queries may include non-geocoded records when explicitly asked
      requireCoordinates: baseFilters.requireCoordinates,
    });

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      count: result.count,
      candidateCount: result.candidateCount,
      people: result.people.map((hit) => ({
        ...toMapPerson(hit.person, byId.get(hit.person.id) || null),
        matchedAttributes: hit.matchedAttributes.map((a) => ({
          key: a.key,
          label: a.label,
          category: a.category,
          current: a.current,
          asOf: a.asOf,
          changeSummary: a.changeSummary,
          historyLength: a.history.length,
        })),
        state: hit.state
          ? {
              computedAt: hit.state.computedAt,
              issuePositions: hit.state.issuePositions.map((a) => ({
                key: a.key,
                label: a.label,
                current: a.current,
                asOf: a.asOf,
                changeSummary: a.changeSummary,
              })),
              partisanship: hit.state.partisanship
                ? {
                    current: hit.state.partisanship.current,
                    changeSummary: hit.state.partisanship.changeSummary,
                  }
                : null,
              donationStatus: hit.state.donationStatus
                ? {
                    current: hit.state.donationStatus.current,
                    changeSummary: hit.state.donationStatus.changeSummary,
                  }
                : null,
              engagement: hit.state.engagement
                ? {
                    current: hit.state.engagement.current,
                    changeSummary: hit.state.engagement.changeSummary,
                  }
                : null,
              lastSurvey: hit.state.lastSurvey
                ? {
                    current: hit.state.lastSurvey.current,
                    changeSummary: hit.state.lastSurvey.changeSummary,
                  }
                : null,
            }
          : null,
      })),
      filters: {
        tier: propensityTier || [],
        excludeSuppressed: truthy(sp.get('excludeSuppressed')),
        includeArea: csvList(sp.get('includeArea') || sp.get('includeAreas')) || [],
        gender: baseFilters.gender || [],
        minAgeYears: baseFilters.minAgeYears ?? null,
        tracked,
        hasDonated: truthy(sp.get('hasDonated')),
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
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

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
