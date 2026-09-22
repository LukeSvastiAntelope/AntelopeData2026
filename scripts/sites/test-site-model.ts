/**
 * Sites S1 — types/defaults + slug builder smoke.
 * Run: npx tsx scripts/sites/test-site-model.ts
 */
import assert from 'node:assert/strict';
import {
  defaultSiteContent,
  defaultSiteTheme,
  SITE_TEMPLATE_META,
  type SiteTemplateId,
} from '../../src/app/utils/types/site';
import { buildSiteSlug } from '../../src/app/utils/database/site-repo';

const ids: SiteTemplateId[] = [
  'classic_civic',
  'modern_clean',
  'community_local',
];
for (const id of ids) {
  assert.ok(SITE_TEMPLATE_META[id].name);
  const theme = defaultSiteTheme(id);
  assert.ok(theme.primaryColor);
}

const content = defaultSiteContent({
  meta: { candidateName: 'Jane Doe', office: 'City Council' },
});
assert.equal(content.meta.candidateName, 'Jane Doe');
assert.ok(content.slots.hero.headline);
assert.ok(content.slots.issues.items.length >= 1);
assert.ok(content.slots.cta.primaryLabel);
assert.ok(content.slots.footer.paidForBy);

const slug = buildSiteSlug('Jane Doe for Council');
assert.match(slug, /^jane-doe-for-council-[a-f0-9]{8}$/);

const slug2 = buildSiteSlug('Jane Doe for Council');
assert.notEqual(slug, slug2, 'UUID segment must uniquify');

console.log('OK: Sites S1 model + templates registry ids + slug');
