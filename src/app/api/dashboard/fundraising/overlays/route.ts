import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user';
import { getConnection } from '@/app/utils/database/db'

export const runtime = 'nodejs'

async function getPrimaryOrgId(db: any, userId: string): Promise<number | null> {
  const [orgRows]: any = await db.execute(
    `SELECT o.id
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [userId]
  )
  return orgRows?.[0]?.id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);

    const body = await request.json()
    const {
      reportId,
      enabledMetrics,
      status = 'enabled',
    } = body as {
      reportId?: string | null
      enabledMetrics?: any
      status?: 'enabled' | 'disabled'
    }

    const db = await getConnection()
    const orgId = await getPrimaryOrgId(db, userId)
    if (!orgId) return NextResponse.json({ status: false, message: 'No organization found' }, { status: 400 })

    const metricsJson = enabledMetrics ? JSON.stringify(enabledMetrics) : null
    const overlayType = 'fundraising_report'

    // Upsert per org + reportId (null reportId not supported for upsert; treat as insert)
    if (!reportId) {
      await db.execute(
        `INSERT INTO dashboard_map_overlays (organization_id, overlay_type, report_id, enabled_metrics, status)
         VALUES (?, ?, NULL, ?, ?)`,
        [orgId, overlayType, metricsJson, status]
      )
      return NextResponse.json({ status: true })
    }

    // If overlay exists for this report, update; else insert
    const [existing]: any = await db.execute(
      `SELECT id FROM dashboard_map_overlays WHERE organization_id = ? AND overlay_type = ? AND report_id = ? LIMIT 1`,
      [orgId, overlayType, reportId]
    )

    if (existing?.[0]?.id) {
      await db.execute(
        `UPDATE dashboard_map_overlays
           SET enabled_metrics = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [metricsJson, status, existing[0].id]
      )
    } else {
      await db.execute(
        `INSERT INTO dashboard_map_overlays (organization_id, overlay_type, report_id, enabled_metrics, status)
         VALUES (?, ?, ?, ?, ?)`,
        [orgId, overlayType, reportId, metricsJson, status]
      )
    }

    return NextResponse.json({ status: true })
  } catch (e) {
    console.error('dashboard fundraising overlays POST error:', e)
    return NextResponse.json({ status: false, message: 'Failed' }, { status: 500 })
  }
}

