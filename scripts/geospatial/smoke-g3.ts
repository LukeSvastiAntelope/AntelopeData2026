/**
 * G3 smoke: assign turf, append canvass contacts, DNC → suppression, rollup status.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geospatial/smoke-g3.ts
 */

import { openSql, closePool } from '../../src/app/utils/database/db';
import { TurfRepo, ContactSuppressionRepo } from '../../src/app/utils/database/turf-repo';
import { assignTurfTool } from '../../src/app/utils/services/tools/assign-turf';
import { recordTurfStopTool } from '../../src/app/utils/services/tools/record-turf-stop';
import { listTurfAddressesTool } from '../../src/app/utils/services/tools/list-turf-addresses';

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

  // First contact — supporter (append)
  const recorded = await recordTurfStopTool.execute(
    {
      turf: 'Saturday Dem walk',
      voterGeoId: stop.voterGeoId,
      status: 'supporter',
      party: 'Democrat',
      notes: 'g3 smoke supporter',
    },
    { userId, organizationId: orgId }
  );
  if ((recorded.data as { outcome: { status: string } }).outcome.status !== 'supporter') {
    throw new Error('record_turf_stop supporter failed');
  }

  // Second contact — dnc_request (append trail + suppress)
  const dnc = await recordTurfStopTool.execute(
    {
      turf: 'Saturday Dem walk',
      voterGeoId: stop.voterGeoId,
      status: 'dnc_request',
      notes: 'g3 smoke dnc',
    },
    { userId, organizationId: orgId }
  );
  if ((dnc.data as { outcome: { status: string } }).outcome.status !== 'dnc_request') {
    throw new Error('record_turf_stop dnc_request failed');
  }

  const sql = await openSql();
  const [trail] = await sql.execute(
    `SELECT id, status FROM canvass_contacts
     WHERE organization_id = ? AND voter_geo_id = ? AND turf_id = ?
     ORDER BY id ASC`,
    [orgId, stop.voterGeoId, turf.id]
  );
  const contacts = trail as { id: number; status: string }[];
  if (contacts.length < 2) {
    throw new Error(`Expected append-only trail >=2, got ${contacts.length}`);
  }
  if (contacts[contacts.length - 1].status !== 'dnc_request') {
    throw new Error('Latest contact should be dnc_request');
  }

  const suppressed = await ContactSuppressionRepo.list(orgId, 500);
  const hitSuppress = suppressed.find((s) => s.voter_geo_id === stop.voterGeoId);
  if (!hitSuppress) {
    throw new Error('dnc_request did not write contact_suppression');
  }

  const refreshed = await TurfRepo.listAddresses(turf.id, orgId);
  const hit = refreshed.addresses.find((a) => a.voterGeoId === stop.voterGeoId);
  if (!hit || hit.canvassStatus !== 'dnc_request') {
    throw new Error(`Expected rollup dnc_request, got ${hit?.canvassStatus}`);
  }

  await listTurfAddressesTool.execute(
    { turf: 'Saturday Dem walk' },
    { userId, organizationId: orgId }
  );

  turf = await TurfRepo.getById(turf.id, orgId);
  console.log({
    turfId: turf?.id,
    assignedTo: turf?.assigned_to,
    stop: hit.voterGeoId,
    status: hit.canvassStatus,
    trailLen: contacts.length,
    suppressed: hitSuppress.reason,
  });
  console.log('PASS: G3 smoke — append trail + DNC suppression + rollup');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
