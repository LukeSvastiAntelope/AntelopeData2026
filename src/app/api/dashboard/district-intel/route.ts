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
          fecStatus: 'unavailable',
          openStatesStatus: 'unavailable',
          ballotpediaStatus: 'unavailable',
          mitElectionLabStatus: 'unavailable',
          censusPreview: null,
          fecPreview: null,
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

    // Preferred election-data sources, per campaign-team guidance. The
    // underlying search-preview model performs a real web search, so
    // "site:" hints reliably bias it toward these domains.
    const preferredSources = [
      { name: 'MIT Election Lab', domain: 'electionlab.mit.edu' },
      { name: 'OpenElectionData.net', domain: 'openelectiondata.net' },
      { name: 'Daily Kos Elections / The Downballot data guide', domain: 'dailykos.com' },
      { name: `${stateName} official election results`, domain: base.district.state === 'NJ' ? 'nj.gov' : '' },
    ].filter((s) => s.domain)

    const sourceList = preferredSources.map((s) => `${s.name} (site:${s.domain})`).join('; ')

    const researchQuestion = `Produce a comprehensive, cited campaign-intelligence report on ${districtLabel}. Cover: current competitiveness and partisan lean, ` +
      `2024 (and prior cycle) election results and margins, the incumbent, historical results and redistricting context, and key demographic/political factors ` +
      `that shape the race. Prioritize and directly cite these sources wherever they have relevant data: ${sourceList}. Where a number comes from one of these ` +
      `sources, name the source next to the figure.`

    const systemContext = `You are a senior US congressional campaign strategist and elections analyst producing a rigorous, source-grounded report. ` +
      `Known baseline facts for this district from Antelope's internal database (treat as authoritative; reconcile any web data against these) — ` +
      `Cook PVI: ${base.district.pvi || 'N/A'}, 2024 margin: ${base.district.margin2024?.toFixed?.(1) ?? base.district.margin2024}, ` +
      `incumbent: ${base.district.incumbentName || 'Unknown'} (${base.district.incumbentParty || 'N/A'}), ` +
      `population: ${base.district.demographics?.totalPopulation ?? 'N/A'}, median household income: ${base.district.demographics?.medianHouseholdIncome ?? 'N/A'}. ` +
      `Preferred/primary sources for election data in this domain: MIT Election Lab (electionlab.mit.edu, academic election-returns data), ` +
      `OpenElectionData.net (community open elections data), Daily Kos Elections' "Downballot" data guide (dailykos.com / thedownballot.com, ` +
      `district-level historical results and PVI methodology), and official state election results (nj.gov, NJ Division of Elections) when the ` +
      `district is in New Jersey.`

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
          { role: 'user', content: `Generate a deep intelligence report for ${districtLabel} using MIT Election Lab, OpenElectionData, Daily Kos Elections, and official state election results.` },
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

