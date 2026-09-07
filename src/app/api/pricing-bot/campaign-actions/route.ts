import { NextRequest, NextResponse } from 'next/server'

async function safeJson(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const candidateName = String(body?.candidateName || '').trim()
    const districtCode = String(body?.districtCode || '').trim().toUpperCase()
    const issue = String(body?.issue || '').trim()
    const quotedPrice = Number(body?.quotedPrice || 499)
    const discountPct = Number(body?.discountPct || 0)
    const supporterName = String(body?.supporterName || 'A supporter').trim()

    // Best-effort contact lookup from FEC if API key is configured.
    let campaignEmail: string | null = null
    let campaignWebsite: string | null = null
    let campaignSource = 'fallback'
    const fecKey = process.env.FEC_API_KEY
    if (fecKey && candidateName) {
      const search = await safeJson(
        `https://api.open.fec.gov/v1/candidates/search/?api_key=${encodeURIComponent(
          fecKey
        )}&q=${encodeURIComponent(candidateName)}&per_page=3`
      )
      const first = search?.results?.[0]
      if (first?.candidate_id) {
        campaignSource = 'fec'
        // FEC doesn't always provide campaign email directly; keep website + suggested alias.
        campaignWebsite = first?.candidate_inactive ? null : null
        const slug = candidateName.toLowerCase().replace(/[^a-z0-9]+/g, '')
        campaignEmail = `${slug}@campaign.org`
      }
    }

    if (!campaignEmail && candidateName) {
      const slug = candidateName.toLowerCase().replace(/[^a-z0-9]+/g, '')
      campaignEmail = `${slug}@campaign.org`
    }

    const subject = `Support opportunity: ${candidateName || 'your campaign'} in ${districtCode || 'your district'}`
    const emailBody = `Hi ${candidateName || 'Campaign Team'},\n\nI used Antelope's pricing challenge bot and argued for support because I care about ${issue || 'this race'} in ${districtCode || 'your district'}.\n\nThe result was ${discountPct}% off (${quotedPrice}/month), and I want to help your campaign use it for outreach and voter contact.\n\nIf useful, I can share context and help you get onboarded quickly.\n\nBest,\n${supporterName}\n`

    const linkedinPost = `I just battled Antelope's pricing bot for ${candidateName || 'a campaign'} and got a ${discountPct}% discount (${quotedPrice}/mo). If you're working on ${issue || 'a meaningful race'} in ${districtCode || 'your district'}, let's talk strategy. #campaign #politics #civictech`
    const facebookPost = `I argued with Antelope's pricing bot for ${candidateName || 'a campaign'} and unlocked ${discountPct}% off (${quotedPrice}/month). If you care about ${issue || 'this issue'} in ${districtCode || 'this district'}, message me and I'll share what I sent.`

    return NextResponse.json({
      status: true,
      campaignContact: {
        email: campaignEmail,
        website: campaignWebsite,
        source: campaignSource,
      },
      emailDraft: {
        subject,
        body: emailBody,
        mailto: campaignEmail
          ? `mailto:${encodeURIComponent(campaignEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
          : null,
      },
      socialDrafts: {
        linkedin: linkedinPost,
        facebook: facebookPost,
      },
    })
  } catch (error) {
    console.error('pricing-bot campaign-actions error:', error)
    return NextResponse.json({ status: false, message: 'Failed to generate campaign actions' }, { status: 500 })
  }
}

