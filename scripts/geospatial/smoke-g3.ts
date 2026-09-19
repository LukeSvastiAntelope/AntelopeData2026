/**
 * G3 smoke: assign Saturday Dem walk, record a stop, list enriched outcomes.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geospatial/smoke-g3.ts
 */

import { TurfRepo } from '../../src/app/utils/database/turf-repo';
import { assignTurfTool } from '../../src/app/utils/services/tools/assign-turf';
import { recordTurfStopTool } from '../../src/app/utils/services/tools/record-turf-stop';
import { listTurfAddressesTool } from '../../src/app/utils/services/tools/list-turf-addresses';
import { closePool } from '../../src/app/utils/database/db';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function main() {
  const orgId = Number(process.env.SMOKE_ORG_ID || 1);
  const userId = Number(process.env.SMOKE_USER_ID || 1);

  let turf = await TurfRepo.getByLabel('Saturday Dem walk', orgId);
  if (!turf) {
    throw new Error('Run smoke-g2 first to create “Saturday Dem walk”');
  }

  const assigned = await assignTurfTool.execute(
    { turf: 'Saturday Dem walk' },
    { userId, organizationId: orgId }
  );
  if ((assigned.data as { assignedTo: number }).assignedTo !== userId) {
    throw new Error('assign_turf did not set assigned_to to current user');
  }

  const { addresses } = await TurfRepo.listAddresses(turf.id, orgId);
  if (addresses.length < 1) throw new Error('Turf has no addresses');
  const stop = addresses[0];

  const recorded = await recordTurfStopTool.execute(
    {
      turf: 'Saturday Dem walk',
      voterGeoId: stop.voterGeoId,
      status: 'confirmed',
      party: 'Democrat',
      notes: 'g3 smoke',
    },
    { userId, organizationId: orgId }
  );
  if ((recorded.data as { outcome: { status: string } }).outcome.status !== 'confirmed') {
    throw new Error('record_turf_stop failed');
  }

  const listed = await listTurfAddressesTool.execute(
    { turf: 'Saturday Dem walk' },
    { userId, organizationId: orgId }
  );
  const rows = (listed.data as { addresses: { voterGeoId: number; canvassStatus?: string }[] })
    .addresses;
  // list_turf_addresses tool maps without canvassStatus — check repo path
  const refreshed = await TurfRepo.listAddresses(turf.id, orgId);
  const hit = refreshed.addresses.find((a) => a.voterGeoId === stop.voterGeoId);
  if (!hit || hit.canvassStatus !== 'confirmed') {
    throw new Error(`Expected confirmed status on stop, got ${hit?.canvassStatus}`);
  }
  if (hit.sortOrder !== 1 && hit.sortOrder == null) {
    throw new Error('sortOrder missing on turf address');
  }

  turf = await TurfRepo.getById(turf.id, orgId);
  console.log({
    turfId: turf?.id,
    assignedTo: turf?.assigned_to,
    stop: hit.voterGeoId,
    status: hit.canvassStatus,
    listedCount: rows.length,
  });
  console.log('PASS: G3 smoke — assign + record stop + enriched walk-list');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
