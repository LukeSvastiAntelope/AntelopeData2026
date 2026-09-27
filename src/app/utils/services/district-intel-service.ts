/**
 * Shared District Intelligence service (Data D1).
 *
 * Census ACS + CBP, OpenFEC (candidates + committee totals), OpenStates,
 * BLS LAUS — with source-health + verified-facts discipline.
 * Dashboard route and (later) signup both call this; do not duplicate fetches.
 *
 * Snapshots are tenant-scoped (organization_id + district_key) with TTL reuse.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getConnection, openSql } from '@/app/utils/database/db';

export type SourceStatus = 'ok' | 'partial' | 'unavailable';

export const ABBREV_TO_STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export const STATE_FIPS_MAP: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13',
  HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25',
  MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36',
  NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48',
  UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};

/** Default snapshot freshness — override with DISTRICT_INTEL_TTL_HOURS. */
export const DEFAULT_DISTRICT_INTEL_TTL_MS =
  (Number(process.env.DISTRICT_INTEL_TTL_HOURS) > 0
    ? Number(process.env.DISTRICT_INTEL_TTL_HOURS)
    : 24) *
  60 *
  60 *
  1000;

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export type CampaignOfficeType =
  | 'federal_house'
  | 'federal_senate'
  | 'state_house'
  | 'state_senate'
  | 'governor'
  | 'city_council'
  | 'county'
  | string;

/**
 * Parse campaign district codes:
 *   NJ-5 / NJ05     → federal house
 *   NJ-LD-12        → state house (lower)
 *   NJ-SD-5         → state senate (upper)
 */
export function parseCampaignDistrict(raw: string): {
  state: string;
  districtNumber: number;
  label: string;
  officeType: 'federal_house' | 'state_house' | 'state_senate';
} | null {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  const lege = s.match(/^([A-Z]{2})-?(LD|SD)-?(\d{1,3})$/);
  if (lege && STATE_FIPS_MAP[lege[1]]) {
    const districtNumber = parseInt(lege[3], 10);
    if (!Number.isFinite(districtNumber) || districtNumber < 0) return null;
    const officeType =
      lege[2] === 'SD' ? ('state_senate' as const) : ('state_house' as const);
    const prefix = lege[2];
    return {
      state: lege[1],
      districtNumber,
      label: `${lege[1]}-${prefix}-${districtNumber}`,
      officeType,
    };
  }
  const house = s.match(/^([A-Z]{2})-?(\d{1,2})$/);
  if (house && STATE_FIPS_MAP[house[1]]) {
    const districtNumber = parseInt(house[2], 10);
    if (!Number.isFinite(districtNumber) || districtNumber < 0 || districtNumber > 53)
      return null;
    return {
      state: house[1],
      districtNumber,
      label: `${house[1]}-${districtNumber}`,
      officeType: 'federal_house',
    };
  }
  return null;
}

export function isCongressionalOffice(
  officeType: string | null | undefined
): boolean {
  return (
    !officeType ||
    officeType === 'federal_house' ||
    officeType === 'federal_senate'
  );
}

export async function safeJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type OpenStatesLegislator = {
  name: string;
  party: string | null;
  chamber: string | null;
  district: string | null;
  role: string | null;
};

export type OpenStatesBill = {
  identifier: string;
  title: string;
  latestAction: string | null;
  updatedAt: string | null;
};

export type FecZipBucket = {
  zip: string;
  count: number;
  amount: number;
};

export type ExternalDistrictData = {
  censusStatus: SourceStatus;
  cbpStatus: SourceStatus;
  blsStatus: SourceStatus;
  fecStatus: SourceStatus;
  fecTotalsStatus: SourceStatus;
  /** Congressional-tier only — Schedule A itemized ZIP geography */
  fecItemizedStatus: SourceStatus;
  openStatesStatus: SourceStatus;
  ballotpediaStatus: SourceStatus;
  mitElectionLabStatus: SourceStatus;
  censusPreview: unknown[] | null;
  cbpPreview: unknown[] | null;
  blsLatest: { period: string; year: string; value: string } | null;
  fecPreview: unknown[] | null;
  fecTotals: Record<string, unknown> | null;
  fecItemizedByZip: FecZipBucket[] | null;
  openStatesPreview: unknown[] | null;
  /** D3 — state-lege representation + recent bill activity (bounded) */
  openStatesDepth: {
    legislators: OpenStatesLegislator[];
    recentBills: OpenStatesBill[];
  } | null;
};

export type DistrictIntelPayload = {
  status: true;
  /** True when a row existed in political_data_districts */
  dbRecordFound: boolean;
  district: {
    districtCode: string;
    state: string;
    districtNumber: number;
    pvi: string | null;
    pviNumeric: number;
    margin2024: number;
    incumbentName: string | null;
    incumbentParty: string | null;
    demographics: {
      totalPopulation: number | null;
      medianHouseholdIncome: number | null;
      bachelorsOrHigherPct: number | null;
      medianAge: number | null;
    };
  };
  external: ExternalDistrictData;
  intelligence: {
    narrative: string;
    recommendedNextSteps: string[];
  };
};

export type SourcesHealth = {
  census: SourceStatus;
  cbp: SourceStatus;
  bls: SourceStatus;
  fecCandidates: SourceStatus;
  fecTotals: SourceStatus;
  fecItemized: SourceStatus;
  openStates: SourceStatus;
  ballotpedia: SourceStatus;
  mitElectionLab: SourceStatus;
};

export function sourcesHealthFromExternal(
  external: ExternalDistrictData
): SourcesHealth {
  return {
    census: external.censusStatus,
    cbp: external.cbpStatus,
    bls: external.blsStatus,
    fecCandidates: external.fecStatus,
    fecTotals: external.fecTotalsStatus,
    fecItemized: external.fecItemizedStatus,
    openStates: external.openStatesStatus,
    ballotpedia: external.ballotpediaStatus,
    mitElectionLab: external.mitElectionLabStatus,
  };
}

function emptyExternal(): ExternalDistrictData {
  return {
    censusStatus: 'unavailable',
    cbpStatus: 'unavailable',
    blsStatus: 'unavailable',
    fecStatus: 'unavailable',
    fecTotalsStatus: 'unavailable',
    fecItemizedStatus: 'unavailable',
    openStatesStatus: 'unavailable',
    ballotpediaStatus: 'unavailable',
    mitElectionLabStatus: 'unavailable',
    censusPreview: null,
    cbpPreview: null,
    blsLatest: null,
    fecPreview: null,
    fecTotals: null,
    fecItemizedByZip: null,
    openStatesPreview: null,
    openStatesDepth: null,
  };
}

function parseOpenStatesDepth(
  peopleRaw: any,
  billsRaw: any,
  districtHint?: number | null
): {
  legislators: OpenStatesLegislator[];
  recentBills: OpenStatesBill[];
} {
  const people = Array.isArray(peopleRaw?.results) ? peopleRaw.results : [];
  const legislators: OpenStatesLegislator[] = [];
  for (const p of people.slice(0, 40)) {
    const roles = Array.isArray(p.roles) ? p.roles : [];
    const current =
      roles.find((r: any) => r?.type === 'member' || r?.org_classification) ||
      roles[0];
    const chamber =
      current?.org_classification ||
      current?.chamber ||
      (String(current?.title || '').toLowerCase().includes('senate')
        ? 'upper'
        : String(current?.title || '').toLowerCase().includes('assembly') ||
            String(current?.title || '').toLowerCase().includes('house')
          ? 'lower'
          : null);
    const district =
      current?.district != null ? String(current.district) : null;
    if (
      districtHint != null &&
      district != null &&
      String(districtHint) !== String(parseInt(district, 10)) &&
      String(districtHint) !== district
    ) {
      // Prefer matching district when hint provided; still keep a few statewide
      // if none match — collected in second pass below
      continue;
    }
    legislators.push({
      name: String(p.name || 'Unknown'),
      party: p.party != null ? String(p.party) : null,
      chamber: chamber != null ? String(chamber) : null,
      district,
      role: current?.title != null ? String(current.title) : null,
    });
    if (legislators.length >= 8) break;
  }
  // If district filter emptied the list, fall back to first 6 statewide
  if (!legislators.length && people.length) {
    for (const p of people.slice(0, 6)) {
      const roles = Array.isArray(p.roles) ? p.roles : [];
      const current = roles[0];
      legislators.push({
        name: String(p.name || 'Unknown'),
        party: p.party != null ? String(p.party) : null,
        chamber:
          current?.org_classification != null
            ? String(current.org_classification)
            : null,
        district:
          current?.district != null ? String(current.district) : null,
        role: current?.title != null ? String(current.title) : null,
      });
    }
  }

  const bills = Array.isArray(billsRaw?.results) ? billsRaw.results : [];
  const recentBills: OpenStatesBill[] = bills.slice(0, 5).map((b: any) => {
    const actions = Array.isArray(b.actions) ? b.actions : [];
    const latest = actions[actions.length - 1] || actions[0];
    return {
      identifier: String(b.identifier || b.id || '—'),
      title: String(b.title || '').slice(0, 200),
      latestAction: latest?.description
        ? String(latest.description).slice(0, 160)
        : latest?.classification
          ? String(
              Array.isArray(latest.classification)
                ? latest.classification[0]
                : latest.classification
            )
          : null,
      updatedAt: b.updated_at ? String(b.updated_at) : null,
    };
  });

  return { legislators, recentBills };
}

async function fetchFecItemizedByZip(
  committeeId: string,
  fecKey: string
): Promise<{ status: SourceStatus; byZip: FecZipBucket[] }> {
  // Congressional-tier only — Schedule A individual contributions, capped.
  const url =
    `https://api.open.fec.gov/v1/schedules/schedule_a/` +
    `?api_key=${encodeURIComponent(fecKey)}` +
    `&committee_id=${encodeURIComponent(committeeId)}` +
    `&is_individual=true&per_page=50&sort=-contribution_receipt_amount`;
  const raw = await safeJson(url);
  if (!raw?.results) return { status: 'unavailable', byZip: [] };
  const buckets = new Map<string, { count: number; amount: number }>();
  for (const row of raw.results) {
    const zip = String(row.contributor_zip || '')
      .replace(/\D/g, '')
      .slice(0, 5);
    if (zip.length < 5) continue;
    const amt = Number(row.contribution_receipt_amount) || 0;
    const prev = buckets.get(zip) || { count: 0, amount: 0 };
    buckets.set(zip, { count: prev.count + 1, amount: prev.amount + amt });
  }
  const byZip = [...buckets.entries()]
    .map(([zip, v]) => ({ zip, count: v.count, amount: Math.round(v.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  return {
    status: byZip.length ? 'ok' : 'partial',
    byZip,
  };
}

/**
 * Live external-API fetching — identical whether or not the district exists
 * in political_data_districts. Degrades gracefully; never fabricates.
 *
 * @param opts.officeType — when state_house/state_senate, still pull OpenStates
 *   depth; FEC itemized only for congressional (federal_house / default).
 * @param opts.includeFecItemized — default true for congressional-tier only.
 */
export async function fetchExternalDistrictData(
  stateAbbrev: string,
  districtNumber: number,
  opts?: {
    officeType?: string | null;
    includeFecItemized?: boolean;
  }
): Promise<ExternalDistrictData> {
  const stateFips = STATE_FIPS_MAP[stateAbbrev];
  const districtPadded = districtNumber
    ? String(districtNumber).padStart(2, '0')
    : '';
  const officeType = opts?.officeType || 'federal_house';
  const isCongressional =
    !officeType ||
    officeType === 'federal_house' ||
    officeType === 'federal_senate';
  const wantItemized =
    opts?.includeFecItemized !== false && officeType === 'federal_house';

  const censusKey = process.env.CENSUS_API_KEY;
  const censusKeyParam = censusKey
    ? `&key=${encodeURIComponent(censusKey)}`
    : '';

  // Census ACS/CBP are congressional-district geography — skip for state-lege
  // rather than fabricating district-level figures from CD APIs.
  let censusStatus: SourceStatus = 'unavailable';
  let censusRaw: any = null;
  let cbpStatus: SourceStatus = 'unavailable';
  let cbpRaw: any = null;
  if (isCongressional && stateFips && districtPadded) {
    const censusUrl = `https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP05_0001E,DP03_0062E,DP03_0009PE,DP02_0067PE&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`;
    censusRaw = await safeJson(censusUrl);
    censusStatus = censusRaw ? 'ok' : 'partial';
    const cbpUrl = censusKey
      ? `https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,EMP,PAYANN&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`
      : '';
    cbpRaw = cbpUrl ? await safeJson(cbpUrl) : null;
    cbpStatus = !censusKey ? 'unavailable' : cbpRaw ? 'ok' : 'partial';
  }

  const fecKey = (process.env.FEC_API_KEY || 'DEMO_KEY').trim();
  let fecStatus: SourceStatus = 'unavailable';
  let fecRaw: any = null;
  let fecTotals: Record<string, unknown> | null = null;
  let fecTotalsStatus: SourceStatus = 'unavailable';
  let fecItemizedStatus: SourceStatus = 'unavailable';
  let fecItemizedByZip: FecZipBucket[] | null = null;

  if (isCongressional) {
    const fecUrl = `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(fecKey)}&office=H&state=${stateAbbrev}&district=${districtNumber}&per_page=5&sort=-election_years`;
    fecRaw = await safeJson(fecUrl);
    fecStatus = fecRaw ? 'ok' : 'unavailable';
    const topCommitteeId =
      fecRaw?.results?.[0]?.principal_committees?.[0]?.committee_id;
    if (topCommitteeId) {
      const totalsUrl = `https://api.open.fec.gov/v1/committee/${topCommitteeId}/totals/?api_key=${encodeURIComponent(fecKey)}&per_page=1&sort=-cycle`;
      const totalsRaw = await safeJson(totalsUrl);
      fecTotals = totalsRaw?.results?.[0] || null;
      fecTotalsStatus = fecTotals ? 'ok' : 'unavailable';
      if (wantItemized) {
        const itemized = await fetchFecItemizedByZip(topCommitteeId, fecKey);
        fecItemizedStatus = itemized.status;
        fecItemizedByZip = itemized.byZip.length ? itemized.byZip : null;
      }
    }
  }

  const openStatesKey = process.env.OPENSTATES_API_KEY;
  let openStatesStatus: SourceStatus = 'unavailable';
  let openStatesRaw: any = null;
  let billsRaw: any = null;
  if (openStatesKey) {
    const peopleUrl = `https://v3.openstates.org/people?jurisdiction=${encodeURIComponent(stateAbbrev)}&include=roles&per_page=20&apikey=${encodeURIComponent(openStatesKey)}`;
    openStatesRaw = await safeJson(peopleUrl);
    const billsUrl = `https://v3.openstates.org/bills?jurisdiction=${encodeURIComponent(stateAbbrev)}&sort=updated_desc&per_page=5&apikey=${encodeURIComponent(openStatesKey)}`;
    billsRaw = await safeJson(billsUrl);
    openStatesStatus =
      openStatesRaw || billsRaw
        ? openStatesRaw && billsRaw
          ? 'ok'
          : 'partial'
        : 'unavailable';
  }

  const openStatesDepth =
    openStatesStatus !== 'unavailable'
      ? parseOpenStatesDepth(
          openStatesRaw,
          billsRaw,
          officeType === 'state_house' || officeType === 'state_senate'
            ? districtNumber
            : null
        )
      : null;

  const blsKey = process.env.BLS_API_KEY;
  let blsLatest: { period: string; year: string; value: string } | null = null;
  let blsStatus: SourceStatus = 'unavailable';
  if (stateFips) {
    const seriesId = `LASST${stateFips}0000000000003`;
    const currentYear = new Date().getFullYear();
    const blsBody: Record<string, unknown> = {
      seriesid: [seriesId],
      startyear: String(currentYear - 1),
      endyear: String(currentYear),
    };
    if (blsKey) blsBody.registrationkey = blsKey;
    try {
      const res = await fetch(
        'https://api.bls.gov/publicAPI/v2/timeseries/data/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(blsBody),
        }
      );
      const json = res.ok ? await res.json() : null;
      const point = json?.Results?.series?.[0]?.data?.[0];
      if (point) {
        blsLatest = {
          period: point.periodName,
          year: point.year,
          value: point.value,
        };
        blsStatus = 'ok';
      }
    } catch {
      // leave blsStatus as unavailable
    }
  }

  return {
    censusStatus,
    cbpStatus,
    blsStatus,
    fecStatus,
    fecTotalsStatus,
    fecItemizedStatus,
    openStatesStatus,
    ballotpediaStatus: 'unavailable',
    mitElectionLabStatus: 'unavailable',
    censusPreview: Array.isArray(censusRaw) ? censusRaw.slice(0, 2) : null,
    cbpPreview: Array.isArray(cbpRaw) ? cbpRaw.slice(0, 2) : null,
    blsLatest,
    fecPreview: fecRaw?.results?.slice?.(0, 3) || null,
    fecTotals,
    fecItemizedByZip,
    openStatesPreview: openStatesRaw?.results?.slice?.(0, 3) || null,
    openStatesDepth,
  };
}

function buildNarrative(
  districtCode: string,
  local: Record<string, unknown> | null,
  external: ExternalDistrictData
): string {
  if (!local) {
    return `${districtCode}: no internal database record yet for this district — relying on live Census/BLS/FEC data plus web research for this report. Data source health -> Census ACS: ${external.censusStatus}, Census CBP: ${external.cbpStatus}, BLS: ${external.blsStatus}, FEC candidates: ${external.fecStatus}, FEC totals: ${external.fecTotalsStatus}.`;
  }
  return [
    `${districtCode} baseline: PVI ${local.cook_pvi || 'N/A'}, 2024 margin ${parseFloat(String(local.margin_2024 || 0)).toFixed(1)}.`,
    `Incumbent: ${local.incumbent_name || 'Unknown'} (${local.incumbent_party || 'N/A'}).`,
    `Demographics: pop ${local.total_population ? Number(local.total_population).toLocaleString() : 'N/A'}, median HH income ${local.median_household_income ? `$${Number(local.median_household_income).toLocaleString()}` : 'N/A'}, median age ${local.median_age || 'N/A'}.`,
    `Data source health -> Census ACS: ${external.censusStatus}, Census CBP: ${external.cbpStatus}, BLS: ${external.blsStatus}, FEC candidates: ${external.fecStatus}, FEC totals: ${external.fecTotalsStatus}, OpenStates: ${external.openStatesStatus}, Ballotpedia: ${external.ballotpediaStatus} (link-out only), MIT Election Lab: ${external.mitElectionLabStatus} (link-out / web-search target only, not a verified API).`,
  ].join(' ');
}

const DEFAULT_NEXT_STEPS = [
  'Open district in chat to run scenario strategy and messaging tests.',
  'Compare fundraising and turnout proxies vs adjacent districts.',
  'Build a voter-contact geofence plan around high-priority precincts.',
];

/**
 * Build base district intel from internal DB + live external APIs.
 * When the DB row is missing, pass fallbackState/fallbackDistrictNumber
 * (map click / signup) to still return live external data.
 */
export async function buildDistrictIntelBase(input: {
  districtCode: string;
  fallbackState?: string | null;
  fallbackDistrictNumber?: number | null;
  officeType?: string | null;
}): Promise<
  | DistrictIntelPayload
  | { error: string; status: 400 | 404 }
> {
  const districtCode = String(input.districtCode || '')
    .trim()
    .toUpperCase();
  if (!districtCode) {
    return { error: 'districtCode is required', status: 400 };
  }

  const parsed = parseCampaignDistrict(districtCode);
  const officeType =
    input.officeType || parsed?.officeType || 'federal_house';

  const db = await getConnection();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT d.*, demo.total_population, demo.median_household_income, demo.bachelors_or_higher_pct, demo.median_age, demo.source_year
     FROM political_data_districts d
     LEFT JOIN political_data_district_demographics demo ON demo.district_code = d.district_code
     WHERE d.district_code = ?
     LIMIT 1`,
    [districtCode]
  );
  const local = rows?.[0] || null;

  if (!local) {
    const clientState = String(input.fallbackState || parsed?.state || '')
      .trim()
      .toUpperCase();
    const clientDistrictNumber = Number(
      input.fallbackDistrictNumber ?? parsed?.districtNumber ?? 0
    );
    if (!clientState) {
      return { error: 'District not found', status: 404 };
    }
    const external = await fetchExternalDistrictData(
      clientState,
      clientDistrictNumber,
      { officeType }
    );
    return {
      status: true,
      dbRecordFound: false,
      district: {
        districtCode,
        state: clientState,
        districtNumber: clientDistrictNumber,
        pvi: null,
        pviNumeric: 0,
        margin2024: 0,
        incumbentName: null,
        incumbentParty: null,
        demographics: {
          totalPopulation: null,
          medianHouseholdIncome: null,
          bachelorsOrHigherPct: null,
          medianAge: null,
        },
      },
      external,
      intelligence: {
        narrative: buildNarrative(districtCode, null, external),
        recommendedNextSteps: [...DEFAULT_NEXT_STEPS],
      },
    };
  }

  const stateAbbrev = String(local.state || '').toUpperCase();
  const districtNumber = Number(local.district_number || 0);
  const external = await fetchExternalDistrictData(stateAbbrev, districtNumber, {
    officeType,
  });

  return {
    status: true,
    dbRecordFound: true,
    district: {
      districtCode,
      state: stateAbbrev,
      districtNumber,
      pvi: local.cook_pvi != null ? String(local.cook_pvi) : null,
      pviNumeric: parseFloat(String(local.cook_pvi_numeric || 0)),
      margin2024: parseFloat(String(local.margin_2024 || 0)),
      incumbentName: local.incumbent_name
        ? String(local.incumbent_name)
        : null,
      incumbentParty: local.incumbent_party
        ? String(local.incumbent_party)
        : null,
      demographics: {
        totalPopulation: local.total_population
          ? Number(local.total_population)
          : null,
        medianHouseholdIncome: local.median_household_income
          ? Number(local.median_household_income)
          : null,
        bachelorsOrHigherPct: local.bachelors_or_higher_pct
          ? Number(local.bachelors_or_higher_pct)
          : null,
        medianAge: local.median_age ? Number(local.median_age) : null,
      },
    },
    external,
    intelligence: {
      narrative: buildNarrative(districtCode, local, external),
      recommendedNextSteps: [...DEFAULT_NEXT_STEPS],
    },
  };
}

/** Antelope-verified facts — only real API-sourced points, each labeled. */
export function buildVerifiedFacts(
  base: Pick<DistrictIntelPayload, 'district' | 'external'>,
  stateName?: string
): string[] {
  const name =
    stateName ||
    ABBREV_TO_STATE_NAME[base.district.state] ||
    base.district.state;
  const verifiedFacts: string[] = [];
  if (base.district.pvi) {
    verifiedFacts.push(
      `Cook PVI: ${base.district.pvi} (Antelope internal database)`
    );
  }
  if (base.district.margin2024) {
    verifiedFacts.push(
      `2024 margin: ${base.district.margin2024.toFixed(1)} (Antelope internal database)`
    );
  }
  if (base.district.incumbentName) {
    verifiedFacts.push(
      `Incumbent: ${base.district.incumbentName} (${base.district.incumbentParty || 'party N/A'}) (Antelope internal database)`
    );
  }
  if (base.district.demographics?.totalPopulation) {
    verifiedFacts.push(
      `Population: ${base.district.demographics.totalPopulation.toLocaleString()} (Census ACS 5-year)`
    );
  }
  if (base.district.demographics?.medianHouseholdIncome) {
    verifiedFacts.push(
      `Median household income: $${base.district.demographics.medianHouseholdIncome.toLocaleString()} (Census ACS 5-year)`
    );
  }
  if (base.external.blsLatest) {
    verifiedFacts.push(
      `${name} state unemployment rate: ${base.external.blsLatest.value}% as of ${base.external.blsLatest.period} ${base.external.blsLatest.year} (BLS LAUS — state-level, not district-level; no district-level unemployment series exists)`
    );
  }
  const cbpRow = Array.isArray(base.external.cbpPreview)
    ? base.external.cbpPreview[1]
    : null;
  if (Array.isArray(cbpRow)) {
    const [, estab, emp, payann] = cbpRow;
    verifiedFacts.push(
      `Business establishments in district: ${estab}, employment: ${emp}, annual payroll: $${payann}k (Census County Business Patterns)`
    );
  }
  const t = base.external.fecTotals as
    | {
        committee_name?: string;
        receipts?: number;
        individual_contributions?: number;
        cycle?: number;
      }
    | null;
  if (t?.receipts) {
    verifiedFacts.push(
      `Leading candidate committee "${t.committee_name}" total receipts: $${Number(t.receipts).toLocaleString()}${
        t.individual_contributions
          ? `, individual contributions: $${Number(t.individual_contributions).toLocaleString()}`
          : ''
      } for cycle ${t.cycle} (OpenFEC committee totals)`
    );
  }
  if (base.external.fecItemizedByZip?.length) {
    const top = base.external.fecItemizedByZip[0];
    verifiedFacts.push(
      `Top donor ZIP ${top.zip}: $${top.amount.toLocaleString()} across ${top.count} itemized individual contribution(s) (OpenFEC Schedule A sample)`
    );
  }
  const depth = base.external.openStatesDepth;
  if (depth?.legislators?.length) {
    const names = depth.legislators
      .slice(0, 3)
      .map((l) => `${l.name}${l.district ? ` (dist. ${l.district})` : ''}`)
      .join('; ');
    verifiedFacts.push(
      `State legislators (sample): ${names} (OpenStates)`
    );
  }
  if (depth?.recentBills?.length) {
    verifiedFacts.push(
      `Recent state bill activity: ${depth.recentBills[0].identifier} — ${depth.recentBills[0].title.slice(0, 80)} (OpenStates)`
    );
  }
  return verifiedFacts;
}

async function readSnapshot(input: {
  organizationId: number;
  districtKey: string;
  ttlMs: number;
}): Promise<{
  payload: DistrictIntelPayload;
  sourcesHealth: SourcesHealth;
  generatedAt: string;
} | null> {
  try {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT payload, sources_health, generated_at, status
       FROM district_intel_snapshots
       WHERE organization_id = ? AND district_key = ?
       LIMIT 1`,
      [input.organizationId, input.districtKey]
    );
    if (!rows.length) return null;
    const rowStatus = String(rows[0].status || 'ready');
    if (rowStatus !== 'ready') return null;
    const generatedAt = new Date(rows[0].generated_at);
    if (Number.isNaN(generatedAt.getTime())) return null;
    if (Date.now() - generatedAt.getTime() > input.ttlMs) return null;

    let payload = rows[0].payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        return null;
      }
    }
    let sourcesHealth = rows[0].sources_health;
    if (typeof sourcesHealth === 'string') {
      try {
        sourcesHealth = JSON.parse(sourcesHealth);
      } catch {
        sourcesHealth = {};
      }
    }
    if (!payload || payload.status !== true) return null;
    return {
      payload: payload as DistrictIntelPayload,
      sourcesHealth: sourcesHealth as SourcesHealth,
      generatedAt: generatedAt.toISOString(),
    };
  } catch (err) {
    // Table may not exist yet in some envs — degrade to live fetch
    console.warn('[district-intel-service] snapshot read skipped', err);
    return null;
  }
}

export async function writeDistrictIntelSnapshot(input: {
  organizationId: number;
  districtKey: string;
  payload: DistrictIntelPayload;
}): Promise<void> {
  const health = sourcesHealthFromExternal(input.payload.external);
  try {
    const sql = await openSql();
    await sql.execute<ResultSetHeader>(
      `INSERT INTO district_intel_snapshots
        (organization_id, district_key, payload, sources_health, status, error_message, generated_at)
       VALUES (?, ?, ?, ?, 'ready', NULL, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         payload = VALUES(payload),
         sources_health = VALUES(sources_health),
         status = 'ready',
         error_message = NULL,
         generated_at = UTC_TIMESTAMP()`,
      [
        input.organizationId,
        input.districtKey.slice(0, 32),
        JSON.stringify(input.payload),
        JSON.stringify(health),
      ]
    );
  } catch (err) {
    console.warn('[district-intel-service] snapshot write skipped', err);
  }
}

/**
 * Tenant-scoped get-or-build: return fresh snapshot if within TTL, else
 * refetch external sources, persist, and return.
 */
export async function getOrBuildDistrictIntel(input: {
  organizationId: number;
  districtCode: string;
  fallbackState?: string | null;
  fallbackDistrictNumber?: number | null;
  officeType?: string | null;
  forceRefresh?: boolean;
  ttlMs?: number;
}): Promise<
  | (DistrictIntelPayload & {
      cached: boolean;
      generatedAt: string;
      sourcesHealth: SourcesHealth;
      dbRecordFound: boolean;
    })
  | { error: string; status: 400 | 404 }
> {
  const districtKey = String(input.districtCode || '')
    .trim()
    .toUpperCase()
    .slice(0, 32);
  const ttlMs = input.ttlMs ?? DEFAULT_DISTRICT_INTEL_TTL_MS;

  if (!input.forceRefresh && input.organizationId > 0) {
    const cached = await readSnapshot({
      organizationId: input.organizationId,
      districtKey,
      ttlMs,
    });
    if (cached) {
      return {
        ...cached.payload,
        cached: true,
        generatedAt: cached.generatedAt,
        sourcesHealth: cached.sourcesHealth,
        dbRecordFound: Boolean(cached.payload.dbRecordFound),
      };
    }
  }

  const built = await buildDistrictIntelBase({
    districtCode: districtKey,
    fallbackState: input.fallbackState,
    fallbackDistrictNumber: input.fallbackDistrictNumber,
    officeType: input.officeType,
  });
  if ('error' in built) return built;

  if (input.organizationId > 0) {
    await writeDistrictIntelSnapshot({
      organizationId: input.organizationId,
      districtKey,
      payload: built,
    });
  }

  return {
    ...built,
    cached: false,
    generatedAt: new Date().toISOString(),
    sourcesHealth: sourcesHealthFromExternal(built.external),
  };
}

export type SnapshotJobStatus = 'none' | 'pending' | 'ready' | 'failed';

export type OnboardingReportView = {
  districtCode: string;
  state: string;
  districtNumber: number;
  headline: string;
  narrative: string;
  demographics: DistrictIntelPayload['district']['demographics'];
  pvi: string | null;
  incumbentName: string | null;
  incumbentParty: string | null;
  fundraising: {
    status: SourceStatus;
    committeeName: string | null;
    receipts: number | null;
    individualContributions: number | null;
    cycle: number | null;
    sampleCandidates: { name: string; party: string }[];
    /** Congressional-tier Schedule A ZIP geography (optional depth) */
    donorZips: FecZipBucket[] | null;
  };
  localOfficials: {
    status: SourceStatus;
    sample: { name: string; role: string }[];
    /** D3 OpenStates depth */
    legislators: OpenStatesLegislator[];
    recentBills: OpenStatesBill[];
  };
  verifiedFacts: string[];
  sourcesHealth: SourcesHealth;
  generatedAt: string;
};

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

/** Read job row (any status) for onboarding polling. */
export async function getDistrictIntelJob(input: {
  organizationId: number;
  districtKey: string;
}): Promise<{
  status: SnapshotJobStatus;
  payload: DistrictIntelPayload | null;
  sourcesHealth: SourcesHealth | null;
  generatedAt: string | null;
  errorMessage: string | null;
} | null> {
  try {
    const sql = await openSql();
    const [rows] = await sql.execute<RowDataPacket[]>(
      `SELECT payload, sources_health, generated_at, status, error_message
       FROM district_intel_snapshots
       WHERE organization_id = ? AND district_key = ?
       LIMIT 1`,
      [input.organizationId, input.districtKey.slice(0, 32)]
    );
    if (!rows.length) return null;
    const st = String(rows[0].status || 'ready') as 'pending' | 'ready' | 'failed';
    const payload = parseJsonField<DistrictIntelPayload | null>(
      rows[0].payload,
      null
    );
    const sourcesHealth = parseJsonField<SourcesHealth | null>(
      rows[0].sources_health,
      null
    );
    return {
      status: st,
      payload: payload?.status === true ? payload : null,
      sourcesHealth,
      generatedAt: rows[0].generated_at
        ? new Date(rows[0].generated_at).toISOString()
        : null,
      errorMessage:
        rows[0].error_message != null ? String(rows[0].error_message) : null,
    };
  } catch (err) {
    console.warn('[district-intel-service] job read skipped', err);
    return null;
  }
}

async function markSnapshotPending(input: {
  organizationId: number;
  districtKey: string;
}): Promise<void> {
  const sql = await openSql();
  const stub = {
    status: true,
    dbRecordFound: false,
    district: {
      districtCode: input.districtKey,
      state: '',
      districtNumber: 0,
      pvi: null,
      pviNumeric: 0,
      margin2024: 0,
      incumbentName: null,
      incumbentParty: null,
      demographics: {
        totalPopulation: null,
        medianHouseholdIncome: null,
        bachelorsOrHigherPct: null,
        medianAge: null,
      },
    },
    external: emptyExternal(),
    intelligence: {
      narrative: 'Gathering district data…',
      recommendedNextSteps: [],
    },
  };
  await sql.execute(
    `INSERT INTO district_intel_snapshots
      (organization_id, district_key, payload, sources_health, status, error_message, generated_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       status = 'pending',
       error_message = NULL,
       generated_at = UTC_TIMESTAMP()`,
    [
      input.organizationId,
      input.districtKey.slice(0, 32),
      JSON.stringify(stub),
      JSON.stringify({}),
    ]
  );
}

async function markSnapshotFailed(input: {
  organizationId: number;
  districtKey: string;
  message: string;
}): Promise<void> {
  try {
    const sql = await openSql();
    await sql.execute(
      `UPDATE district_intel_snapshots
       SET status = 'failed', error_message = ?, generated_at = UTC_TIMESTAMP()
       WHERE organization_id = ? AND district_key = ?`,
      [input.message.slice(0, 500), input.organizationId, input.districtKey.slice(0, 32)]
    );
  } catch (err) {
    console.warn('[district-intel-service] mark failed skipped', err);
  }
}

/**
 * Fire-and-forget generation for signup / first district selection.
 * Does not block the request on external APIs.
 */
export function scheduleDistrictIntelGeneration(input: {
  organizationId: number;
  districtCode: string;
  state?: string | null;
  districtNumber?: number | null;
  officeType?: string | null;
}): { started: boolean; districtKey: string } {
  const parsed = parseCampaignDistrict(input.districtCode);
  const districtKey = String(parsed?.label || input.districtCode || '')
    .trim()
    .toUpperCase()
    .slice(0, 32);
  if (!input.organizationId || !districtKey) {
    return { started: false, districtKey };
  }
  const officeType =
    input.officeType || parsed?.officeType || 'federal_house';
  const state = input.state || parsed?.state || null;
  const districtNumber =
    input.districtNumber ?? parsed?.districtNumber ?? null;

  void (async () => {
    try {
      // Skip if a fresh ready snapshot already exists
      const existing = await readSnapshot({
        organizationId: input.organizationId,
        districtKey,
        ttlMs: DEFAULT_DISTRICT_INTEL_TTL_MS,
      });
      if (existing) return;

      await markSnapshotPending({
        organizationId: input.organizationId,
        districtKey,
      });

      const result = await getOrBuildDistrictIntel({
        organizationId: input.organizationId,
        districtCode: districtKey,
        fallbackState: state,
        fallbackDistrictNumber: districtNumber,
        officeType,
        forceRefresh: true,
      });
      if ('error' in result) {
        await markSnapshotFailed({
          organizationId: input.organizationId,
          districtKey,
          message: result.error,
        });
      }
    } catch (err) {
      console.error('[scheduleDistrictIntelGeneration]', err);
      await markSnapshotFailed({
        organizationId: input.organizationId,
        districtKey,
        message: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  })();

  return { started: true, districtKey };
}

/** Shape a ready snapshot into the onboarding report card. */
export function toOnboardingReportView(
  payload: DistrictIntelPayload,
  sourcesHealth: SourcesHealth,
  generatedAt: string
): OnboardingReportView {
  const stateName =
    ABBREV_TO_STATE_NAME[payload.district.state] || payload.district.state;
  const verifiedFacts = buildVerifiedFacts(payload, stateName);
  const totals = payload.external.fecTotals as
    | {
        committee_name?: string;
        receipts?: number;
        individual_contributions?: number;
        cycle?: number;
      }
    | null;
  const sampleCandidates = (
    Array.isArray(payload.external.fecPreview)
      ? payload.external.fecPreview
      : []
  )
    .slice(0, 4)
    .map((c: any) => ({
      name: String(c?.name || 'Unknown'),
      party: String(c?.party_full || c?.party || '—'),
    }));

  const sampleOfficials =
    payload.external.openStatesDepth?.legislators?.length
      ? payload.external.openStatesDepth.legislators.slice(0, 6).map((l) => ({
          name: l.name,
          role: [l.role, l.chamber, l.district ? `dist. ${l.district}` : null]
            .filter(Boolean)
            .join(' · ') || 'Legislator',
        }))
      : (
          Array.isArray(payload.external.openStatesPreview)
            ? payload.external.openStatesPreview
            : []
        )
          .slice(0, 4)
          .map((p: any) => {
            const role =
              p?.current_role?.title ||
              p?.roles?.[0]?.title ||
              p?.roles?.[0]?.type ||
              'Legislator';
            return {
              name: String(p?.name || 'Unknown'),
              role: String(role),
            };
          });

  const districtLabel = payload.district.districtNumber
    ? `${stateName}'s ${ordinal(payload.district.districtNumber)} District`
    : `${stateName} (${payload.district.districtCode})`;

  return {
    districtCode: payload.district.districtCode,
    state: payload.district.state,
    districtNumber: payload.district.districtNumber,
    headline: `District Intelligence · ${districtLabel}`,
    narrative: payload.intelligence.narrative,
    demographics: payload.district.demographics,
    pvi: payload.district.pvi,
    incumbentName: payload.district.incumbentName,
    incumbentParty: payload.district.incumbentParty,
    fundraising: {
      status: payload.external.fecTotalsStatus || payload.external.fecStatus,
      committeeName: totals?.committee_name || null,
      receipts: totals?.receipts != null ? Number(totals.receipts) : null,
      individualContributions:
        totals?.individual_contributions != null
          ? Number(totals.individual_contributions)
          : null,
      cycle: totals?.cycle != null ? Number(totals.cycle) : null,
      sampleCandidates,
      donorZips: payload.external.fecItemizedByZip,
    },
    localOfficials: {
      status: payload.external.openStatesStatus,
      sample: sampleOfficials,
      legislators: payload.external.openStatesDepth?.legislators || [],
      recentBills: payload.external.openStatesDepth?.recentBills || [],
    },
    verifiedFacts,
    sourcesHealth,
    generatedAt,
  };
}
