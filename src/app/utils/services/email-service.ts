const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM_EMAIL = 'noreply@getantelope.com'
const FROM_NAME = 'Antelope Surveys'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getantelope.com'

export class EmailService {
  /**
   * Send survey completion confirmation with Digital Twin link for NEW users via SendGrid REST API.
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

  /**
   * Send survey completion confirmation for RETURNING users who already have a Digital Twin.
   */
  static async sendSurveyConfirmationReturning(
    toEmail: string,
    toName: string,
    agentToken: string
  ): Promise<void> {
    const twinUrl = `${BASE_URL}/digital-twin/${agentToken}`

    const htmlContent = `
      <p>Hi ${toName || 'there'},</p>
      <p>Thank you for completing another survey! We've updated your Digital Twin with your latest responses.</p>
      <p>Your Digital Twin now includes insights from multiple surveys, creating an even richer representation of your perspectives and opinions.</p>
      <p>You can review your updated profile and see all your survey responses using the link below:</p>
      <p><a href="${twinUrl}" target="_blank" rel="noopener noreferrer">View Your Updated Digital Twin</a></p>
      <p>If you have any questions, feel free to reply to this email.</p>
      <p>— The Antelope Team</p>
    `

    const payload = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName || undefined }],
          subject: 'Your Digital Twin Has Been Updated',
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

      console.log(`[EmailService] Returning user confirmation email sent to ${toEmail}`)
    } catch (error) {
      console.error('[EmailService] Failed to send returning user confirmation email:', error)
      // Don't throw; avoid breaking user flow
    }
  }

  /**
   * Send magic login link for Digital Twin access via SendGrid REST API.
   */
  static async sendTwinLoginLink(
    toEmail: string,
    toName: string | undefined,
    agentToken: string
  ): Promise<void> {
    const twinUrl = `${BASE_URL}/digital-twin/${agentToken}`

    const htmlContent = `
      <p>Hi ${toName || 'there'},</p>
      <p>You requested access to your Digital Twin profile on Antelope. Click the link below to securely access your profile:</p>
      <p><a href="${twinUrl}" target="_blank" rel="noopener noreferrer">Open Your Digital Twin</a></p>
      <p>This link will sign you in automatically. If you did not request this email, you can safely ignore it.</p>
      <p>— The Antelope Team</p>
    `

    const payload = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName || undefined }],
          subject: 'Your secure link to Antelope Digital Twin',
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

      console.log(`[EmailService] Magic link email sent to ${toEmail}`)
    } catch (error) {
      console.error('[EmailService] Failed to send magic link email:', error)
      // Don't throw; avoid breaking user flow
    }
  }
} 