/**
 * Import political data into the database.
 *
 * Usage:
 *   npx tsx scripts/import-political-data.ts           Seed baseline state data (embedded)
 *   npx tsx scripts/import-political-data.ts --csv      Also import district CSV (data/cook_pvi.csv)
 *   npx tsx scripts/import-political-data.ts --csv --state=NJ
 *   npx tsx scripts/import-political-data.ts --csv --csv-path=./data/cook_pvi.csv
 */

import * as mysql from 'mysql2/promise';
import { refreshDistrictPoliticalDataFromCsv } from '../src/app/utils/political-data-refresh';

const STATE_DATA: Array<{
  state: string; name: string; pvi: string; pviNum: number;
  ev: number; gov: string; senate: string; margin24: number;
}> = [
  { state: 'AL', name: 'Alabama', pvi: 'R+15', pviNum: -15, ev: 9, gov: 'R', senate: 'R/R', margin24: -25.4 },
  { state: 'AK', name: 'Alaska', pvi: 'R+9', pviNum: -9, ev: 3, gov: 'R', senate: 'R/I', margin24: -10.1 },
  { state: 'AZ', name: 'Arizona', pvi: 'R+2', pviNum: -2, ev: 11, gov: 'D', senate: 'D/I', margin24: -5.5 },
  { state: 'AR', name: 'Arkansas', pvi: 'R+16', pviNum: -16, ev: 6, gov: 'R', senate: 'R/R', margin24: -28.3 },
  { state: 'CA', name: 'California', pvi: 'D+12', pviNum: 12, ev: 54, gov: 'D', senate: 'D/D', margin24: 20.3 },
  { state: 'CO', name: 'Colorado', pvi: 'D+4', pviNum: 4, ev: 10, gov: 'D', senate: 'D/D', margin24: 6.8 },
  { state: 'CT', name: 'Connecticut', pvi: 'D+6', pviNum: 6, ev: 7, gov: 'D', senate: 'D/D', margin24: 10.4 },
  { state: 'DE', name: 'Delaware', pvi: 'D+6', pviNum: 6, ev: 3, gov: 'D', senate: 'D/D', margin24: 8.6 },
  { state: 'FL', name: 'Florida', pvi: 'R+3', pviNum: -3, ev: 30, gov: 'R', senate: 'R/R', margin24: -13.2 },
  { state: 'GA', name: 'Georgia', pvi: 'R+1', pviNum: -1, ev: 16, gov: 'R', senate: 'D/R', margin24: -2.2 },
  { state: 'HI', name: 'Hawaii', pvi: 'D+14', pviNum: 14, ev: 4, gov: 'D', senate: 'D/D', margin24: 21.5 },
  { state: 'ID', name: 'Idaho', pvi: 'R+19', pviNum: -19, ev: 4, gov: 'R', senate: 'R/R', margin24: -32.2 },
  { state: 'IL', name: 'Illinois', pvi: 'D+7', pviNum: 7, ev: 19, gov: 'D', senate: 'D/D', margin24: 12.2 },
  { state: 'IN', name: 'Indiana', pvi: 'R+9', pviNum: -9, ev: 11, gov: 'R', senate: 'R/R', margin24: -17.0 },
  { state: 'IA', name: 'Iowa', pvi: 'R+6', pviNum: -6, ev: 6, gov: 'R', senate: 'R/R', margin24: -12.6 },
  { state: 'KS', name: 'Kansas', pvi: 'R+10', pviNum: -10, ev: 6, gov: 'D', senate: 'R/R', margin24: -14.7 },
  { state: 'KY', name: 'Kentucky', pvi: 'R+16', pviNum: -16, ev: 8, gov: 'D', senate: 'R/R', margin24: -25.9 },
  { state: 'LA', name: 'Louisiana', pvi: 'R+12', pviNum: -12, ev: 8, gov: 'R', senate: 'R/R', margin24: -19.3 },
  { state: 'ME', name: 'Maine', pvi: 'D+3', pviNum: 3, ev: 4, gov: 'D', senate: 'I/R', margin24: 5.8 },
  { state: 'MD', name: 'Maryland', pvi: 'D+12', pviNum: 12, ev: 10, gov: 'D', senate: 'D/D', margin24: 21.4 },
  { state: 'MA', name: 'Massachusetts', pvi: 'D+12', pviNum: 12, ev: 11, gov: 'D', senate: 'D/D', margin24: 22.7 },
  { state: 'MI', name: 'Michigan', pvi: 'D+1', pviNum: 1, ev: 15, gov: 'D', senate: 'D/D', margin24: -1.4 },
  { state: 'MN', name: 'Minnesota', pvi: 'D+1', pviNum: 1, ev: 10, gov: 'D', senate: 'D/D', margin24: 1.8 },
  { state: 'MS', name: 'Mississippi', pvi: 'R+12', pviNum: -12, ev: 6, gov: 'R', senate: 'R/R', margin24: -16.6 },
  { state: 'MO', name: 'Missouri', pvi: 'R+10', pviNum: -10, ev: 10, gov: 'R', senate: 'R/R', margin24: -16.3 },
  { state: 'MT', name: 'Montana', pvi: 'R+11', pviNum: -11, ev: 4, gov: 'R', senate: 'R/R', margin24: -17.2 },
  { state: 'NE', name: 'Nebraska', pvi: 'R+12', pviNum: -12, ev: 5, gov: 'R', senate: 'R/R', margin24: -19.1 },
  { state: 'NV', name: 'Nevada', pvi: 'EVEN', pviNum: 0, ev: 6, gov: 'R', senate: 'D/R', margin24: -3.2 },
  { state: 'NH', name: 'New Hampshire', pvi: 'EVEN', pviNum: 0, ev: 4, gov: 'R', senate: 'D/D', margin24: -0.3 },
  { state: 'NJ', name: 'New Jersey', pvi: 'D+6', pviNum: 6, ev: 14, gov: 'D', senate: 'D/D', margin24: 10.5 },
  { state: 'NM', name: 'New Mexico', pvi: 'D+3', pviNum: 3, ev: 5, gov: 'D', senate: 'D/D', margin24: 4.6 },
  { state: 'NY', name: 'New York', pvi: 'D+10', pviNum: 10, ev: 28, gov: 'D', senate: 'D/D', margin24: 12.2 },
  { state: 'NC', name: 'North Carolina', pvi: 'R+1', pviNum: -1, ev: 16, gov: 'D', senate: 'R/R', margin24: -3.2 },
  { state: 'ND', name: 'North Dakota', pvi: 'R+18', pviNum: -18, ev: 3, gov: 'R', senate: 'R/R', margin24: -32.8 },
  { state: 'OH', name: 'Ohio', pvi: 'R+6', pviNum: -6, ev: 17, gov: 'R', senate: 'R/D', margin24: -11.1 },
  { state: 'OK', name: 'Oklahoma', pvi: 'R+20', pviNum: -20, ev: 7, gov: 'R', senate: 'R/R', margin24: -33.1 },
  { state: 'OR', name: 'Oregon', pvi: 'D+5', pviNum: 5, ev: 8, gov: 'D', senate: 'D/D', margin24: 6.3 },
  { state: 'PA', name: 'Pennsylvania', pvi: 'EVEN', pviNum: 0, ev: 19, gov: 'D', senate: 'D/R', margin24: -1.8 },
  { state: 'RI', name: 'Rhode Island', pvi: 'D+8', pviNum: 8, ev: 4, gov: 'D', senate: 'D/D', margin24: 13.5 },
  { state: 'SC', name: 'South Carolina', pvi: 'R+8', pviNum: -8, ev: 9, gov: 'R', senate: 'R/R', margin24: -14.6 },
  { state: 'SD', name: 'South Dakota', pvi: 'R+16', pviNum: -16, ev: 3, gov: 'R', senate: 'R/R', margin24: -26.7 },
  { state: 'TN', name: 'Tennessee', pvi: 'R+14', pviNum: -14, ev: 11, gov: 'R', senate: 'R/R', margin24: -23.3 },
  { state: 'TX', name: 'Texas', pvi: 'R+5', pviNum: -5, ev: 40, gov: 'R', senate: 'R/R', margin24: -13.5 },
  { state: 'UT', name: 'Utah', pvi: 'R+13', pviNum: -13, ev: 6, gov: 'R', senate: 'R/R', margin24: -21.5 },
  { state: 'VT', name: 'Vermont', pvi: 'D+13', pviNum: 13, ev: 3, gov: 'R', senate: 'I/D', margin24: 22.4 },
  { state: 'VA', name: 'Virginia', pvi: 'D+3', pviNum: 3, ev: 13, gov: 'R', senate: 'D/D', margin24: 3.5 },
  { state: 'WA', name: 'Washington', pvi: 'D+7', pviNum: 7, ev: 12, gov: 'D', senate: 'D/D', margin24: 11.8 },
  { state: 'WV', name: 'West Virginia', pvi: 'R+22', pviNum: -22, ev: 4, gov: 'R', senate: 'R/R', margin24: -38.9 },
  { state: 'WI', name: 'Wisconsin', pvi: 'EVEN', pviNum: 0, ev: 10, gov: 'D', senate: 'D/R', margin24: -0.9 },
  { state: 'WY', name: 'Wyoming', pvi: 'R+25', pviNum: -25, ev: 3, gov: 'R', senate: 'R/R', margin24: -43.4 },
  { state: 'DC', name: 'District of Columbia', pvi: 'D+43', pviNum: 43, ev: 3, gov: 'D', senate: '-', margin24: 82.7 },
];

async function getConn() {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || 'antelopedb-do-user-18192858-0.j.db.ondigitalocean.com',
    port: parseInt(process.env.MYSQL_PORT || '25060'),
    user: process.env.MYSQL_USER || 'doadmin',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: { rejectUnauthorized: false },
  });
}

async function seedStates(c: mysql.Connection) {
  console.log('Seeding state-level political data...');
  for (const s of STATE_DATA) {
    await c.execute(
      `INSERT INTO political_data_states (state, state_name, cook_pvi, cook_pvi_numeric, electoral_votes, governor_party, senate_seats, margin_2024)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         state_name=VALUES(state_name), cook_pvi=VALUES(cook_pvi), cook_pvi_numeric=VALUES(cook_pvi_numeric),
         electoral_votes=VALUES(electoral_votes), governor_party=VALUES(governor_party),
         senate_seats=VALUES(senate_seats), margin_2024=VALUES(margin_2024)`,
      [s.state, s.name, s.pvi, s.pviNum, s.ev, s.gov, s.senate, s.margin24]
    );
  }
  console.log('  Seeded ' + STATE_DATA.length + ' states');
}

async function main() {
  const args = process.argv.slice(2);
  const importCsv = args.includes('--csv');
  const stateArg = args.find((a) => a.startsWith('--state='));
  const csvPathArg = args.find((a) => a.startsWith('--csv-path='));
  const stateFilter = stateArg ? stateArg.split('=')[1]?.toUpperCase() : undefined;
  const csvPath = csvPathArg ? csvPathArg.split('=')[1] : undefined;

  const c = await getConn();
  try {
    await seedStates(c);
    if (importCsv) {
      console.log('Importing district CSV data...');
      const summary = await refreshDistrictPoliticalDataFromCsv({ csvPath, stateFilter });
      console.log(
        `  District import summary: processed=${summary.processedRows}, upserted=${summary.upsertedRows}, skipped=${summary.skippedRows}, source=${summary.sourcePath}`
      );
    }
    console.log('Done!');
  }
  finally { await c.end(); }
}

main().catch(console.error);
