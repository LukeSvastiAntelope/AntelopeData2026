/**
 * FM4 DB smoke: merge → audit → undo → re-merge (idempotent skip).
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/collation/smoke-fm4-db.ts
 */

import { openSql, closePool } from '../../src/app/utils/database/db';
import type { PoolConnection } from 'mysql2/promise';
import {
  autoMergePersons,
  undoPersonMerge,
  pickCanvassFields,
} from '../../src/app/utils/database/person-merge';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const sql = await openSql();
  const orgId = Number(process.env.SMOKE_ORG_ID || '1');
  const tag = `fm4smoke_${Date.now()}`;

  // Seed two live persons — loser has DNC, survivor has file party only
  const [insA] = await sql.execute(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, full_name_normalized,
       party, zip, state, match_confidence, canvass_status)
     VALUES (?, ?, 'Alex', 'Rivera', 'alex rivera', 'Republican', '07030', 'NJ', 0.4, NULL)`,
    [orgId, `${tag}_a`]
  );
  const [insB] = await sql.execute(
    `INSERT INTO person_records
      (organization_id, cluster_key, first_name, last_name, full_name_normalized,
       party, zip, state, match_confidence, canvass_status, canvass_notes)
     VALUES (?, ?, 'Alexander', 'Rivera', 'alexander rivera', 'Unaffiliated', '07030', 'NJ', 0.4,
             'dnc_request', 'door dnc')`,
    [orgId, `${tag}_b`]
  );
  const idA = Number((insA as any).insertId);
  const idB = Number((insB as any).insertId);
  assert(idA > 0 && idB > 0, 'seed insert ids');

  // Suppression on loser — must move to survivor and return on undo
  const [sup] = await sql.execute(
    `INSERT INTO contact_suppression
      (organization_id, person_record_id, reason, source, notes)
     VALUES (?, ?, 'do_not_contact', 'refused', ?)`,
    [orgId, Math.max(idA, idB), tag]
  );
  const suppressionId = Number((sup as any).insertId);

  const conn = (await sql.getConnection()) as PoolConnection;
  let auditId = 0;
  let survivorId = 0;
  let loserId = 0;
  try {
    await conn.beginTransaction();
    const result = await autoMergePersons(conn, orgId, idA, idB, 0.96, {
      runId: tag,
      notes: 'fm4 smoke',
    });
    assert(!result.skipped, 'first merge should apply');
    assert(result.auditId != null, 'audit id required');
    auditId = result.auditId!;
    survivorId = result.survivorId;
    loserId = result.loserId;
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [survRows] = await sql.execute(
    `SELECT canvass_status, canvass_notes, match_confidence, cluster_key, merged_into_person_id
     FROM person_records WHERE id = ?`,
    [survivorId]
  );
  const surv = (survRows as any[])[0];
  assert(surv.canvass_status === 'dnc_request', 'DNC must land on canonical');
  assert(String(surv.canvass_notes || '').includes('door dnc'), 'DNC notes on canonical');
  assert(Number(surv.match_confidence) >= 0.96, 'match_confidence updated');
  assert(surv.merged_into_person_id == null, 'survivor stays live');

  const [loseRows] = await sql.execute(
    `SELECT merged_into_person_id FROM person_records WHERE id = ?`,
    [loserId]
  );
  assert(
    Number((loseRows as any[])[0].merged_into_person_id) === survivorId,
    'loser soft-archived'
  );

  const [audRows] = await sql.execute(
    `SELECT merged_from, status FROM person_merge_audit WHERE id = ?`,
    [auditId]
  );
  const aud = (audRows as any[])[0];
  const mf =
    typeof aud.merged_from === 'string' ? JSON.parse(aud.merged_from) : aud.merged_from;
  assert(aud.status === 'applied', 'audit applied');
  assert(Array.isArray(mf.records) && mf.records.length === 2, 'merged_from records');
  assert(typeof mf.score === 'number' && mf.timestamp, 'merged_from score+timestamp');

  const [supAfter] = await sql.execute(
    `SELECT person_record_id FROM contact_suppression WHERE id = ?`,
    [suppressionId]
  );
  assert(
    Number((supAfter as any[])[0].person_record_id) === survivorId,
    'DNC suppression moved to survivor'
  );

  // Idempotent re-merge
  const conn2 = (await sql.getConnection()) as PoolConnection;
  try {
    await conn2.beginTransaction();
    const again = await autoMergePersons(conn2, orgId, idA, idB, 0.96, { runId: tag });
    assert(again.skipped === true, 're-merge must skip settled pair');
    await conn2.commit();
  } catch (e) {
    await conn2.rollback();
    throw e;
  } finally {
    conn2.release();
  }

  // Undo
  const conn3 = (await sql.getConnection()) as PoolConnection;
  try {
    await conn3.beginTransaction();
    await undoPersonMerge(conn3, orgId, auditId, null);
    await conn3.commit();
  } catch (e) {
    await conn3.rollback();
    throw e;
  } finally {
    conn3.release();
  }

  const [loseAfter] = await sql.execute(
    `SELECT merged_into_person_id, canvass_status FROM person_records WHERE id = ?`,
    [loserId]
  );
  assert((loseAfter as any[])[0].merged_into_person_id == null, 'loser live after undo');
  assert((loseAfter as any[])[0].canvass_status === 'dnc_request', 'loser DNC restored');

  const [supBack] = await sql.execute(
    `SELECT person_record_id FROM contact_suppression WHERE id = ?`,
    [suppressionId]
  );
  assert(
    Number((supBack as any[])[0].person_record_id) === loserId,
    'suppression returned to loser'
  );

  const [audUndone] = await sql.execute(
    `SELECT status FROM person_merge_audit WHERE id = ?`,
    [auditId]
  );
  assert((audUndone as any[])[0].status === 'undone', 'audit marked undone');

  // Cleanup smoke rows
  await sql.execute(`DELETE FROM contact_suppression WHERE id = ?`, [suppressionId]);
  await sql.execute(`DELETE FROM person_merge_audit WHERE id = ?`, [auditId]);
  await sql.execute(`DELETE FROM person_records WHERE id IN (?, ?)`, [idA, idB]);

  // Touches pickCanvassFields export for tree-shake sanity
  assert(typeof pickCanvassFields === 'function', 'pickCanvassFields export');

  console.log(
    `PASS: FM4 DB — merge audit=#${auditId} survivor=#${survivorId} loser=#${loserId} undone`
  );
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
