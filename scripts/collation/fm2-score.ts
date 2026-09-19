/**
 * FM2 — Fuzzy scoring per FM1 candidate pair.
 *
 * Reads pending person_match_candidates, computes a field-level similarity
 * vector (names + nickname map, street trigram/Levenshtein, geo-distance
 * tiebreaker, exact email/phone), writes score + field_scores JSON.
 * Leaves decision=pending — thresholds / review / merge are FM3–FM4.
 *
 *   yarn collation:fm2 -- --org 3 --run-id <optional>
 */

import { openSql, closePool } from '../../src/app/utils/database/db';
import {
  exactOrEmpty,
  jaroWinkler,
  levenshteinSimilarity,
  trigramSimilarity,
} from './score';
import { areNicknames } from './nicknames';
import { normalizeEmail, normalizeName, normalizePhone, normalizeZip } from './standardize';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

type PersonScoreRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  full_name_normalized: string | null;
  email: string | null;
  phone: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  street_normalized: string | null;
};

export type SimilarityVector = {
  firstName: number;
  lastName: number;
  fullName: number;
  nicknameMatch: boolean;
  streetTrigram: number;
  streetLevenshtein: number;
  street: number;
  geoDistanceM: number | null;
  geo: number;
  email: number;
  phone: number;
  zip: number;
  /** Weighted composite in [0,1] — informational; FM3 decides. */
  composite: number;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function firstNameOf(p: PersonScoreRow): string {
  if (p.first_name?.trim()) return normalizeName(p.first_name);
  const full = normalizeName(p.full_name_normalized || '');
  return full.split(/\s+/)[0] || '';
}

function lastNameOf(p: PersonScoreRow): string {
  if (p.last_name?.trim()) return normalizeName(p.last_name);
  const full = normalizeName(p.full_name_normalized || '');
  const parts = full.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** Haversine distance in meters. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Geo similarity tiebreaker: 1 at same point, decays to ~0 by 500m.
 * Missing coords → neutral 0.5.
 */
export function geoSimilarity(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null }
): { meters: number | null; score: number } {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return { meters: null, score: 0.5 };
  }
  const meters = haversineMeters(
    Number(a.latitude),
    Number(a.longitude),
    Number(b.latitude),
    Number(b.longitude)
  );
  // Exponential decay: ~0.37 at 150m, ~0.05 at 500m
  const score = Math.exp(-meters / 150);
  return { meters, score: Math.max(0, Math.min(1, score)) };
}

/** Name score: max(JW, trigram, lev); nickname group boosts to ≥0.92. */
export function nameSimilarity(a: string, b: string): {
  score: number;
  nicknameMatch: boolean;
} {
  const A = normalizeName(a);
  const B = normalizeName(b);
  if (!A || !B) return { score: 0.4, nicknameMatch: false };
  const nick = areNicknames(A, B);
  const raw = Math.max(jaroWinkler(A, B), trigramSimilarity(A, B), levenshteinSimilarity(A, B));
  if (nick) return { score: Math.max(raw, 0.92), nicknameMatch: true };
  return { score: raw, nicknameMatch: false };
}

export function scorePersonPair(a: PersonScoreRow, b: PersonScoreRow): SimilarityVector {
  const firstA = firstNameOf(a);
  const firstB = firstNameOf(b);
  const lastA = lastNameOf(a);
  const lastB = lastNameOf(b);
  const fullA = normalizeName(a.full_name_normalized || `${firstA} ${lastA}`);
  const fullB = normalizeName(b.full_name_normalized || `${firstB} ${lastB}`);

  const first = nameSimilarity(firstA, firstB);
  const last = nameSimilarity(lastA, lastB);
  const full = nameSimilarity(fullA, fullB);

  const streetA = (a.street_normalized || '').toUpperCase().trim();
  const streetB = (b.street_normalized || '').toUpperCase().trim();
  const streetTrigram = streetA && streetB ? trigramSimilarity(streetA, streetB) : 0.5;
  const streetLevenshtein =
    streetA && streetB ? levenshteinSimilarity(streetA, streetB) : 0.5;
  const street = Math.max(streetTrigram, streetLevenshtein);

  const geo = geoSimilarity(a, b);

  const emailA = normalizeEmail(a.email || '');
  const emailB = normalizeEmail(b.email || '');
  const phoneA = normalizePhone(a.phone || '');
  const phoneB = normalizePhone(b.phone || '');
  // Exact on normalized — strong evidence when both present
  const email =
    emailA && emailB ? (emailA === emailB ? 1 : 0) : exactOrEmpty(emailA, emailB);
  const phone =
    phoneA && phoneB ? (phoneA === phoneB ? 1 : 0) : exactOrEmpty(phoneA, phoneB);

  const zipA = normalizeZip(a.zip || '');
  const zipB = normalizeZip(b.zip || '');
  const zip = zipA && zipB ? (zipA === zipB ? 1 : 0) : 0.5;

  // Weighted composite (informational). Email/phone dominate when present.
  const weights: Array<[number, number]> = [
    [first.score, 2.0],
    [last.score, 2.5],
    [full.score, 1.5],
    [street, 2.0],
    [geo.score, 1.0],
    [email, emailA && emailB ? 4.0 : 0.5],
    [phone, phoneA && phoneB ? 3.5 : 0.5],
    [zip, 1.0],
  ];
  let num = 0;
  let den = 0;
  for (const [s, w] of weights) {
    num += s * w;
    den += w;
  }
  let composite = den ? num / den : 0;

  // Deterministic shortcuts (same as D1 decide) — still leave decision pending
  if (emailA && emailB && emailA === emailB) composite = Math.max(composite, 0.99);
  if (phoneA && phoneB && phoneA === phoneB && last.score >= 0.9) {
    composite = Math.max(composite, 0.97);
  }

  return {
    firstName: round4(first.score),
    lastName: round4(last.score),
    fullName: round4(full.score),
    nicknameMatch: first.nicknameMatch || last.nicknameMatch,
    streetTrigram: round4(streetTrigram),
    streetLevenshtein: round4(streetLevenshtein),
    street: round4(street),
    geoDistanceM: geo.meters != null ? Math.round(geo.meters * 10) / 10 : null,
    geo: round4(geo.score),
    email: round4(email),
    phone: round4(phone),
    zip: round4(zip),
    composite: round4(composite),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function loadPeopleByIds(ids: number[]): Promise<Map<number, PersonScoreRow>> {
  const map = new Map<number, PersonScoreRow>();
  if (!ids.length) return map;
  const sql = await openSql();
  // Chunk IN lists
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const placeholders = slice.map(() => '?').join(',');
    const [rows] = await sql.execute(
      `SELECT
         pr.id, pr.first_name, pr.last_name, pr.full_name_normalized,
         pr.email, pr.phone, pr.zip, pr.latitude, pr.longitude,
         ap.street_normalized
       FROM person_records pr
       LEFT JOIN address_points ap ON ap.id = pr.address_point_id
       WHERE pr.id IN (${placeholders})`,
      slice
    );
    for (const r of rows as any[]) {
      map.set(Number(r.id), {
        id: Number(r.id),
        first_name: r.first_name,
        last_name: r.last_name,
        full_name_normalized: r.full_name_normalized,
        email: r.email,
        phone: r.phone,
        zip: r.zip,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        street_normalized: r.street_normalized,
      });
    }
  }
  return map;
}

async function main() {
  const orgId = Number(arg('org', process.env.SMOKE_ORG_ID || '1'));
  if (!Number.isFinite(orgId) || orgId <= 0) throw new Error('--org required');
  const runId = arg('run-id'); // optional filter
  const limit = Math.min(Math.max(Number(arg('limit', '5000')), 1), 50000);

  const sql = await openSql();
  const where = ['organization_id = ?', `decision = 'pending'`];
  const params: unknown[] = [orgId];
  if (runId) {
    where.push('run_id = ?');
    params.push(runId);
  }
  const [cands] = await sql.execute(
    `SELECT id, left_person_id, right_person_id, run_id
     FROM person_match_candidates
     WHERE ${where.join(' AND ')}
     ORDER BY id ASC
     LIMIT ${limit}`,
    params
  );
  const candidates = cands as {
    id: number;
    left_person_id: number;
    right_person_id: number;
    run_id: string;
  }[];

  console.log(
    `FM2 scoring org=${orgId} candidates=${candidates.length}${runId ? ` run=${runId}` : ''}`
  );

  if (!candidates.length) {
    console.log('PASS: FM2 — no pending candidates');
    return;
  }

  const ids = [
    ...new Set(candidates.flatMap((c) => [c.left_person_id, c.right_person_id])),
  ];
  const people = await loadPeopleByIds(ids);

  let scored = 0;
  let missing = 0;
  let sumComposite = 0;

  for (const c of candidates) {
    const left = people.get(c.left_person_id);
    const right = people.get(c.right_person_id);
    if (!left || !right) {
      missing++;
      continue;
    }
    const vector = scorePersonPair(left, right);
    await sql.execute(
      `UPDATE person_match_candidates
       SET score = ?, field_scores = ?, decision = 'pending'
       WHERE id = ? AND organization_id = ?`,
      [vector.composite, JSON.stringify(vector), c.id, orgId]
    );
    scored++;
    sumComposite += vector.composite;
  }

  console.log({
    scored,
    missing,
    avgComposite: scored ? Math.round((sumComposite / scored) * 1000) / 1000 : null,
  });
  console.log(
    `PASS: FM2 — wrote similarity vectors for ${scored} pairs (decision still pending)`
  );
}

// Only run batch when executed directly (not when imported for unit checks)
const isDirectRun =
  process.argv[1]?.includes('fm2-score') ||
  process.argv[1]?.endsWith('fm2-score.ts');

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error('FAIL', e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool().catch(() => undefined);
    });
}