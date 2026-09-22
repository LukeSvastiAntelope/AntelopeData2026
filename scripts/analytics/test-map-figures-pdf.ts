/**
 * Analytics C4 — combined PDF figure ordering: narrative charts then maps.
 * Run: npx tsx scripts/analytics/test-map-figures-pdf.ts
 */
import assert from 'node:assert/strict';
import {
  figuresToPackagedMaps,
} from '../../src/app/(secure)/python-analysis/utils/capture-map';
import type { ExportableFigure } from '../../src/app/(secure)/python-analysis/utils/export-pdf';
import { packagePythonAnalysisRun } from '../../src/app/utils/services/python-analysis-report';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const charts: ExportableFigure[] = [
  { pngBase64: tinyPng, label: 'Support by party', kind: 'chart' },
];
const maps: ExportableFigure[] = [
  { pngBase64: tinyPng, label: 'Survey geography map', kind: 'map' },
];

const ordered = [
  ...charts.map((f, i) => ({ ...f, label: f.label || `Chart ${i + 1}` })),
  ...maps.map((f, i) => ({ ...f, label: f.label || `Map ${i + 1}` })),
];
assert.equal(ordered[0].kind, 'chart');
assert.equal(ordered[1].kind, 'map');
assert.ok(ordered[1].label?.toLowerCase().includes('map'));

const packagedMaps = figuresToPackagedMaps([...charts, ...maps]);
assert.equal(packagedMaps.length, 1);
assert.equal(packagedMaps[0].label, 'Survey geography map');
assert.ok(packagedMaps[0].dataUrl.startsWith('data:image/png'));

const report = packagePythonAnalysisRun({
  sessionId: 'test-session',
  question: 'Where are supporters concentrated?',
  keyFindings: [
    'FINAL SYNTHESIS: Supporters cluster in the northern ZIPs.',
    'N=120 meets floor',
  ],
  executedSteps: [
    {
      id: 'step-1',
      description: 'Party crosstab',
      output: 'Dem 72%',
      success: true,
      insights: ['Democrats higher'],
      plots: [tinyPng],
    },
  ],
  maps: packagedMaps,
  dataset: { name: 'pulse.csv', rows: 120, columns: ['party', 'zip'] },
});

assert.equal(report.metadata.source, 'python-analysis');
assert.equal(report.metadata.maps.length, 1);
assert.ok(report.metadata.maps[0].dataUrl);
assert.ok(
  report.sections.some((s) => s.title === 'Maps'),
  'Maps section in packaged report'
);
assert.ok(
  report.sections.some((s) => s.title === 'Figures'),
  'Figures section present'
);
assert.equal(report.metadata.significance.minTotalResponses, 80);
assert.equal(report.metadata.significance.minCellSize, 25);
assert.ok(
  report.metadata.significance.smallSampleDisclaimer.includes('limited number')
);

console.log('OK: Analytics C4 map figures → packaged report + PDF ordering');
