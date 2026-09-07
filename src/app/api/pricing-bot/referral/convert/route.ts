import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore } from '../../_store'

export async function POST(req: NextRequest) {
  try {
    const { token } = (await req.json()) as { token?: string }
    if (!token) {
      return NextResponse.json({ status: false, message: 'token is required' }, { status: 400 })
    }
    const store = pricingBotStore()
    const referral = store.referrals.get(token)
    if (!referral) {
      return NextResponse.json({ status: false, message: 'Referral not found' }, { status: 404 })
    }
    referral.conversions += 1
    store.stats.referralConversions += 1
    return NextResponse.json({ status: true, conversions: referral.conversions })
  } catch (error) {
    console.error('pricing-bot referral convert error:', error)
    return NextResponse.json({ status: false, message: 'Failed to track conversion' }, { status: 500 })
  }
}

