import { NextRequest, NextResponse } from 'next/server'
import { pricingBotStore } from '../../_store'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const store = pricingBotStore()
  const referral = store.referrals.get(token)
  const redirectRaw = new URL(req.url).searchParams.get('redirect') || '/auth/register'
  const redirectTo = redirectRaw.startsWith('/') ? redirectRaw : '/auth/register'

  if (referral) {
    referral.clicks += 1
    store.stats.referralClicks += 1
  }

  const destination = new URL(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}ref=${encodeURIComponent(token)}`, req.url)
  return NextResponse.redirect(destination)
}

