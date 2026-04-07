import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConnection } from '@/app/utils/database/db'
import OpenAI from 'openai'

type SourceStatus = 'ok' | 'partial' | 'unavailable'

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

  const censusUrl =
    stateFips && districtPadded
      ? `https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP05_0001E,DP03_0062E&for=congressional%20district:${districtPadded}&in=state:${stateFips}`
      : ''
  const censusRaw = censusUrl ? await safeJson(censusUrl) : null
  const censusStatus: SourceStatus = censusRaw ? 'ok' : 'partial'

  // OpenFEC allows DEMO_KEY for low-volume testing; set FEC_API_KEY in production.
  const fecKey = (process.env.FEC_API_KEY || 'DEMO_KEY').trim()
  const fecUrl = `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(fecKey)}&office=H&state=${stateAbbrev}&district=${districtNumber}&per_page=5`
  const fecRaw = await safeJson(fecUrl)
  const fecStatus: SourceStatus = fecRaw ? 'ok' : 'unavailable'

  const openStatesKey = process.env.OPENSTATES_API_KEY
  const openStatesUrl = openStatesKey
    ? `https://v3.openstates.org/people?jurisdiction=${stateAbbrev}&include=roles&apikey=${encodeURIComponent(openStatesKey)}`
    : ''
  const openStatesRaw = openStatesUrl ? await safeJson(openStatesUrl) : null
  const openStatesStatus: SourceStatus = openStatesRaw ? 'ok' : 'unavailable'

  const ballotpediaStatus: SourceStatus = 'unavailable'
  // MIT Election Lab publishes research datasets; there is no single public REST API wired here (links only in district brief / action kit).
  const mitElectionLabStatus: SourceStatus = 'unavailable'

  const summary = [
    `${districtCode} baseline: PVI ${local.cook_pvi || 'N/A'}, 2024 margin ${parseFloat(local.margin_2024 || 0).toFixed(1)}.`,
    `Incumbent: ${local.incumbent_name || 'Unknown'} (${local.incumbent_party || 'N/A'}).`,
    `Demographics: pop ${local.total_population ? Number(local.total_population).toLocaleString() : 'N/A'}, median HH income ${local.median_household_income ? `$${Number(local.median_household_income).toLocaleString()}` : 'N/A'}, median age ${local.median_age || 'N/A'}.`,
    `Data source health -> Census: ${censusStatus}, FEC: ${fecStatus}, OpenStates: ${openStatesStatus}, Ballotpedia: ${ballotpediaStatus}, MIT Election Lab: ${mitElectionLabStatus} (no live API in this app—use MIT data portal for files).`,
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
      fecStatus,
      openStatesStatus,
      ballotpediaStatus,
      mitElectionLabStatus,
      censusPreview: Array.isArray(censusRaw) ? censusRaw.slice(0, 2) : null,
      fecPreview: fecRaw?.results?.slice?.(0, 3) || null,
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
    const districtCode = String(body?.districtCode || '')
    const base = await getBaseDistrictIntel(districtCode)
    if ('error' in base) {
      return NextResponse.json({ status: false, message: base.error }, { status: base.status })
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

    const prompt = `
You are a senior US campaign strategist and analyst.
Use the provided district intelligence JSON to produce a concise strategic memo.

Return STRICT JSON with keys:
title (string),
executiveSummary (string, 3-5 sentences),
strategicAngles (array of 4 short bullet strings),
riskFlags (array of 3 short bullet strings),
messageTestingIdeas (array of 4 short bullet strings),
caveats (array of 2 short bullet strings).

District intelligence JSON:
${JSON.stringify(base)}
`

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You return only valid JSON. No markdown.' },
        { role: 'user', content: prompt },
      ],
    })

    const text = completion.choices?.[0]?.message?.content?.trim() || '{}'
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {
        title: `${base.district.districtCode} strategic memo`,
        executiveSummary: base.intelligence.narrative,
        strategicAngles: base.intelligence.recommendedNextSteps,
        riskFlags: ['Model output parse failed; using fallback framing.'],
        messageTestingIdeas: ['Test economy and affordability framing by age cohort.'],
        caveats: ['LLM output malformed; fallback injected.'],
      }
    }

    return NextResponse.json({
      status: true,
      llmEnabled: true,
      report: parsed,
      base,
    })
  } catch (error) {
    console.error('district-intel POST error:', error)
    return NextResponse.json({ status: false, message: 'Failed to generate deep district report' }, { status: 500 })
  }
}

