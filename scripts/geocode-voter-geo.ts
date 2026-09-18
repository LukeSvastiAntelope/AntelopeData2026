/**
 * Batch Census geocode for voter_geo rows with geocode_status=pending.
 * Non-blocking relative to upload — run after import:
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geocode-voter-geo.ts --limit 50
 */

import { VoterGeoRepo } from '../src/app/utils/database/geo-repo';
import { geocodeAddress } from '../src/app/utils/services/geo/geocode';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

async function main() {
  const limit = Number(arg('limit', '50'));
  const pending = await VoterGeoRepo.listPendingGeocode(limit);
  console.log(`Pending geocode: ${pending.length}`);

  let ok = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await geocodeAddress({
      street: row.street,
      city: row.city,
      state: row.state,
      zip: row.zip,
    });
    if (result.ok) {
      await VoterGeoRepo.markGeocoded(
        row.id,
        result.latitude,
        result.longitude,
        result.source,
        result.confidence
      );
      ok++;
      console.log(`ok #${row.id} ${row.street || ''} → ${result.latitude},${result.longitude}`);
    } else {
      await VoterGeoRepo.markFailed(row.id, result.error);
      failed++;
      console.log(`fail #${row.id}: ${result.error}`);
    }
    // Be polite to Census
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`Done. ok=${ok} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
