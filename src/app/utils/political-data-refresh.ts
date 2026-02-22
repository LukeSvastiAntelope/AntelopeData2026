import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { openSql } from '@/app/utils/database/db';

type DistrictCsvRow = {
  state: string;
  district: string;
  pvi: string;
};

export interface DistrictRefreshOptions {
  csvPath?: string;
  stateFilter?: string;
}

export interface DistrictRefreshSummary {
  sourcePath: string;
  processedRows: number;
  upsertedRows: number;
  skippedRows: number;
  stateFilter?: string;
}

export interface ExternalRefreshSummary {
  source: 'openfec' | 'census';
  state: string;
  processedRows: number;
  matchedRows: number;
  upsertedRows: number;
  skippedRows: number;
  errors: string[];
}

const STATE_TO_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10',
  FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20',
  KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28',
  MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36',
  NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45',
  SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56', DC: '11',
};

function parsePviNumeric(pvi: string): number {
  const raw = (pvi || '').trim().toUpperCase();
  if (!raw || raw === 'EVEN') return 0;
  const m = raw.match(/^([DR])\s*\+?\s*(\d+(?:\.\d+)?)$/);
  if (!m) return 0;
  const val = parseFloat(m[2]);
  return m[1] === 'D' ? val : -val;
}

function normalizeDistrictCode(state: string, district: string): { districtNumber: number; districtCode: string } | null {
  const stateAbbrev = (state || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateAbbrev)) return null;

  const d = (district || '').toString().trim().toUpperCase();
  if (!d) return null;

  // Supports values like: 11, 011, "11", "AL", "AT-LARGE"
  if (/^\d+$/.test(d)) {
    const districtNumber = parseInt(d, 10);
    if (!Number.isFinite(districtNumber) || districtNumber < 0 || districtNumber > 99) return null;
    return {
      districtNumber,
      districtCode: `${stateAbbrev}-${districtNumber.toString().padStart(2, '0')}`,
    };
  }

  if (d === 'AL' || d === 'AT-LARGE' || d === 'AT LARGE') {
    return {
      districtNumber: 0,
      districtCode: `${stateAbbrev}-AL`,
    };
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/[$,%\s,]/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchJsonWithRetry(url: string, attempts: number = 3): Promise<any> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

export async function getTrackedOrganizationStates(): Promise<string[]> {
  const db = await openSql();
  const [rows]: any = await db.execute(
    `SELECT DISTINCT UPPER(TRIM(state)) AS state
     FROM organizations
     WHERE state IS NOT NULL AND TRIM(state) <> ''
     ORDER BY state`
  );
  return rows
    .map((r: any) => (r.state || '').toUpperCase())
    .filter((s: string) => /^[A-Z]{2}$/.test(s));
}

export async function refreshDistrictPoliticalDataFromCsv(options: DistrictRefreshOptions = {}): Promise<DistrictRefreshSummary> {
  const sourcePath = options.csvPath
    ? path.resolve(options.csvPath)
    : path.join(process.cwd(), 'data', 'cook_pvi.csv');
  const stateFilter = options.stateFilter?.trim().toUpperCase();

  if (!fs.existsSync(sourcePath)) {
    return {
      sourcePath,
      processedRows: 0,
      upsertedRows: 0,
      skippedRows: 0,
      stateFilter,
    };
  }

  const rawCsv = fs.readFileSync(sourcePath, 'utf8');
  const parsed = Papa.parse<DistrictCsvRow>(rawCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }

  const db = await openSql();
  let processedRows = 0;
  let upsertedRows = 0;
  let skippedRows = 0;

  for (const row of parsed.data) {
    processedRows++;

    const rowState = (row.state || '').trim().toUpperCase();
    if (stateFilter && rowState !== stateFilter) {
      continue;
    }

    const normalized = normalizeDistrictCode(rowState, row.district || '');
    const pvi = (row.pvi || '').trim().toUpperCase();

    if (!normalized || !pvi) {
      skippedRows++;
      continue;
    }

    await db.execute(
      `INSERT INTO political_data_districts
        (state, district_number, district_code, cook_pvi, cook_pvi_numeric)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         district_code = VALUES(district_code),
         cook_pvi = CASE
           WHEN VALUES(cook_pvi) IS NULL OR VALUES(cook_pvi) = '' THEN cook_pvi
           ELSE VALUES(cook_pvi)
         END,
         cook_pvi_numeric = CASE
           WHEN VALUES(cook_pvi_numeric) IS NULL THEN cook_pvi_numeric
           ELSE VALUES(cook_pvi_numeric)
         END`,
      [rowState, normalized.districtNumber, normalized.districtCode, pvi, parsePviNumeric(pvi)]
    );

    upsertedRows++;
  }

  return {
    sourcePath,
    processedRows,
    upsertedRows,
    skippedRows,
    stateFilter,
  };
}

export async function refreshOpenFecDistrictDonations(state: string): Promise<ExternalRefreshSummary> {
  const normalizedState = (state || '').trim().toUpperCase();
  const summary: ExternalRefreshSummary = {
    source: 'openfec',
    state: normalizedState,
    processedRows: 0,
    matchedRows: 0,
    upsertedRows: 0,
    skippedRows: 0,
    errors: [],
  };

  const apiKey = process.env.OPENFEC_API || process.env.OPENFEC_API_KEY || '';
  if (!apiKey) {
    summary.errors.push('OPENFEC_API is not set');
    return summary;
  }

  const db = await openSql();
  const [districtRows]: any = await db.execute(
    `SELECT district_number, district_code
     FROM political_data_districts
     WHERE state = ?
     ORDER BY district_number`,
    [normalizedState]
  );
  if (!districtRows.length) {
    summary.errors.push(`No districts found in DB for state ${normalizedState}`);
    return summary;
  }

  const districtSet = new Set<number>(districtRows.map((r: any) => Number(r.district_number)));
  const totals = new Map<number, { dem: number; rep: number; other: number }>();

  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const url = new URL('https://api.open.fec.gov/v1/candidates/search/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('office', 'H');
    url.searchParams.set('state', normalizedState);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const payload = await fetchJsonWithRetry(url.toString());
    const results = Array.isArray(payload?.results) ? payload.results : [];
    pages = Number(payload?.pagination?.pages || 1);

    for (const row of results) {
      summary.processedRows++;
      const districtNum = Number(
        row?.district_number ??
        row?.district ??
        (typeof row?.district === 'string' ? parseInt(row.district, 10) : NaN)
      );
      if (!Number.isFinite(districtNum) || !districtSet.has(districtNum)) {
        summary.skippedRows++;
        continue;
      }

      const partyRaw = String(row?.party || '').toUpperCase();
      const receipts = parseNumber(row?.receipts) ?? parseNumber(row?.total_receipts) ?? 0;
      const existing = totals.get(districtNum) || { dem: 0, rep: 0, other: 0 };
      if (partyRaw.startsWith('DEM') || partyRaw === 'D') existing.dem += receipts;
      else if (partyRaw.startsWith('REP') || partyRaw === 'R') existing.rep += receipts;
      else existing.other += receipts;
      totals.set(districtNum, existing);
      summary.matchedRows++;
    }

    page++;
  }

  for (const row of districtRows) {
    const districtNum = Number(row.district_number);
    const t = totals.get(districtNum) || { dem: 0, rep: 0, other: 0 };
    await db.execute(
      `UPDATE political_data_districts
       SET total_donations_dem = ?,
           total_donations_rep = ?,
           total_donations_other = ?
       WHERE state = ? AND district_number = ?`,
      [Math.round(t.dem), Math.round(t.rep), Math.round(t.other), normalizedState, districtNum]
    );
    summary.upsertedRows++;
  }

  return summary;
}

export async function refreshCensusDistrictDemographics(state: string): Promise<ExternalRefreshSummary> {
  const normalizedState = (state || '').trim().toUpperCase();
  const summary: ExternalRefreshSummary = {
    source: 'census',
    state: normalizedState,
    processedRows: 0,
    matchedRows: 0,
    upsertedRows: 0,
    skippedRows: 0,
    errors: [],
  };

  const apiKey = process.env.US_CENSUS_API || process.env.CENSUS_API_KEY || '';
  if (!apiKey) {
    summary.errors.push('US_CENSUS_API is not set');
    return summary;
  }
  const stateFips = STATE_TO_FIPS[normalizedState];
  if (!stateFips) {
    summary.errors.push(`No state FIPS mapping for ${normalizedState}`);
    return summary;
  }

  const year = process.env.US_CENSUS_YEAR || '2023';
  const url = new URL(`https://api.census.gov/data/${year}/acs/acs5/profile`);
  // DP02_0068PE = Percent 25+ with bachelor's degree or higher.
  // DP02_0067PE is high-school-or-higher and is much larger, so we explicitly use 0068PE.
  url.searchParams.set('get', 'NAME,DP05_0001E,DP03_0062E,DP02_0068PE,DP05_0018E');
  url.searchParams.set('for', 'congressional district:*');
  url.searchParams.set('in', `state:${stateFips}`);
  url.searchParams.set('key', apiKey);

  const payload = await fetchJsonWithRetry(url.toString());
  if (!Array.isArray(payload) || payload.length < 2) {
    summary.errors.push('Census payload did not include row data');
    return summary;
  }

  const header = payload[0] as string[];
  const idx = {
    pop: header.indexOf('DP05_0001E'),
    income: header.indexOf('DP03_0062E'),
    bachelorsPct: header.indexOf('DP02_0068PE'),
    medianAge: header.indexOf('DP05_0018E'),
    district: header.indexOf('congressional district'),
  };
  if (idx.pop < 0 || idx.income < 0 || idx.bachelorsPct < 0 || idx.medianAge < 0 || idx.district < 0) {
    summary.errors.push('Census payload header missing required columns');
    return summary;
  }

  const db = await openSql();
  for (const row of payload.slice(1) as string[][]) {
    summary.processedRows++;

    const districtRaw = (row[idx.district] || '').trim();
    if (!districtRaw) {
      summary.skippedRows++;
      continue;
    }
    const districtNumber = parseInt(districtRaw, 10);
    if (!Number.isFinite(districtNumber) || districtNumber < 0) {
      summary.skippedRows++;
      continue;
    }

    const districtCode = districtNumber === 0
      ? `${normalizedState}-AL`
      : `${normalizedState}-${districtNumber.toString().padStart(2, '0')}`;

    const totalPopulation = parseNumber(row[idx.pop]);
    const medianIncome = parseNumber(row[idx.income]);
    const bachelorsPct = parseNumber(row[idx.bachelorsPct]);
    const medianAge = parseNumber(row[idx.medianAge]);

    await db.execute(
      `INSERT INTO political_data_district_demographics
        (state, district_number, district_code, total_population, median_household_income, bachelors_or_higher_pct, median_age, source_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_population = CASE
           WHEN VALUES(total_population) IS NULL THEN total_population
           ELSE VALUES(total_population)
         END,
         median_household_income = CASE
           WHEN VALUES(median_household_income) IS NULL THEN median_household_income
           ELSE VALUES(median_household_income)
         END,
         bachelors_or_higher_pct = CASE
           WHEN VALUES(bachelors_or_higher_pct) IS NULL THEN bachelors_or_higher_pct
           ELSE VALUES(bachelors_or_higher_pct)
         END,
         median_age = CASE
           WHEN VALUES(median_age) IS NULL THEN median_age
           ELSE VALUES(median_age)
         END,
         source_year = VALUES(source_year)`,
      [
        normalizedState,
        districtNumber,
        districtCode,
        totalPopulation !== null ? Math.round(totalPopulation) : null,
        medianIncome !== null ? Math.round(medianIncome) : null,
        bachelorsPct,
        medianAge,
        parseInt(year, 10),
      ]
    );

    summary.matchedRows++;
    summary.upsertedRows++;
  }

  return summary;
}
