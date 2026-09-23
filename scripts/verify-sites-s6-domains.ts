/**
 * Sites S6 — custom domain resolve + tenancy (DB).
 * DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-sites-s6-domains.ts
 */

import { SiteRepo } from '../src/app/utils/database/site-repo';
import {
  SiteDomainRepo,
  newVerificationToken,
} from '../src/app/utils/database/site-domain-repo';
import { isAppHost, slugFromPlatformSubdomain } from '../src/app/utils/site-host';

async function main() {
  const site = await SiteRepo.getPublishedSiteBySlug('alex-rivera-efc37bb8');
  if (!site) throw new Error('Need published alex-rivera-efc37bb8');

  const host = `s6-test-${Date.now()}.example.com`;
  const token = newVerificationToken();

  const existing = await SiteDomainRepo.getByHost(host);
  if (existing) throw new Error('host collision');

  const id = await SiteDomainRepo.create({
    siteId: site.id,
    organizationId: site.organizationId,
    host,
    verificationToken: token,
    dnsInstructions: { records: [{ type: 'CNAME', name: host, value: 'cname.vercel-dns.com' }] },
  });

  // Unverified must not resolve
  const before = await SiteDomainRepo.resolvePublishedSlugByHost(host);
  if (before) throw new Error('Unverified domain should not resolve');

  await SiteDomainRepo.markVerified(id, site.organizationId);
  const after = await SiteDomainRepo.resolvePublishedSlugByHost(host);
  if (after !== site.slug) {
    throw new Error(`Expected slug ${site.slug}, got ${after}`);
  }

  // App hosts never look like platform tenant subdomains
  if (slugFromPlatformSubdomain('antelopedata.org')) {
    throw new Error('apex must not yield slug');
  }
  if (!isAppHost('antelopedata.org')) throw new Error('apex is app host');

  // Cleanup
  await SiteDomainRepo.delete(id, site.organizationId);

  console.log('VERIFY_S6_DOMAINS_OK', { host, slug: site.slug });
  process.exit(0);
}

main().catch((e) => {
  console.error('VERIFY_FAILED', e);
  process.exit(1);
});
