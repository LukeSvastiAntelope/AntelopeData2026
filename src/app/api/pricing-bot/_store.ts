type ShareAction = 'linkedin' | 'facebook' | 'campaign_email'

export type PricingChatMessage = { role: 'user' | 'assistant'; content: string }

export interface PricingBotProfile {
  campaignType: string
  candidateName: string
  districtCode: string
  campaignWebsite: string
  reductionSoughtPct: number
}

export interface QuoteSession {
  token: string
  createdAt: number
  ip: string
  listPrice: number
  finalPrice: number
  discountPct: number
  needsHumanReview: boolean
  shareBonusApplied: boolean
  shareActions: ShareAction[]
  referralToken: string
  /** Multi-turn pricing chat (optional; set when using /api/pricing-bot/chat) */
  chatMessages?: PricingChatMessage[]
  cumulativeFavorabilityScore?: number
  userTurnCount?: number
  profile?: PricingBotProfile
}

interface ReferralRecord {
  token: string
  quoteToken: string
  createdAt: number
  clicks: number
  conversions: number
}

export interface PricingBotStats {
  quotesTotal: number
  quote429Blocked: number
  reviewsSubmitted: number
  shareBonusClaims: number
  referralClicks: number
  referralConversions: number
  tier650: number
  tier500to649: number
  tier350to499: number
  tier100to349: number
  tier99: number
}

interface PricingBotStore {
  quotes: Map<string, QuoteSession>
  referrals: Map<string, ReferralRecord>
  ipEvents: Map<string, number[]>
  stats: PricingBotStats
}

const g = globalThis as unknown as { __pricingBotStore?: PricingBotStore }

function initStore(): PricingBotStore {
  return {
    quotes: new Map(),
    referrals: new Map(),
    ipEvents: new Map(),
    stats: {
      quotesTotal: 0,
      quote429Blocked: 0,
      reviewsSubmitted: 0,
      shareBonusClaims: 0,
      referralClicks: 0,
      referralConversions: 0,
      tier650: 0,
      tier500to649: 0,
      tier350to499: 0,
      tier100to349: 0,
      tier99: 0,
    },
  }
}

export function pricingBotStore(): PricingBotStore {
  if (!g.__pricingBotStore) g.__pricingBotStore = initStore()
  return g.__pricingBotStore
}

export type { ShareAction }

