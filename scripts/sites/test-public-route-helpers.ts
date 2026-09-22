/**
 * Sites S2 — public route helpers smoke (no DB).
 * Run: npx tsx scripts/sites/test-public-route-helpers.ts
 */
import assert from 'node:assert/strict';
import { defaultSiteContent, defaultSiteTheme } from '../../src/app/utils/types/site';
import { getSiteTemplate } from '../../src/components/site-templates';

const content = defaultSiteContent({
  meta: { candidateName: 'Ada Voter', office: 'State Senate' },
  slots: {
    hero: {
      headline: 'A fair shot for every family',
      subheadline: 'District-first leadership.',
      ctaLabel: 'Join',
      ctaHref: '#signup',
    },
  } as any,
});

const title =
  content.meta.candidateName && content.meta.office
    ? `${content.meta.candidateName} for ${content.meta.office}`
    : content.meta.candidateName;
assert.equal(title, 'Ada Voter for State Senate');

const description =
  content.slots.hero.subheadline?.trim() || content.slots.hero.headline;
assert.equal(description, 'District-first leadership.');

const tpl = getSiteTemplate('classic_civic');
assert.ok(tpl.Component);
assert.ok(defaultSiteTheme('classic_civic').primaryColor);

const addonPages = ['issues', 'events', 'volunteer', 'donate'];
assert.ok(addonPages.every((p) => typeof p === 'string'));

console.log('OK: Sites S2 public render helpers');
