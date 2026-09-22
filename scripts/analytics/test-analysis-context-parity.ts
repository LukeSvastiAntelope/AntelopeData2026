/**
 * Analytics C2 — prompt assembly: history + rich bundle + raw grain.
 * Run: npx tsx scripts/analytics/test-analysis-context-parity.ts
 */
import assert from 'node:assert/strict';
import {
  formatDatasetGrainForPrompt,
  normalizeRowsToObjects,
} from '../../src/app/utils/services/dataset-grain';

function buildPlanSystemPrompt(opts: {
  question: string;
  analyticsContextPrompt?: string;
  analysisHistory?: Array<{ question?: string; code?: string; output?: string }>;
  datasetInfo: {
    columns: string[];
    types: Record<string, string>;
    sample_data: any[];
    row_count: number;
  };
}): string {
  const grainBlock = formatDatasetGrainForPrompt({
    columns: opts.datasetInfo.columns,
    types: opts.datasetInfo.types,
    sample_data: opts.datasetInfo.sample_data,
    row_count: opts.datasetInfo.row_count,
  });
  const richBundle = opts.analyticsContextPrompt?.trim()
    ? `\n\nCAMPAIGN / SURVEY CONTEXT (from buildAnalyticsContext):\n${opts.analyticsContextPrompt}`
    : '';
  const historyExtra =
    opts.analysisHistory && opts.analysisHistory.length > 0
      ? `\n\nPRIOR ANALYSIS HISTORY (continuity across turns):\n${opts.analysisHistory
          .map((h, i) => `${i + 1}. Q: ${h.question}\nCode: ${h.code}\nResult: ${h.output}`)
          .join('\n\n')}`
      : '';
  return `Question: ${opts.question}${richBundle}${historyExtra}\n\n${grainBlock}`;
}

const columns = ['age', 'party', 'q_support', 'zip'];
const types = {
  age: 'int64',
  party: 'object',
  q_support: 'int64',
  zip: 'object',
};
const arrayRows = [
  [34, 'Democrat', 1, '07001'],
  [52, 'Republican', 0, '07002'],
  [41, 'Independent', 1, '07003'],
  [29, 'Democrat', 1, '07001'],
  [60, 'Republican', 0, '07004'],
  [45, 'Democrat', 0, '07002'],
  [38, 'Independent', 1, '07005'],
  [55, 'Republican', 1, '07001'],
  [33, 'Democrat', 0, '07003'],
  [48, 'Independent', 1, '07004'],
  [27, 'Democrat', 1, '07002'],
  [61, 'Republican', 0, '07005'],
  [36, 'Democrat', 1, '07001'],
  [44, 'Independent', 0, '07003'],
  [50, 'Republican', 1, '07004'],
  [39, 'Democrat', 1, '07002'],
];

// --- normalize array rows ---
const objs = normalizeRowsToObjects(columns, arrayRows.slice(0, 3));
assert.equal(objs[0].age, 34);
assert.equal(objs[1].party, 'Republican');

const richBundle = [
  '### Campaign / organization',
  '- Name: Demo Campaign',
  '- Candidate: Jane Doe',
  '- Office: US House',
  '- State: NJ',
  '- District: NJ-07',
  '',
  '### District profile',
  'Suburban swing district; college-educated share above state average.',
  '',
  '### Voter-file / contact-list summary',
  '42k contacts; 58% likely voters; top ZIPs 07001–07005.',
  '',
  '### Prior surveys (same campaign/creator)',
  '- #101 | Baseline favorability | closed | 812 responses',
  '',
  '### Current survey intent',
  '- Title: Post-primary pulse',
  'Questions:',
  '1. (single) Party ID',
  '2. (single) Support for the candidate',
  '3. (number) Age',
].join('\n');

const history = [
  {
    question: 'What share support the candidate by party?',
    code: "print(pd.crosstab(df['party'], df['q_support'], normalize='index'))",
    output: 'FINAL SYNTHESIS: Democrats support at 72%; Republicans at 31%.',
  },
];

const prompt = buildPlanSystemPrompt({
  question: 'Is age associated with support after controlling for party?',
  analyticsContextPrompt: richBundle,
  analysisHistory: history,
  datasetInfo: {
    columns,
    types,
    sample_data: arrayRows,
    row_count: 1842,
  },
});

assert.ok(prompt.includes('CAMPAIGN / SURVEY CONTEXT'), 'rich bundle section');
assert.ok(prompt.includes('Post-primary pulse'), 'survey intent');
assert.ok(prompt.includes('NJ-07'), 'district');
assert.ok(prompt.includes('42k contacts'), 'voter-file summary');
assert.ok(prompt.includes('PRIOR ANALYSIS HISTORY'), 'history section');
assert.ok(prompt.includes('FINAL SYNTHESIS'), 'prior synthesis continuity');
assert.ok(prompt.includes('Dataset grain'), 'grain section');
assert.ok(prompt.includes('1842 rows'), 'true row count');
assert.ok(prompt.includes('"age": 34'), 'real head values');
assert.ok(prompt.includes('age: int64'), 'dtypes');
assert.ok(prompt.includes('unique_in_head'), 'column stats');
assert.ok(prompt.includes('request more grain'), 'can request more');

// Bare schema regression: prompt must not be only column names without head
assert.ok(!/^Question:.*\ncolumns:/s.test(prompt));
assert.ok(prompt.includes('Dataframe head'));

console.log('OK: Analytics C2 prompt assembly (history + rich bundle + raw grain)');
