/**
 * Blocking — cheap keys (ZIP + phonetic last name) shrink the pair space.
 * Blocking quality matters more than the scorer.
 */

import type { StandardizedRow } from './types';

export function buildBlocks(rows: StandardizedRow[]): Map<string, number[]> {
  const blocks = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    const key = row.blockKey || 'UNK';
    const list = blocks.get(key) || [];
    list.push(idx);
    blocks.set(key, list);
  });
  return blocks;
}

/** Candidate pairs within each block (i < j). Caps huge blocks. */
export function candidatePairs(
  blocks: Map<string, number[]>,
  maxBlockSize = 250
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const idxs of blocks.values()) {
    const list = idxs.length > maxBlockSize ? idxs.slice(0, maxBlockSize) : idxs;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        pairs.push([list[i], list[j]]);
      }
    }
  }
  return pairs;
}
