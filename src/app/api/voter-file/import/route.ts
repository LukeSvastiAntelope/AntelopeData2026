import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { detectVoterFileFormat } from '@/app/utils/voter-file-schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/voter-file/import
 *
 * Upload a voter file (CSV or Excel) for preview.
 * Auto-detects format (L2, TargetSmart, generic state roll),
 * maps columns, and returns a preview for user confirmation.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { status: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    // Parse CSV or Excel
    if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
      const text = await file.text();
      const delimiter = fileName.endsWith('.tsv') ? '\t' : undefined;

      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy' as const,
        delimiter,
        transformHeader: (header: string, index: number) =>
          header.trim() || `Column_${index}`,
      });

      rows = result.data;
      headers = result.meta.fields || [];
    } else if (
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: '',
        raw: false,
      });
      rows = jsonData;
      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
      }
    } else {
      return NextResponse.json(
        { status: false, message: 'Unsupported file format. Use CSV, TSV, or Excel.' },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { status: false, message: 'File contains no data rows' },
        { status: 400 }
      );
    }

    // Detect format and map columns
    const detection = detectVoterFileFormat(headers);

    // Build preview rows (first 20)
    const previewRows = rows.slice(0, 20).map((row) => {
      const mapped: Record<string, string> = {};
      for (const col of detection.mappedColumns) {
        const raw = row[col.originalColumn] || '';
        mapped[col.targetField] = col.transform ? col.transform(raw) : raw;
      }
      return { original: row, mapped };
    });

    return NextResponse.json({
      status: true,
      totalRows: rows.length,
      format: {
        id: detection.format.id,
        name: detection.format.name,
        description: detection.format.description,
      },
      confidence: Math.round(detection.confidence * 100),
      mappedColumns: detection.mappedColumns.map(({ originalColumn, targetField, label }) => ({
        originalColumn,
        targetField,
        label,
      })),
      unmappedColumns: detection.unmappedColumns,
      previewRows,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Voter file import error:', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed to process voter file',
      },
      { status: 500 }
    );
  }
}
