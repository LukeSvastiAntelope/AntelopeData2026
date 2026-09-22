/**
 * Statistical gate for postable survey insights.
 * Numbers and significance are computed in TypeScript — never by the model.
 */

import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';

export type PostableInsightThresholds = {
  minTotalResponses: number;
  minCellSize: number;
  alpha: number;
  minAbsoluteEffect: number;
  /** Apply BH when scanned contrasts exceed this count (default 1 = always when >1). */
  multipleComparisonThreshold: number;
  maxGroupingFields: number;
  maxGroupLevels: number;
  maxOutcomeCategories: number;
  maxScannedContrasts: number;
};

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Conservative defaults — tunable via env without code changes. */
export const POSTABLE_INSIGHT_THRESHOLDS: PostableInsightThresholds = {
  minTotalResponses: envNum('POSTABLE_MIN_TOTAL_RESPONSES', 80),
  minCellSize: envNum('POSTABLE_MIN_CELL_SIZE', 25),
  alpha: envNum('POSTABLE_ALPHA', 0.05),
  minAbsoluteEffect: envNum('POSTABLE_MIN_ABSOLUTE_EFFECT', 0.12),
  multipleComparisonThreshold: envNum('POSTABLE_MULTIPLE_COMPARISON_THRESHOLD', 1),
  maxGroupingFields: envNum('POSTABLE_MAX_GROUPING_FIELDS', 8),
  maxGroupLevels: envNum('POSTABLE_MAX_GROUP_LEVELS', 6),
  maxOutcomeCategories: envNum('POSTABLE_MAX_OUTCOME_CATEGORIES', 4),
  maxScannedContrasts: envNum('POSTABLE_MAX_SCANNED_CONTRASTS', 200),
};

export type ContrastKind = 'proportion' | 'mean';

export type ComputedContrast = {
  id: string;
  outcomeQuestionId: number;
  outcomePrompt: string;
  outcomeValue: string | null;
  groupingField: string;
  groupA: string;
  groupB: string;
  kind: ContrastKind;
  nA: number;
  nB: number;
  /** Proportion or mean in group A */
  estimateA: number;
  /** Proportion or mean in group B */
  estimateB: number;
  absoluteEffect: number;
  relativeEffect: number | null;
  pValue: number;
  pCorrected: number;
  publishable: boolean;
  flag: 'publishable' | 'directional_only';
  uncertaintyNote: string;
  testedContrasts: number;
};

export type PostableInsightScanResult = {
  surveyId: number;
  totalResponses: number;
  thresholds: PostableInsightThresholds;
  groupingFieldsUsed: string[];
  outcomeQuestionsScanned: number;
  contrastsScanned: number;
  publishable: ComputedContrast[];
  directionalOnly: ComputedContrast[];
  insufficientData: boolean;
  insufficientDataMessage: string | null;
};

// --- small stats helpers (no heavy deps) ---

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF */
function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Two-sided two-proportion z-test */
export function twoProportionZTest(
  successesA: number,
  nA: number,
  successesB: number,
  nB: number
): { pA: number; pB: number; absoluteEffect: number; relativeEffect: number | null; pValue: number } {
  const pA = successesA / nA;
  const pB = successesB / nB;
  const absoluteEffect = Math.abs(pA - pB);
  const relativeEffect = pB === 0 ? null : (pA - pB) / pB;
  const pPool = (successesA + successesB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  if (se === 0 || !Number.isFinite(se)) {
    return { pA, pB, absoluteEffect, relativeEffect, pValue: 1 };
  }
  const z = (pA - pB) / se;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  return { pA, pB, absoluteEffect, relativeEffect, pValue: Math.min(1, Math.max(0, pValue)) };
}

/** Welch's t-test (two-sided), approximate via normal for large n */
export function welchTTest(
  valuesA: number[],
  valuesB: number[]
): { meanA: number; meanB: number; absoluteEffect: number; relativeEffect: number | null; pValue: number } {
  const nA = valuesA.length;
  const nB = valuesB.length;
  const meanA = valuesA.reduce((s, v) => s + v, 0) / nA;
  const meanB = valuesB.reduce((s, v) => s + v, 0) / nB;
  const absoluteEffect = Math.abs(meanA - meanB);
  const relativeEffect = meanB === 0 ? null : (meanA - meanB) / meanB;
  const varA =
    valuesA.reduce((s, v) => s + (v - meanA) ** 2, 0) / Math.max(1, nA - 1);
  const varB =
    valuesB.reduce((s, v) => s + (v - meanB) ** 2, 0) / Math.max(1, nB - 1);
  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0 || !Number.isFinite(se)) {
    return { meanA, meanB, absoluteEffect, relativeEffect, pValue: 1 };
  }
  const t = (meanA - meanB) / se;
  // Normal approximation is fine at our minCellSize ≥ 25
  const pValue = 2 * (1 - normCdf(Math.abs(t)));
  return { meanA, meanB, absoluteEffect, relativeEffect, pValue: Math.min(1, Math.max(0, pValue)) };
}

/** Benjamini–Hochberg FDR correction; returns corrected p aligned to input order. */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const indexed = pValues.map((p, i) => ({ p: Math.min(1, Math.max(0, p)), i }));
  indexed.sort((a, b) => a.p - b.p);
  const corrected = new Array(m).fill(1);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const item = indexed[rank - 1];
    const bh = (item.p * m) / rank;
    running = Math.min(running, bh);
    corrected[item.i] = Math.min(1, running);
  }
  return corrected;
}

/** True when total N is below the publish floor (scan short-circuits). */
export function isBelowTotalResponseFloor(
  totalResponses: number,
  thresholds: PostableInsightThresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  return totalResponses < thresholds.minTotalResponses;
}

/**
 * Exact publish gate applied after BH correction in scanPostableInsights.
 * Cell size, alpha, and absolute-effect floors must all clear.
 */
export function contrastPassesPublishGate(
  c: { nA: number; nB: number; absoluteEffect: number },
  pCorrected: number,
  thresholds: PostableInsightThresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  return (
    c.nA >= thresholds.minCellSize &&
    c.nB >= thresholds.minCellSize &&
    pCorrected < thresholds.alpha &&
    c.absoluteEffect >= thresholds.minAbsoluteEffect
  );
}

type LoadedRow = {
  responseId: number;
  groups: Record<string, string>;
  answers: Record<number, string>;
  numericAnswers: Record<number, number>;
};

type OutcomeQuestion = {
  id: number;
  prompt: string;
  type: string;
  kind: ContrastKind;
};

function parseDemographics(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return out;
    }
  }
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const s = String(v).trim();
      if (s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined') {
        out[k] = s;
      }
    }
  }
  return out;
}

function isOutcomeType(type: string): ContrastKind | null {
  const t = (type || '').toLowerCase().replace(/_/g, '-');
  if (['single-choice', 'singlechoice', 'yes-no', 'yesno', 'multiple-choice'].includes(t)) {
    // multiple-choice treated as presence of first token / raw string category
    return 'proportion';
  }
  if (['rating', 'likert', 'number', 'scale'].includes(t)) return 'mean';
  return null;
}

function uncertaintyNote(c: {
  nA: number;
  nB: number;
  pCorrected: number;
  absoluteEffect: number;
  publishable: boolean;
  testedContrasts: number;
}): string {
  const base = `n=${c.nA} vs n=${c.nB}; |effect|=${(c.absoluteEffect * 100).toFixed(1)}pp; p(corrected)=${c.pCorrected.toPrecision(3)} (${c.testedContrasts} contrasts tested).`;
  if (!c.publishable) {
    return `${base} Flagged directional_only — not eligible for public posting.`;
  }
  return `${base} Cleared the statistical gate for a public claim, with residual sampling uncertainty.`;
}

/**
 * Scan survey responses and return gated contrasts.
 * Owner-scoped via SurveyRepo.getSurveyById.
 */
export async function scanPostableInsights(params: {
  surveyId: number;
  userId: number;
  thresholds?: Partial<PostableInsightThresholds>;
}): Promise<PostableInsightScanResult> {
  const thresholds: PostableInsightThresholds = {
    ...POSTABLE_INSIGHT_THRESHOLDS,
    ...(params.thresholds || {}),
  };

  const survey = await SurveyRepo.getSurveyById(params.surveyId, params.userId);
  if (!survey) {
    throw new Error(`Survey ${params.surveyId} not found or not accessible.`);
  }

  const db = await openSql();
  const [responseRows]: any = await db.execute(
    `SELECT id, demographics, gender, age_range, political_affiliation, income_bracket
     FROM survey_responses WHERE survey_id = ?`,
    [params.surveyId]
  );
  const totalResponses = (responseRows || []).length;

  const empty = (msg: string | null, insufficient: boolean): PostableInsightScanResult => ({
    surveyId: params.surveyId,
    totalResponses,
    thresholds,
    groupingFieldsUsed: [],
    outcomeQuestionsScanned: 0,
    contrastsScanned: 0,
    publishable: [],
    directionalOnly: [],
    insufficientData: insufficient,
    insufficientDataMessage: msg,
  });

  if (isBelowTotalResponseFloor(totalResponses, thresholds)) {
    return empty(
      `${totalResponses} responses — not enough to publish a subgroup claim yet (need ≥${thresholds.minTotalResponses}). Collect more responses or keep findings private.`,
      true
    );
  }

  const [questionRows]: any = await db.execute(
    `SELECT id, type, prompt FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC`,
    [params.surveyId]
  );

  const outcomes: OutcomeQuestion[] = [];
  for (const q of questionRows || []) {
    const kind = isOutcomeType(String(q.type || ''));
    if (!kind) continue;
    outcomes.push({
      id: Number(q.id),
      prompt: String(q.prompt || `Question ${q.id}`),
      type: String(q.type || ''),
      kind,
    });
  }

  const [answerRows]: any = await db.execute(
    `SELECT sa.response_id, sa.question_id, sa.answer_value
     FROM survey_answers sa
     INNER JOIN survey_responses sr ON sr.id = sa.response_id
     WHERE sr.survey_id = ?`,
    [params.surveyId]
  );

  const answersByResponse = new Map<number, { answers: Record<number, string>; numeric: Record<number, number> }>();
  for (const row of answerRows || []) {
    const rid = Number(row.response_id);
    const qid = Number(row.question_id);
    if (!answersByResponse.has(rid)) {
      answersByResponse.set(rid, { answers: {}, numeric: {} });
    }
    const bucket = answersByResponse.get(rid)!;
    const raw = row.answer_value == null ? '' : String(row.answer_value).trim();
    if (!raw) continue;
    // multiple-choice may be JSON array — keep as normalized string
    let label = raw;
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) label = parsed.map(String).join(' | ');
      } catch {
        /* keep raw */
      }
    }
    bucket.answers[qid] = label;
    const num = Number(raw);
    if (Number.isFinite(num)) bucket.numeric[qid] = num;
  }

  const DENORM_FIELDS = ['gender', 'age_range', 'political_affiliation', 'income_bracket'] as const;
  const rows: LoadedRow[] = [];
  const fieldValueCounts = new Map<string, Map<string, number>>();

  for (const rr of responseRows || []) {
    const rid = Number(rr.id);
    const groups: Record<string, string> = {};
    const demo = parseDemographics(rr.demographics);
    for (const [k, v] of Object.entries(demo)) {
      groups[k] = v;
    }
    for (const f of DENORM_FIELDS) {
      if (rr[f] != null && String(rr[f]).trim()) {
        groups[f] = String(rr[f]).trim();
      }
    }
    for (const [k, v] of Object.entries(groups)) {
      if (!fieldValueCounts.has(k)) fieldValueCounts.set(k, new Map());
      const m = fieldValueCounts.get(k)!;
      m.set(v, (m.get(v) || 0) + 1);
    }
    const ans = answersByResponse.get(rid) || { answers: {}, numeric: {} };
    rows.push({
      responseId: rid,
      groups,
      answers: ans.answers,
      numericAnswers: ans.numeric,
    });
  }

  // Derive grouping fields from data that actually have ≥2 populated levels
  const groupingFields: string[] = [];
  for (const [field, counts] of fieldValueCounts.entries()) {
    const levels = [...counts.entries()].filter(([, n]) => n >= thresholds.minCellSize);
    if (levels.length >= 2) groupingFields.push(field);
  }
  groupingFields.sort((a, b) => {
    const ca = fieldValueCounts.get(a)?.size || 0;
    const cb = fieldValueCounts.get(b)?.size || 0;
    return cb - ca;
  });
  const usedFields = groupingFields.slice(0, thresholds.maxGroupingFields);

  if (!usedFields.length || !outcomes.length) {
    return empty(
      !outcomes.length
        ? 'No categorical/rating outcome questions found to contrast.'
        : 'No demographic/segmentation fields with enough filled cells to compare subgroups.',
      true
    );
  }

  type RawContrast = Omit<ComputedContrast, 'pCorrected' | 'publishable' | 'flag' | 'uncertaintyNote' | 'testedContrasts'>;
  const scanned: RawContrast[] = [];

  for (const outcome of outcomes) {
    if (scanned.length >= thresholds.maxScannedContrasts) break;

    for (const field of usedFields) {
      if (scanned.length >= thresholds.maxScannedContrasts) break;

      const levelCounts = new Map<string, number>();
      for (const row of rows) {
        const g = row.groups[field];
        if (!g) continue;
        if (outcome.kind === 'proportion' && !row.answers[outcome.id]) continue;
        if (outcome.kind === 'mean' && row.numericAnswers[outcome.id] === undefined) continue;
        levelCounts.set(g, (levelCounts.get(g) || 0) + 1);
      }
      const levels = [...levelCounts.entries()]
        .filter(([, n]) => n >= thresholds.minCellSize)
        .sort((a, b) => b[1] - a[1])
        .slice(0, thresholds.maxGroupLevels)
        .map(([v]) => v);
      if (levels.length < 2) continue;

      if (outcome.kind === 'proportion') {
        const catCounts = new Map<string, number>();
        for (const row of rows) {
          const v = row.answers[outcome.id];
          if (!v) continue;
          // For multi-select joined strings, also count individual tokens
          const parts = v.includes(' | ') ? v.split(' | ').map((s) => s.trim()) : [v];
          for (const part of parts) {
            if (!part) continue;
            catCounts.set(part, (catCounts.get(part) || 0) + 1);
          }
        }
        const categories = [...catCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, thresholds.maxOutcomeCategories)
          .map(([v]) => v);

        for (const category of categories) {
          for (let i = 0; i < levels.length; i++) {
            for (let j = i + 1; j < levels.length; j++) {
              if (scanned.length >= thresholds.maxScannedContrasts) break;
              const groupA = levels[i];
              const groupB = levels[j];
              let nA = 0;
              let nB = 0;
              let sA = 0;
              let sB = 0;
              for (const row of rows) {
                const g = row.groups[field];
                const ans = row.answers[outcome.id];
                if (!g || !ans) continue;
                const hit = ans === category || ans.split(' | ').map((s) => s.trim()).includes(category);
                if (g === groupA) {
                  nA += 1;
                  if (hit) sA += 1;
                } else if (g === groupB) {
                  nB += 1;
                  if (hit) sB += 1;
                }
              }
              if (nA < thresholds.minCellSize || nB < thresholds.minCellSize) continue;
              const test = twoProportionZTest(sA, nA, sB, nB);
              scanned.push({
                id: `c${scanned.length + 1}`,
                outcomeQuestionId: outcome.id,
                outcomePrompt: outcome.prompt,
                outcomeValue: category,
                groupingField: field,
                groupA,
                groupB,
                kind: 'proportion',
                nA,
                nB,
                estimateA: test.pA,
                estimateB: test.pB,
                absoluteEffect: test.absoluteEffect,
                relativeEffect: test.relativeEffect,
                pValue: test.pValue,
              });
            }
          }
        }
      } else {
        // mean contrasts between group pairs
        let globalMin = Infinity;
        let globalMax = -Infinity;
        for (const row of rows) {
          const v = row.numericAnswers[outcome.id];
          if (v === undefined) continue;
          globalMin = Math.min(globalMin, v);
          globalMax = Math.max(globalMax, v);
        }
        const range = Number.isFinite(globalMax - globalMin) && globalMax > globalMin ? globalMax - globalMin : 1;

        for (let i = 0; i < levels.length; i++) {
          for (let j = i + 1; j < levels.length; j++) {
            if (scanned.length >= thresholds.maxScannedContrasts) break;
            const groupA = levels[i];
            const groupB = levels[j];
            const valuesA: number[] = [];
            const valuesB: number[] = [];
            for (const row of rows) {
              const g = row.groups[field];
              const v = row.numericAnswers[outcome.id];
              if (!g || v === undefined) continue;
              if (g === groupA) valuesA.push(v);
              else if (g === groupB) valuesB.push(v);
            }
            if (valuesA.length < thresholds.minCellSize || valuesB.length < thresholds.minCellSize) continue;
            const test = welchTTest(valuesA, valuesB);
            // Scale absolute effect to [0,1]-ish fraction of observed range for gating
            const scaledEffect = test.absoluteEffect / range;
            scanned.push({
              id: `c${scanned.length + 1}`,
              outcomeQuestionId: outcome.id,
              outcomePrompt: outcome.prompt,
              outcomeValue: null,
              groupingField: field,
              groupA,
              groupB,
              kind: 'mean',
              nA: valuesA.length,
              nB: valuesB.length,
              estimateA: test.meanA,
              estimateB: test.meanB,
              absoluteEffect: scaledEffect,
              relativeEffect: test.relativeEffect,
              pValue: test.pValue,
            });
          }
        }
      }
    }
  }

  const contrastsScanned = scanned.length;
  if (!contrastsScanned) {
    return empty(
      `${totalResponses} responses loaded, but no subgroup contrasts met the minimum cell size (${thresholds.minCellSize}) to even test.`,
      true
    );
  }

  const corrected =
    contrastsScanned > thresholds.multipleComparisonThreshold
      ? benjaminiHochberg(scanned.map((c) => c.pValue))
      : scanned.map((c) => c.pValue);

  const publishable: ComputedContrast[] = [];
  const directionalOnly: ComputedContrast[] = [];

  scanned.forEach((c, idx) => {
    const pCorrected = corrected[idx];
    const passes = contrastPassesPublishGate(c, pCorrected, thresholds);
    const full: ComputedContrast = {
      ...c,
      pCorrected,
      publishable: passes,
      flag: passes ? 'publishable' : 'directional_only',
      testedContrasts: contrastsScanned,
      uncertaintyNote: uncertaintyNote({
        nA: c.nA,
        nB: c.nB,
        pCorrected,
        absoluteEffect: c.absoluteEffect,
        publishable: passes,
        testedContrasts: contrastsScanned,
      }),
    };
    if (passes) publishable.push(full);
    else directionalOnly.push(full);
  });

  publishable.sort((a, b) => b.absoluteEffect - a.absoluteEffect || a.pCorrected - b.pCorrected);
  directionalOnly.sort((a, b) => a.pCorrected - b.pCorrected);

  return {
    surveyId: params.surveyId,
    totalResponses,
    thresholds,
    groupingFieldsUsed: usedFields,
    outcomeQuestionsScanned: outcomes.length,
    contrastsScanned,
    publishable,
    directionalOnly,
    insufficientData: publishable.length === 0,
    insufficientDataMessage:
      publishable.length === 0
        ? `${totalResponses} responses; scanned ${contrastsScanned} subgroup contrasts — none cleared the gate (min cell ${thresholds.minCellSize}, p<${thresholds.alpha} after correction, |effect|≥${thresholds.minAbsoluteEffect}). Increase sample size or simplify the claim.`
        : null,
  };
}
