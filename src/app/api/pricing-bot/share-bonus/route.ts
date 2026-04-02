import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore, type ShareAction } from '../_store'

export async function POST(req: NextRequest) {
  try {
    const { quoteToken, action } = (await req.json()) as { quoteToken?: string; action?: ShareAction }
    const validAction: ShareAction[] = ['linkedin', 'facebook', 'campaign_email']
    if (!quoteToken || !action || !validAction.includes(action)) {
      return NextResponse.json({ status: false, message: 'Missing quoteToken or invalid action' }, { status: 400 })
    }

    const store = pricingBotStore()
    const quote = store.quotes.get(quoteToken)
    if (!quote) {
      return NextResponse.json({ status: false, message: 'Quote session not found' }, { status: 404 })
    }

    if (quote.shareActions.includes(action)) {
      return NextResponse.json({
        status: true,
        quote: {
          finalPrice: quote.finalPrice,
          discountPct: quote.discountPct,
          shareBonusApplied: quote.shareBonusApplied,
        },
        message: 'Action already credited.',
      })
    }

    quote.shareActions.push(action)
    if (!quote.shareBonusApplied) {
      quote.shareBonusApplied = true
      const boostedPct = Math.min(90, quote.discountPct + 5)
      const boostedPrice = Math.max(99, Math.round(quote.listPrice * (1 - boostedPct / 100)))
      quote.discountPct = boostedPct
      quote.finalPrice = boostedPrice
      store.stats.shareBonusClaims += 1
    }

    return NextResponse.json({
      status: true,
      quote: {
        finalPrice: quote.finalPrice,
        discountPct: quote.discountPct,
        shareBonusApplied: quote.shareBonusApplied,
      },
      message: 'Share bonus processed.',
    })
  } catch (error) {
    console.error('pricing-bot share-bonus error:', error)
    return NextResponse.json({ status: false, message: 'Failed to process share bonus' }, { status: 500 })
  }
}

