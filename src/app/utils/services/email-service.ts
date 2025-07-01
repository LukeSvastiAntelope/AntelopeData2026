const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM_EMAIL = 'noreply@getantelope.com'
const FROM_NAME = 'Antelope Surveys'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getantelope.com'

export class EmailService {
  /**
   * Helper function to fetch available surveys for email inclusion
   */
  private static async getAvailableSurveys(limit: number = 5): Promise<Array<{id: number, title: string, slug: string}>> {
    try {
      // Import SurveyRepo directly to avoid HTTP calls within server-side code
      const { SurveyRepo } = await import("@/app/utils/database/survey-repo");
      
      const surveys = await SurveyRepo.getAllSurveys();
      const available = surveys
        .filter((s: any) => s.status === 'published' || s.status === 'active')
        .map((s: any) => ({ id: s.id, title: s.title, slug: s.slug }))
        .slice(0, limit);
      
      return available;
    } catch (error) {
      console.warn('[EmailService] Failed to fetch available surveys for email:', error);
      return [];
    }
  }

  /**
   * Generate HTML for survey list in email
   */
  private static generateSurveyListHTML(surveys: Array<{id: number, title: string, slug: string}>): string {
    if (surveys.length === 0) {
      return `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #6c757d; margin: 0 0 10px 0; font-size: 16px;">🔍 New Surveys Coming Soon</h3>
          <p style="color: #6c757d; margin: 0; font-size: 14px;">
            We're working on bringing you more interesting surveys. Check back soon!
          </p>
        </div>
      `;
    }

    const surveyItems = surveys.map(survey => `
      <div style="background: white; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin: 10px 0;">
        <h4 style="margin: 0 0 8px 0; color: #212529; font-size: 15px;">${survey.title}</h4>
        <p style="margin: 0 0 12px 0; color: #6c757d; font-size: 13px;">
          Share your perspective and enhance your digital twin
        </p>
        <a href="${BASE_URL}/survey/${survey.slug}" 
           style="display: inline-block; background: #007bff; color: white; padding: 8px 16px; 
                  text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: 500;">
          Take Survey →
        </a>
      </div>
    `).join('');

    return `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #212529; margin: 0 0 15px 0; font-size: 16px;">📋 More Surveys Available</h3>
        <p style="color: #6c757d; margin: 0 0 15px 0; font-size: 14px;">
          Continue building your digital twin by participating in these surveys:
        </p>
        ${surveyItems}
        ${surveys.length >= 5 ? `
          <div style="text-align: center; margin-top: 15px;">
            <a href="${BASE_URL}/surveys" 
               style="color: #007bff; text-decoration: none; font-size: 13px;">
              View all available surveys →
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Send survey completion confirmation with Digital Twin link for NEW users via SendGrid REST API.
   * No external SDK required – uses native fetch.
   */
  static async sendSurveyConfirmation(
    toEmail: string,
    toName: string,
    agentToken: string
  ): Promise<void> {
    const twinUrl = `${BASE_URL}/digital-twin/${agentToken}`;
    
    // Fetch available surveys (with timeout to prevent blocking email)
    let availableSurveys: Array<{id: number, title: string, slug: string}> = [];
    try {
      const surveysPromise = this.getAvailableSurveys(4);
      const timeoutPromise = new Promise<Array<{id: number, title: string, slug: string}>>(resolve => 
        setTimeout(() => resolve([]), 2000) // 2 second timeout
      );
      availableSurveys = await Promise.race([surveysPromise, timeoutPromise]);
    } catch (error) {
      console.warn('[EmailService] Failed to fetch surveys for email, proceeding without them:', error);
    }
    const surveyListHTML = this.generateSurveyListHTML(availableSurveys);

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">🎉 Your Digital Twin is Ready!</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <p style="color: #212529; font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">
            Hi ${toName || 'there'},
          </p>
          
          <p style="color: #212529; font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">
            Thank you for completing our survey! We've analyzed your responses and created a Digital Twin that captures your unique perspectives and values.
          </p>

          <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #1976d2; margin: 0 0 10px 0; font-size: 16px;">🧠 What's Your Digital Twin?</h3>
            <p style="color: #424242; margin: 0; font-size: 14px; line-height: 1.5;">
              Your Digital Twin is an AI representation of your thoughts, preferences, and opinions. It can answer questions, provide insights, and help researchers understand diverse perspectives while keeping your identity private.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${twinUrl}" 
               style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
              🔗 View Your Digital Twin
            </a>
          </div>

          ${surveyListHTML}

          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px;">✨ Make It Even Better</h3>
            <p style="color: #856404; margin: 0 0 10px 0; font-size: 14px;">
              Your Digital Twin becomes more accurate and insightful as you:
            </p>
            <ul style="color: #856404; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Complete more surveys</li>
              <li>Update your profile information</li>
              <li>Engage with the platform regularly</li>
            </ul>
          </div>

          <p style="color: #6c757d; font-size: 14px; line-height: 1.5; margin: 20px 0 0 0;">
            You can review your Digital Twin, add more details, or delete it at any time. Your privacy and control are our top priorities.
          </p>

          <p style="color: #6c757d; font-size: 14px; line-height: 1.5; margin: 20px 0 0 0;">
            If you have any questions, feel free to reply to this email.
          </p>

          <p style="color: #212529; font-size: 16px; margin: 20px 0 0 0;">
            — The Antelope Team
          </p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent because you completed a survey on Antelope. 
            <a href="${twinUrl}" style="color: #007bff;">Manage your Digital Twin</a>
          </p>
        </div>
      </div>
    `;

    const payload = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName || undefined }],
          subject: 'Your Digital Twin is Ready! 🎉',
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
    };

    try {
      if (!SENDGRID_API_KEY) {
        console.warn('[EmailService] SENDGRID_API_KEY not set – email not sent. Payload:', payload);
        return;
      }

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SendGrid API responded with ${res.status}: ${text}`);
      }

      console.log(`[EmailService] Enhanced confirmation email sent to ${toEmail}`);
    } catch (error) {
      console.error('[EmailService] Failed to send confirmation email:', error);
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
    const twinUrl = `${BASE_URL}/digital-twin/${agentToken}`;
    
    // Fetch available surveys (with timeout to prevent blocking email)
    let availableSurveys: Array<{id: number, title: string, slug: string}> = [];
    try {
      const surveysPromise = this.getAvailableSurveys(4);
      const timeoutPromise = new Promise<Array<{id: number, title: string, slug: string}>>(resolve => 
        setTimeout(() => resolve([]), 2000) // 2 second timeout
      );
      availableSurveys = await Promise.race([surveysPromise, timeoutPromise]);
    } catch (error) {
      console.warn('[EmailService] Failed to fetch surveys for email, proceeding without them:', error);
    }
    const surveyListHTML = this.generateSurveyListHTML(availableSurveys);

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
        <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">🔄 Digital Twin Updated!</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <p style="color: #212529; font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">
            Hi ${toName || 'there'},
          </p>
          
          <p style="color: #212529; font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">
            Thank you for completing another survey! We've updated your Digital Twin with your latest responses, creating an even richer representation of your perspectives and opinions.
          </p>

          <div style="background: #e8f5e8; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #155724; margin: 0 0 10px 0; font-size: 16px;">📈 Your Digital Twin is Growing</h3>
            <p style="color: #155724; margin: 0; font-size: 14px; line-height: 1.5;">
              With each survey you complete, your Digital Twin becomes more sophisticated and accurate. It now includes insights from multiple surveys, providing a comprehensive view of your unique perspective.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${twinUrl}" 
               style="display: inline-block; background: #17a2b8; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
              🔗 View Your Updated Digital Twin
            </a>
          </div>

          ${surveyListHTML}

          <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #0c5460; margin: 0 0 10px 0; font-size: 16px;">🎯 Keep Building Your Profile</h3>
            <p style="color: #0c5460; margin: 0; font-size: 14px; line-height: 1.5;">
              Your Digital Twin is becoming more valuable with each interaction. Consider updating your profile information and exploring more surveys to unlock deeper insights about your perspectives.
            </p>
          </div>

          <p style="color: #6c757d; font-size: 14px; line-height: 1.5; margin: 20px 0 0 0;">
            You can review your updated profile, see all your survey responses, and manage your Digital Twin settings at any time.
          </p>

          <p style="color: #6c757d; font-size: 14px; line-height: 1.5; margin: 20px 0 0 0;">
            If you have any questions, feel free to reply to this email.
          </p>

          <p style="color: #212529; font-size: 16px; margin: 20px 0 0 0;">
            — The Antelope Team
          </p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; font-size: 12px; margin: 0;">
            This email was sent because you completed a survey on Antelope. 
            <a href="${twinUrl}" style="color: #007bff;">Manage your Digital Twin</a>
          </p>
        </div>
      </div>
    `;

    const payload = {
      personalizations: [
        {
          to: [{ email: toEmail, name: toName || undefined }],
          subject: 'Your Digital Twin Has Been Updated! 🔄',
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
    };

    try {
      if (!SENDGRID_API_KEY) {
        console.warn('[EmailService] SENDGRID_API_KEY not set – email not sent. Payload:', payload);
        return;
      }

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SendGrid API responded with ${res.status}: ${text}`);
      }

      console.log(`[EmailService] Enhanced returning user confirmation email sent to ${toEmail}`);
    } catch (error) {
      console.error('[EmailService] Failed to send returning user confirmation email:', error);
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