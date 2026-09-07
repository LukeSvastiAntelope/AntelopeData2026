import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore } from '../_store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestId = `REV-${Date.now().toString(36).toUpperCase()}`
    const store = pricingBotStore()
    store.stats.reviewsSubmitted += 1

    // MVP: no persistence yet; log for ops visibility.
    console.log('Pricing human review request:', {
      requestId,
      submittedAt: new Date().toISOString(),
      payload: body,
    })

    return NextResponse.json({
      status: true,
      requestId,
      message: 'Human review request submitted. A team member will follow up.',
    })
  } catch (error) {
    console.error('pricing-bot review error:', error)
    return NextResponse.json({ status: false, message: 'Failed to submit human review' }, { status: 500 })
  }
}

