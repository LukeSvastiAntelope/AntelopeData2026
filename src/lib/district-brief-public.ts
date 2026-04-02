import { getConnection } from '@/app/utils/database/db'

export type SourceHealth = 'ok' | 'partial' | 'unavailable'

async function safeJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13',
  HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25',
  MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36',
  NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48',
  UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
}

/** Accepts NJ-5, NJ - 5, nj05 */
export function parseUsHouseDistrict(raw: string): { state: string; districtNumber: number; label: string } | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '')
  const m = s.match(/^([A-Z]{2})-?(\d{1,2})$/)
  if (!m) return null
  const state = m[1]
  const districtNumber = parseInt(m[2], 10)
  if (!STATE_FIPS[state] || districtNumber < 0 || districtNumber > 53) return null
  return { state, districtNumber, label: `${state}-${districtNumber}` }
}

export interface PublicDistrictBrief {
  districtCode: string
  state: string
  districtNumber: number
  headline: string
  tagline: string
  pvi: string | null
  pviNumeric: number | null
  margin2024: number | null
  incumbentName: string | null
  incumbentParty: string | null
  demographics: {
    totalPopulation: number | null
    medianHouseholdIncome: number | null
    bachelorsOrHigherPct: number | null
    medianAge: number | null
  }
  census: { status: SourceHealth; totalPop: number | null; medianIncome: number | null }
  fec: {
    status: SourceHealth
    sampleCandidates: { name: string; party: string; office: string }[]
  }
  openStates: { status: SourceHealth; note: string; directoryUrl: string }
  ballotpedia: { searchUrl: string; label: string }
  mitElectionLab: { url: string; label: string }
  chart: { name: string; value: number; fill: string }[]
  narrative: string
  bullets: string[]
}

export async function buildPublicDistrictBrief(districtCodeInput: string): Promise<
  { ok: true; data: PublicDistrictBrief } | { ok: false; error: string; status: number }
> {
  const parsed = parseUsHouseDistrict(districtCodeInput)
  if (!parsed) {
    return { ok: false, error: 'Use a US House district like NJ-5 or CA-12.', status: 400 }
  }
  const districtCode = parsed.label

  let local: Record<string, unknown> | null = null
  try {
    const db = await getConnection()
    const [rows]: any = await db.execute(
      `SELECT d.*, demo.total_population, demo.median_household_income, demo.bachelors_or_higher_pct, demo.median_age
       FROM political_data_districts d
       LEFT JOIN political_data_district_demographics demo ON demo.district_code = d.district_code
       WHERE d.district_code = ?
       LIMIT 1`,
      [districtCode]
    )
    local = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null
  } catch {
    local = null
  }

  const stateAbbrev = String(local?.state || parsed.state).toUpperCase()
  const districtNumber = local ? Number(local?.district_number || 0) : parsed.districtNumber
  const stateFips = STATE_FIPS[stateAbbrev]
  const districtPadded = String(districtNumber).padStart(2, '0')

  const censusUrl =
    stateFips && districtPadded
      ? `https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP05_0001E,DP03_0062E&for=congressional%20district:${districtPadded}&in=state:${stateFips}`
      : ''
  const censusRaw = censusUrl ? await safeJson(censusUrl) : null
  let censusPop: number | null = null
  let censusIncome: number | null = null
  if (Array.isArray(censusRaw) && censusRaw.length > 1) {
    const row = censusRaw[1]
    if (Array.isArray(row)) {
      censusPop = row[1] ? parseInt(String(row[1]), 10) : null
      censusIncome = row[2] ? parseInt(String(row[2]), 10) : null
    }
  }
  const censusStatus: SourceHealth = censusRaw ? 'ok' : stateFips ? 'partial' : 'unavailable'

  const fecKey = process.env.FEC_API_KEY
  const fecUrl = fecKey
    ? `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(fecKey)}&office=H&state=${stateAbbrev}&district=${districtNumber}&per_page=6`
    : ''
  const fecRaw = fecUrl ? await safeJson(fecUrl) : null
  const fecStatus: SourceHealth = fecRaw?.results ? 'ok' : fecKey ? 'partial' : 'unavailable'
  const sampleCandidates =
    fecRaw?.results?.slice(0, 5).map((c: Record<string, unknown>) => ({
      name: String(c.name || 'Unknown'),
      party: String(c.party || '—'),
      office: String(c.office_full || 'House'),
    })) || []

  const openStatesKey = process.env.OPENSTATES_API_KEY
  let openStatesNote = 'Browse state legislators and committees for coalition angles.'
  let openStatesStatus: SourceHealth = 'unavailable'
  if (openStatesKey) {
    const os = await safeJson(
      `https://v3.openstates.org/people?jurisdiction=${stateAbbrev}&include=roles&per_page=3&apikey=${encodeURIComponent(openStatesKey)}`
    )
    openStatesStatus = os?.results ? 'ok' : 'partial'
    if (os?.results?.length) {
      openStatesNote = `Open States returned ${os.results.length}+ people in ${stateAbbrev} — use directory for local endorsements and legislative context.`
    }
  }
  const openStatesDirectoryUrl = `https://openstates.org/${stateAbbrev.toLowerCase()}/`

  const ballotpediaSearchUrl = `https://ballotpedia.org/wiki/index.php?search=${encodeURIComponent(
    `${stateAbbrev} Congressional District ${districtNumber}`
  )}`
  const mitUrl = 'https://electionlab.mit.edu/research/election-data'

  const pvi = local?.cook_pvi != null ? String(local.cook_pvi) : null
  const pviNumeric = local?.cook_pvi_numeric != null ? parseFloat(String(local.cook_pvi_numeric)) : null
  const margin2024 = local?.margin_2024 != null ? parseFloat(String(local.margin_2024)) : null
  const incumbentName = local?.incumbent_name != null ? String(local.incumbent_name) : null
  const incumbentParty = local?.incumbent_party != null ? String(local.incumbent_party) : null

  const totalPopulation =
    local?.total_population != null ? Number(local.total_population) : censusPop
  const medianHouseholdIncome =
    local?.median_household_income != null ? Number(local.median_household_income) : censusIncome
  const bachelorsOrHigherPct =
    local?.bachelors_or_higher_pct != null ? Number(local.bachelors_or_higher_pct) : null
  const medianAge = local?.median_age != null ? Number(local.median_age) : null

  const competitiveness = margin2024 != null ? Math.min(100, Math.abs(margin2024) * 2.5) : 45
  const popK = totalPopulation != null ? Math.min(100, totalPopulation / 8000) : 40
  const incomeK = medianHouseholdIncome != null ? Math.min(100, medianHouseholdIncome / 1500) : 45

  const chart = [
    { name: 'Competitiveness', value: Math.round(competitiveness), fill: '#7c3aed' },
    { name: 'Scale (pop)', value: Math.round(popK), fill: '#0ea5e9' },
    { name: 'Income proxy', value: Math.round(incomeK), fill: '#10b981' },
  ]

  const headline = `${districtCode} district brief`
  const tagline =
    margin2024 != null && Math.abs(margin2024) < 8
      ? 'Toss-up territory — field and persuasion margins matter.'
      : margin2024 != null && margin2024 > 12
        ? 'Lean landscape — consolidate base and expand persuasion.'
        : 'Snapshot for planning — calibrate message and turnout to local reality.'

  const bullets = [
    pvi ? `Cook PVI ${pvi} frames baseline partisan lean.` : 'PVI: add district to Antelope’s database for Cook-style lean.',
    incumbentName
      ? `Incumbent: ${incumbentName} (${incumbentParty || 'party n/a'}).`
      : 'Incumbent: confirm filing status on FEC and state election sites.',
    totalPopulation
      ? `Population ~${totalPopulation.toLocaleString()} (Census ACS / internal merge).`
      : 'Population: Census ACS when available.',
    fecStatus === 'ok' && sampleCandidates.length
      ? `FEC shows ${sampleCandidates.length}+ House filings for this seat — vet active committees.`
      : 'FEC: configure FEC_API_KEY for live committee and filing context.',
    'Ballotpedia & Open States: use links below for race narrative and state legislative bridges.',
  ]

  const narrative = [
    `${districtCode} sits in ${stateAbbrev}.`,
    margin2024 != null
      ? `Reported 2024 margin ~${margin2024.toFixed(1)} points — treat as directional, not a forecast.`
      : 'Margin: enrich with MIT Election Lab–style historical files when you need precinct trends.',
    medianHouseholdIncome
      ? `Median household income ~$${medianHouseholdIncome.toLocaleString()} (demographic anchor for messaging).`
      : 'Income: Census ACS fills in when the district is resolved.',
  ].join(' ')

  const data: PublicDistrictBrief = {
    districtCode,
    state: stateAbbrev,
    districtNumber,
    headline,
    tagline,
    pvi,
    pviNumeric,
    margin2024,
    incumbentName,
    incumbentParty,
    demographics: {
      totalPopulation,
      medianHouseholdIncome,
      bachelorsOrHigherPct,
      medianAge,
    },
    census: { status: censusStatus, totalPop: censusPop, medianIncome: censusIncome },
    fec: { status: fecStatus, sampleCandidates },
    openStates: { status: openStatesStatus, note: openStatesNote, directoryUrl: openStatesDirectoryUrl },
    ballotpedia: { searchUrl: ballotpediaSearchUrl, label: 'Ballotpedia race & candidate pages' },
    mitElectionLab: { url: mitUrl, label: 'MIT Election Lab — research data' },
    chart,
    narrative,
    bullets,
  }

  return { ok: true, data }
}
