import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore, type PricingBotProfile, type PricingChatMessage, type PricingBotStats } from '../_store'

const PROMO_MONTHS = 3
const LIST_PRICE = 650

const KEYWORDS = [
  { re: /econom|job|afford|small business|growth/i, w: 3 },
  { re: /coalition|bipartisan|diplom|de-escalat/i, w: 2 },
  { re: /underdog|grassroots|field|canvass|turnout/i, w: 3 },
  { re: /scale|efficien|volunteer|budget|lean/i, w: 2 },
  { re: /win|path to victory|persuasion|swing|model/i, w: 3 },
  { re: /transparen|ethic|govern|account/i, w: 2 },
]

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function randNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random()
  const v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return mean + z * stdDev
}

function scoreDeltaFromMessage(text: string): number {
  const t = text.trim()
  if (t.length < 12) return -2
  let d = 2 + Math.min(5, Math.floor(t.length / 100))
  for (const k of KEYWORDS) {
    if (k.re.test(t)) d += k.w
  }
  if (/realistic|ground game|data|plan|metric/i.test(t)) d += 2
  if (t.length < 40) d -= 1
  return clamp(Math.round(d), -5, 14)
}

/** Floor 5% off list; mean rises with favorability and turns; spread via normal distribution. */
function computeChatDiscountPct(cumulative: number, userTurnCount: number): number {
  const BASE = 5
  const s = cumulative / 100
  const turnFactor = Math.min(1, Math.pow((userTurnCount + 1) / 16, 1.05))
  // Mean total discount roughly 7% early → mid-30s at strong, multi-turn engagement
  const meanTotal = BASE + s * 26 * turnFactor + turnFactor * 6 + (userTurnCount / 14) * 4
  const stdDev = 3.2 + (1 - turnFactor) * 1.8
  let pct = Math.round(randNormal(meanTotal, stdDev))
  pct = clamp(pct, BASE, 48)
  return pct
}

function makeBotReply(args: {
  delta: number
  cumulative: number
  discountPct: number
  finalPrice: number
  turn: number
  sought: number
}): string {
  const { delta, cumulative, discountPct, finalPrice, turn, sought } = args
  const soughtLine =
    sought > 0
      ? ` You mentioned ~${sought}% off list—we will see how the numbers land; promo pricing applies to the first ${PROMO_MONTHS} months.`
      : ''

  if (delta >= 0) {
    if (discountPct < 14) {
      return `Antelope: "Thank you—that helps. Cumulative relationship score is ${cumulative}/100.${soughtLine} When you are ready, add a bit more detail on field or impact and we can keep refining." Current quote: $${finalPrice}/mo for the first ${PROMO_MONTHS} months (${discountPct}% off list).`
    }
    if (discountPct < 30) {
      return `Antelope: "This is constructive—clearer strategy than many first passes. Score ${cumulative}/100.${soughtLine}" Revised quote: $${finalPrice}/mo for the first ${PROMO_MONTHS} months (${discountPct}% off).`
    }
    return `Antelope: "Strong case—mission, plan, and execution all showing up. Favorability ${cumulative}/100.${soughtLine}" $${finalPrice}/mo for the first ${PROMO_MONTHS} months (${discountPct}% off). We want this partnership to work for you.`
  }

  if (turn <= 2) {
    return `Antelope: "I appreciate you engaging. Score ${cumulative}/100.${soughtLine} If you can share turnout assumptions, coalition story, or one concrete metric, we can calibrate further." Quote remains $${finalPrice}/mo for the first ${PROMO_MONTHS} months (${discountPct}% off).`
  }
  return `Antelope: "Still listening—let us tighten the next note with something measurable or constituency-specific. Favorability ${cumulative}/100.${soughtLine}" $${finalPrice}/mo for the first ${PROMO_MONTHS} months (${discountPct}% off).`
}

function welcomeMessage(profile: PricingBotProfile): string {
  const name = profile.candidateName?.trim() || 'your candidate'
  const race = profile.campaignType?.trim() || 'this race'
  const dist = profile.districtCode?.trim()
  const sought = profile.reductionSoughtPct
  const distBit = dist ? ` (${dist})` : ''
  const site = profile.campaignWebsite?.trim()
  const siteBit = site ? ` I noted your site (${site}).` : ''
  return `Antelope: "Good to meet you—${name} for ${race}${distBit}.${siteBit} List is $${LIST_PRICE}/mo for the first ${PROMO_MONTHS} months before any adjustment.${sought > 0 ? ` You are aiming for roughly ${sought}% off; we will work from a respectful baseline and build from there.` : ''} In a sentence or two, what is your clearest path to victory, and what would success mean for the communities you serve?"`
}

function tierKeyForPrice(finalPrice: number): keyof Pick<
  PricingBotStats,
  'tier650' | 'tier500to649' | 'tier350to499' | 'tier100to349' | 'tier99'
> {
  if (finalPrice === 650) return 'tier650'
  if (finalPrice >= 500) return 'tier500to649'
  if (finalPrice >= 350) return 'tier350to499'
  if (finalPrice >= 100) return 'tier100to349'
  return 'tier99'
}

function checkRateLimit(store: ReturnType<typeof pricingBotStore>, ip: string, now: number): boolean {
  const events = (store.ipEvents.get(ip) || []).filter((t) => now - t < 24 * 60 * 60 * 1000)
  const last = events.length ? events[events.length - 1] : 0
  if (events.length >= 40 || (last && now - last < 12_000)) return false
  events.push(now)
  store.ipEvents.set(ip, events)
  return true
}

export async function POST(req: NextRequest) {
  try {
    const store = pricingBotStore()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()

    const body = (await req.json()) as {
      action?: 'start' | 'message'
      sessionId?: string
      userMessage?: string
      profile?: Partial<PricingBotProfile>
    }

    if (body.action === 'start') {
      if (!checkRateLimit(store, ip, now)) {
        store.stats.quote429Blocked += 1
        return NextResponse.json(
          { status: false, message: 'Slow down. Short cooldown on chat messages.' },
          { status: 429 }
        )
      }

      const profile: PricingBotProfile = {
        campaignType: String(body.profile?.campaignType || '').trim() || 'Campaign',
        candidateName: String(body.profile?.candidateName || '').trim(),
        districtCode: String(body.profile?.districtCode || '').trim(),
        campaignWebsite: String(body.profile?.campaignWebsite || '').trim(),
        reductionSoughtPct: clamp(Number(body.profile?.reductionSoughtPct ?? 20), 0, 90),
      }

      const quoteToken = crypto.randomUUID()
      const referralToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const welcome: PricingChatMessage = { role: 'assistant', content: welcomeMessage(profile) }

      store.quotes.set(quoteToken, {
        token: quoteToken,
        createdAt: now,
        ip,
        listPrice: LIST_PRICE,
        finalPrice: LIST_PRICE,
        discountPct: 0,
        needsHumanReview: false,
        shareBonusApplied: false,
        shareActions: [],
        referralToken,
        chatMessages: [welcome],
        cumulativeFavorabilityScore: 0,
        userTurnCount: 0,
        profile,
      })

      store.referrals.set(referralToken, {
        token: referralToken,
        quoteToken,
        createdAt: now,
        clicks: 0,
        conversions: 0,
      })

      store.stats.quotesTotal += 1
      store.stats.tier650 += 1

      return NextResponse.json({
        status: true,
        promoMonths: PROMO_MONTHS,
        sessionId: quoteToken,
        quote: {
          quoteToken,
          listPrice: LIST_PRICE,
          finalPrice: LIST_PRICE,
          discountPct: 0,
          favorabilityScore: 0,
          currency: 'USD',
          interval: 'month',
          priceNote: `for the first ${PROMO_MONTHS} months`,
          needsHumanReview: false,
        },
        messages: [welcome],
        cumulativeFavorabilityScore: 0,
        referralLink: `/api/pricing-bot/referral/${referralToken}?redirect=/register`,
      })
    }

    if (body.action === 'message') {
      if (!checkRateLimit(store, ip, now)) {
        store.stats.quote429Blocked += 1
        return NextResponse.json(
          { status: false, message: 'Slow down. Short cooldown on chat messages.' },
          { status: 429 }
        )
      }

      const sessionId = String(body.sessionId || '')
      const userMessage = String(body.userMessage || '').trim()
      const q = store.quotes.get(sessionId)
      if (!q || !q.profile) {
        return NextResponse.json({ status: false, message: 'Session not found. Start a new chat.' }, { status: 404 })
      }
      if (!userMessage) {
        return NextResponse.json({ status: false, message: 'Message required.' }, { status: 400 })
      }

      const prevTier = tierKeyForPrice(q.finalPrice)
      store.stats[prevTier] = Math.max(0, store.stats[prevTier] - 1)

      const delta = scoreDeltaFromMessage(userMessage)
      const cumulative = clamp((q.cumulativeFavorabilityScore ?? 0) + delta, 0, 100)
      const userTurnCount = (q.userTurnCount ?? 0) + 1
      const discountPct = computeChatDiscountPct(cumulative, userTurnCount)
      const finalPrice = Math.max(99, Math.round(LIST_PRICE * (1 - discountPct / 100)))

      const userMsg: PricingChatMessage = { role: 'user', content: userMessage }
      const reply = makeBotReply({
        delta,
        cumulative,
        discountPct,
        finalPrice,
        turn: userTurnCount,
        sought: q.profile.reductionSoughtPct,
      })
      const assistantMsg: PricingChatMessage = { role: 'assistant', content: reply }

      const messages = [...(q.chatMessages || []), userMsg, assistantMsg]
      q.chatMessages = messages
      q.cumulativeFavorabilityScore = cumulative
      q.userTurnCount = userTurnCount
      q.discountPct = discountPct
      q.finalPrice = finalPrice
      q.needsHumanReview = finalPrice <= 199 || userMessage.length < 25

      const newTier = tierKeyForPrice(finalPrice)
      store.stats[newTier] += 1

      return NextResponse.json({
        status: true,
        promoMonths: PROMO_MONTHS,
        sessionId,
        quote: {
          quoteToken: sessionId,
          listPrice: LIST_PRICE,
          finalPrice,
          discountPct,
          favorabilityScore: cumulative,
          currency: 'USD',
          interval: 'month',
          priceNote: `for the first ${PROMO_MONTHS} months`,
          needsHumanReview: q.needsHumanReview,
        },
        messages,
        cumulativeFavorabilityScore: cumulative,
        deltaFavorability: delta,
        shareText: `Antelope: my campaign just earned ${discountPct}% off list ($${finalPrice}/mo for the first ${PROMO_MONTHS} months). Fair partners, sharp strategy.`,
        referralLink: `/api/pricing-bot/referral/${q.referralToken}?redirect=/register`,
      })
    }

    return NextResponse.json({ status: false, message: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('pricing-bot chat error:', error)
    return NextResponse.json({ status: false, message: 'Chat failed' }, { status: 500 })
  }
}
