/**
 * GET /api/python-analysis/dataset-sources/export
 *   ?kind=voter&listId=
 *   ?kind=survey&surveyId=   (redirects to existing export-csv shape as text/csv)
 *
 * Returns CSV text for loading into the multi-dataset tray / Pyodide.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';

const ENTRY_COLS = [
  'phone',
  'first_name',
  'last_name',
  'email',
  'birthdate',
  'age',
  'district',
  'zip',
  'city',
  'state',
  'party',
] as const;

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const kind = (req.nextUrl.searchParams.get('kind') || '').toLowerCase();
    const listId = Number(req.nextUrl.searchParams.get('listId'));
    const surveyId = Number(req.nextUrl.searchParams.get('surveyId'));

    if (kind === 'voter') {
      if (!Number.isFinite(listId) || listId <= 0) {
        return NextResponse.json({ error: 'listId required' }, { status: 400 });
      }

      const db = await openSql();
      const [lists]: any = await db.execute(
        `SELECT id, name FROM contact_lists WHERE id = ? AND user_id = ? LIMIT 1`,
        [listId, userId]
      );
      if (!lists?.length) {
        return NextResponse.json({ error: 'Contact list not found' }, { status: 404 });
      }

      const [rows]: any = await db.execute(
        `SELECT phone, first_name, last_name, email, birthdate, age, district, zip, city, state, party, extra_data
         FROM contact_list_entries
         WHERE list_id = ?
         ORDER BY id ASC
         LIMIT 100000`,
        [listId]
      );

      // Collect extra_data keys for wide CSV
      const extraKeys = new Set<string>();
      for (const r of rows || []) {
        if (!r.extra_data) continue;
        try {
          const obj =
            typeof r.extra_data === 'string'
              ? JSON.parse(r.extra_data)
              : r.extra_data;
          if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach((k) => extraKeys.add(k));
          }
        } catch {
          /* ignore */
        }
      }
      const extras = [...extraKeys].slice(0, 40);
      const headers = [...ENTRY_COLS, ...extras];

      const lines = [headers.join(',')];
      for (const r of rows || []) {
        let extraObj: Record<string, unknown> = {};
        if (r.extra_data) {
          try {
            extraObj =
              typeof r.extra_data === 'string'
                ? JSON.parse(r.extra_data)
                : r.extra_data || {};
          } catch {
            extraObj = {};
          }
        }
        const vals = [
          ...ENTRY_COLS.map((c) => csvEscape(r[c])),
          ...extras.map((k) => csvEscape(extraObj[k])),
        ];
        lines.push(vals.join(','));
      }

      const csv = lines.join('\n');
      const name = String(lists[0].name || `voter_${listId}`).replace(
        /[^\w.-]+/g,
        '_'
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}.csv"`,
          'X-Dataset-Label': String(lists[0].name || `Contact list #${listId}`),
          'X-Dataset-Rows': String((rows || []).length),
        },
      });
    }

    if (kind === 'survey' || kind === 'prior_survey') {
      if (!Number.isFinite(surveyId) || surveyId <= 0) {
        return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
      }
      // Proxy to existing survey CSV export (same auth headers)
      const origin = req.nextUrl.origin;
      const url = `${origin}/api/surveys/${surveyId}/export-csv`;
      const upstream = await fetch(url, {
        headers: {
          cookie: req.headers.get('cookie') || '',
          'x-user-id': req.headers.get('x-user-id') || String(userId),
          'x-user-email': req.headers.get('x-user-email') || '',
        },
        cache: 'no-store',
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        return NextResponse.json(
          { error: text || 'Survey export failed' },
          { status: upstream.status }
        );
      }
      const csv = await upstream.text();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="survey_${surveyId}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'kind must be voter, survey, or prior_survey' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[python-analysis/dataset-sources/export]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
