import { NextRequest, NextResponse } from 'next/server';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

export const runtime = 'nodejs';

function parseEnum(columnType: string): string[] {
  const match = columnType.match(/^enum\((.*)\)$/i);
  if (!match) return [];
  const inner = match[1];
  const values: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === ',') {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) values.push(current);
  return values.map((v) => v.replace(/\\'/g, "'"));
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const db = await getMySQLConnection();
  const conn = await db.getConnection();
  try {
    const updates: any[] = [];

    const [srCols]: any[] = await conn.execute(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'survey_responses' AND COLUMN_NAME = 'source'`
    );
    const desiredResponses = [
      'native',
      'import',
      'api',
      'web',
      'telegram',
      'email',
      'sms',
      'discord',
      'whatsapp',
    ];
    if (srCols[0]?.COLUMN_TYPE) {
      const currentValues = parseEnum(srCols[0].COLUMN_TYPE);
      const merged = Array.from(new Set([...currentValues, ...desiredResponses]));
      if (merged.sort().join(',') !== currentValues.sort().join(',')) {
        const enumList = merged
          .map((v) => `'${v.replace(/'/g, "\\'")}'`)
          .join(', ');
        const enumSql = `ENUM(${enumList})`;
        await conn.execute(
          `ALTER TABLE survey_responses MODIFY COLUMN source ${enumSql} DEFAULT 'native'`
        );
        updates.push({
          table: 'survey_responses',
          from: currentValues,
          to: merged,
        });
      }
    } else {
      const enumList = desiredResponses
        .map((v) => `'${v.replace(/'/g, "\\'")}'`)
        .join(', ');
      const enumSql = `ENUM(${enumList})`;
      await conn.execute(
        `ALTER TABLE survey_responses ADD COLUMN source ${enumSql} DEFAULT 'native' AFTER user_agent`
      );
      updates.push({ table: 'survey_responses', added: desiredResponses });
    }

    const [sCols]: any[] = await conn.execute(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'`
    );
    const desiredSurveys = [
      'native',
      'csv_import',
      'excel_import',
      'surveymonkey_import',
      'typeform_import',
      'google_forms_import',
      'google_sheets_import',
      'web',
      'telegram',
      'email',
      'sms',
      'discord',
      'whatsapp',
    ];
    if (sCols[0]?.COLUMN_TYPE) {
      const currentValues = parseEnum(sCols[0].COLUMN_TYPE);
      const merged = Array.from(new Set([...currentValues, ...desiredSurveys]));
      if (merged.sort().join(',') !== currentValues.sort().join(',')) {
        const enumList = merged
          .map((v) => `'${v.replace(/'/g, "\\'")}'`)
          .join(', ');
        const enumSql = `ENUM(${enumList})`;
        await conn.execute(
          `ALTER TABLE surveys MODIFY COLUMN source ${enumSql} DEFAULT 'native'`
        );
        updates.push({ table: 'surveys', from: currentValues, to: merged });
      }
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'schema.fix_source_enums',
      targetType: 'system',
      metadata: { updates },
      ip: clientIp(req),
    });

    return NextResponse.json({ ok: true, updates });
  } catch (e: any) {
    console.error('fix-source-enums error:', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown' },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
