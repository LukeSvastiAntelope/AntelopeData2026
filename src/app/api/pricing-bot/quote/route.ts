import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore } from '../_store'

interface PricingQuoteRequest {
  campaignType?: string
  candidateName?: string
  districtCode?: string
  /** Public campaign site URL (optional); included in bot context */
  campaignWebsite?: string
  teamSize?: number
  constituencySize?: number
  missionImpact?: number
  referralPotential?: number
  reductionSoughtPct?: number
  convinceText?: string
}

function normalizeWebsiteUrl(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
    const u = new URL(withProto)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.href
  } catch {
    return ''
  }
}

function buildEnrichedPitch(body: PricingQuoteRequest, convinceText: string): string {
  const parts: string[] = []
  const name = String(body.candidateName || '').trim()
  const district = String(body.districtCode || '').trim()
  const site = normalizeWebsiteUrl(String(body.campaignWebsite || ''))
  if (name) parts.push(`Candidate: ${name}`)
  if (district) parts.push(`District: ${district}`)
  if (site) parts.push(`Campaign website: ${site}`)
  if (convinceText) parts.push(convinceText)
  return parts.join('\n')
}

const FEATURE_RAG = [
  { key: 'economy', weight: 8, text: 'Economic growth, jobs, affordability, small business expansion, cost reduction.' },
  { key: 'diplomacy', weight: 7, text: 'Diplomacy, coalition building, bipartisan cooperation, conflict de-escalation.' },
  { key: 'underdog', weight: 9, text: 'Underdog campaigns with realistic path-to-victory and constrained resources.' },
  { key: 'scale', weight: 7, text: 'Economies of scale, efficient operations, volunteer leverage, budget discipline.' },
  { key: 'winning', weight: 8, text: 'Winning strategy, turnout model, persuasion plan, field execution.' },
  { key: 'transparency', weight: 6, text: 'Transparent governance, fair process, measurable outcomes, ethical campaigning.' },
]

function randNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random()
  const v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return mean + z * stdDev
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function makePersonalityLine(discountPct: number, missionImpact: number): string {
  if (discountPct >= 75) {
    return 'Antelope: "Exceptional clarity on mission and path to victory—this is the kind of partnership we want to back. Thank you for the rigor."'
  }
  if (discountPct >= 55) {
    return 'Antelope: "Strong, practical case. We are glad to meet you at a number that reflects both impact and discipline."'
  }
  if (discountPct >= 35) {
    return 'Antelope: "Solid foundation—good intent and enough detail to move forward together."'
  }
  if (discountPct >= 15) {
    return missionImpact >= 4
      ? 'Antelope: "Worthy mission; we would love a bit more specificity on execution next time, but this is a fair starting point."'
      : 'Antelope: "There is something to build on here—keep sharpening the plan, and we will keep listening."'
  }
  return 'Antelope: "Everyone starts from a respectful baseline; share more on field and outcomes and we can keep calibrating."'
}

function cumulativeFavorabilityScore(input: string, missionImpact: number, referralPotential: number) {
  const text = input.toLowerCase()
  let score = 22 + missionImpact * 4 + referralPotential * 3
  const hits: string[] = []
  for (const item of FEATURE_RAG) {
    const terms = item.text.toLowerCase().split(/[,\s]+/).filter((t) => t.length > 4)
    const matched = terms.some((t) => text.includes(t))
    if (matched) {
      score += item.weight
      hits.push(item.key)
    }
  }
  if (text.includes('realistic') || text.includes('path to victory') || text.includes('ground game')) score += 8
  if (text.length < 30) score -= 12
  score = clamp(Math.round(score), 1, 100)
  return { score, hits }
}

export async function POST(req: NextRequest) {
  try {
    const store = pricingBotStore()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()
    const events = (store.ipEvents.get(ip) || []).filter((t) => now - t < 24 * 60 * 60 * 1000)
    const last = events.length ? events[events.length - 1] : 0
    if (events.length >= 15 || (last && now - last < 30_000)) {
      store.stats.quote429Blocked += 1
      return NextResponse.json(
        {
          status: false,
          message: 'Slow down a bit. Pricing Bot has a short cooldown to prevent abuse.',
        },
        { status: 429 }
      )
    }
    events.push(now)
    store.ipEvents.set(ip, events)

    const body = (await req.json()) as PricingQuoteRequest
    const teamSize = Math.max(1, Number(body.teamSize || 1))
    const constituencySize = Math.max(1, Number(body.constituencySize || 1000))
    const missionImpact = clamp(Number(body.missionImpact ?? 1), 1, 5)
    const referralPotential = clamp(Number(body.referralPotential ?? 1), 1, 5)
    const reductionSoughtPct = clamp(Number(body.reductionSoughtPct || 20), 0, 90)
    const convinceText = String(body.convinceText || '').trim()
    const pitchText = buildEnrichedPitch(body, convinceText)
    const campaignType = String(body.campaignType || 'other').toLowerCase()
    const favorability = cumulativeFavorabilityScore(pitchText, missionImpact, referralPotential)

    const listPrice = 650

    const qualityScore =
      (pitchText.length >= 160 ? 2 : pitchText.length >= 90 ? 1 : 0) +
      (missionImpact >= 4 ? 2 : missionImpact >= 3 ? 1 : 0) +
      (referralPotential >= 4 ? 2 : referralPotential >= 3 ? 1 : 0) +
      (teamSize <= 5 ? 1 : 0) +
      (favorability.score >= 72 ? 1 : 0)
    const reasonable = qualityScore >= 4
    const standardDiscountEligible = qualityScore >= 5 && pitchText.length >= 120

    // Merit 0–1: drives mean of normal distribution (discount starts at 5% floor, rises with merit).
    const merit = clamp(
      (qualityScore / 7) * 0.28 +
        (favorability.score / 100) * 0.42 +
        Math.min(1, pitchText.length / 220) * 0.22 +
        (reasonable ? 0.08 : 0),
      0,
      1
    )
    const rareMission = missionImpact >= 5 || /crisis|urgent|special election|ballot access|civil rights|tribal/i.test(pitchText)
    const verySmallScale =
      constituencySize <= 20000 ||
      teamSize <= 3 ||
      /mayor|town|school board|borough|ward/i.test(campaignType) ||
      /small town|local race|municipal/i.test(pitchText)
    const qualifiesDeepDiscount = reasonable && (rareMission || verySmallScale)
    const meritBoost = qualifiesDeepDiscount ? 6 + randNormal(0, 2.5) : 0

    const meanDiscount = 5 + merit * 36 + Math.max(0, meritBoost)
    const discountPct = clamp(Math.round(randNormal(meanDiscount, 5.2)), 5, 82)

    let finalPrice = Math.max(99, Math.round(listPrice * (1 - discountPct / 100)))

    // Respect requested discount as a soft ceiling when pitch clears baseline.
    const requestedPrice = Math.round(listPrice * (1 - reductionSoughtPct / 100))
    if (standardDiscountEligible && reductionSoughtPct > 0) {
      finalPrice = Math.min(finalPrice, Math.max(99, requestedPrice))
    }

    const gotFloor = qualifiesDeepDiscount && Math.random() < 0.06
    if (gotFloor) {
      finalPrice = 99
    }

    const needsHumanReview =
      finalPrice <= 199 ||
      missionImpact >= 5 ||
      pitchText.length < 40 ||
      /not sure|unsure|complex|custom contract|enterprise/i.test(pitchText)

    const discountPctFinal = Math.round(((listPrice - finalPrice) / listPrice) * 100)
    const personalityLine = makePersonalityLine(discountPctFinal, missionImpact)
    const quoteToken = crypto.randomUUID()
    const referralToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

    const rationale: string[] = []
    rationale.push(`List price starts at $${listPrice}/mo; discounts begin at 5% and scale by merit (normal distribution).`)
    if (standardDiscountEligible) rationale.push('Request cleared baseline for alignment with requested discount cap.')
    if (!standardDiscountEligible) rationale.push('Merit-weighted discount applied from 5% floor.')
    if (qualifiesDeepDiscount) rationale.push('Mission or scale profile allowed a modest uplift to the mean discount.')
    if (gotFloor) rationale.push('Rare-value cohort: exceptional floor applied after review of fit.')
    if (needsHumanReview) rationale.push('Recommended for human review before final lock.')

    store.stats.quotesTotal += 1
    if (finalPrice === 650) store.stats.tier650 += 1
    else if (finalPrice >= 500) store.stats.tier500to649 += 1
    else if (finalPrice >= 350) store.stats.tier350to499 += 1
    else if (finalPrice >= 100) store.stats.tier100to349 += 1
    else store.stats.tier99 += 1

    store.quotes.set(quoteToken, {
      token: quoteToken,
      createdAt: now,
      ip,
      listPrice,
      finalPrice,
      discountPct: discountPctFinal,
      needsHumanReview,
      shareBonusApplied: false,
      shareActions: [],
      referralToken,
    })
    store.referrals.set(referralToken, {
      token: referralToken,
      quoteToken,
      createdAt: now,
      clicks: 0,
      conversions: 0,
    })

    const promoMonths = 3

    return NextResponse.json({
      status: true,
      quote: {
        quoteToken,
        listPrice,
        finalPrice,
        discountPct: discountPctFinal,
        favorabilityScore: favorability.score,
        currency: 'USD',
        interval: 'month',
        priceNote: `for the first ${promoMonths} months`,
        promoMonths,
        needsHumanReview,
      },
      debug: {
        reasonable,
        rareMission,
        verySmallScale,
        qualifiesDeepDiscount,
        qualityScore,
        reductionSoughtPct,
        favorabilityHits: favorability.hits,
      },
      rationale,
      personalityLine,
      shareText: `Antelope offered ${discountPctFinal}% off (${finalPrice}/mo for the first ${promoMonths} months)—fair, serious, worth a look.`,
      referralLink: `/api/pricing-bot/referral/${referralToken}?redirect=/auth/register`,
    })
  } catch (error) {
    console.error('pricing-bot quote error:', error)
    return NextResponse.json({ status: false, message: 'Failed to generate quote' }, { status: 500 })
  }
}

