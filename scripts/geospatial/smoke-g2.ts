/**
 * G2 smoke: Area A ∩ likely-Dem − DNC − not canvassed → named turf.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geospatial/smoke-g2.ts
 */

import { GeofenceRepo, VoterGeoRepo } from '../../src/app/utils/database/geo-repo';
import {
  ContactSuppressionRepo,
  TurfRepo,
  queryTurfAddresses,
} from '../../src/app/utils/database/turf-repo';
import { buildTurfTool } from '../../src/app/utils/services/tools/build-turf';
import { listTurfAddressesTool } from '../../src/app/utils/services/tools/list-turf-addresses';
import { segmentListTool } from '../../src/app/utils/services/tools/segment-list';
import { closePool } from '../../src/app/utils/database/db';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function main() {
  const orgId = Number(process.env.SMOKE_ORG_ID || 1);
  const userId = Number(process.env.SMOKE_USER_ID || 1);

  const ring: [number, number][] = [
    [-122.425, 37.775],
    [-122.415, 37.775],
    [-122.415, 37.783],
    [-122.425, 37.783],
    [-122.425, 37.775],
  ];

  // Seed geocoded points with party / scores
  const seeds = [
    {
      voterFileId: 'g2-dem-1',
      lat: 37.7793,
      lng: -122.4192,
      party: 'Democrat',
      partisan: 75,
      street: '10 Dem St',
    },
    {
      voterFileId: 'g2-dem-2',
      lat: 37.7785,
      lng: -122.42,
      party: 'Democrat',
      partisan: 82,
      street: '20 Dem St',
    },
    {
      voterFileId: 'g2-rep-1',
      lat: 37.78,
      lng: -122.418,
      party: 'Republican',
      partisan: 20,
      street: '30 Rep Ave',
    },
    {
      voterFileId: 'g2-dem-dnc',
      lat: 37.779,
      lng: -122.417,
      party: 'Democrat',
      partisan: 90,
      street: '40 DNC Blvd',
    },
    {
      voterFileId: 'g2-out',
      lat: 37.8,
      lng: -122.4,
      party: 'Democrat',
      partisan: 88,
      street: 'Outside Rd',
    },
  ];

  for (const s of seeds) {
    await VoterGeoRepo.upsertPoint({
      organizationId: orgId,
      voterFileId: s.voterFileId,
      street: s.street,
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      party: s.party,
      partisanScore: s.partisan,
      turnoutScore: 80,
      latitude: s.lat,
      longitude: s.lng,
      geocodeStatus: 'ok',
      geocodeSource: 'smoke',
      geocodeConfidence: 1,
    });
  }

  // Ensure Area A fence
  const existingFence = await GeofenceRepo.getByLabel('Area A', orgId);
  if (existingFence) await GeofenceRepo.delete(existingFence.id, orgId);
  await GeofenceRepo.create({
    organizationId: orgId,
    createdBy: userId,
    label: 'Area A',
    fenceType: 'polygon',
    purpose: 'include',
    ring,
    color: '#22c55e',
  });

  // Resolve DNC target geo id
  const dncProbe = await queryTurfAddresses(orgId, {
    includeFenceLabels: ['Area A'],
    filters: { party: ['Democrat'] },
    excludeSuppressed: false,
    excludeContacted: false,
    limit: 50,
  });
  const dncRow = dncProbe.find((a) => a.voterFileId === 'g2-dem-dnc');
  if (!dncRow) throw new Error('Failed to seed DNC candidate inside Area A');

  await ContactSuppressionRepo.add({
    organizationId: orgId,
    voterGeoId: dncRow.voterGeoId,
    voterFileId: 'g2-dem-dnc',
    reason: 'do_not_contact',
    source: 'manual',
    createdBy: userId,
  });

  // Done-when: Area A, likely-Dem, not DNC, not yet canvassed
  const built = await buildTurfTool.execute(
    {
      label: 'Saturday Dem walk',
      includeAreas: ['Area A'],
      segmentId: 'likely-dem',
      excludeSuppressed: true,
      excludeContacted: true,
    },
    { userId, organizationId: orgId }
  );

  const count = (built.data as { count: number }).count;
  const ids = new Set(
    ((built.data as { addresses: { voterGeoId: number }[] }).addresses || []).map(
      (a) => a.voterGeoId
    )
  );

  console.log({ turf: built.data, count });

  if (count !== 2) {
    throw new Error(`Expected 2 Dem walk addresses (dem-1, dem-2), got ${count}`);
  }
  if (ids.has(dncRow.voterGeoId)) {
    throw new Error('DNC address should have been excluded');
  }

  const listed = await listTurfAddressesTool.execute(
    { turf: 'Saturday Dem walk' },
    { userId, organizationId: orgId }
  );
  if ((listed.data as { returned: number }).returned !== 2) {
    throw new Error('list_turf_addresses mismatch');
  }

  const segment = await segmentListTool.execute(
    {
      segmentId: 'likely-dem',
      includeAreas: ['Area A'],
      excludeSuppressed: true,
      excludeContacted: true,
    },
    { userId, organizationId: orgId }
  );
  if ((segment.data as { implemented: boolean }).implemented !== true) {
    throw new Error('segment_list still stubbed');
  }
  if ((segment.data as { count: number }).count !== 2) {
    throw new Error(`segment_list expected 2, got ${(segment.data as { count: number }).count}`);
  }

  // Cleanup prior Saturday Dem walk is fine to leave; ensure TurfRepo path works
  const turf = await TurfRepo.getByLabel('Saturday Dem walk', orgId);
  if (!turf || turf.address_count !== 2) {
    throw new Error('Saved turf missing or wrong count');
  }

  console.log('PASS: G2 smoke — layered turf + segment_list + DNC');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
