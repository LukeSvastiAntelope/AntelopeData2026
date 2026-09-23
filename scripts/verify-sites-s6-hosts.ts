/**
 * Unit-style checks for Sites S6 host helpers (no DB).
 * Run: npx tsx scripts/verify-sites-s6-hosts.ts
 */

import assert from 'assert';
import {
  getAppHosts,
  getSiteRootDomain,
  isAppHost,
  isValidCustomHost,
  normalizeHost,
  platformSubdomainUrl,
  slugFromPlatformSubdomain,
} from '../src/app/utils/site-host';

function main() {
  process.env.SITE_ROOT_DOMAIN = 'antelopedata.org';
  process.env.APP_HOSTS = 'antelopedata.org,www.antelopedata.org,app.antelopedata.org';
  process.env.NEXT_PUBLIC_APP_URL = 'https://antelopedata.org';

  assert.strictEqual(getSiteRootDomain(), 'antelopedata.org');
  assert.ok(getAppHosts().has('antelopedata.org'));
  assert.ok(isAppHost('antelopedata.org'));
  assert.ok(isAppHost('www.antelopedata.org'));
  assert.ok(isAppHost('localhost'));
  assert.ok(isAppHost('foo.vercel.app'));
  assert.ok(!isAppHost('alex-rivera.antelopedata.org'));

  assert.strictEqual(
    slugFromPlatformSubdomain('alex-rivera-efc37bb8.antelopedata.org'),
    'alex-rivera-efc37bb8'
  );
  assert.strictEqual(slugFromPlatformSubdomain('www.antelopedata.org'), null);
  assert.strictEqual(slugFromPlatformSubdomain('antelopedata.org'), null);
  assert.strictEqual(slugFromPlatformSubdomain('api.antelopedata.org'), null);
  assert.strictEqual(
    slugFromPlatformSubdomain('nested.sub.antelopedata.org'),
    null
  );
  assert.strictEqual(slugFromPlatformSubdomain('campaign.example.com'), null);

  assert.ok(isValidCustomHost('www.mycampaign.com'));
  assert.ok(!isValidCustomHost('antelopedata.org'));
  assert.ok(!isValidCustomHost('foo.antelopedata.org'));
  assert.ok(!isValidCustomHost('localhost'));

  assert.strictEqual(
    platformSubdomainUrl('alex-rivera-efc37bb8'),
    'https://alex-rivera-efc37bb8.antelopedata.org'
  );
  assert.strictEqual(normalizeHost('WWW.Example.COM:443'), 'www.example.com');

  console.log('VERIFY_S6_HOSTS_OK');
}

main();
