/**
 * POST /api/reports/save — persist a packaged python-analysis run.
 * Does not call stubbed ReportGenerationService analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ReportStorageService } from '@/app/utils/services/report-storage-service';
import { assertPackagedAnalysisReport } from '@/app/utils/services/python-analysis-report';

export async function POST(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = auth;

    const body = await req.json();

    // Preferred path: packaged python-analysis run
    if (body?.metadata?.source === 'python-analysis' || body?.packaged) {
      const packaged = assertPackagedAnalysisReport(body.packaged || body);
      const storage = new ReportStorageService();
      const reportId = await storage.persistPackagedReport(userId, packaged);
      return NextResponse.json({ success: true, reportId, source: 'python-analysis' });
    }

    // Legacy shape: { query, reportType, sections, metadata } without generation
    const { surveyId, cohortId, query, reportType, complexity, sections, metadata, title } =
      body || {};
    if (!query || !reportType || !sections || !metadata) {
      return NextResponse.json(
        {
          error:
            'Missing required fields. Send a packaged python-analysis run (metadata.source=python-analysis) or query/reportType/sections/metadata.',
        },
        { status: 400 }
      );
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ error: 'sections must be a non-empty array' }, { status: 400 });
    }

    const storage = new ReportStorageService();
    const reportId = await storage.persistPackagedReport(userId, {
      title:
        title ||
        `Report: ${String(query).slice(0, 50)}${String(query).length > 50 ? '...' : ''}`,
      query,
      reportType,
      surveyId,
      cohortId,
      complexity,
      sections,
      metadata: { ...metadata, source: metadata.source || 'client-sections' },
    });

    return NextResponse.json({ success: true, reportId });
  } catch (error) {
    console.error('❌ Report save failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
