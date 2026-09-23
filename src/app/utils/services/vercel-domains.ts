/**
 * Vercel Domains API client for Sites S6 custom-domain connect.
 * Gracefully stubs when VERCEL_TOKEN / VERCEL_PROJECT_ID are unset (local/dev).
 *
 * Ops (one-time): add *.antelopedata.org to the Vercel project + wildcard DNS.
 */

import { getSiteRootDomain } from '@/app/utils/site-host';

export type VercelDomainResult = {
  ok: boolean;
  stubbed: boolean;
  vercelDomainId: string | null;
  name: string;
  verified: boolean;
  /** DNS records the user should create */
  dns: Array<{
    type: string;
    name: string;
    value: string;
  }>;
  message?: string;
  raw?: unknown;
};

function vercelConfig() {
  const token = process.env.VERCEL_TOKEN || '';
  const projectId = process.env.VERCEL_PROJECT_ID || '';
  const teamId = process.env.VERCEL_TEAM_ID || '';
  return { token, projectId, teamId, configured: Boolean(token && projectId) };
}

function teamQuery(teamId: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

function cnameTarget(): string {
  return (
    process.env.VERCEL_DNS_CNAME_TARGET ||
    `cname.vercel-dns.com`
  );
}

function stubDns(host: string, verificationToken: string): VercelDomainResult {
  const root = getSiteRootDomain();
  return {
    ok: true,
    stubbed: true,
    vercelDomainId: null,
    name: host,
    verified: false,
    dns: [
      {
        type: 'CNAME',
        name: host,
        value: cnameTarget(),
      },
      {
        type: 'TXT',
        name: `_antelope-site.${host}`,
        value: verificationToken,
      },
    ],
    message: `Vercel Domains API not configured (set VERCEL_TOKEN + VERCEL_PROJECT_ID). Add a CNAME to ${cnameTarget()}. Platform subdomains use *.${root} (ops: wildcard on the Vercel project).`,
  };
}

export async function vercelAddProjectDomain(
  host: string,
  verificationToken: string
): Promise<VercelDomainResult> {
  const { token, projectId, teamId, configured } = vercelConfig();
  if (!configured) return stubDns(host, verificationToken);

  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery(teamId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: host }),
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Domain may already exist on the project — treat as recoverable
    if (res.status === 409 || (raw as { error?: { code?: string } })?.error?.code === 'domain_already_in_use') {
      return vercelGetProjectDomain(host, verificationToken);
    }
    return {
      ok: false,
      stubbed: false,
      vercelDomainId: null,
      name: host,
      verified: false,
      dns: stubDns(host, verificationToken).dns,
      message:
        (raw as { error?: { message?: string } })?.error?.message ||
        `Vercel Domains API error (${res.status})`,
      raw,
    };
  }

  const name = String((raw as { name?: string }).name || host);
  const verified = Boolean((raw as { verified?: boolean }).verified);
  const verification = (raw as { verification?: Array<{ type: string; domain: string; value: string }> })
    .verification;

  const dns =
    Array.isArray(verification) && verification.length
      ? verification.map((v) => ({
          type: v.type || 'TXT',
          name: v.domain || host,
          value: v.value,
        }))
      : stubDns(host, verificationToken).dns;

  return {
    ok: true,
    stubbed: false,
    vercelDomainId: name,
    name,
    verified,
    dns,
    raw,
  };
}

export async function vercelGetProjectDomain(
  host: string,
  verificationToken: string
): Promise<VercelDomainResult> {
  const { token, projectId, teamId, configured } = vercelConfig();
  if (!configured) return stubDns(host, verificationToken);

  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}${teamQuery(teamId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      stubbed: false,
      vercelDomainId: null,
      name: host,
      verified: false,
      dns: stubDns(host, verificationToken).dns,
      message:
        (raw as { error?: { message?: string } })?.error?.message ||
        `Vercel domain lookup failed (${res.status})`,
      raw,
    };
  }

  const verified = Boolean((raw as { verified?: boolean }).verified);
  return {
    ok: true,
    stubbed: false,
    vercelDomainId: String((raw as { name?: string }).name || host),
    name: host,
    verified,
    dns: stubDns(host, verificationToken).dns,
    raw,
  };
}

export async function vercelVerifyProjectDomain(
  host: string,
  verificationToken: string
): Promise<VercelDomainResult> {
  const { token, projectId, teamId, configured } = vercelConfig();
  if (!configured) {
    // Stub: mark verify as a no-op pending DNS — caller may still flip verified
    // after manual ops check. Return unverified with instructions.
    return {
      ...stubDns(host, verificationToken),
      message:
        'Vercel not configured — verify manually after DNS propagates, or set VERCEL_TOKEN.',
    };
  }

  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}/verify${teamQuery(teamId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Fall back to GET status
    return vercelGetProjectDomain(host, verificationToken);
  }
  return {
    ok: true,
    stubbed: false,
    vercelDomainId: String((raw as { name?: string }).name || host),
    name: host,
    verified: Boolean((raw as { verified?: boolean }).verified),
    dns: stubDns(host, verificationToken).dns,
    raw,
  };
}

export async function vercelRemoveProjectDomain(host: string): Promise<void> {
  const { token, projectId, teamId, configured } = vercelConfig();
  if (!configured) return;
  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}${teamQuery(teamId)}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
