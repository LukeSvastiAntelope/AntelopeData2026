/**
 * Data D3 smoke — TIGER state-lege boundaries + OpenStates/FEC depth gating.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-d3-downballot.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import { closePool, openSql } from '../src/app/utils/database/db';
import {
  fetchExternalDistrictData,
  getOrBuildDistrictIntel,
  parseCampaignDistrict,
  scheduleDistrictIntelGeneration,
  sourcesHealthFromExternal,
} from '../src/app/utils/services/district-intel-service';
import { getStateLegislativeBoundaries } from '../src/app/utils/services/geo/tiger-boundaries';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- parseCampaignDistrict ---');
  const house = parseCampaignDistrict('nj-5');
  assert(house?.label === 'NJ-5' && house.officeType === 'federal_house', 'house parse');
  const ld = parseCampaignDistrict('NJ-LD-12');
  assert(ld?.label === 'NJ-LD-12' && ld.officeType === 'state_house', 'ld parse');
  const sd = parseCampaignDistrict('NJ-SD-5');
  assert(sd?.label === 'NJ-SD-5' && sd.officeType === 'state_senate', 'sd parse');
  console.log('parse ok', { house, ld, sd });

  console.log('--- TIGER NJ SLDL ---');
  const tiger1 = await getStateLegislativeBoundaries({
    state: 'NJ',
    layer: 'sldl',
  });
  assert(tiger1.status === 'ok', `tiger status ${tiger1.status}: ${tiger1.message}`);
  assert(tiger1.geojson.features.length > 10, 'expected many SLDL features');
  const sample = tiger1.geojson.features[0]?.properties;
  assert(Boolean(sample?.district_code), 'district_code present');
  console.log('tiger ok', {
    cached: tiger1.cached,
    features: tiger1.geojson.features.length,
    sampleCode: sample?.district_code,
  });

  const tiger2 = await getStateLegislativeBoundaries({
    state: 'NJ',
    layer: 'sldl',
  });
  assert(tiger2.cached === true, 'second TIGER call should hit geo_boundary_cache');
  console.log('tiger cache hit ok');

  console.log('--- FEC itemized congressional-only ---');
  const cong = await fetchExternalDistrictData('NJ', 5, {
    officeType: 'federal_house',
    includeFecItemized: true,
  });
  assert(
    cong.fecItemizedStatus === 'ok' ||
      cong.fecItemizedStatus === 'partial' ||
      cong.fecItemizedStatus === 'unavailable',
    'fec itemized status valid'
  );
  // Must not fabricate ZIP buckets
  if (cong.fecItemizedStatus === 'unavailable') {
    assert(cong.fecItemizedByZip == null, 'no fabricated ZIPs');
  }
  console.log('cong fec', {
    fec: cong.fecStatus,
    totals: cong.fecTotalsStatus,
    itemized: cong.fecItemizedStatus,
    zips: cong.fecItemizedByZip?.length ?? 0,
    openStates: cong.openStatesStatus,
    depthLegs: cong.openStatesDepth?.legislators?.length ?? 0,
    bills: cong.openStatesDepth?.recentBills?.length ?? 0,
  });

  const lege = await fetchExternalDistrictData('NJ', 12, {
    officeType: 'state_house',
  });
  assert(lege.fecStatus === 'unavailable', 'state-lege must skip FEC candidates');
  assert(lege.fecItemizedStatus === 'unavailable', 'state-lege must skip FEC itemized');
  assert(lege.fecItemizedByZip == null, 'no FEC ZIPs for state-lege');
  assert(lege.censusStatus === 'unavailable', 'state-lege must skip CD Census');
  console.log('state-lege gating ok', {
    openStates: lege.openStatesStatus,
    depthLegs: lege.openStatesDepth?.legislators?.length ?? 0,
    bills: lege.openStatesDepth?.recentBills?.length ?? 0,
    health: sourcesHealthFromExternal(lege),
  });

  console.log('--- snapshot cache + async schedule ---');
  const sql = await openSql();
  const [orgs] = await sql.execute<any[]>(
    `SELECT id FROM organizations ORDER BY id ASC LIMIT 1`
  );
  assert(orgs.length > 0, 'need an org');
  const orgId = Number(orgs[0].id);
  const districtKey = `NJ-LD-12`;

  const kick = scheduleDistrictIntelGeneration({
    organizationId: orgId,
    districtCode: districtKey,
    state: 'NJ',
    districtNumber: 12,
    officeType: 'state_house',
  });
  assert(kick.started, 'schedule started');

  // Wait briefly for async generation
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const built = await getOrBuildDistrictIntel({
      organizationId: orgId,
      districtCode: districtKey,
      fallbackState: 'NJ',
      fallbackDistrictNumber: 12,
      officeType: 'state_house',
    });
    if (!('error' in built) && built.cached) {
      ready = true;
      console.log('snapshot cache hit', {
        generatedAt: built.generatedAt,
        openStates: built.sourcesHealth.openStates,
        fecItemized: built.sourcesHealth.fecItemized,
      });
      break;
    }
    if (!('error' in built) && !built.cached) {
      // Just built live — next call should be cached
      const again = await getOrBuildDistrictIntel({
        organizationId: orgId,
        districtCode: districtKey,
        officeType: 'state_house',
      });
      if (!('error' in again) && again.cached) {
        ready = true;
        console.log('snapshot cache hit after build', {
          generatedAt: again.generatedAt,
        });
        break;
      }
    }
  }
  assert(ready, 'expected snapshot cache hit within timeout');

  console.log('D3 smoke PASSED');
  await closePool();
}

main().catch(async (err) => {
  console.error('D3 smoke FAILED', err);
  try {
    await closePool();
  } catch {}
  process.exit(1);
});
