/**
 * H4 content-quality gate: publishable requires n floors + corrected p < alpha.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics/test-h4-content-gate.ts
 */

import { POSTABLE_INSIGHT_THRESHOLDS } from '../../src/app/utils/services/postable-insight-service';
import {
  inferPublishableFlag,
  resolveFindingStats,
} from '../../src/app/utils/services/analysis-content-service';
import {
  extractFindingStats,
  extractPValueFromText,
} from '../../src/app/utils/analysis/extract-finding-stats';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  const t = POSTABLE_INSIGHT_THRESHOLDS;

  // Keyword-only synthesis must NOT become publishable
  assert(
    inferPublishableFlag({
      sampleN: 200,
      pCorrected: null,
      testName: null,
    }) === 'directional_only',
    'missing p → directional'
  );
  assert(
    inferPublishableFlag({
      sampleN: 200,
      pCorrected: 0.01,
      testName: null,
    }) === 'directional_only',
    'missing test → directional'
  );
  assert(
    inferPublishableFlag({
      sampleN: t.minTotalResponses - 1,
      pCorrected: 0.01,
      testName: 'chi-square',
    }) === 'directional_only',
    'thin n → directional'
  );
  assert(
    inferPublishableFlag({
      sampleN: 200,
      pCorrected: t.alpha,
      testName: 'chi-square',
    }) === 'directional_only',
    'p == alpha → directional'
  );
  assert(
    inferPublishableFlag({
      sampleN: 200,
      pCorrected: 0.01,
      testName: 'chi-square',
    }) === 'publishable',
    'healthy n + p + test → publishable'
  );

  // Extractor
  assert(extractPValueFromText('p = 0.03') === 0.03, 'parse p=0.03');
  assert(
    extractFindingStats('Using a chi-square test, p-value = 0.004').testName ===
      'chi-square',
    'parse chi-square'
  );

  // BH across multiple figure p-values
  const multi = resolveFindingStats({
    synthesis: 'Finding with tests',
    figures: [
      { pValue: 0.04, testName: 't-test', caption: 'A' },
      { pValue: 0.03, testName: 't-test', caption: 'B' },
    ],
    pValue: null,
    testName: null,
  });
  assert(multi.pCorrected != null && multi.pCorrected >= 0.03, 'BH raises p');
  assert(multi.testName === 't-test', 'test name from figures');

  console.log('PASS: H4 content-quality gate');
}

main();
