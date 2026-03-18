import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { rows, columns, valueColumn } = body as {
      rows: Record<string, string>[];
      columns: string[];
      valueColumn?: string;
    };
    if (!Array.isArray(rows) || !Array.isArray(columns) || rows.length === 0) {
      return NextResponse.json({ error: 'Missing rows or columns' }, { status: 400 });
    }

    const numericColumns = columns.filter((col: string) => {
      const vals = rows.map((r: Record<string, string>) => r[col]).filter(Boolean);
      const parsed = vals.map((v: string) => parseFloat(String(v).replace(/[%,$]/g, '')));
      const numericCount = parsed.filter((n: number) => !Number.isNaN(n)).length;
      return numericCount >= vals.length * 0.5;
    });

    const suggestedColumn = valueColumn && numericColumns.includes(valueColumn)
      ? valueColumn
      : (numericColumns[0] ?? columns[0]);

    const geoLike = columns.filter((c: string) =>
      /state|district|name|geo|fips|region|place/i.test(c)
    );
    const suggestedStyle = numericColumns.length > 0 ? 'color' : 'color';

    let summary = `Found ${rows.length} rows; ${numericColumns.length} numeric column(s). Suggested value column: "${suggestedColumn}".`;
    if (geoLike.length) {
      summary += ` Geo-like columns: ${geoLike.join(', ')}.`;
    }

    return NextResponse.json({
      status: true,
      suggestedColumn,
      suggestedStyle,
      summary,
      numericColumns,
    });
  } catch (error) {
    console.error('Custom map analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
