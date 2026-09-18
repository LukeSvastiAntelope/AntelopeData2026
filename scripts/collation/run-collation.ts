/**
 * D1 offline collation job
 *
 * Pipeline: standardize → block → score → decide → cluster → survivorship → MySQL
 * Matching runs here (Node string-similarity). MySQL is the serving store only.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/collation/run-collation.ts \
 *     --sources fixtures/collation/source_voter.csv,fixtures/collation/source_property.csv \
 *     --org 1
 *
 * Incremental: passes --incremental to match new source rows against existing
 * person_source_rows / person_records clusters for the org (no full wipe).
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { parse } from 'csv-parse/sync';
import { buildBlocks, candidatePairs } from './block';
import { scoreAndDecide } from './decide';
import { clusterMatches } from './cluster';
import { standardizeRow } from './standardize';
import { surviveCluster } from './survivorship';
import { writeUnifiedBatch } from './write-mysql';
import type { StandardizedRow, UnifiedPerson } from './types';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

function arg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadCsv(filePath: string): Record<string, string>[] {
  const abs = path.resolve(filePath);
  const text = fs.readFileSync(abs, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

async function loadExistingAnchors(
  conn: mysql.Connection,
  orgId: number | null
): Promise<StandardizedRow[]> {
  const [rows] = await conn.execute(
    `SELECT source_name, source_row_key, payload FROM person_source_rows
     WHERE organization_id <=> ?`,
    [orgId]
  );
  const out: StandardizedRow[] = [];
  for (const r of rows as any[]) {
    try {
      const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
      out.push(payload as StandardizedRow);
    } catch {
      /* skip bad payload */
    }
  }
  return out;
}

async function main() {
  const sourcesArg = arg('sources');
  const orgIdRaw = arg('org', '');
  const orgId = orgIdRaw ? Number(orgIdRaw) : null;
  const incremental = hasFlag('incremental');
  const dryRun = hasFlag('dry-run');

  if (!sourcesArg) {
    console.error('Usage: --sources file1.csv,file2.csv [--org 1] [--incremental] [--dry-run]');
    process.exit(1);
  }

  const files = sourcesArg.split(',').map((s) => s.trim()).filter(Boolean);
  const standardized: StandardizedRow[] = [];
  let newRowCount = 0;

  for (const file of files) {
    const sourceName = path.basename(file, path.extname(file));
    const rows = loadCsv(file);
    rows.forEach((raw, i) => {
      const key =
        raw.id ||
        raw.voter_id ||
        raw.parcel_id ||
        raw.source_row_key ||
        String(i + 1);
      standardized.push(
        standardizeRow(raw, { sourceName, sourceRowKey: String(key) })
      );
    });
    console.log(`Loaded ${rows.length} rows from ${file} as source "${sourceName}"`);
  }
  newRowCount = standardized.length;

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    if (incremental) {
      const anchors = await loadExistingAnchors(conn, orgId);
      standardized.push(...anchors);
      console.log(`Incremental: anchored against ${anchors.length} existing source rows`);
    }

    const blocks = buildBlocks(standardized);
    const pairs = candidatePairs(blocks);
    console.log(`Blocks: ${blocks.size}; candidate pairs: ${pairs.length}`);

    const scored = scoreAndDecide(standardized, pairs);
    const matches = scored.filter((p) => p.decision === 'match').length;
    const maybes = scored.filter((p) => p.decision === 'maybe').length;
    console.log(`Scored links — match: ${matches}, maybe: ${maybes}`);

    // Only auto-link matches into clusters (maybes stay reviewable / separate)
    const clusters = clusterMatches(standardized.length, scored, { includeMaybe: false });
    console.log(`Clusters (people): ${clusters.length}`);

    const people: UnifiedPerson[] = [];
    const sourceRowsByCluster = new Map<string, StandardizedRow[]>();

    for (const memberIdxs of clusters) {
      // Incremental: skip clusters that only contain prior anchor rows
      if (incremental && memberIdxs.every((i) => i >= newRowCount)) {
        continue;
      }
      const members = memberIdxs.map((i) => standardized[i]);
      const person = surviveCluster(members, memberIdxs, scored);
      people.push(person);
      sourceRowsByCluster.set(person.clusterKey, members);
    }

    console.log(`Unified people to write: ${people.length}`);
    if (dryRun) {
      console.log(JSON.stringify(people.slice(0, 3), null, 2));
      return;
    }

    const result = await writeUnifiedBatch(conn, orgId, people, sourceRowsByCluster);
    console.log(
      `Wrote ${result.people} person_records, ${result.addresses} address_points (org=${orgId})`
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
