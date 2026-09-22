import { config } from 'dotenv';
config({ path: '.env.local' });
import { SiteRepo } from '../../src/app/utils/database/site-repo';

async function main() {
  const orgId = 1;
  const id = await SiteRepo.createSite({
    organizationId: orgId,
    templateId: 'modern_clean',
    createdBy: 1,
    content: { meta: { candidateName: 'Test Candidate', office: 'Mayor' } },
  });
  console.log('created', id);
  const row = await SiteRepo.getSiteById(id, orgId);
  console.log('slug', row?.slug, 'status', row?.status, 'template', row?.templateId);
  console.log('hero', row?.content.slots.hero.headline.slice(0, 40));
  await SiteRepo.updateSite(id, orgId, { status: 'published' });
  const pub = await SiteRepo.getPublishedSiteBySlug(row!.slug);
  console.log('published lookup', !!pub, pub?.id);
  const draftOnly = await SiteRepo.getPublishedSiteBySlug('does-not-exist-xyz');
  console.log('missing slug', draftOnly);
  await SiteRepo.deleteSite(id, orgId);
  console.log('OK: SiteRepo CRUD + getPublishedSiteBySlug');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
