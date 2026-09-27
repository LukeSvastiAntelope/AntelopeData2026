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

export async function safeJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type ExternalDistrictData = {
  censusStatus: SourceStatus;
  cbpStatus: SourceStatus;
  blsStatus: SourceStatus;
  fecStatus: SourceStatus;
  fecTotalsStatus: SourceStatus;
  openStatesStatus: SourceStatus;
  ballotpediaStatus: SourceStatus;
  mitElectionLabStatus: SourceStatus;
  censusPreview: unknown[] | null;
  cbpPreview: unknown[] | null;
  blsLatest: { period: string; year: string; value: string } | null;
  fecPreview: unknown[] | null;
  fecTotals: Record<string, unknown> | null;
  openStatesPreview: unknown[] | null;
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
    openStates: external.openStatesStatus,
    ballotpedia: external.ballotpediaStatus,
    mitElectionLab: external.mitElectionLabStatus,
  };
}

/**
 * Live external-API fetching — identical whether or not the district exists
 * in political_data_districts. Degrades gracefully; never fabricates.
 */
export async function fetchExternalDistrictData(
  stateAbbrev: string,
  districtNumber: number
): Promise<ExternalDistrictData> {
  const stateFips = STATE_FIPS_MAP[stateAbbrev];
  const districtPadded = districtNumber
    ? String(districtNumber).padStart(2, '0')
    : '';

  const censusKey = process.env.CENSUS_API_KEY;
  const censusKeyParam = censusKey
    ? `&key=${encodeURIComponent(censusKey)}`
    : '';

  const censusUrl =
    stateFips && districtPadded
      ? `https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP05_0001E,DP03_0062E,DP03_0009PE,DP02_0067PE&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`
      : '';
  const censusRaw = censusUrl ? await safeJson(censusUrl) : null;
  const censusStatus: SourceStatus = censusRaw ? 'ok' : 'partial';

  const cbpUrl =
    censusKey && stateFips && districtPadded
      ? `https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,EMP,PAYANN&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`
      : '';
  const cbpRaw = cbpUrl ? await safeJson(cbpUrl) : null;
  const cbpStatus: SourceStatus = !censusKey
    ? 'unavailable'
    : cbpRaw
      ? 'ok'
      : 'partial';

  const fecKey = (process.env.FEC_API_KEY || 'DEMO_KEY').trim();
  const fecUrl = `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(fecKey)}&office=H&state=${stateAbbrev}&district=${districtNumber}&per_page=5&sort=-election_years`;
  const fecRaw = await safeJson(fecUrl);
  const fecStatus: SourceStatus = fecRaw ? 'ok' : 'unavailable';

  let fecTotals: Record<string, unknown> | null = null;
  let fecTotalsStatus: SourceStatus = 'unavailable';
  const topCommitteeId =
    fecRaw?.results?.[0]?.principal_committees?.[0]?.committee_id;
  if (topCommitteeId) {
    const totalsUrl = `https://api.open.fec.gov/v1/committee/${topCommitteeId}/totals/?api_key=${encodeURIComponent(fecKey)}&per_page=1&sort=-cycle`;
    const totalsRaw = await safeJson(totalsUrl);
    fecTotals = totalsRaw?.results?.[0] || null;
    fecTotalsStatus = fecTotals ? 'ok' : 'unavailable';
  }

  const openStatesKey = process.env.OPENSTATES_API_KEY;
  const openStatesUrl = openStatesKey
    ? `https://v3.openstates.org/people?jurisdiction=${stateAbbrev}&include=roles&apikey=${encodeURIComponent(openStatesKey)}`
    : '';
  const openStatesRaw = openStatesUrl ? await safeJson(openStatesUrl) : null;
  const openStatesStatus: SourceStatus = openStatesRaw ? 'ok' : 'unavailable';

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
    openStatesStatus,
    ballotpediaStatus: 'unavailable',
    mitElectionLabStatus: 'unavailable',
    censusPreview: Array.isArray(censusRaw) ? censusRaw.slice(0, 2) : null,
    cbpPreview: Array.isArray(cbpRaw) ? cbpRaw.slice(0, 2) : null,
    blsLatest,
    fecPreview: fecRaw?.results?.slice?.(0, 3) || null,
    fecTotals,
    openStatesPreview: openStatesRaw?.results?.slice?.(0, 3) || null,
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
    const clientState = String(input.fallbackState || '')
      .trim()
      .toUpperCase();
    const clientDistrictNumber = Number(input.fallbackDistrictNumber || 0);
    if (!clientState) {
      return { error: 'District not found', status: 404 };
    }
    const external = await fetchExternalDistrictData(
      clientState,
      clientDistrictNumber
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
  const external = await fetchExternalDistrictData(stateAbbrev, districtNumber);

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
      `SELECT payload, sources_health, generated_at
       FROM district_intel_snapshots
       WHERE organization_id = ? AND district_key = ?
       LIMIT 1`,
      [input.organizationId, input.districtKey]
    );
    if (!rows.length) return null;
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
        (organization_id, district_key, payload, sources_health, generated_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         payload = VALUES(payload),
         sources_health = VALUES(sources_health),
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
