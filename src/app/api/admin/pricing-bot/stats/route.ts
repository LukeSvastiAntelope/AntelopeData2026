import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pricingBotStore } from '@/app/api/pricing-bot/_store'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const store = pricingBotStore()
  return NextResponse.json({
    status: true,
    stats: store.stats,
    activeQuoteSessions: store.quotes.size,
    activeReferralTokens: store.referrals.size,
  })
}

