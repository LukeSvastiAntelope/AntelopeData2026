/**
 * FM3 — Conservative match decision on scored FM1/FM2 pairs.
 *
 * Thresholds (config, defaults conservative):
 *   FM3_AUTO_MERGE_MIN (default 0.92) → auto-merge clusters + survivorship
 *   FM3_REVIEW_MIN     (default 0.78) → merge_candidates review queue
 *   below review min → reject (leave separate)
 *
 * Never auto-merges the ambiguous middle. False merge > false split.
 *
 *   yarn collation:fm3 -- --org 3 [--dry-run] [--auto-min 0.92] [--review-min 0.78]
 */

import { openSql, closePool } from '../../src/app/utils/database/db';
import type { PoolConnection } from 'mysql2/promise';
import { autoMergePersons } from '../../src/app/utils/database/person-merge';
import {
  assertValidFm3Thresholds,
  decideFm3Match,
  getFm3Thresholds,
} from '../../src/app/utils/database/fm3-thresholds';

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

async function main() {
  const orgId = Number(arg('org', process.env.SMOKE_ORG_ID || '1'));
  if (!Number.isFinite(orgId) || orgId <= 0) throw new Error('--org required');

  const defaults = getFm3Thresholds();
  const autoMin = Number(arg('auto-min', String(defaults.autoMergeMin)));
  const reviewMin = Number(arg('review-min', String(defaults.reviewMin)));
  assertValidFm3Thresholds({ autoMergeMin: autoMin, reviewMin });
  const dryRun = hasFlag('dry-run');
  const limit = Math.min(Math.max(Number(arg('limit', '5000')), 1), 50000);
  const runId = arg('run-id');
  const thresholds = { autoMergeMin: autoMin, reviewMin };

  const sql = await openSql();
  const where = [
    'organization_id = ?',
    `decision = 'pending'`,
    'score IS NOT NULL',
  ];
  const params: unknown[] = [orgId];
  if (runId) {
    where.push('run_id = ?');
    params.push(runId);
  }

  const [rows] = await sql.execute(
    `SELECT id, left_person_id, right_person_id, score, field_scores
     FROM person_match_candidates
     WHERE ${where.join(' AND ')}
     ORDER BY score DESC
     LIMIT ${limit}`,
    params
  );
  const candidates = rows as {
    id: number;
    left_person_id: number;
    right_person_id: number;
    score: number;
    field_scores: unknown;
  }[];

  console.log(
    `FM3 decide org=${orgId} scored=${candidates.length} autoMin=${autoMin} reviewMin=${reviewMin} dryRun=${dryRun}`
  );

  let autoMerged = 0;
  let queuedReview = 0;
  let rejected = 0;
  let errors = 0;

  for (const c of candidates) {
    const score = Number(c.score);
    const decision = decideFm3Match(score, thresholds);

    if (decision === 'auto_merge') {
      if (dryRun) {
        console.log(
          `[dry-run] auto-merge ${c.left_person_id}+${c.right_person_id} score=${score}`
        );
        autoMerged++;
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
          { matchCandidateId: c.id }
        );
        await conn.execute(
          `UPDATE person_match_candidates
           SET decision = 'auto_merge', score = ?
           WHERE id = ? AND organization_id = ?`,
          [score, c.id, orgId]
        );
        await conn.commit();
        if (result.skipped) {
          console.log(
            `auto-merge skip ${c.left_person_id}/${c.right_person_id}: ${result.reason}`
          );
        } else {
          autoMerged++;
          console.log(
            `auto-merge survivor=#${result.survivorId} loser=#${result.loserId} audit=#${result.auditId} score=${score}`
          );
        }
      } catch (e) {
        await conn.rollback();
        errors++;
        console.warn(
          `auto-merge failed pair ${c.left_person_id}/${c.right_person_id}:`,
          e instanceof Error ? e.message : e
        );
      } finally {
        conn.release();
      }
      continue;
    }

    if (decision === 'review') {
      if (dryRun) {
        console.log(
          `[dry-run] review ${c.left_person_id}+${c.right_person_id} score=${score}`
        );
        queuedReview++;
        continue;
      }
      const personA = Math.min(c.left_person_id, c.right_person_id);
      const personB = Math.max(c.left_person_id, c.right_person_id);
      try {
        await sql.execute(
          `INSERT INTO merge_candidates
            (organization_id, person_a_id, person_b_id, match_candidate_id, score, field_scores, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE
             score = VALUES(score),
             field_scores = VALUES(field_scores),
             match_candidate_id = VALUES(match_candidate_id),
             updated_at = CURRENT_TIMESTAMP`,
          [
            orgId,
            personA,
            personB,
            c.id,
            score,
            typeof c.field_scores === 'string'
              ? c.field_scores
              : JSON.stringify(c.field_scores ?? null),
          ]
        );
        await sql.execute(
          `UPDATE person_match_candidates SET decision = 'review' WHERE id = ? AND organization_id = ?`,
          [c.id, orgId]
        );
        queuedReview++;
      } catch (e) {
        errors++;
        console.warn(
          `review queue failed pair ${personA}/${personB}:`,
          e instanceof Error ? e.message : e
        );
      }
      continue;
    }

    // Below review floor — leave separate
    if (!dryRun) {
      await sql.execute(
        `UPDATE person_match_candidates SET decision = 'reject' WHERE id = ? AND organization_id = ?`,
        [c.id, orgId]
      );
    }
    rejected++;
  }

  console.log({ autoMerged, queuedReview, rejected, errors, dryRun });
  console.log(
    `PASS: FM3 — auto=${autoMerged} review=${queuedReview} reject=${rejected} (conservative)`
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
