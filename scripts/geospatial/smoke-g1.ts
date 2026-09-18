/**
 * G1 smoke: seed voter_geo + Area A fence + addressesInFence / tool path.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geospatial/smoke-g1.ts
 */

import {
  GeofenceRepo,
  VoterGeoRepo,
  addressesInFence,
} from '../../src/app/utils/database/geo-repo';
import { addressesInAreaTool } from '../../src/app/utils/services/tools/addresses-in-area';
import { closePool } from '../../src/app/utils/database/db';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function main() {
  const orgId = Number(process.env.SMOKE_ORG_ID || 1);
  const userId = Number(process.env.SMOKE_USER_ID || 1);

  // SF Market St neighborhood — points inside/outside a known box
  const inside = [
    { voterFileId: 'g1-in-1', lat: 37.7793, lng: -122.4192, street: '1 Market St' },
    { voterFileId: 'g1-in-2', lat: 37.778, lng: -122.42, street: '100 Market St' },
    { voterFileId: 'g1-in-3', lat: 37.78, lng: -122.418, street: '200 Market St' },
  ];
  const outside = [
    { voterFileId: 'g1-out-1', lat: 37.8, lng: -122.4, street: 'Far Away Ave' },
  ];

  for (const p of [...inside, ...outside]) {
    await VoterGeoRepo.upsertPoint({
      organizationId: orgId,
      voterFileId: p.voterFileId,
      street: p.street,
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      latitude: p.lat,
      longitude: p.lng,
      geocodeStatus: 'ok',
      geocodeSource: 'smoke',
      geocodeConfidence: 1,
    });
  }

  const ring: [number, number][] = [
    [-122.425, 37.775],
    [-122.415, 37.775],
    [-122.415, 37.783],
    [-122.425, 37.783],
    [-122.425, 37.775],
  ];

  // Upsert Area A (delete prior smoke fence if present)
  const existing = await GeofenceRepo.getByLabel('Area A', orgId);
  if (existing) {
    await GeofenceRepo.delete(existing.id, orgId);
  }

  const fence = await GeofenceRepo.create({
    organizationId: orgId,
    createdBy: userId,
    label: 'Area A',
    fenceType: 'polygon',
    purpose: 'include',
    ring,
    color: '#22c55e',
  });

  const { addresses } = await addressesInFence(fence.id, orgId);
  const ids = new Set(addresses.map((a) => a.voterFileId));
  console.log({
    fenceId: fence.id,
    count: addresses.length,
    ids: [...ids],
  });

  for (const p of inside) {
    if (!ids.has(p.voterFileId)) {
      throw new Error(`Expected inside point ${p.voterFileId} in Area A`);
    }
  }
  for (const p of outside) {
    if (ids.has(p.voterFileId)) {
      throw new Error(`Expected outside point ${p.voterFileId} NOT in Area A`);
    }
  }

  const toolResult = await addressesInAreaTool.execute(
    { area: 'Area A', limit: 100 },
    { userId, organizationId: orgId }
  );
  console.log('tool count:', (toolResult.data as { count: number }).count);
  if ((toolResult.data as { count: number }).count !== addresses.length) {
    throw new Error('Tool count mismatch vs addressesInFence');
  }

  console.log('PASS: G1 smoke — Area A spatial query + addresses_in_area tool');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
