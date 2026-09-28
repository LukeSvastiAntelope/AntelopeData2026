/**
 * Admin A5 smoke — Antelope growth channel + gated marketing drafts (never auto-post).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/smoke-a5-growth.ts
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

import { getTool } from '../src/app/utils/services/tools/registry';
import { executeTool } from '../src/app/utils/services/tools/executor';
import {
  AntelopeGrowthRepo,
} from '../src/app/utils/database/antelope-growth-repo';
import {
  approveMarketingDraft,
  getOrCreateGrowthChannel,
  rejectMarketingDraft,
  stageAntelopeMarketingDraft,
} from '../src/app/utils/services/antelope-growth-service';
import { closePool, openSql } from '../src/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('--- tool registry ---');
  const tool = getTool('post_antelope_marketing');
  assert(!!tool, 'post_antelope_marketing registered');
  assert(tool!.risk === 'approval', 'risk=approval');

  const held = await executeTool(
    {
      name: 'post_antelope_marketing',
      input: { body: 'Test draft — should hold at gate' },
    },
    { userId: 1, organizationId: 0 }
  );
  assert(held.ok && held.status === 'pending_approval', 'executor holds');
  console.log('approval gate ok');

  const sql = await openSql();
  const [tables] = await sql.execute<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('antelope_growth_channels','antelope_marketing_drafts')`
  );
  assert(tables.length === 2, 'growth tables missing — run migration');

  const [users] = await sql.execute<RowDataPacket[]>(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  assert(users.length > 0, 'need a user');
  const actorUserId = Number(users[0].id);

  console.log('--- channel ---');
  const channel = await getOrCreateGrowthChannel();
  assert(channel.provider === 'twitter', 'twitter channel');
  assert(!!channel.handle, 'handle');
  console.log('channel', { id: channel.id, handle: channel.handle });

  console.log('--- stage draft ---');
  const staged = await stageAntelopeMarketingDraft({
    actorUserId,
    body: 'Smoke test: Antelope growth draft held for approval. Never auto-posts.',
    topic: 'smoke',
    source: 'manual',
    generate: false,
  });
  assert(staged.draft.status === 'pending_approval', 'pending');
  assert(staged.draft.body.length > 10, 'body');
  console.log('staged', {
    id: staged.draft.id,
    stagedActionId: staged.stagedActionId,
  });

  console.log('--- approve (no post) ---');
  const approved = await approveMarketingDraft(staged.draft.id, actorUserId);
  assert(approved.status === 'approved', 'approved');
  assert(!approved.postedAt, 'approve must not set posted_at');

  console.log('--- mark posted (manual) ---');
  const posted = await AntelopeGrowthRepo.markPosted(approved.id, {
    externalId: 'smoke-manual',
  });
  assert(posted?.status === 'posted', 'posted');
  assert(!!posted?.postedAt, 'posted_at');

  console.log('--- reject path ---');
  const staged2 = await stageAntelopeMarketingDraft({
    actorUserId,
    generate: true,
    source: 'agent',
  });
  const rejected = await rejectMarketingDraft(staged2.draft.id, actorUserId);
  assert(rejected.status === 'rejected', 'rejected');

  // Cannot mark posted from pending
  const bad = await AntelopeGrowthRepo.markPosted(staged2.draft.id);
  assert(bad === null, 'cannot mark_posted unless approved');

  console.log('A5 smoke PASSED');
  await closePool();
}

main().catch(async (err) => {
  console.error('A5 smoke FAILED', err);
  try {
    await closePool();
  } catch {}
  process.exit(1);
});
