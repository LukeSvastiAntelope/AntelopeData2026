/**
 * P3 — CAN-SPAM auto compliance for every outbound email.
 * One-click unsubscribe + physical-address footer — non-negotiable, injected server-side.
 */

import {
  hashUnsubscribeToken,
  mintUnsubscribeToken,
} from '@/app/utils/database/email-send-repo';

/** Platform / campaign postal address required by CAN-SPAM. */
export function getPhysicalAddress(override?: string | null): string {
  const fromEnv = process.env.EMAIL_PHYSICAL_ADDRESS?.trim();
  const fromOverride = override?.trim();
  return (
    fromOverride ||
    fromEnv ||
    'Antelope Data, Inc., 1000 N West Street, Suite 1200, Wilmington, DE 19801'
  );
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    'https://antelopedata.org'
  ).replace(/\/$/, '');
}

export function buildUnsubscribeUrl(token: string): string {
  return `${appBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Human-facing confirmation page (linked from footer). */
export function buildUnsubscribePageUrl(token: string): string {
  return `${appBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Inject physical-address footer + unsubscribe link into HTML.
 * Idempotent if markers already present.
 */
export function injectCanSpamFooter(html: string, opts: {
  unsubscribeUrl: string;
  physicalAddress: string;
  fromName?: string;
}): string {
  const marker = 'data-antelope-canspam="1"';
  if (html.includes(marker)) return html;

  const addr = opts.physicalAddress.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = (opts.fromName || 'This campaign').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const footer = `
<div ${marker} style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-family:sans-serif;font-size:12px;line-height:1.5;color:#666;">
  <p style="margin:0 0 8px;">You are receiving this email from ${name} via Antelope.</p>
  <p style="margin:0 0 8px;">${addr}</p>
  <p style="margin:0;">
    <a href="${opts.unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe</a>
    from future emails from this campaign.
  </p>
</div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}\n${footer}`;
}

/** RFC 8058 one-click + mailto-free HTTPS unsubscribe headers. */
export function buildCanSpamHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export type CompliantMessage = {
  html: string;
  headers: Record<string, string>;
  unsubscribeToken: string;
  unsubscribeTokenHash: string;
  unsubscribeUrl: string;
  physicalAddress: string;
};

/**
 * Build per-recipient CAN-SPAM package (unique unsub token + footer + headers).
 */
export function buildCompliantMessage(params: {
  html: string;
  userId: number;
  email: string;
  sendId?: number | null;
  fromName?: string;
  physicalAddress?: string | null;
  extraHeaders?: Record<string, string>;
}): CompliantMessage {
  const token = mintUnsubscribeToken({
    userId: params.userId,
    email: params.email,
    sendId: params.sendId,
  });
  const unsubscribeUrl = buildUnsubscribeUrl(token);
  const physicalAddress = getPhysicalAddress(params.physicalAddress);
  const html = injectCanSpamFooter(params.html, {
    unsubscribeUrl: buildUnsubscribePageUrl(token),
    physicalAddress,
    fromName: params.fromName,
  });
  return {
    html,
    headers: {
      ...(params.extraHeaders || {}),
      ...buildCanSpamHeaders(unsubscribeUrl),
    },
    unsubscribeToken: token,
    unsubscribeTokenHash: hashUnsubscribeToken(token),
    unsubscribeUrl,
    physicalAddress,
  };
}
