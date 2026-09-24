import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { PayrollRepo } from '@/app/utils/database/payroll-repo';

export const runtime = 'nodejs';

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** GET /api/dashboard/payroll?from=&to=&export=csv */
export async function GET(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);
    const orgId = await ensurePrimaryOrgId(userId);

    const sp = request.nextUrl.searchParams;
    const defaults = defaultRange();
    const from = (sp.get('from') || defaults.from).slice(0, 10);
    const to = (sp.get('to') || defaults.to).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { status: false, message: 'from/to must be YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (from > to) {
      return NextResponse.json(
        { status: false, message: 'from must be ≤ to' },
        { status: 400 }
      );
    }

    const rows = await PayrollRepo.recomputeRange({
      organizationId: orgId,
      fromDate: from,
      toDate: to,
    });
    const members = await PayrollRepo.listPaidFlags(orgId);

    // Optional prune of raw crumbs older than 90d (best-effort, non-blocking)
    void PayrollRepo.pruneBreadcrumbs(orgId, 90).catch(() => undefined);

    if (sp.get('export') === 'csv') {
      const header = [
        'work_date',
        'canvasser_user_id',
        'canvasser_name',
        'canvasser_email',
        'is_paid',
        'miles',
        'hours',
        'doors',
        'breadcrumb_count',
        'first_at',
        'last_at',
      ];
      const lines = [header.join(',')];
      for (const r of rows) {
        const cells = [
          r.workDate,
          r.canvasserUserId,
          csvEscape(r.canvasserName || ''),
          csvEscape(r.canvasserEmail || ''),
          r.isPaid ? '1' : '0',
          r.miles.toFixed(3),
          r.hours.toFixed(3),
          r.doors,
          r.breadcrumbCount,
          r.firstAt || '',
          r.lastAt || '',
        ];
        lines.push(cells.join(','));
      }
      const body = lines.join('\n') + '\n';
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="payroll_${from}_${to}.csv"`,
        },
      });
    }

    const totals = rows.reduce(
      (acc, r) => {
        acc.miles += r.miles;
        acc.hours += r.hours;
        acc.doors += r.doors;
        return acc;
      },
      { miles: 0, hours: 0, doors: 0 }
    );

    return NextResponse.json({
      status: true,
      from,
      to,
      totals: {
        miles: Math.round(totals.miles * 1000) / 1000,
        hours: Math.round(totals.hours * 1000) / 1000,
        doors: totals.doors,
        rows: rows.length,
      },
      rows,
      members,
    });
  } catch (error) {
    console.error('[payroll GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dashboard/payroll — set paid-canvasser flag.
 * Body: { userId, paid: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireUserId(request);
    if (typeof auth !== 'string') return auth;
    const callerId = Number(auth);
    const orgId = await ensurePrimaryOrgId(callerId);
    const body = await request.json();
    const userId = Number(body.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { status: false, message: 'userId required' },
        { status: 400 }
      );
    }
    const paid = Boolean(body.paid);
    const ok = await PayrollRepo.setPaidCanvasser({
      organizationId: orgId,
      userId,
      paid,
    });
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Member not found in this organization' },
        { status: 404 }
      );
    }
    return NextResponse.json({ status: true, userId, paid });
  } catch (error) {
    console.error('[payroll PATCH]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
