import { NextRequest, NextResponse } from 'next/server';
import { SurveyAutotriggerRepo } from '@/app/utils/database/survey-autotrigger-repo';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

/**
 * GET /api/autotriggers — org-scoped survey auto-triggers for agent-map automations.
 * Optional: also returns dashboard scraper automations so all automations live in one place.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const db = await openSql();
    const [orgRows] = await db.execute<RowDataPacket[]>(
      `SELECT organization_id FROM organization_members
       WHERE user_id = ? AND status = 'active'
       ORDER BY FIELD(role, 'owner', 'admin', 'analyst', 'viewer'), organization_id ASC
       LIMIT 1`,
      [Number(userId)]
    );
    const orgId = orgRows[0]?.organization_id != null ? Number(orgRows[0].organization_id) : null;

    const surveyTriggers = orgId
      ? await SurveyAutotriggerRepo.listForOrganization(orgId)
      : [];

    const [scraperRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, type, name, config, enabled, last_run_at, created_at, updated_at
       FROM dashboard_automations
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [Number(userId)]
    );
    const scrapers = (scraperRows || []).map((r) => ({
      id: Number(r.id),
      type: String(r.type),
      name: String(r.name),
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config || {},
      enabled: Boolean(r.enabled),
      lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
      kind: 'scraper' as const,
    }));

    return NextResponse.json({
      status: true,
      organizationId: orgId,
      surveyAutotriggers: surveyTriggers.map((t) => ({
        ...t,
        kind: 'survey_autotrigger' as const,
      })),
      scrapers,
    });
  } catch (error) {
    console.error('[autotriggers GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
