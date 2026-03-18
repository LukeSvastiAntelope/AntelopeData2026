import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'
import { createCompletion } from '@/app/utils/services/ai-service'

export const runtime = 'nodejs'
export const maxDuration = 120

type Recipient = { email?: string; phone?: string; name?: string }

function buildPrompt(args: {
  recipient: Recipient
  tone: string
  campaignContext: string
  ctaUrl: string
  channel: 'email' | 'sms'
}) {
  const { recipient, tone, campaignContext, ctaUrl, channel } = args
  const name = recipient.name ? `Name: ${recipient.name}` : 'Name: (unknown)'
  const medium = channel === 'sms' ? 'SMS text message' : 'email message (no subject needed)'

  return [
    `You are writing a ${medium} for campaign fundraising.`,
    `Write in this tone: ${tone || 'friendly, concise, fundraising'}.`,
    `Personalize lightly. Do not invent facts about the person.`,
    `Include exactly one quick micro-poll question that can be answered by replying with A/B/C (keep options short).`,
    `Include a clear donation call-to-action link.`,
    `Keep it short:`,
    channel === 'sms' ? `- max 320 characters if possible` : `- max 900 characters`,
    ``,
    `Campaign context:`,
    campaignContext || '(none provided)',
    ``,
    `Recipient info:`,
    name,
    recipient.email ? `Email: ${recipient.email}` : '',
    recipient.phone ? `Phone: ${recipient.phone}` : '',
    ``,
    `Donation link: ${ctaUrl || '(missing)'}`,
    ``,
    `Return ONLY the message body text.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params
    const userId = request.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      channel,
      model,
      tone,
      campaignContext,
      ctaUrl,
      recipients,
    } = body as {
      channel: 'email' | 'sms'
      model: string
      tone?: string
      campaignContext?: string
      ctaUrl?: string
      recipients: Recipient[]
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ status: false, message: 'No recipients provided' }, { status: 400 })
    }
    if (channel !== 'email' && channel !== 'sms') {
      return NextResponse.json({ status: false, message: 'Unsupported channel for preview' }, { status: 400 })
    }

    const db = await openSql()
    const [surveys]: any = await db.execute(
      'SELECT id FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    )
    if (!surveys || surveys.length === 0) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 })
    }

    const take = recipients.slice(0, 5)
    const preview = await Promise.all(
      take.map(async (r) => {
        const to = channel === 'email' ? (r.email || r.phone || 'unknown') : (r.phone || r.email || 'unknown')
        const prompt = buildPrompt({
          recipient: r,
          tone: tone || '',
          campaignContext: campaignContext || '',
          ctaUrl: ctaUrl || '',
          channel,
        })
        const result = await createCompletion({
          model: model || 'gpt-4o-mini',
          temperature: 0.5,
          maxTokens: 300,
          messages: [
            { role: 'system', content: 'You are a careful political fundraising copywriter.' },
            { role: 'user', content: prompt },
          ],
        })
        return { to, message: (result.content || '').trim() }
      })
    )

    return NextResponse.json({ status: true, preview })
  } catch (error) {
    console.error('content-messaging preview error:', error)
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Preview failed' },
      { status: 500 }
    )
  }
}

