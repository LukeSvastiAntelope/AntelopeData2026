import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'
import { createCompletion } from '@/app/utils/services/ai-service'
import { EmailService } from '@/app/utils/services/email-service'

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

async function sendSms(surveyId: string, phoneNumbers: string[], message: string, userId: string) {
  // Reuse existing SMS route logic by calling it internally is non-trivial; keep a minimal Twilio sender here.
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER
  const twilioConfigured = !!(twilioSid && twilioToken && twilioPhone)

  if (!twilioConfigured) {
    return {
      sent: false,
      reason: 'twilio_not_configured',
      formattedMessage: message,
      phoneNumbers,
    }
  }

  let twilio: any
  try {
    twilio = (await import('twilio')).default
  } catch {
    return {
      sent: false,
      reason: 'twilio_not_installed',
      formattedMessage: message,
      phoneNumbers,
    }
  }

  const client = twilio(twilioSid, twilioToken)
  const results: Array<{ phone: string; status: 'sent' | 'failed'; sid?: string; error?: string }> = []

  const batchSize = 10
  for (let i = 0; i < phoneNumbers.length; i += batchSize) {
    const batch = phoneNumbers.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(async (phone) => {
        const msg = await client.messages.create({
          body: message,
          to: phone.trim(),
          from: twilioPhone,
        })
        return { phone, status: 'sent' as const, sid: msg.sid }
      })
    )

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j]
      const phone = batch[j]
      if (r.status === 'fulfilled') results.push(r.value)
      else results.push({ phone, status: 'failed', error: (r as any).reason?.message || 'Unknown error' })
    }
  }

  return { sent: true, results }
}

async function sendEmail(toEmail: string, toName: string | undefined, message: string) {
  const sendgridKey = process.env.SENDGRID_API_KEY
  if (!sendgridKey) {
    return { sent: false, reason: 'sendgrid_not_configured' as const }
  }

  // Minimal transactional email using existing service conventions (from EmailService).
  // We keep subject simple; this can be improved in UI later.
  const subject = 'A quick question'
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;">${escapeHtml(
    message
  ).replace(/\n/g, '<br/>')}</div>`

  const payload = {
    personalizations: [{ to: [{ email: toEmail, name: toName || undefined }], subject }],
    from: { email: 'noreply@getantelope.com', name: 'Antelope' },
    content: [{ type: 'text/html', value: html }],
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendgridKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { sent: false, reason: 'sendgrid_error' as const, error: text || `HTTP ${res.status}` }
  }

  return { sent: true }
}

function escapeHtml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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
    if (recipients.length > 500) {
      return NextResponse.json({ status: false, message: 'Maximum 500 recipients per request' }, { status: 400 })
    }
    if (channel !== 'email' && channel !== 'sms') {
      return NextResponse.json({ status: false, message: 'Unsupported channel' }, { status: 400 })
    }

    const db = await openSql()
    const [surveys]: any = await db.execute(
      'SELECT id FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    )
    if (!surveys || surveys.length === 0) {
      return NextResponse.json({ status: false, message: 'Survey not found' }, { status: 404 })
    }

    // Generate + send sequentially (keeps AI/provider load predictable). Optimize later with batching/queue.
    const results: Array<{ to: string; status: 'sent' | 'failed'; error?: string }> = []

    for (const r of recipients) {
      const to = channel === 'email' ? (r.email || '') : (r.phone || '')
      if (!to) {
        results.push({ to: 'missing', status: 'failed', error: 'Missing destination for channel' })
        continue
      }

      const prompt = buildPrompt({
        recipient: r,
        tone: tone || '',
        campaignContext: campaignContext || '',
        ctaUrl: ctaUrl || '',
        channel,
      })

      const completion = await createCompletion({
        model: model || 'gpt-4o-mini',
        temperature: 0.6,
        maxTokens: 350,
        messages: [
          { role: 'system', content: 'You are a careful political fundraising copywriter.' },
          { role: 'user', content: prompt },
        ],
      })

      const message = (completion.content || '').trim()
      if (!message) {
        results.push({ to, status: 'failed', error: 'AI returned empty message' })
        continue
      }

      if (channel === 'sms') {
        const sms = await sendSms(surveyId, [to], message, userId)
        if ((sms as any).sent) results.push({ to, status: 'sent' })
        else results.push({ to, status: 'failed', error: (sms as any).reason || 'sms_failed' })
      } else {
        // email
        const emailRes = await sendEmail(to, r.name, message)
        if (emailRes.sent) results.push({ to, status: 'sent' })
        else results.push({ to, status: 'failed', error: (emailRes as any).reason || (emailRes as any).error || 'email_failed' })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
    const failed = results.filter(r => r.status === 'failed').length

    // touch EmailService so it stays in the bundle (and for future extension)
    void EmailService

    return NextResponse.json({
      status: true,
      summary: { total: results.length, sent, failed },
      results,
    })
  } catch (error) {
    console.error('content-messaging send error:', error)
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Send failed' },
      { status: 500 }
    )
  }
}

