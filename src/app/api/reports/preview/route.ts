/**
 * POST /api/reports/preview — preview a packaged python-analysis run.
 * No stubbed ReportGenerationService analysis — returns the client package as-is.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { assertPackagedAnalysisReport } from '@/app/utils/services/python-analysis-report';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;

    const body = await req.json();

    if (body?.metadata?.source === 'python-analysis' || body?.packaged) {
      const packaged = assertPackagedAnalysisReport(body.packaged || body);
      return NextResponse.json({
        success: true,
        preview: {
          title: packaged.title,
          sections: packaged.sections,
          metadata: packaged.metadata,
        },
      });
    }

    // Legacy: accept already-built sections for preview without regenerating
    const { title, query, reportType, sections, metadata } = body || {};
    if (sections && Array.isArray(sections) && sections.length > 0) {
      return NextResponse.json({
        success: true,
        preview: {
          title:
            title ||
            `Report: ${String(query || '').slice(0, 50)}`,
          sections,
          metadata: metadata || { source: 'client-sections' },
        },
      });
    }

    return NextResponse.json(
      {
        error:
          'Preview requires a packaged python-analysis run (metadata.source=python-analysis) or prebuilt sections. Server-side stubbed analysis has been retired.',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('❌ Report preview failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
