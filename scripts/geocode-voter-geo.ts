/**
 * Batch Census geocode for voter_geo rows with geocode_status=pending.
 * Non-blocking relative to upload — also drained by platform cron
 * (runDailyPlatformTasks) and kicked post-import.
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geocode-voter-geo.ts --limit 50
 */

import { drainPendingGeocode } from '../src/app/utils/services/geo/geocode';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

async function main() {
  const limit = Number(arg('limit', '50'));
  const summary = await drainPendingGeocode({ limit, delayMs: 250 });
  console.log(
    `Done. considered=${summary.considered} ok=${summary.ok} failed=${summary.failed}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
