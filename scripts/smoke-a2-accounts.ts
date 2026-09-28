/**
 * Admin A2 smoke — cross-org accounts list + detail (service layer).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-a2-accounts.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import {
  getAccountDetail,
  listAccountOverviews,
} from '../src/app/utils/services/admin-accounts-service';
import { closePool } from '../src/app/utils/database/db';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const accounts = await listAccountOverviews();
  assert(Array.isArray(accounts), 'accounts is array');
  assert(accounts.length > 0, 'expected at least one org');
  const sample = accounts[0];
  assert(typeof sample.id === 'number', 'id');
  assert(typeof sample.name === 'string', 'name');
  assert(typeof sample.plan === 'string', 'plan');
  assert(typeof sample.surveyCount === 'number', 'surveyCount');
  assert(typeof sample.contactCount === 'number', 'contactCount');
  assert(typeof sample.sendCount === 'number', 'sendCount');
  console.log('list ok', {
    total: accounts.length,
    sample: {
      id: sample.id,
      name: sample.name,
      plan: sample.plan,
      surveys: sample.surveyCount,
      contacts: sample.contactCount,
      sends: sample.sendCount,
      lastActiveAt: sample.lastActiveAt,
    },
  });

  const detail = await getAccountDetail(sample.id);
  assert(detail != null, 'detail found');
  assert(detail!.id === sample.id, 'detail id match');
  assert(Array.isArray(detail!.members), 'members');
  assert(Array.isArray(detail!.recentActivity), 'activity');
  assert(Array.isArray(detail!.recentSurveys), 'surveys');
  console.log('detail ok', {
    members: detail!.members.length,
    activity: detail!.recentActivity.length,
    surveys: detail!.recentSurveys.length,
  });

  const missing = await getAccountDetail(999999999);
  assert(missing === null, 'missing org → null');

  console.log('A2 smoke PASSED');
  await closePool();
}

main().catch(async (err) => {
  console.error('A2 smoke FAILED', err);
  try {
    await closePool();
  } catch {}
  process.exit(1);
});
