import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConnection } from '@/app/utils/database/db'
import { createCompletion } from '@/app/utils/services/ai-service'
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage'
import { deepResearch } from '@/app/utils/services/web-search'
import {
  ABBREV_TO_STATE_NAME,
  buildVerifiedFacts,
  getOrBuildDistrictIntel,
  ordinal,
  type DistrictIntelPayload,
} from '@/app/utils/services/district-intel-service'
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org'

function createConversationId(districtCode: string): string {
  return `district-${districtCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function resolveOrgId(userId: string | number): Promise<number> {
  try {
    return await ensurePrimaryOrgId(String(userId))
  } catch {
    return 0
  }
}

/** Response shape matches pre-D1 dashboard consumers (no cache meta on GET). */
function toClientBase(base: DistrictIntelPayload) {
  const { dbRecordFound: _db, ...rest } = base
  return rest
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sp = new URL(request.url).searchParams
    const districtCode = sp.get('districtCode') || ''
    const fallbackState = sp.get('state')
    const fallbackDistrictNumber = sp.get('districtNumber')
    const officeType = sp.get('officeType')
    const organizationId = await resolveOrgId(session.user.id)
    // Optional client fallbacks let state-lege / map-click districts resolve
    // when political_data_districts has no row (no fabricated figures).
    const base = await getOrBuildDistrictIntel({
      organizationId,
      districtCode,
      fallbackState: fallbackState || null,
      fallbackDistrictNumber: fallbackDistrictNumber
        ? Number(fallbackDistrictNumber)
        : null,
      officeType: officeType || null,
    })
    if ('error' in base) {
      return NextResponse.json({ status: false, message: base.error }, { status: base.status })
    }
    return NextResponse.json(toClientBase(base))
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

    const organizationId = await resolveOrgId(session.user.id)
    const clientState = String(body?.state || '').trim().toUpperCase()
    const clientDistrictNumber = Number(body?.districtNumber || 0)

    const officeType =
      body?.officeType != null ? String(body.officeType) : null
    const built = await getOrBuildDistrictIntel({
      organizationId,
      districtCode,
      fallbackState: clientState || null,
      fallbackDistrictNumber: clientDistrictNumber || null,
      officeType,
      forceRefresh: Boolean(body?.forceRefresh),
    })
    if ('error' in built) {
      return NextResponse.json({ status: false, message: built.error }, { status: built.status })
    }

    const dbRecordFound = built.dbRecordFound
    const base = toClientBase(built)

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        status: true,
        llmEnabled: false,
        report: {
          title: `${base.district.districtCode} strategic memo`,
          executiveSummary: base.intelligence.narrative,
          strategicAngles: base.intelligence.recommendedNextSteps,
          caveats: ['ANTHROPIC_API_KEY missing, generated fallback report.'],
        },
      })
    }

    const stateName = ABBREV_TO_STATE_NAME[base.district.state] || base.district.state
    const districtLabel = base.district.districtNumber
      ? `${stateName}'s ${ordinal(base.district.districtNumber)} Congressional District (${base.district.districtCode})`
      : `${stateName} (${base.district.districtCode})`

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

    const verifiedFacts = buildVerifiedFacts(base, stateName)

    const systemContext = `You are a senior US congressional campaign strategist and elections analyst producing a rigorous, source-grounded report. ` +
      (verifiedFacts.length
        ? `Antelope-verified baseline facts for this district (real API data, cite by source name as shown, do not re-derive or contradict without explicit ` +
          `justification) — ${verifiedFacts.join('; ')}. `
        : `No Antelope-verified baseline facts are available for this district (internal database + external APIs returned nothing) — rely entirely on ` +
          `cited web search for every figure. `) +
      `Never state a figure without attributing it either to the Antelope-verified data above or to a specific web source you found.`

    let deepResult: { content: string; citations: { title: string; url: string }[] } = { content: '', citations: [] }
    try {
      deepResult = await withUserOrgAiUsage(
        session.user.id,
        'district_intel',
        () => deepResearch({ question: researchQuestion, systemContext }),
        organizationId > 0 ? organizationId : null
      )
    } catch (error) {
      console.error('district-intel deepResearch error:', error)
    }

    let parsed: any
    try {
      if (!deepResult.content) throw new Error('no deep research content')
      const summaryPrompt = `Summarize the campaign-intelligence report below into STRICT JSON with keys:
title (string), executiveSummary (string, 3-5 sentences), strategicAngles (array of 4 short bullet strings),
riskFlags (array of 3 short bullet strings), messageTestingIdeas (array of 4 short bullet strings), caveats (array of 2 short bullet strings).
Use ONLY information present in the report below — do not invent facts or sources.

REPORT:
${deepResult.content}`
      const completion = await withUserOrgAiUsage(
        session.user.id,
        'district_intel',
        () => createCompletion({
          tier: 'cheap',
          maxTokens: 2500,
          expandOnTruncation: true,
          messages: [
            { role: 'system', content: 'You return only valid JSON. No markdown.' },
            { role: 'user', content: summaryPrompt },
          ],
        }),
        organizationId > 0 ? organizationId : null
      )
      if (completion.stopReason === 'max_tokens') {
        throw new Error(
          'District intel summary was truncated after expand; please retry'
        )
      }
      const text = (completion.content || '{}').replace(/```json\n?|\n?```/g, '').trim() || '{}'
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
      cached: built.cached,
      generatedAt: built.generatedAt,
    })
  } catch (error) {
    console.error('district-intel POST error:', error)
    return NextResponse.json({ status: false, message: 'Failed to generate deep district report' }, { status: 500 })
  }
}
