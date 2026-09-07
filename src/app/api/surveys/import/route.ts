import { NextRequest, NextResponse } from "next/server";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ResearchDataDetector } from '@/app/utils/survey/research-data-detector';
import {
  analyzeColumns,
  normalizeRecords,
  type ColumnSummary
} from '@/app/utils/survey/import-utils';

// Increase body size limit for file uploads (50MB)
export const maxDuration = 300; // 5 minutes for large file processing
export const runtime = 'nodejs';

interface ImportPreview {
  fileName: string;
  totalRows: number;
  columns: ColumnSummary[];
  previewData: any[];
  suggestedTitle: string;
  detectedDemographics: string[];
  errors: string[];
  warnings: string[];
  researchDataAnalysis?: {
    confidence: number;
    isResearchData: boolean;
    suggestCodebook: boolean;
    reasons: string[];
    recommendations: string[];
    detectedPatterns: {
      technicalColumns: string[];
      numericOnlyColumns: string[];
      metadataColumns: string[];
      waveIdentifiers: string[];
    };
  };
}

// Add chunk storage interfaces and functions
interface ChunkData {
  chunkIndex: number;
  totalChunks: number;
  data: any[];
  fileName: string;
  userId: string;
  timestamp: number;
}

// Helper function to get temp directory for chunks
function getTempDir(userId: string, fileName: string): string {
  return path.join(tmpdir(), 'survey-import-chunks', userId, fileName.replace(/[^a-zA-Z0-9.-]/g, '_'));
}

// Store chunk data temporarily
async function storeChunk(chunkData: ChunkData): Promise<void> {
  const tempDir = getTempDir(chunkData.userId, chunkData.fileName);
  
  // Ensure directory exists
  await fs.mkdir(tempDir, { recursive: true });
  
  const chunkFile = path.join(tempDir, `chunk_${chunkData.chunkIndex}.json`);
  await fs.writeFile(chunkFile, JSON.stringify(chunkData));
}

// Trim CSV text to the last newline that occurs outside of quoted fields
function trimToLastBalancedLine(csvString: string): string {
  let insideQuotes = false;
  let lastSafeNewline = -1;
  for (let i = 0; i < csvString.length; i++) {
    const ch = csvString[i];
    if (ch === '"') {
      // Handle doubled quotes inside a quoted field
      if (insideQuotes && csvString[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (ch === '\n' && !insideQuotes) {
      lastSafeNewline = i;
    }
  }
  if (lastSafeNewline >= 0) {
    return csvString.slice(0, lastSafeNewline + 1);
  }
  return csvString; // fallback, nothing to trim
}

// Helper function to parse CSV data with tolerant fallback (for chunked previews)
function parseCSV(buffer: Buffer, opts?: { tolerantForChunk?: boolean }): Promise<any[]> {
  const { tolerantForChunk = false } = opts || {};
  return new Promise((resolve, reject) => {
    let csvString = buffer.toString('utf-8');

    // For chunked uploads, trim trailing partial records to avoid unterminated quotes
    if (tolerantForChunk) {
      csvString = trimToLastBalancedLine(csvString);
    }

    const tryParse = (text: string): Promise<any[]> => new Promise((resolveInner, rejectInner) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy' as const,
        transformHeader: (header: string, index: number) => {
          const cleanHeader = header.trim();
          return cleanHeader || `Column_${index}`;
        },
        complete: (results: any) => {
          const errors = results.errors || [];
          const hasCritical = errors.some((e: any) => e?.type === 'Delimiter' || e?.type === 'Quotes');
          if (hasCritical) {
            rejectInner(new Error(errors.map((e: any) => e.message).join(', ')));
          } else {
            resolveInner(results.data);
          }
        },
        error: (error: any) => {
          rejectInner(error);
        }
      } as any);
    });

    const parseFlow = async () => {
      try {
        return await tryParse(csvString);
      } catch (_err) {
        const trimmed = trimToLastBalancedLine(csvString);
        if (trimmed && trimmed.length < csvString.length) {
          return await tryParse(trimmed);
        }
        throw _err;
      }
    };

    parseFlow()
      .then(resolve)
      .catch(reject);
  });
}

// Main import preview endpoint
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    // Check if this is a chunked upload
    const chunkIndex = formData.get('chunkIndex');
    const totalChunks = formData.get('totalChunks');
    const isFirstChunk = formData.get('isFirstChunk') === 'true';
    const isLastChunk = formData.get('isLastChunk') === 'true';
    const originalFileName = formData.get('originalFileName') as string;
    
    if (!file) {
      return NextResponse.json({ 
        status: false, 
        message: 'No file provided' 
      }, { status: 400 });
    }

    // Enhanced file type validation
    const fileName = (originalFileName || file.name).toLowerCase();
    const mimeType = file.type.toLowerCase();
    
    // Check by extension first (more reliable for chunked uploads)
    const isCSV = fileName.endsWith('.csv') || mimeType === 'text/csv' || mimeType === 'application/csv';
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || 
                   mimeType.includes('excel') || mimeType.includes('spreadsheet');
    
    if (!isCSV && !isExcel) {
      return NextResponse.json({ 
        status: false, 
        message: 'Unsupported file type. Please upload CSV or Excel files.' 
      }, { status: 400 });
    }

    // For chunked uploads, we have different size limits per chunk
    const maxChunkSize = chunkIndex !== null ? 5 * 1024 * 1024 : 10 * 1024 * 1024; // 5MB per chunk, 10MB for single files
    
    if (file.size > maxChunkSize) {
      return NextResponse.json({ 
        status: false, 
        message: chunkIndex !== null 
          ? 'Chunk too large. Maximum chunk size is 5MB.' 
          : 'File too large. Maximum size is 10MB.' 
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawData: any[] = [];
    
    // Parse based on file type
    try {
      if (isCSV) {
        rawData = await parseCSV(buffer, { tolerantForChunk: chunkIndex !== null });
      } else {
        // Excel file
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json(worksheet);
      }
    } catch (parseError) {
      return NextResponse.json({ 
        status: false, 
        message: `Failed to parse file: ${parseError.message}` 
      }, { status: 400 });
    }

    if (rawData.length === 0) {
      return NextResponse.json({ 
        status: false, 
        message: 'File appears to be empty or has no valid data.' 
      }, { status: 400 });
    }

    const { rows: normalizedRows } = normalizeRecords(rawData, { dropEmptyRows: true });

    if (normalizedRows.length === 0) {
      return NextResponse.json({
        status: false,
        message: 'File contains only empty rows or unsupported data formats.'
      }, { status: 400 });
    }

    const researchDataAnalysis = ResearchDataDetector.analyzeForResearchData(
      normalizedRows.slice(0, 100),
      originalFileName || file.name
    );

    if (chunkIndex !== null) {
      return handleChunkedUpload({
        rows: normalizedRows,
        chunkIndex: parseInt(chunkIndex as string),
        totalChunks: parseInt(totalChunks as string),
        isFirstChunk,
        isLastChunk,
        originalFileName: originalFileName || file.name,
        userId: userIdHeader,
        researchDataAnalysis
      });
    }

    const columnAnalysis = analyzeColumns(normalizedRows, { sampleSize: 150 });
    const columns = columnAnalysis.columns;
    const detectedDemographics = columnAnalysis.detectedDemographics;
    const errors: string[] = [];
    const warnings: string[] = [...columnAnalysis.warnings];

    const suggestedTitle = `Imported Survey - ${file.name.replace(/\.[^/.]+$/, "")}`;

    if (normalizedRows.length > 1000) {
      warnings.push(`Large dataset detected (${normalizedRows.length} responses). Processing may take longer.`);
    }

    const preview: ImportPreview = {
      fileName: file.name,
      totalRows: normalizedRows.length,
      columns,
      previewData: normalizedRows.slice(0, 5),
      suggestedTitle,
      detectedDemographics: [...new Set(detectedDemographics)],
      errors,
      warnings,
      researchDataAnalysis
    };

    return NextResponse.json({ 
      status: true, 
      preview 
    });

  } catch (error) {
    console.error('Error in survey import preview:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during file processing' 
    }, { status: 500 });
  }
}

// Handle chunked upload processing
async function handleChunkedUpload(params: {
  rows: any[];
  chunkIndex: number;
  totalChunks: number;
  isFirstChunk: boolean;
  isLastChunk: boolean;
  originalFileName: string;
  userId: string;
  researchDataAnalysis?: any;
}) {
  const { rows, chunkIndex, totalChunks, isFirstChunk, isLastChunk, originalFileName, userId, researchDataAnalysis } = params;
  
  // For the first chunk, we do full header analysis and create the preview
  if (isFirstChunk) {
    const columnAnalysis = analyzeColumns(rows, { sampleSize: Math.min(500, rows.length) });
    const columns = columnAnalysis.columns;
    const detectedDemographics = columnAnalysis.detectedDemographics;
    const errors: string[] = [];
    const warnings: string[] = [...columnAnalysis.warnings];

    // Generate suggested survey title
    const suggestedTitle = `Imported Survey - ${originalFileName.replace(/\.[^/.]+$/, "")}`;
    
    // Add warnings for chunked uploads
    warnings.push(`Large file detected - processing in ${totalChunks} chunks. This may take a few minutes.`);

    // Store chunk data temporarily (you might want to use Redis or a temp table for this)
    // For now, we'll return the preview and let the client handle subsequent chunks
    const chunkData: ChunkData = {
      chunkIndex,
      totalChunks,
      data: rows,
      fileName: originalFileName,
      userId,
      timestamp: Date.now()
    };

    await storeChunk(chunkData);

    const preview: ImportPreview = {
      fileName: originalFileName,
      totalRows: rows.length, // This is just the first chunk, actual total will be higher
      columns,
      previewData: rows.slice(0, 5),
      suggestedTitle,
      detectedDemographics: [...new Set(detectedDemographics)],
      errors,
      warnings,
      researchDataAnalysis // Add research data analysis for chunked uploads too
    };

    return NextResponse.json({ 
      status: true, 
      preview,
      isChunked: true,
      chunkInfo: {
        chunkIndex,
        totalChunks,
        chunkRows: rows.length,
        isFirstChunk,
        isLastChunk
      }
    });
  }

  // For subsequent chunks, just return processing info
  return NextResponse.json({ 
    status: true, 
    isChunked: true,
    chunkInfo: {
      chunkIndex,
      totalChunks,
      chunkRows: rows.length,
      isFirstChunk,
      isLastChunk
    },
    message: `Processed chunk ${chunkIndex + 1} of ${totalChunks} (${rows.length} rows)`
  });
}
