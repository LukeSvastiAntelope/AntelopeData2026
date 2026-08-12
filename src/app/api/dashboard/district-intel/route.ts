import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConnection } from '@/app/utils/database/db'
import OpenAI from 'openai'
import { deepResearch } from '@/app/utils/services/web-search'

type SourceStatus = 'ok' | 'partial' | 'unavailable'

const ABBREV_TO_STATE_NAME: Record<string, string> = {
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
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function createConversationId(districtCode: string): string {
  return `district-${districtCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function safeJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

async function getBaseDistrictIntel(districtCodeRaw: string) {
  const districtCode = districtCodeRaw.trim().toUpperCase()
  if (!districtCode) {
    return { error: 'districtCode is required', status: 400 as const }
  }

  const db = await getConnection()
  const [rows]: any = await db.execute(
    `SELECT d.*, demo.total_population, demo.median_household_income, demo.bachelors_or_higher_pct, demo.median_age, demo.source_year
     FROM political_data_districts d
     LEFT JOIN political_data_district_demographics demo ON demo.district_code = d.district_code
     WHERE d.district_code = ?
     LIMIT 1`,
    [districtCode]
  )
  const local = rows?.[0]
  if (!local) {
    return { error: 'District not found', status: 404 as const }
  }

  const stateAbbrev = String(local.state || '').toUpperCase()
  const districtNumber = Number(local.district_number || 0)
  const stateFipsMap: Record<string, string> = {
    AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13',
    HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25',
    MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36',
    NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48',
    UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
  }
  const stateFips = stateFipsMap[stateAbbrev]
  const districtPadded = districtNumber ? String(districtNumber).padStart(2, '0') : ''

  // Census API key raises the anonymous rate limit and is required for some
  // datasets (e.g. County Business Patterns below); ACS itself tolerates a
  // modest amount of unauthenticated traffic, so it degrades gracefully
  // without a key rather than going fully unavailable.
  const censusKey = process.env.CENSUS_API_KEY
  const censusKeyParam = censusKey ? `&key=${encodeURIComponent(censusKey)}` : ''

  const censusUrl =
    stateFips && districtPadded
      ? `https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP05_0001E,DP03_0062E,DP03_0009PE,DP02_0067PE&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`
      : ''
  const censusRaw = censusUrl ? await safeJson(censusUrl) : null
  const censusStatus: SourceStatus = censusRaw ? 'ok' : 'partial'

  // County Business Patterns at congressional-district geography — real
  // local economic texture (establishment count, employment, annual
  // payroll). Requires a Census API key (free, api.census.gov/data/key_signup.html).
  const cbpUrl =
    censusKey && stateFips && districtPadded
      ? `https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,EMP,PAYANN&for=congressional%20district:${districtPadded}&in=state:${stateFips}${censusKeyParam}`
      : ''
  const cbpRaw = cbpUrl ? await safeJson(cbpUrl) : null
  const cbpStatus: SourceStatus = !censusKey ? 'unavailable' : cbpRaw ? 'ok' : 'partial'

  // OpenFEC allows DEMO_KEY for low-volume testing; set FEC_API_KEY in production.
  const fecKey = (process.env.FEC_API_KEY || 'DEMO_KEY').trim()
  const fecUrl = `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(fecKey)}&office=H&state=${stateAbbrev}&district=${districtNumber}&per_page=5&sort=-election_years`
  const fecRaw = await safeJson(fecUrl)
  const fecStatus: SourceStatus = fecRaw ? 'ok' : 'unavailable'

  // Real fundraising totals (not just candidate metadata) for the leading
  // candidate's principal committee — genuine donor/receipts data, not an
  // LLM guess. Best-effort: only the top result's committee is queried to
  // keep this fast.
  let fecTotals: any = null
  let fecTotalsStatus: SourceStatus = 'unavailable'
  const topCommitteeId = fecRaw?.results?.[0]?.principal_committees?.[0]?.committee_id
  if (topCommitteeId) {
    const totalsUrl = `https://api.open.fec.gov/v1/committee/${topCommitteeId}/totals/?api_key=${encodeURIComponent(fecKey)}&per_page=1&sort=-cycle`
    const totalsRaw = await safeJson(totalsUrl)
    fecTotals = totalsRaw?.results?.[0] || null
    fecTotalsStatus = fecTotals ? 'ok' : 'unavailable'
  }

  const openStatesKey = process.env.OPENSTATES_API_KEY
  const openStatesUrl = openStatesKey
    ? `https://v3.openstates.org/people?jurisdiction=${stateAbbrev}&include=roles&apikey=${encodeURIComponent(openStatesKey)}`
    : ''
  const openStatesRaw = openStatesUrl ? await safeJson(openStatesUrl) : null
  const openStatesStatus: SourceStatus = openStatesRaw ? 'ok' : 'unavailable'

  // BLS Local Area Unemployment Statistics — STATE-level unemployment rate
  // (LAUS does not publish a congressional-district geography, so this is
  // deliberately labeled state-level rather than faking district precision).
  // Works at low volume without a key; BLS_API_KEY raises the daily limit.
  const blsKey = process.env.BLS_API_KEY
  let blsLatest: { period: string; year: string; value: string } | null = null
  let blsStatus: SourceStatus = 'unavailable'
  if (stateFips) {
    const seriesId = `LASST${stateFips}0000000000003`
    const currentYear = new Date().getFullYear()
    const blsBody: any = { seriesid: [seriesId], startyear: String(currentYear - 1), endyear: String(currentYear) }
    if (blsKey) blsBody.registrationkey = blsKey
    try {
      const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blsBody),
      })
      const json = res.ok ? await res.json() : null
      const point = json?.Results?.series?.[0]?.data?.[0]
      if (point) {
        blsLatest = { period: point.periodName, year: point.year, value: point.value }
        blsStatus = 'ok'
      }
    } catch {
      // leave blsStatus as 'unavailable'
    }
  }

  const ballotpediaStatus: SourceStatus = 'unavailable'
  // MIT Election Lab publishes research datasets, not a live REST API — it's
  // only usable here as a web-search target (see preferredSources in the
  // POST handler below), never as a verified/authoritative data source.
  const mitElectionLabStatus: SourceStatus = 'unavailable'

  const summary = [
    `${districtCode} baseline: PVI ${local.cook_pvi || 'N/A'}, 2024 margin ${parseFloat(local.margin_2024 || 0).toFixed(1)}.`,
    `Incumbent: ${local.incumbent_name || 'Unknown'} (${local.incumbent_party || 'N/A'}).`,
    `Demographics: pop ${local.total_population ? Number(local.total_population).toLocaleString() : 'N/A'}, median HH income ${local.median_household_income ? `$${Number(local.median_household_income).toLocaleString()}` : 'N/A'}, median age ${local.median_age || 'N/A'}.`,
    `Data source health -> Census ACS: ${censusStatus}, Census CBP: ${cbpStatus}, BLS: ${blsStatus}, FEC candidates: ${fecStatus}, FEC totals: ${fecTotalsStatus}, OpenStates: ${openStatesStatus}, Ballotpedia: ${ballotpediaStatus} (link-out only), MIT Election Lab: ${mitElectionLabStatus} (link-out / web-search target only, not a verified API).`,
  ].join(' ')

  return {
    status: true as const,
    district: {
      districtCode,
      state: stateAbbrev,
      districtNumber,
      pvi: local.cook_pvi,
      pviNumeric: parseFloat(local.cook_pvi_numeric || 0),
      margin2024: parseFloat(local.margin_2024 || 0),
      incumbentName: local.incumbent_name || null,
      incumbentParty: local.incumbent_party || null,
      demographics: {
        totalPopulation: local.total_population ? Number(local.total_population) : null,
        medianHouseholdIncome: local.median_household_income ? Number(local.median_household_income) : null,
        bachelorsOrHigherPct: local.bachelors_or_higher_pct ? Number(local.bachelors_or_higher_pct) : null,
        medianAge: local.median_age ? Number(local.median_age) : null,
      },
    },
    external: {
      censusStatus,
      cbpStatus,
      blsStatus,
      fecStatus,
      fecTotalsStatus,
      openStatesStatus,
      ballotpediaStatus,
      mitElectionLabStatus,
      censusPreview: Array.isArray(censusRaw) ? censusRaw.slice(0, 2) : null,
      cbpPreview: Array.isArray(cbpRaw) ? cbpRaw.slice(0, 2) : null,
      blsLatest,
      fecPreview: fecRaw?.results?.slice?.(0, 3) || null,
      fecTotals,
      openStatesPreview: openStatesRaw?.results?.slice?.(0, 3) || null,
    },
    intelligence: {
      narrative: summary,
      recommendedNextSteps: [
        'Open district in chat to run scenario strategy and messaging tests.',
        'Compare fundraising and turnout proxies vs adjacent districts.',
        'Build a voter-contact geofence plan around high-priority precincts.',
      ],
    },
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const districtCode = new URL(request.url).searchParams.get('districtCode') || ''
    const base = await getBaseDistrictIntel(districtCode)
    if ('error' in base) {
      return NextResponse.json({ status: false, message: base.error }, { status: base.status })
    }
    return NextResponse.json(base)
  } catch (error) {
    console.error('district-intel route error:', error)
    return NextResponse.json({ status: false, message: 'Failed to build district intelligence' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const districtCode = String(body?.districtCode || '').trim().toUpperCase()
    if (!districtCode) {
      return NextResponse.json({ status: false, message: 'districtCode is required' }, { status: 400 })
    }

    let base = await getBaseDistrictIntel(districtCode)
    let dbRecordFound = true
    if ('error' in base) {
      // The district may not be in our internal database yet (e.g. the Cook PVI
      // refresh hasn't been run for it) even though the user selected a real
      // district on the map. Fall back to what the client already knows from
      // the map click (state, district number) so the deep web-research report
      // can still be generated for whatever district was actually selected.
      const clientState = String(body?.state || '').trim().toUpperCase()
      const clientDistrictNumber = Number(body?.districtNumber || 0)
      if (!clientState) {
        return NextResponse.json({ status: false, message: base.error }, { status: base.status })
      }
      dbRecordFound = false
      base = {
        status: true,
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
        external: {
          censusStatus: 'unavailable',
          cbpStatus: 'unavailable',
          blsStatus: 'unavailable',
          fecStatus: 'unavailable',
          fecTotalsStatus: 'unavailable',
          openStatesStatus: 'unavailable',
          ballotpediaStatus: 'unavailable',
          mitElectionLabStatus: 'unavailable',
          censusPreview: null,
          cbpPreview: null,
          blsLatest: null,
          fecPreview: null,
          fecTotals: null,
          openStatesPreview: null,
        },
        intelligence: {
          narrative: `${districtCode}: no internal database record yet for this district — relying entirely on live web research for this report.`,
          recommendedNextSteps: [
            'Open district in chat to run scenario strategy and messaging tests.',
            'Compare fundraising and turnout proxies vs adjacent districts.',
            'Build a voter-contact geofence plan around high-priority precincts.',
          ],
        },
      }
    }

    const client = getOpenAIClient()
    if (!client) {
      return NextResponse.json({
        status: true,
        llmEnabled: false,
        report: {
          title: `${base.district.districtCode} strategic memo`,
          executiveSummary: base.intelligence.narrative,
          strategicAngles: base.intelligence.recommendedNextSteps,
          caveats: ['OPENAI_API_KEY missing, generated fallback report.'],
        },
      })
    }

    const stateName = ABBREV_TO_STATE_NAME[base.district.state] || base.district.state
    const districtLabel = base.district.districtNumber
      ? `${stateName}'s ${ordinal(base.district.districtNumber)} Congressional District (${base.district.districtCode})`
      : `${stateName} (${base.district.districtCode})`

    // Web-search targets only. These are real, reputable election-data
    // websites the model may find via live search — but unlike the
    // Antelope-verified facts block below, nothing here is claimed as an
    // API-backed source, so the model must not cite them as more certain
    // than a normal web search result. MIT Election Lab is deliberately
    // NOT framed as "authoritative" — it publishes research datasets, not
    // a live API, and treating it that way previously produced unreliable
    // figures the model effectively invented while attributing them to it.
    const preferredSources = [
      { name: 'MIT Election Lab', domain: 'electionlab.mit.edu' },
      { name: 'OpenElectionData.net', domain: 'openelectiondata.net' },
      { name: 'Daily Kos Elections / The Downballot data guide', domain: 'dailykos.com' },
      { name: 'OpenElections (community open elections data)', domain: 'openelections.net' },
      { name: `${stateName} official election results`, domain: base.district.state === 'NJ' ? 'nj.gov' : base.district.state === 'TX' ? 'sos.texas.gov' : '' },
    ].filter((s) => s.domain)

    const sourceList = preferredSources.map((s) => `${s.name} (site:${s.domain})`).join('; ')

    const researchQuestion = `Produce a comprehensive, cited campaign-intelligence report on ${districtLabel}. Cover: current competitiveness and partisan lean, ` +
      `2024 (and prior cycle) election results and margins, the incumbent, historical results and redistricting context, and key demographic/economic factors ` +
      `that shape the race. Antelope has already supplied verified baseline data below (Census, BLS, FEC) — use it directly rather than re-deriving it from ` +
      `search, and cite it as "Antelope internal data (Census/BLS/FEC)" when you reference it. For everything else — election history, redistricting context, ` +
      `local reporting — search the web and prioritize these sites where they have relevant data: ${sourceList}. Every figure in the report must be traceable ` +
      `to either the Antelope-verified data below or a specific cited web source — never state a number without one of those two.`

    // Antelope-verified facts: only real, API-sourced data points are
    // included (never "N/A" placeholders), each explicitly labeled with
    // its source so a hostile fact-check can trace every number back to
    // where it came from — the same anti-hallucination discipline used
    // elsewhere in this app for AI-generated survey insights.
    const verifiedFacts: string[] = []
    if (base.district.pvi) verifiedFacts.push(`Cook PVI: ${base.district.pvi} (Antelope internal database)`)
    if (base.district.margin2024) verifiedFacts.push(`2024 margin: ${base.district.margin2024.toFixed(1)} (Antelope internal database)`)
    if (base.district.incumbentName) verifiedFacts.push(`Incumbent: ${base.district.incumbentName} (${base.district.incumbentParty || 'party N/A'}) (Antelope internal database)`)
    if (base.district.demographics?.totalPopulation) verifiedFacts.push(`Population: ${base.district.demographics.totalPopulation.toLocaleString()} (Census ACS 5-year)`)
    if (base.district.demographics?.medianHouseholdIncome) verifiedFacts.push(`Median household income: $${base.district.demographics.medianHouseholdIncome.toLocaleString()} (Census ACS 5-year)`)
    if (base.external.blsLatest) verifiedFacts.push(`${stateName} state unemployment rate: ${base.external.blsLatest.value}% as of ${base.external.blsLatest.period} ${base.external.blsLatest.year} (BLS LAUS — state-level, not district-level; no district-level unemployment series exists)`)
    const cbpRow = Array.isArray(base.external.cbpPreview) ? base.external.cbpPreview[1] : null // row 0 is the header
    if (cbpRow) {
      const [, estab, emp, payann] = cbpRow
      verifiedFacts.push(`Business establishments in district: ${estab}, employment: ${emp}, annual payroll: $${payann}k (Census County Business Patterns)`)
    }
    if (base.external.fecTotals?.receipts) {
      const t = base.external.fecTotals
      verifiedFacts.push(`Leading candidate committee "${t.committee_name}" total receipts: $${Number(t.receipts).toLocaleString()}${t.individual_contributions ? `, individual contributions: $${Number(t.individual_contributions).toLocaleString()}` : ''} for cycle ${t.cycle} (OpenFEC committee totals)`)
    }

    const systemContext = `You are a senior US congressional campaign strategist and elections analyst producing a rigorous, source-grounded report. ` +
      (verifiedFacts.length
        ? `Antelope-verified baseline facts for this district (real API data, cite by source name as shown, do not re-derive or contradict without explicit ` +
          `justification) — ${verifiedFacts.join('; ')}. `
        : `No Antelope-verified baseline facts are available for this district (internal database + external APIs returned nothing) — rely entirely on ` +
          `cited web search for every figure. `) +
      `Never state a figure without attributing it either to the Antelope-verified data above or to a specific web source you found.`

    let deepResult: { content: string; citations: { title: string; url: string }[] } = { content: '', citations: [] }
    try {
      deepResult = await deepResearch({ question: researchQuestion, systemContext })
    } catch (error) {
      console.error('district-intel deepResearch error:', error)
    }

    // Ground the compact panel summary strictly in the researched report (falls
    // back to the base facts if the research call failed for any reason).
    let parsed: any
    try {
      if (!deepResult.content) throw new Error('no deep research content')
      const summaryPrompt = `Summarize the campaign-intelligence report below into STRICT JSON with keys:
title (string), executiveSummary (string, 3-5 sentences), strategicAngles (array of 4 short bullet strings),
riskFlags (array of 3 short bullet strings), messageTestingIdeas (array of 4 short bullet strings), caveats (array of 2 short bullet strings).
Use ONLY information present in the report below — do not invent facts or sources.

REPORT:
${deepResult.content}`
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You return only valid JSON. No markdown.' },
          { role: 'user', content: summaryPrompt },
        ],
      })
      const text = completion.choices?.[0]?.message?.content?.trim() || '{}'
      parsed = JSON.parse(text)
    } catch {
      parsed = {
        title: `${base.district.districtCode} strategic memo`,
        executiveSummary: base.intelligence.narrative,
        strategicAngles: base.intelligence.recommendedNextSteps,
        riskFlags: deepResult.content ? ['Summary step failed; see full report for details.'] : ['Web research unavailable; showing internal database facts only.'],
        messageTestingIdeas: ['Test economy and affordability framing by age cohort.'],
        caveats: deepResult.content ? ['Auto-summary may omit nuance — read the full cited report.'] : ['Deep research call failed; this is a fallback summary.'],
      }
    }

    // Persist the full cited report as a "general/news" conversation so it's
    // immediately reachable from Cohort Chat's general/news section.
    let conversationId: string | null = null
    if (deepResult.content) {
      try {
        conversationId = createConversationId(base.district.districtCode)
        const title = `📰 ${base.district.districtCode} Deep District Report`
        const messages = [
          { role: 'user', content: `Generate a deep intelligence report for ${districtLabel} using Antelope's verified Census/BLS/FEC data plus cited web research (OpenElectionData, Daily Kos Elections, OpenElections, official state election results).` },
          { role: 'agent', content: deepResult.content },
        ]
        const db = await getConnection()
        try {
          await db.execute(
            `INSERT INTO chat_conversations (id, user_id, title, messages, survey_id, cohort_id, type)
             VALUES (?, ?, ?, ?, NULL, NULL, 'news')`,
            [conversationId, session.user.id, title, JSON.stringify(messages)]
          )
        } catch (error: any) {
          // Backward-compatible fallback if the DB enum hasn't been migrated to include 'news' yet.
          const errMsg = String(error?.message || '')
          if (/(Data truncated|Incorrect|enum|type)/i.test(errMsg)) {
            await db.execute(
              `INSERT INTO chat_conversations (id, user_id, title, messages, survey_id, cohort_id, type)
               VALUES (?, ?, ?, ?, NULL, NULL, 'chat')`,
              [conversationId, session.user.id, title, JSON.stringify(messages)]
            )
          } else {
            throw error
          }
        }
      } catch (error) {
        console.error('district-intel conversation save error:', error)
        conversationId = null
      }
    }

    if (!dbRecordFound && Array.isArray(parsed.caveats)) {
      parsed.caveats = [...parsed.caveats, 'No internal database record for this district — figures are sourced entirely from live web research.']
    }

    return NextResponse.json({
      status: true,
      llmEnabled: true,
      report: parsed,
      base,
      dbRecordFound,
      deepResearch: deepResult.content ? { content: deepResult.content, citationCount: deepResult.citations.length } : null,
      conversationId,
    })
  } catch (error) {
    console.error('district-intel POST error:', error)
    return NextResponse.json({ status: false, message: 'Failed to generate deep district report' }, { status: 500 })
  }
}

