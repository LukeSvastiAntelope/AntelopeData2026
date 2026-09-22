/**
 * Analytics C3 — named frames + prompt block for multi-dataset tray.
 * Run: npx tsx scripts/analytics/test-multi-dataset-frames.ts
 */
import assert from 'node:assert/strict';
import {
  suggestFrameName,
  formatLoadedFramesForPrompt,
  type AnalysisFrame,
} from '../../src/app/(secure)/python-analysis/utils/named-datasets';
import type { Dataset } from '../../src/app/(secure)/python-analysis/hooks/useAnalysisContext';

const ds = (name: string, cols: string[]): Dataset => ({
  name,
  data: [
    cols.map((_, i) => String(i + 1)),
    cols.map((_, i) => String(i + 10)),
  ],
  columns: cols,
  shape: [2, cols.length],
  dtypes: Object.fromEntries(cols.map((c) => [c, 'object'])),
  sampleData: [
    Object.fromEntries(cols.map((c, i) => [c, String(i + 1)])),
    Object.fromEntries(cols.map((c, i) => [c, String(i + 10)])),
  ],
});

assert.equal(suggestFrameName('survey'), 'df_survey');
assert.equal(suggestFrameName('voter', { listId: 9 }), 'df_voter_9');
assert.equal(suggestFrameName('prior_survey', { surveyId: 44 }), 'df_prior_44');
assert.equal(
  suggestFrameName('upload', { existingNames: ['df_upload'] }),
  'df_upload_2'
);

const frames: AnalysisFrame[] = [
  {
    id: 'survey-1',
    kind: 'survey',
    label: 'Pulse',
    frameName: 'df_survey',
    dataset: ds('pulse.csv', ['party', 'support']),
    surveyId: 1,
    isPrimary: true,
  },
  {
    id: 'voter-3',
    kind: 'voter',
    label: 'NJ contacts',
    frameName: 'df_voter_3',
    dataset: ds('voters.csv', ['zip', 'party', 'age']),
    listId: 3,
    isPrimary: false,
  },
];

const prompt = formatLoadedFramesForPrompt(frames);
assert.ok(prompt.includes('df_survey'));
assert.ok(prompt.includes('df_voter_3'));
assert.ok(prompt.includes('PRIMARY'));
assert.ok(prompt.includes('Join/compare'));
assert.ok(prompt.includes('party'));

console.log('OK: Analytics C3 multi-dataset named frames');
