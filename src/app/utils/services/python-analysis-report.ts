/**
 * Packaged python-analysis run → Report sections + metadata.
 * Shared contract for client packaging and reports/preview|save.
 *
 * Safe for client bundles (no DB / AI imports). Significance floors mirror
 * POSTABLE_INSIGHT_THRESHOLDS defaults (80 / 25) — do not invent new engines.
 */

import type { ReportSection } from '@/app/utils/services/report-storage-service';

/** Mirrors POSTABLE_INSIGHT_THRESHOLDS defaults — keep in sync. */
export const REPORT_SIGNIFICANCE_FLOORS = {
  minTotalResponses: 80,
  minCellSize: 25,
  alpha: 0.05,
  minAbsoluteEffect: 0.12,
} as const;

/** Same caveat as autotrigger-outputs SMALL_SAMPLE_DISCLAIMER. */
export const REPORT_SMALL_SAMPLE_DISCLAIMER =
  'Small-sample caveat: this finding is based on a limited number of responses and may not generalize. Treat it as directional, not definitive.';

export type PackagedReportFigure = {
  stepId: string;
  dataUrl: string;
  label?: string;
};

export type PackagedReportMap = {
  id: string;
  /** Data URL or serialized map snapshot — filled in Phase 4 */
  dataUrl?: string;
  label?: string;
};

export type PackagedAnalysisReport = {
  title: string;
  query: string;
  reportType: 'demographic' | 'thematic' | 'comparative' | 'longitudinal' | 'comprehensive';
  surveyId?: number;
  cohortId?: number;
  complexity?: number;
  sections: ReportSection[];
  metadata: {
    source: 'python-analysis';
    sessionId: string;
    dataset?: {
      name?: string;
      rows?: number;
      columns?: string[];
      columnTypes?: Record<string, string>;
    };
    figures: PackagedReportFigure[];
    maps: PackagedReportMap[];
    insights: string[];
    /** Postable-insight floors — must travel with every saved report */
    significance: {
      minTotalResponses: number;
      minCellSize: number;
      alpha: number;
      minAbsoluteEffect: number;
      smallSampleDisclaimer: string;
    };
    processingTimeMs?: number;
    stepsExecuted?: number;
    generatedAt: string;
    tokenUsage?: number;
  };
};

export type AgentRunSnapshot = {
  sessionId: string;
  question: string;
  keyFindings: string[];
  executedSteps: Array<{
    id: string;
    description?: string;
    output?: string;
    success: boolean;
    insights?: string[];
    plots?: string[];
    execution_time_ms?: number;
  }>;
  dataset?: {
    name?: string;
    rows?: number;
    columns?: string[];
    columnTypes?: Record<string, string>;
  };
  startTimeMs?: number;
  surveyId?: number;
  maps?: PackagedReportMap[];
};

function estimateTokens(sections: ReportSection[]): number {
  return sections.reduce((total, s) => total + Math.ceil((s.content || '').length / 4), 0);
}

/**
 * Build a ReportSection[] + metadata package from a completed python-analysis run.
 */
export function packagePythonAnalysisRun(
  run: AgentRunSnapshot
): PackagedAnalysisReport {
  const floors = REPORT_SIGNIFICANCE_FLOORS;
  const synthesisFinding = run.keyFindings.find((f) =>
    f.startsWith('FINAL SYNTHESIS:')
  );
  const insights = run.keyFindings.filter((f) => !f.startsWith('FINAL SYNTHESIS:'));
  const synthesisText = synthesisFinding
    ? synthesisFinding.replace(/^FINAL SYNTHESIS:\s*/, '')
    : insights.slice(0, 5).join('\n\n') ||
      'Analysis completed. See step outputs and figures below.';

  const figures: PackagedReportFigure[] = [];
  for (const step of run.executedSteps) {
    const plots = step.plots || [];
    plots.forEach((dataUrl, i) => {
      if (!dataUrl) return;
      figures.push({
        stepId: step.id,
        dataUrl,
        label: step.description
          ? `${step.description}${plots.length > 1 ? ` (${i + 1})` : ''}`
          : `Figure ${figures.length + 1}`,
      });
    });
  }

  const sections: ReportSection[] = [];
  let order = 0;

  sections.push({
    type: 'executive_summary',
    title: 'Executive Summary',
    content: synthesisText,
    orderIndex: order++,
  });

  if (insights.length) {
    sections.push({
      type: 'insights',
      title: 'Key Insights',
      content: [
        ...insights.map((ins, i) => `${i + 1}. ${ins}`),
        '',
        `---`,
        `Significance discipline: cell sizes below ${floors.minCellSize} or total N below ${floors.minTotalResponses} are not publishable claims.`,
        REPORT_SMALL_SAMPLE_DISCLAIMER,
      ].join('\n'),
      orderIndex: order++,
    });
  }

  const successfulSteps = run.executedSteps.filter(
    (s) => s.success && (s.output || '').trim()
  );
  if (successfulSteps.length) {
    const stepMarkdown = successfulSteps
      .map((s, i) => {
        const body = (s.output || '').trim().slice(0, 4000);
        return `### Step ${i + 1}: ${s.description || s.id}\n\n\`\`\`\n${body}\n\`\`\``;
      })
      .join('\n\n');
    sections.push({
      type: 'statistical_analysis',
      title: 'Analysis Steps (Python)',
      content: stepMarkdown,
      orderIndex: order++,
    });
  }

  if (figures.length) {
    const figLines = figures
      .map((f, i) => `![${f.label || `Figure ${i + 1}`}](${f.dataUrl})`)
      .join('\n\n');
    sections.push({
      type: 'visualization',
      title: 'Figures',
      content: figLines,
      chartSpecs: { figures, source: 'python-analysis' },
      orderIndex: order++,
    });
  }

  const maps = run.maps || [];
  if (maps.length) {
    sections.push({
      type: 'visualization',
      title: 'Maps',
      content: maps
        .map((m) =>
          m.dataUrl
            ? `![${m.label || m.id}](${m.dataUrl})`
            : `*Map ${m.label || m.id} (snapshot pending)*`
        )
        .join('\n\n'),
      chartSpecs: { maps, source: 'python-analysis-maps' },
      orderIndex: order++,
    });
  }

  sections.push({
    type: 'methodology',
    title: 'Methodology',
    content: [
      'This report is the saved output of a **python-analysis** run:',
      '1. The agent planned analysis steps from the research question.',
      '2. Python executed on the uploaded dataset in-browser (Pyodide).',
      '3. Figures and insights were extracted from successful steps.',
      '4. A final synthesis was produced from gated findings.',
      '',
      `Question: ${run.question}`,
      run.dataset?.name ? `Dataset: ${run.dataset.name}` : null,
      run.dataset?.rows != null ? `Rows: ${run.dataset.rows}` : null,
      run.dataset?.columns?.length
        ? `Columns: ${run.dataset.columns.join(', ')}`
        : null,
      '',
      `Significance floors (postable-insight): total N ≥ ${floors.minTotalResponses}, cell N ≥ ${floors.minCellSize}.`,
      REPORT_SMALL_SAMPLE_DISCLAIMER,
    ]
      .filter(Boolean)
      .join('\n'),
    orderIndex: order++,
  });

  const queryPreview =
    run.question.slice(0, 50) + (run.question.length > 50 ? '...' : '');
  const title = `Python Analysis: ${queryPreview}`;
  const tokenUsage = estimateTokens(sections);
  const processingTimeMs =
    run.startTimeMs != null ? Math.max(0, Date.now() - run.startTimeMs) : undefined;

  return {
    title,
    query: run.question,
    reportType: 'comprehensive',
    surveyId: run.surveyId,
    complexity: 0.5,
    sections,
    metadata: {
      source: 'python-analysis',
      sessionId: run.sessionId,
      dataset: run.dataset,
      figures,
      maps,
      insights,
      significance: {
        minTotalResponses: floors.minTotalResponses,
        minCellSize: floors.minCellSize,
        alpha: floors.alpha,
        minAbsoluteEffect: floors.minAbsoluteEffect,
        smallSampleDisclaimer: REPORT_SMALL_SAMPLE_DISCLAIMER,
      },
      processingTimeMs,
      stepsExecuted: run.executedSteps.length,
      generatedAt: new Date().toISOString(),
      tokenUsage,
    },
  };
}

/** Validate a packaged report payload from the client. */
export function assertPackagedAnalysisReport(
  body: unknown
): PackagedAnalysisReport {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid packaged report payload');
  }
  const p = body as PackagedAnalysisReport;
  if (!p.query || typeof p.query !== 'string') {
    throw new Error('Missing query');
  }
  if (!p.reportType) {
    throw new Error('Missing reportType');
  }
  if (!Array.isArray(p.sections) || p.sections.length === 0) {
    throw new Error('Missing sections');
  }
  if (!p.metadata || p.metadata.source !== 'python-analysis') {
    throw new Error('metadata.source must be python-analysis');
  }
  if (!p.metadata.significance) {
    throw new Error('metadata.significance is required');
  }
  // Enforce floors are present and not weaker than platform defaults
  const sig = p.metadata.significance;
  if (
    Number(sig.minTotalResponses) < REPORT_SIGNIFICANCE_FLOORS.minTotalResponses ||
    Number(sig.minCellSize) < REPORT_SIGNIFICANCE_FLOORS.minCellSize
  ) {
    throw new Error('significance floors weaker than platform defaults (80/25)');
  }
  return {
    ...p,
    title:
      p.title ||
      `Python Analysis: ${p.query.slice(0, 50)}${p.query.length > 50 ? '...' : ''}`,
    sections: p.sections.map((s, i) => ({
      ...s,
      orderIndex: typeof s.orderIndex === 'number' ? s.orderIndex : i,
    })),
  };
}
