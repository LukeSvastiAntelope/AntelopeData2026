/**
 * FM1 — Blocking over existing normalized person_records fields.
 *
 * Reads the D1 serving store (does NOT re-cluster). Emits candidate pairs only
 * across *different* cluster_keys that share a cheap block:
 *   - zip_phonetic: ZIP5 + Soundex(last name)
 *   - geo_phonetic: ~110m geohash cell + Soundex(last name)
 *
 * Blocking is the cost lever — huge blocks are capped. No scoring/merge here
 * (FM2+). False merges are worse than false splits; this stage only proposes.
 *
 *   yarn collation:fm1 -- --org 1 --max-block 80
 */

import { randomUUID } from 'crypto';
import { openSql, closePool } from '../../src/app/utils/database/db';
import type { ResultSetHeader } from 'mysql2';
import { soundex, normalizeZip } from './standardize';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

type PersonBlockRow = {
  id: number;
  organization_id: number;
  cluster_key: string;
  last_name: string | null;
  full_name_normalized: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  street_normalized: string | null;
};

type BlockStrategy = 'zip_phonetic' | 'geo_phonetic';

type CandidatePair = {
  leftPersonId: number;
  rightPersonId: number;
  leftClusterKey: string;
  rightClusterKey: string;
  blockKey: string;
  blockStrategy: BlockStrategy;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function lastNameFromPerson(p: PersonBlockRow): string {
  if (p.last_name && p.last_name.trim()) return p.last_name.trim();
  const full = (p.full_name_normalized || '').trim();
  if (!full) return '';
  const parts = full.split(/\s+/);
  return parts[parts.length - 1] || '';
}

/** ~0.001° ≈ 111m — coarse cell for "same geocoded block". */
function geoCell(lat: number, lng: number): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

function buildBlockMap(
  people: PersonBlockRow[],
  strategy: BlockStrategy
): Map<string, PersonBlockRow[]> {
  const blocks = new Map<string, PersonBlockRow[]>();
  for (const p of people) {
    const phonetic = soundex(lastNameFromPerson(p));
    if (!phonetic) continue;

    let key: string | null = null;
    if (strategy === 'zip_phonetic') {
      const zip = normalizeZip(p.zip || '');
      if (!zip || zip.length < 5) continue;
      key = `zip:${zip}|sx:${phonetic}`;
    } else {
      if (p.latitude == null || p.longitude == null) continue;
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      key = `geo:${geoCell(lat, lng)}|sx:${phonetic}`;
    }

    const list = blocks.get(key) || [];
    list.push(p);
    blocks.set(key, list);
  }
  return blocks;
}

/**
 * Candidate pairs within a block, only across different cluster_keys.
 * Caps block size so blocking stays the cost lever.
 */
function pairsFromBlocks(
  blocks: Map<string, PersonBlockRow[]>,
  strategy: BlockStrategy,
  maxBlockSize: number
): CandidatePair[] {
  const pairs: CandidatePair[] = [];
  const seen = new Set<string>();

  for (const [blockKey, members] of blocks) {
    // Distinct cluster_keys in this block — skip pure same-cluster noise
    const byCluster = new Map<string, PersonBlockRow[]>();
    for (const m of members) {
      const list = byCluster.get(m.cluster_key) || [];
      list.push(m);
      byCluster.set(m.cluster_key, list);
    }
    if (byCluster.size < 2) continue;

    // One representative per cluster (lowest id) keeps pair count down
    const reps = [...byCluster.values()]
      .map((list) => list.slice().sort((a, b) => a.id - b.id)[0])
      .sort((a, b) => a.id - b.id);

    const capped = reps.length > maxBlockSize ? reps.slice(0, maxBlockSize) : reps;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const a = capped[i];
        const b = capped[j];
        if (a.cluster_key === b.cluster_key) continue;
        const left = a.id < b.id ? a : b;
        const right = a.id < b.id ? b : a;
        const pairKey = `${left.id}:${right.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        pairs.push({
          leftPersonId: left.id,
          rightPersonId: right.id,
          leftClusterKey: left.cluster_key,
          rightClusterKey: right.cluster_key,
          blockKey,
          blockStrategy: strategy,
        });
      }
    }
  }

  return pairs;
}

async function loadPeople(organizationId: number | null): Promise<PersonBlockRow[]> {
  const sql = await openSql();
  // FM4: only live (non soft-archived) persons — settled merges stay out of blocking
  const where =
    organizationId != null
      ? 'WHERE pr.organization_id = ? AND pr.merged_into_person_id IS NULL'
      : 'WHERE pr.merged_into_person_id IS NULL';
  const params = organizationId != null ? [organizationId] : [];
  const [rows] = await sql.execute(
    `SELECT
       pr.id,
       pr.organization_id,
       pr.cluster_key,
       pr.last_name,
       pr.full_name_normalized,
       pr.zip,
       pr.latitude,
       pr.longitude,
       ap.street_normalized
     FROM person_records pr
     LEFT JOIN address_points ap ON ap.id = pr.address_point_id
     ${where}
     ORDER BY pr.id ASC`,
    params
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    organization_id: Number(r.organization_id || 0),
    cluster_key: String(r.cluster_key),
    last_name: r.last_name,
    full_name_normalized: r.full_name_normalized,
    zip: r.zip,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    street_normalized: r.street_normalized,
  }));
}

async function writeCandidates(
  organizationId: number,
  runId: string,
  pairs: CandidatePair[]
): Promise<number> {
  if (!pairs.length) return 0;
  const sql = await openSql();
  let written = 0;
  const chunk = 200;
  for (let i = 0; i < pairs.length; i += chunk) {
    const slice = pairs.slice(i, i + chunk);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (const p of slice) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        organizationId,
        runId,
        p.leftPersonId,
        p.rightPersonId,
        p.leftClusterKey,
        p.rightClusterKey,
        p.blockKey,
        p.blockStrategy,
        null, // score — FM2
        'pending'
      );
    }
    const [result] = await sql.execute<ResultSetHeader>(
      `INSERT INTO person_match_candidates
        (organization_id, run_id, left_person_id, right_person_id,
         left_cluster_key, right_cluster_key, block_key, block_strategy,
         score, decision)
       VALUES ${placeholders.join(',')}
       ON DUPLICATE KEY UPDATE
         block_key = VALUES(block_key),
         block_strategy = VALUES(block_strategy)`,
      values
    );
    written += result.affectedRows;
  }
  return written;
}

async function main() {
  const orgRaw = arg('org', process.env.SMOKE_ORG_ID || '1');
  const organizationId = Number(orgRaw);
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    throw new Error('--org required (organization id)');
  }
  const maxBlock = Math.min(Math.max(Number(arg('max-block', '80')), 5), 250);
  const runId =
    arg('run-id') ||
    `fm1-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  const people = await loadPeople(organizationId);
  console.log(
    `FM1 blocking org=${organizationId} people=${people.length} maxBlock=${maxBlock} run=${runId}`
  );

  const zipBlocks = buildBlockMap(people, 'zip_phonetic');
  const geoBlocks = buildBlockMap(people, 'geo_phonetic');

  const zipPairs = pairsFromBlocks(zipBlocks, 'zip_phonetic', maxBlock);
  const geoPairs = pairsFromBlocks(geoBlocks, 'geo_phonetic', maxBlock);

  // Prefer zip strategy when both fire for the same pair
  const byPair = new Map<string, CandidatePair>();
  for (const p of [...geoPairs, ...zipPairs]) {
    byPair.set(`${p.leftPersonId}:${p.rightPersonId}`, p);
  }
  const pairs = [...byPair.values()];

  const written = await writeCandidates(organizationId, runId, pairs);

  const blockStats = {
    zipBlocks: zipBlocks.size,
    geoBlocks: geoBlocks.size,
    zipPairs: zipPairs.length,
    geoPairs: geoPairs.length,
    uniquePairs: pairs.length,
    written,
  };
  console.log(blockStats);
  console.log(
    `PASS: FM1 — ${pairs.length} cross-cluster candidate pairs (pending; no auto-merge)`
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
