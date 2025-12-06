import { NextRequest, NextResponse } from "next/server";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { normalizeRecords } from '@/app/utils/survey/import-utils';

export const dynamic = 'force-dynamic';

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

// Trim CSV text to the last newline that occurs outside of quoted fields
function trimToLastBalancedLine(csvString: string): string {
  let insideQuotes = false;
  let lastSafeNewline = -1;
  for (let i = 0; i < csvString.length; i++) {
    const ch = csvString[i];
    if (ch === '"') {
      if (insideQuotes && csvString[i + 1] === '"') {
        i++;
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
  return csvString;
}

// Helper function to parse CSV data with tolerant fallback for chunks
function parseCSV(buffer: Buffer): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let csvString = buffer.toString('utf-8');
    csvString = trimToLastBalancedLine(csvString);

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

    parseFlow().then(resolve).catch(reject);
  });
}

// Store chunk data temporarily
async function storeChunk(chunkData: ChunkData): Promise<void> {
  const tempDir = getTempDir(chunkData.userId, chunkData.fileName);
  
  // Ensure directory exists
  await fs.mkdir(tempDir, { recursive: true });
  
  const chunkFile = path.join(tempDir, `chunk_${chunkData.chunkIndex}.json`);
  await fs.writeFile(chunkFile, JSON.stringify(chunkData));
}

// Retrieve all chunks for a file
async function getAllChunks(userId: string, fileName: string): Promise<ChunkData[]> {
  const tempDir = getTempDir(userId, fileName);
  
  try {
    const files = await fs.readdir(tempDir);
    const chunks: ChunkData[] = [];
    
    for (const file of files) {
      if (file.startsWith('chunk_') && file.endsWith('.json')) {
        const chunkPath = path.join(tempDir, file);
        const chunkDataStr = await fs.readFile(chunkPath, 'utf-8');
        chunks.push(JSON.parse(chunkDataStr));
      }
    }
    
    // Sort by chunk index
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  } catch (error) {
    return [];
  }
}

// Clean up temporary files
async function cleanupChunks(userId: string, fileName: string): Promise<void> {
  const tempDir = getTempDir(userId, fileName);
  
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to cleanup temp chunks:', error);
  }
}

// POST endpoint for processing chunks
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string);
    const totalChunks = parseInt(formData.get('totalChunks') as string);
    const originalFileName = formData.get('originalFileName') as string;
    const isLastChunk = formData.get('isLastChunk') === 'true';
    
    console.log(`Processing chunk ${chunkIndex} of ${totalChunks} for file: ${originalFileName}`);
    
    if (!file || isNaN(chunkIndex) || isNaN(totalChunks) || !originalFileName) {
      console.error('Missing chunk parameters:', { file: !!file, chunkIndex, totalChunks, originalFileName });
      return NextResponse.json({ 
        status: false, 
        message: 'Missing required chunk parameters' 
      }, { status: 400 });
    }

    // Parse the chunk data
    const buffer = Buffer.from(await file.arrayBuffer());
    let chunkData: any[] = [];
    
    // Enhanced file type detection
    const fileName = originalFileName.toLowerCase();
    const mimeType = file.type.toLowerCase();
    const isCSV = fileName.endsWith('.csv') || mimeType === 'text/csv' || mimeType === 'application/csv';
    
    console.log(`File type detection: fileName=${fileName}, mimeType=${mimeType}, isCSV=${isCSV}`);
    
    try {
      if (isCSV) {
        console.log(`Parsing CSV chunk ${chunkIndex}, buffer size: ${buffer.length} bytes`);
        chunkData = await parseCSV(buffer);
        console.log(`CSV chunk ${chunkIndex} parsed successfully, rows: ${chunkData.length}`);
      } else {
        // Excel file
        console.log(`Parsing Excel chunk ${chunkIndex}`);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        chunkData = XLSX.utils.sheet_to_json(worksheet);
        console.log(`Excel chunk ${chunkIndex} parsed successfully, rows: ${chunkData.length}`);
      }
    } catch (parseError) {
      console.error(`Failed to parse chunk ${chunkIndex}:`, parseError);
      return NextResponse.json({ 
        status: false, 
        message: `Failed to parse chunk: ${parseError.message}` 
      }, { status: 400 });
    }

    const { rows: normalizedRows } = normalizeRecords(chunkData, { dropEmptyRows: true });

    // Store this chunk
    try {
      console.log(`Storing chunk ${chunkIndex} with ${normalizedRows.length} rows`);
      await storeChunk({
        chunkIndex,
        totalChunks,
        data: normalizedRows,
        fileName: originalFileName,
        userId: userIdHeader,
        timestamp: Date.now()
      });
      console.log(`Chunk ${chunkIndex} stored successfully`);
    } catch (storeError) {
      console.error(`Failed to store chunk ${chunkIndex}:`, storeError);
      return NextResponse.json({ 
        status: false, 
        message: `Failed to store chunk: ${storeError.message}` 
      }, { status: 500 });
    }

    // If this is the last chunk, combine all chunks and return complete data
    if (isLastChunk) {
      console.log(`Last chunk received, combining all chunks for ${originalFileName}`);
      const allChunks = await getAllChunks(userIdHeader, originalFileName);
      console.log(`Found ${allChunks.length} chunks, expected ${totalChunks}`);
      
      if (allChunks.length !== totalChunks) {
        console.error(`Chunk count mismatch: expected ${totalChunks}, got ${allChunks.length}`);
        console.log('Available chunks:', allChunks.map(c => c.chunkIndex).sort((a, b) => a - b));
        return NextResponse.json({ 
          status: false, 
          message: `Missing chunks. Expected ${totalChunks}, got ${allChunks.length}` 
        }, { status: 400 });
      }

      // Combine all chunk data
      const combinedData: any[] = [];
      let totalRows = 0;
      
      for (const chunk of allChunks) {
        combinedData.push(...chunk.data);
        totalRows += chunk.data.length;
      }

      console.log(`Combined ${allChunks.length} chunks into ${totalRows} total rows`);

      // Clean up temporary files
      await cleanupChunks(userIdHeader, originalFileName);

      return NextResponse.json({ 
        status: true, 
        isComplete: true,
        totalRows,
        message: `Successfully processed all ${totalChunks} chunks (${totalRows} total rows)`,
        chunkInfo: {
          chunkIndex,
          totalChunks,
          chunkRows: normalizedRows.length,
          isLastChunk: true
        }
      });
    }

    // Return progress for intermediate chunks
    console.log(`Chunk ${chunkIndex} processed successfully, not last chunk`);
    return NextResponse.json({ 
      status: true, 
      isComplete: false,
      message: `Processed chunk ${chunkIndex + 1} of ${totalChunks} (${normalizedRows.length} rows)`,
      chunkInfo: {
        chunkIndex,
        totalChunks,
        chunkRows: normalizedRows.length,
        isLastChunk: false
      }
    });

  } catch (error) {
    console.error('Error processing chunk:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during chunk processing' 
    }, { status: 500 });
  }
}

// GET endpoint for checking chunk status
export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('fileName');
    
    if (!fileName) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing fileName parameter' 
      }, { status: 400 });
    }

    const chunks = await getAllChunks(userIdHeader, fileName);
    const totalRows = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);

    return NextResponse.json({ 
      status: true,
      chunks: chunks.map(chunk => ({
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        rowCount: chunk.data.length,
        timestamp: chunk.timestamp
      })),
      totalRows,
      isComplete: chunks.length > 0 && chunks.length === chunks[0]?.totalChunks
    });

  } catch (error) {
    console.error('Error checking chunk status:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during status check' 
    }, { status: 500 });
  }
} 
