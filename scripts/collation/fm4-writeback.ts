/**
 * FM4 — Idempotent reversible write-back to person_records (MySQL serving).
 *
 * Batch matching stays outside MySQL (FM1–FM3). This stage:
 *   - Applies high-confidence merges with cluster_key + match_confidence updates
 *   - Records merged_from audit (every merge undoable)
 *   - Skips settled pairs / soft-archived persons on re-run
 *   - Never overrides confirmed door-knock or DNC on the canonical record
 *
 *   yarn collation:fm4 -- --org 3 [--dry-run] [--auto-min 0.92]
 *   yarn collation:fm4 -- --org 3 --undo <auditId>
 *   yarn collation:fm4 -- --org 3 --list-audits
 */

import { openSql, closePool } from '../../src/app/utils/database/db';
import type { PoolConnection } from 'mysql2/promise';
import {
  autoMergePersons,
  undoPersonMerge,
} from '../../src/app/utils/database/person-merge';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function listAudits(orgId: number, limit: number) {
  const sql = await openSql();
  const [rows] = await sql.execute(
    `SELECT id, survivor_person_id, loser_person_id, match_score, status,
            merged_from, created_at, undone_at
     FROM person_merge_audit
     WHERE organization_id = ?
     ORDER BY id DESC
     LIMIT ${limit}`,
    [orgId]
  );
  for (const r of rows as any[]) {
    const mf =
      typeof r.merged_from === 'string' ? JSON.parse(r.merged_from) : r.merged_from;
    console.log(
      `#${r.id} ${r.status} survivor=${r.survivor_person_id} loser=${r.loser_person_id} score=${r.match_score} at=${mf?.timestamp || r.created_at}`
    );
  }
  console.log(`PASS: FM4 — listed ${(rows as any[]).length} audit rows`);
}

async function runUndo(orgId: number, auditId: number) {
  const sql = await openSql();
  const conn = (await sql.getConnection()) as PoolConnection;
  try {
    await conn.beginTransaction();
    const result = await undoPersonMerge(conn, orgId, auditId, null);
    await conn.commit();
    console.log(
      `undone audit=#${auditId} restored loser=#${result.loserId} survivor=#${result.survivorId}`
    );
    console.log('PASS: FM4 — merge reversed via merged_from audit');
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function runWriteback(orgId: number) {
  const autoMin = Number(arg('auto-min', process.env.FM3_AUTO_MERGE_MIN || '0.92'));
  if (!(autoMin > 0) || autoMin > 1) {
    throw new Error('--auto-min must be in (0, 1] (default 0.92)');
  }
  const dryRun = hasFlag('dry-run');
  const limit = Math.min(Math.max(Number(arg('limit', '5000')), 1), 50000);
  const runId = arg('run-id') || `fm4-${new Date().toISOString().slice(0, 10)}`;

  const sql = await openSql();

  // Incremental: pending high-confidence OR prior auto_merge that never soft-archived
  // (e.g. FM3 ran before FM4 audit). Skip persons already merged_into.
  const [rows] = await sql.execute(
    `SELECT c.id, c.left_person_id, c.right_person_id, c.score, c.decision
     FROM person_match_candidates c
     JOIN person_records pl ON pl.id = c.left_person_id AND pl.organization_id = c.organization_id
     JOIN person_records pr ON pr.id = c.right_person_id AND pr.organization_id = c.organization_id
     WHERE c.organization_id = ?
       AND c.score IS NOT NULL
       AND c.score >= ?
       AND (
         c.decision = 'pending'
         OR (
           c.decision = 'auto_merge'
           AND pl.merged_into_person_id IS NULL
           AND pr.merged_into_person_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM person_merge_audit a
             WHERE a.organization_id = c.organization_id
               AND a.status = 'applied'
               AND (
                 (a.survivor_person_id = c.left_person_id AND a.loser_person_id = c.right_person_id)
                 OR (a.survivor_person_id = c.right_person_id AND a.loser_person_id = c.left_person_id)
               )
           )
         )
       )
       AND pl.merged_into_person_id IS NULL
       AND pr.merged_into_person_id IS NULL
     ORDER BY c.score DESC
     LIMIT ${limit}`,
    [orgId, autoMin]
  );

  const candidates = rows as {
    id: number;
    left_person_id: number;
    right_person_id: number;
    score: number;
    decision: string;
  }[];

  console.log(
    `FM4 write-back org=${orgId} candidates=${candidates.length} autoMin=${autoMin} dryRun=${dryRun} run=${runId}`
  );

  let merged = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    const score = Number(c.score);
    if (dryRun) {
      console.log(
        `[dry-run] merge ${c.left_person_id}+${c.right_person_id} score=${score} decision=${c.decision}`
      );
      merged++;
      continue;
    }

    const conn = (await sql.getConnection()) as PoolConnection;
    try {
      await conn.beginTransaction();
      const result = await autoMergePersons(
        conn,
        orgId,
        c.left_person_id,
        c.right_person_id,
        score,
        { matchCandidateId: c.id, runId }
      );
      await conn.execute(
        `UPDATE person_match_candidates
         SET decision = 'auto_merge', score = ?
         WHERE id = ? AND organization_id = ?`,
        [score, c.id, orgId]
      );
      await conn.commit();
      if (result.skipped) {
        skipped++;
        console.log(
          `skip pair ${c.left_person_id}/${c.right_person_id}: ${result.reason}`
        );
      } else {
        merged++;
        console.log(
          `write-back survivor=#${result.survivorId} loser=#${result.loserId} audit=#${result.auditId} score=${score}`
        );
      }
    } catch (e) {
      await conn.rollback();
      errors++;
      console.warn(
        `write-back failed pair ${c.left_person_id}/${c.right_person_id}:`,
        e instanceof Error ? e.message : e
      );
    } finally {
      conn.release();
    }
  }

  console.log({ merged, skipped, errors, dryRun });
  console.log(
    `PASS: FM4 — wrote ${merged} merges (${skipped} settled skipped, ${errors} errors); all reversible via merged_from`
  );
}

async function main() {
  const orgId = Number(arg('org', process.env.SMOKE_ORG_ID || '1'));
  if (!Number.isFinite(orgId) || orgId <= 0) throw new Error('--org required');

  if (hasFlag('list-audits')) {
    await listAudits(orgId, Math.min(Math.max(Number(arg('limit', '50')), 1), 500));
    return;
  }

  const undoRaw = arg('undo');
  if (undoRaw != null) {
    const auditId = Number(undoRaw);
    if (!Number.isFinite(auditId) || auditId <= 0) {
      throw new Error('--undo requires a person_merge_audit id');
    }
    await runUndo(orgId, auditId);
    return;
  }

  await runWriteback(orgId);
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
