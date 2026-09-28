import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import {
  getAdminContentSheet,
  upsertContentSheet,
} from '@/app/utils/services/content-cms-service';
import { coercePricingSheet } from '@/app/utils/database/content-sheet-repo';

type Ctx = { params: Promise<{ key: string }> };

/**
 * GET /api/admin/content-sheets/[key]
 * PUT /api/admin/content-sheets/[key]
 */
export async function GET(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { key } = await context.params;
    const sheet = await getAdminContentSheet(key);
    if (!sheet) {
      return NextResponse.json(
        { status: false, message: 'Not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'content_sheet.get',
      targetType: 'content_sheet',
      targetId: key,
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      sheet: {
        ...sheet,
        content:
          key === 'pricing' ? coercePricingSheet(sheet.content) : sheet.content,
      },
    });
  } catch (error) {
    console.error('[admin/content-sheets GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { key } = await context.params;
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || key);
    const content = body.content ?? body;

    const sheet = await upsertContentSheet({
      sheetKey: key,
      title,
      content: key === 'pricing' ? coercePricingSheet(content) : content,
      updatedBy: gate.numericUserId,
    });

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'content_sheet.upsert',
      targetType: 'content_sheet',
      targetId: key,
      metadata: { title: sheet.title },
      ip: clientIp(req),
    });

    return NextResponse.json({
      status: true,
      sheet: {
        ...sheet,
        content:
          key === 'pricing' ? coercePricingSheet(sheet.content) : sheet.content,
      },
    });
  } catch (error) {
    console.error('[admin/content-sheets PUT]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
