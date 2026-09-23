import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  captureSiteForm,
  checkSiteFormRateLimit,
  getOrgContactInbox,
  requestClientMeta,
} from '@/app/utils/services/site-form-capture';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@getantelope.com';
const FROM_EMAIL = 'noreply@getantelope.com';
const FROM_NAME = 'Antelope';

// Simple rate limiting (in-memory) — marketing contact path
const submissionTracker = new Map<string, number[]>();
const RATE_LIMIT = 3;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const submissions = submissionTracker.get(identifier) || [];
  const recentSubmissions = submissions.filter((time) => now - time < RATE_WINDOW);
  if (recentSubmissions.length >= RATE_LIMIT) return false;
  recentSubmissions.push(now);
  submissionTracker.set(identifier, recentSubmissions);
  return true;
}

/**
 * POST /api/contact
 *
 * Marketing path: { name, email, message } → Antelope admin inbox.
 * Site path (Sites S5): { siteSlug, name, email, message, organizationId? }
 *   → organization derived from published site slug; notifies campaign inbox.
 *   Client organizationId is ignored for tenancy.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const body = await req.json();

    const { name, email, message, siteSlug, organizationId: clientOrgId } = body as {
      name?: string;
      email?: string;
      message?: string;
      siteSlug?: string;
      organizationId?: number;
    };

    if (!name || !email || !message) {
      return Response.json(
        { status: false, message: 'Name, email, and message are required' },
        { status: 400 }
      );
    }

    if (name.length > 255 || email.length > 255) {
      return Response.json(
        { status: false, message: 'Name or email is too long' },
        { status: 400 }
      );
    }

    if (message.length < 10 || message.length > 5000) {
      return Response.json(
        { status: false, message: 'Message must be between 10 and 5000 characters' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json(
        { status: false, message: 'Invalid email format' },
        { status: 400 }
      );
    }

    const { ip, userAgent } = requestClientMeta(req);

    // ── Site contact (tenant-scoped) ──────────────────────────────────
    if (siteSlug && String(siteSlug).trim()) {
      const rateKey = `contact:site:${String(siteSlug).trim()}:${ip || email}`;
      if (!checkSiteFormRateLimit(rateKey, 6)) {
        return Response.json(
          { status: false, message: 'Too many submissions. Please try again later.' },
          { status: 429 }
        );
      }

      void clientOrgId; // never trust for tenancy

      try {
        const captured = await captureSiteForm({
          siteSlug: String(siteSlug).trim(),
          formType: 'contact',
          name,
          email,
          message,
          metadata: {
            rejectedClientOrganizationId:
              clientOrgId != null ? Number(clientOrgId) : null,
          },
          ip,
          userAgent,
        });

        const inbox = await getOrgContactInbox(
          captured.organizationId,
          captured.tenant.site.content.slots.footer.email
        );

        if (!captured.suppressed && inbox) {
          sendCampaignContactEmail({
            to: inbox,
            name,
            email,
            message,
            candidateName: captured.tenant.site.content.meta.candidateName,
            siteSlug: captured.siteSlug,
          }).catch((err) =>
            console.error('[Contact] Failed to send campaign email:', err)
          );
        }

        sendConfirmationToUser(name, email, captured.tenant.site.content.meta.candidateName).catch(
          (err) => console.error('[Contact] Failed to send user confirmation:', err)
        );

        return Response.json({
          status: true,
          message: captured.suppressed
            ? 'Message received. This contact is on the campaign do-not-contact list.'
            : 'Message sent successfully! The campaign will get back to you soon.',
          organizationId: captured.organizationId,
          siteSlug: captured.siteSlug,
          suppressed: captured.suppressed,
          submissionId: captured.submissionId,
        });
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode: number }).statusCode)
            : 500;
        if (statusCode === 404) {
          return Response.json(
            { status: false, message: 'Site not found or not published.' },
            { status: 404 }
          );
        }
        throw err;
      }
    }

    // ── Marketing / platform contact ──────────────────────────────────
    const identifier = session?.user?.id || email;
    if (!checkRateLimit(identifier.toString())) {
      return Response.json(
        { status: false, message: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    sendEmailToAdmin(name, email, message).catch((err) =>
      console.error('[Contact] Failed to send admin email:', err)
    );
    sendConfirmationToUser(name, email).catch((err) =>
      console.error('[Contact] Failed to send user confirmation:', err)
    );

    return Response.json({
      status: true,
      message: "Message sent successfully! We'll get back to you soon.",
    });
  } catch (error) {
    console.error('[Contact] Form submission error:', error);
    return Response.json(
      { status: false, message: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}

async function sendCampaignContactEmail(opts: {
  to: string;
  name: string;
  email: string;
  message: string;
  candidateName: string;
  siteSlug: string;
}) {
  if (!SENDGRID_API_KEY) {
    console.warn('[Contact] SENDGRID_API_KEY not set - campaign email not sent');
    return;
  }

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px;">
      <h2 style="color: #333; margin-bottom: 20px;">New message via campaign site</h2>
      <p style="color: #555;">Site: /s/${opts.siteSlug} · ${opts.candidateName}</p>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 10px 0;"><strong>Name:</strong> ${opts.name}</p>
        <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${opts.email}">${opts.email}</a></p>
        <p style="margin: 10px 0;"><strong>Message:</strong></p>
        <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #007bff;">
          ${opts.message.replace(/\n/g, '<br>')}
        </div>
      </div>
    </div>
  `;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: opts.to }],
          subject: `Campaign site contact: ${opts.name}`,
        },
      ],
      from: { email: FROM_EMAIL, name: 'Antelope Campaign Site' },
      reply_to: { email: opts.email, name: opts.name },
      content: [{ type: 'text/html', value: htmlContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  }
}

async function sendEmailToAdmin(name: string, email: string, message: string) {
  if (!SENDGRID_API_KEY) {
    console.warn('[Contact] SENDGRID_API_KEY not set - admin email not sent');
    return;
  }

  const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">New Contact Form Submission</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 10px 0;"><strong style="color: #555;">Name:</strong> ${name}</p>
                <p style="margin: 10px 0;"><strong style="color: #555;">Email:</strong> <a href="mailto:${email}" style="color: #007bff;">${email}</a></p>
                <p style="margin: 10px 0;"><strong style="color: #555;">Message:</strong></p>
                <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #007bff;">
                    ${message.replace(/\n/g, '<br>')}
                </div>
            </div>
        </div>
    `;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: ADMIN_EMAIL }], subject: `New Contact Form: ${name}` }],
      from: { email: FROM_EMAIL, name: 'Antelope Contact Form' },
      reply_to: { email, name },
      content: [{ type: 'text/html', value: htmlContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`SendGrid API responded with ${res.status}: ${await res.text()}`);
  }
}

async function sendConfirmationToUser(
  name: string,
  email: string,
  candidateName?: string
) {
  if (!SENDGRID_API_KEY) {
    console.warn('[Contact] SENDGRID_API_KEY not set - user confirmation not sent');
    return;
  }

  const who = candidateName ? `the ${candidateName} campaign` : 'us';
  const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="padding: 30px 20px; background: white;">
                <p style="color: #212529; font-size: 16px; line-height: 1.6;">
                    Hi ${name},
                </p>
                <p style="color: #212529; font-size: 16px; line-height: 1.6;">
                    We've received your message and ${who} will get back to you as soon as possible.
                </p>
            </div>
        </div>
    `;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email, name }],
          subject: candidateName
            ? `We received your message — ${candidateName}`
            : 'We received your message - Antelope',
        },
      ],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      content: [{ type: 'text/html', value: htmlContent }],
    }),
  });
}
