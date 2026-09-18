/**
 * Decide match / maybe / no from weighted field scores (simple Fellegi–Sunter).
 */

import type { StandardizedRow, ScoredPair, FieldScore, PairDecision } from './types';
import { exactOrEmpty, jaroWinkler, levenshteinSimilarity, trigramSimilarity } from './score';

const WEIGHTS = {
  email: 4.0,
  phone: 3.5,
  lastName: 2.5,
  firstName: 2.0,
  street: 2.0,
  zip: 1.0,
  birthdate: 2.0,
};

function combineNameScore(a: string, b: string): number {
  if (!a || !b) return 0.4;
  return Math.max(jaroWinkler(a, b), trigramSimilarity(a, b), levenshteinSimilarity(a, b));
}

export function scorePair(a: StandardizedRow, b: StandardizedRow): { score: number; fields: FieldScore[] } {
  const fields: FieldScore[] = [];

  const email =
    a.email && b.email ? (a.email === b.email ? 1 : 0) : exactOrEmpty(a.email, b.email);
  fields.push({ field: 'email', score: email, weight: WEIGHTS.email });

  const phone =
    a.phone && b.phone ? (a.phone === b.phone ? 1 : 0) : exactOrEmpty(a.phone, b.phone);
  fields.push({ field: 'phone', score: phone, weight: WEIGHTS.phone });

  const lastName = combineNameScore(a.lastName, b.lastName);
  fields.push({ field: 'lastName', score: lastName, weight: WEIGHTS.lastName });

  const firstName = combineNameScore(a.firstName, b.firstName);
  fields.push({ field: 'firstName', score: firstName, weight: WEIGHTS.firstName });

  const street = combineNameScore(a.street, b.street);
  fields.push({ field: 'street', score: street, weight: WEIGHTS.street });

  const zip = a.zip && b.zip ? (a.zip === b.zip ? 1 : 0) : 0.5;
  fields.push({ field: 'zip', score: zip, weight: WEIGHTS.zip });

  const birth =
    a.birthdate && b.birthdate
      ? a.birthdate === b.birthdate
        ? 1
        : 0
      : a.ageYears != null && b.ageYears != null
        ? Math.abs(a.ageYears - b.ageYears) <= 1
          ? 0.9
          : Math.abs(a.ageYears - b.ageYears) <= 3
            ? 0.5
            : 0.1
        : 0.5;
  fields.push({ field: 'birthdate', score: birth, weight: WEIGHTS.birthdate });

  // Deterministic shortcuts
  if (a.email && b.email && a.email === b.email) {
    return { score: 0.99, fields };
  }
  if (a.phone && b.phone && a.phone === b.phone && lastName >= 0.9) {
    return { score: 0.97, fields };
  }

  let num = 0;
  let den = 0;
  for (const f of fields) {
    num += f.score * f.weight;
    den += f.weight;
  }
  return { score: den ? num / den : 0, fields };
}

export function decide(score: number): PairDecision {
  if (score >= 0.86) return 'match';
  if (score >= 0.72) return 'maybe';
  return 'no';
}

export function scoreAndDecide(
  rows: StandardizedRow[],
  pairs: Array<[number, number]>
): ScoredPair[] {
  const out: ScoredPair[] = [];
  for (const [ai, bi] of pairs) {
    const { score, fields } = scorePair(rows[ai], rows[bi]);
    const decision = decide(score);
    if (decision === 'no') continue;
    out.push({ a: ai, b: bi, score, decision, fields });
  }
  return out;
}
