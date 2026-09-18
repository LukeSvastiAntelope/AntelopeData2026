/**
 * Connected-component clustering — each component is one person.
 */

import type { ScoredPair } from './types';

export function clusterMatches(
  rowCount: number,
  pairs: ScoredPair[],
  opts?: { includeMaybe?: boolean }
): number[][] {
  const includeMaybe = opts?.includeMaybe ?? false;
  const parent = Array.from({ length: rowCount }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (const p of pairs) {
    if (p.decision === 'match' || (includeMaybe && p.decision === 'maybe')) {
      union(p.a, p.b);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < rowCount; i++) {
    const r = find(i);
    const list = groups.get(r) || [];
    list.push(i);
    groups.set(r, list);
  }
  return Array.from(groups.values());
}

/** Mean pairwise match score within a cluster (for match_confidence). */
export function clusterConfidence(
  memberIdxs: number[],
  pairs: ScoredPair[]
): number {
  if (memberIdxs.length <= 1) return 0.7;
  const set = new Set(memberIdxs);
  const relevant = pairs.filter(
    (p) => set.has(p.a) && set.has(p.b) && p.decision === 'match'
  );
  if (!relevant.length) return 0.75;
  const avg = relevant.reduce((s, p) => s + p.score, 0) / relevant.length;
  return Math.min(0.999, Math.max(0.5, avg));
}
