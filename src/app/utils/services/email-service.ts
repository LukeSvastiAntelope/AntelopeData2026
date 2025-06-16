const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM_EMAIL = 'noreply@getantelope.com'
const FROM_NAME = 'Antelope Surveys'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getantelope.com'

export class EmailService {
  /**
   * Send survey completion confirmation with Digital Twin link via SendGrid REST API.
   * No external SDK required – uses native fetch.
   */
  static async sendSurveyConfirmation(
    toEmail: string,
    toName: string,
    agentToken: string
  ): Promise<void> {
    const twinUrl = `${BASE_URL}/digital-twin/${agentToken}`

    const htmlContent = `
      <p>Hi ${toName || 'there'},</p>
      <p>Thank you for completing our survey. We've used your answers to create a Digital Twin that captures your unique perspectives.</p>
      <p>You can review it, add more details, or delete it at any time using the link below:</p>
      <p><a href="${twinUrl}" target="_blank" rel="noopener noreferrer">View Your Digital Twin</a></p>
      <p>If you have any questions, feel free to reply to this email.</p>
      <p>— The Antelope Team</p>
    `

    const payload = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName || undefined }],
          subject: 'Your Digital Twin is Ready',
        },
      ],
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      content: [
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    }

    try {
      if (!SENDGRID_API_KEY) {
        console.warn('[EmailService] SENDGRID_API_KEY not set – email not sent. Payload:', payload)
        return
      }

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`SendGrid API responded with ${res.status}: ${text}`)
      }

      console.log(`[EmailService] Confirmation email sent to ${toEmail}`)
    } catch (error) {
      console.error('[EmailService] Failed to send confirmation email:', error)
      // Don't throw; avoid breaking user flow
    }
  }
} 