import { NextRequest, NextResponse } from "next/server";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Fuse from 'fuse.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ResearchDataDetector } from '@/app/utils/survey/research-data-detector';
import { CodebookParser } from '@/app/utils/survey/codebook-parser';

// Demographic field patterns for auto-detection
const DEMOGRAPHIC_PATTERNS = [
  { field: 'age', patterns: ['age', 'age_range', 'birth_year', 'dob', 'date_of_birth'] },
  { field: 'gender', patterns: ['gender', 'sex'] },
  { field: 'location', patterns: ['city', 'state', 'country', 'zip', 'postal_code', 'location'] },
  { field: 'education', patterns: ['education', 'education_level', 'degree'] },
  { field: 'income', patterns: ['income', 'salary', 'income_range'] },
  { field: 'employment', patterns: ['job_title', 'industry', 'company', 'employment_status'] },
  { field: 'email', patterns: ['email', 'email_address'] }
];

// Question type detection patterns
const QUESTION_TYPE_PATTERNS = [
  { type: 'email', patterns: ['email', 'email_address'] },
  { type: 'number', patterns: ['age', 'income', 'salary', 'rating', 'score'] },
  { type: 'rating', patterns: ['rating', 'score', 'satisfaction', 'agreement'] },
  { type: 'single-choice', patterns: ['choice', 'select', 'option'] },
  { type: 'text', patterns: [] } // default fallback
];

interface ParsedColumn {
  name: string;
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'email' | 'number';
  isDemographic: boolean;
  demographicField?: string;
  sampleValues: string[];
  uniqueValues: string[];
  isRequired: boolean;
}

interface ImportPreview {
  fileName: string;
  totalRows: number;
  columns: ParsedColumn[];
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

// Helper function to detect demographic fields using enhanced fuzzy matching
function detectDemographicField(columnName: string): { field: string; confidence: number } | null {
  const normalizedName = columnName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestMatch: { field: string; confidence: number } | null = null;
  
  for (const demo of DEMOGRAPHIC_PATTERNS) {
    // Check exact matches first (highest confidence)
    for (const pattern of demo.patterns) {
      if (normalizedName === pattern.replace(/[^a-z0-9]/g, '')) {
        return { field: demo.field, confidence: 1.0 };
      }
    }
    
    // Check substring matches
    for (const pattern of demo.patterns) {
      if (normalizedName.includes(pattern) || pattern.includes(normalizedName)) {
        const confidence = Math.max(pattern.length / normalizedName.length, normalizedName.length / pattern.length) * 0.9;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field: demo.field, confidence };
        }
      }
    }
    
    // Use fuzzy matching for partial matches
    const fuse = new Fuse(demo.patterns, {
      threshold: 0.4, // More lenient threshold
      includeScore: true
    });
    const results = fuse.search(normalizedName);
    
    if (results.length > 0 && results[0].score !== undefined) {
      const confidence = 1 - results[0].score;
      if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { field: demo.field, confidence };
      }
    }
  }
  
  return bestMatch && bestMatch.confidence > 0.5 ? bestMatch : null;
}

// Helper function to detect question type with enhanced logic
function detectQuestionType(columnName: string, uniqueValues: string[]): string {
  const normalizedName = columnName.toLowerCase();
  
  // Check for email pattern first
  if (QUESTION_TYPE_PATTERNS[0].patterns.some(p => normalizedName.includes(p))) {
    // Verify with actual data - check if values look like emails
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailCount = uniqueValues.filter(v => emailPattern.test(v.trim())).length;
    if (emailCount > uniqueValues.length * 0.7) {
      return 'email';
    }
  }
  
  // Check for rating/scale patterns in column name
  const ratingPatterns = ['rating', 'score', 'satisfaction', 'scale', 'rate'];
  if (ratingPatterns.some(p => normalizedName.includes(p))) {
    return 'rating';
  }
  
  // Check if values are numeric
  const numericValues = uniqueValues.filter(v => !isNaN(Number(v)) && v.trim() !== '');
  if (numericValues.length > uniqueValues.length * 0.8) {
    // If most values are numbers, determine if it's a scale or general number
    const numbers = numericValues.map(Number);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    
    // Scale detection: limited range, reasonable bounds
    if (max - min <= 10 && min >= 0 && max <= 10) {
      return 'rating';
    }
    
    // Age detection
    if (normalizedName.includes('age') && min >= 0 && max <= 120) {
      return 'number';
    }
    
    return 'number';
  }
  
  // Check for yes/no or boolean patterns
  const booleanValues = uniqueValues.map(v => v.toLowerCase().trim());
  const booleanPatterns = [
    ['yes', 'no'], ['true', 'false'], ['y', 'n'], 
    ['1', '0'], ['agree', 'disagree']
  ];
  
  for (const pattern of booleanPatterns) {
    if (pattern.every(p => booleanValues.includes(p)) && booleanValues.length <= 3) {
      return 'single-choice';
    }
  }
  
  // Check if it looks like multiple choice (limited unique values, not too many)
  if (uniqueValues.length <= 15 && uniqueValues.length > 1) {
    // Additional check: if values are short and look like options
    const avgLength = uniqueValues.reduce((sum, val) => sum + val.length, 0) / uniqueValues.length;
    if (avgLength <= 30) { // Short values likely to be choices
      return 'single-choice';
    }
  }
  
  // Check for multi-choice indicators (comma-separated values)
  const hasCommaValues = uniqueValues.some(v => v.includes(',') && v.split(',').length > 1);
  if (hasCommaValues) {
    return 'multiple-choice';
  }
  
  // Default to text for everything else
  return 'text';
}

// Helper function to parse CSV data
function parseCSV(buffer: Buffer): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const csvString = buffer.toString('utf-8');
    
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string, index: number) => {
        // Handle duplicate headers by appending index
        const cleanHeader = header.trim();
        return cleanHeader || `Column_${index}`;
      },
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors.map(e => e.message));
          // Only reject on critical errors, not warnings
          const criticalErrors = results.errors.filter(e => e.type === 'Delimiter' || e.type === 'Quotes');
          if (criticalErrors.length > 0) {
            reject(new Error(`CSV parsing errors: ${criticalErrors.map(e => e.message).join(', ')}`));
          } else {
            console.log('CSV parsed with warnings, continuing...');
            resolve(results.data);
          }
        } else {
          resolve(results.data);
        }
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
        reject(error);
      }
    });
  });
}

// Helper function to parse Excel data
function parseExcel(buffer: Buffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Use first sheet
  const worksheet = workbook.Sheets[sheetName];
  
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 }).slice(1); // Skip header row
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
        rawData = await parseCSV(buffer);
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

    // 🔍 Research Data Detection (NEW!)
    const researchDataAnalysis = ResearchDataDetector.analyzeForResearchData(
      rawData.slice(0, 100), // Analyze first 100 rows for performance
      originalFileName || file.name
    );

    // For chunked uploads, handle differently
    if (chunkIndex !== null) {
      return handleChunkedUpload({
        rawData,
        chunkIndex: parseInt(chunkIndex as string),
        totalChunks: parseInt(totalChunks as string),
        isFirstChunk,
        isLastChunk,
        originalFileName: originalFileName || file.name,
        userId: userIdHeader,
        researchDataAnalysis // Pass analysis to chunked handler
      });
    }

    // Standard single-file processing (existing logic)
    const headers = Object.keys(rawData[0]);
    const columns: ParsedColumn[] = [];
    const detectedDemographics: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const header of headers) {
      // Get sample values for this column
      const values = rawData.slice(0, 100).map(row => String(row[header] || '')).filter(v => v.trim() !== '');
      const uniqueValues = [...new Set(values)].slice(0, 20); // Limit for analysis
      
      // Detect demographic field
      const demoMatch = detectDemographicField(header);
      const isDemographic = demoMatch !== null;
      
      if (isDemographic && demoMatch) {
        detectedDemographics.push(demoMatch.field);
      }
      
      // Detect question type
      const questionType = detectQuestionType(header, uniqueValues);
      
      // Check if column seems required (low null/empty rate)
      const emptyCount = rawData.slice(0, 100).filter(row => !row[header] || String(row[header]).trim() === '').length;
      const isRequired = emptyCount < rawData.slice(0, 100).length * 0.1; // Less than 10% empty
      
      columns.push({
        name: header,
        type: questionType as any,
        isDemographic,
        demographicField: demoMatch?.field,
        sampleValues: values.slice(0, 5),
        uniqueValues,
        isRequired
      });
    }

    // Generate suggested survey title
    const suggestedTitle = `Imported Survey - ${file.name.replace(/\.[^/.]+$/, "")}`;
    
    // Add warnings for potential issues
    if (detectedDemographics.length === 0) {
      warnings.push('No demographic fields detected. Digital twin creation may be limited.');
    }
    
    if (rawData.length > 1000) {
      warnings.push(`Large dataset detected (${rawData.length} responses). Processing may take longer.`);
    }

    const preview: ImportPreview = {
      fileName: file.name,
      totalRows: rawData.length,
      columns,
      previewData: rawData.slice(0, 5), // First 5 rows for preview
      suggestedTitle,
      detectedDemographics: [...new Set(detectedDemographics)],
      errors,
      warnings,
      researchDataAnalysis // Add research data analysis
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
  rawData: any[];
  chunkIndex: number;
  totalChunks: number;
  isFirstChunk: boolean;
  isLastChunk: boolean;
  originalFileName: string;
  userId: string;
  researchDataAnalysis?: any;
}) {
  const { rawData, chunkIndex, totalChunks, isFirstChunk, isLastChunk, originalFileName, userId, researchDataAnalysis } = params;
  
  // For the first chunk, we do full header analysis and create the preview
  if (isFirstChunk) {
    const headers = Object.keys(rawData[0]);
    const columns: ParsedColumn[] = [];
    const detectedDemographics: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Use all existing header analysis logic
    for (const header of headers) {
      // Get sample values for this column (use more data since this is the first chunk)
      const values = rawData.slice(0, Math.min(500, rawData.length)).map(row => String(row[header] || '')).filter(v => v.trim() !== '');
      const uniqueValues = [...new Set(values)].slice(0, 20);
      
      // Detect demographic field
      const demoMatch = detectDemographicField(header);
      const isDemographic = demoMatch !== null;
      
      if (isDemographic && demoMatch) {
        detectedDemographics.push(demoMatch.field);
      }
      
      // Detect question type
      const questionType = detectQuestionType(header, uniqueValues);
      
      // Check if column seems required
      const emptyCount = rawData.filter(row => !row[header] || String(row[header]).trim() === '').length;
      const isRequired = emptyCount < rawData.length * 0.1;
      
      columns.push({
        name: header,
        type: questionType as any,
        isDemographic,
        demographicField: demoMatch?.field,
        sampleValues: values.slice(0, 5),
        uniqueValues,
        isRequired
      });
    }

    // Generate suggested survey title
    const suggestedTitle = `Imported Survey - ${originalFileName.replace(/\.[^/.]+$/, "")}`;
    
    // Add warnings for chunked uploads
    if (detectedDemographics.length === 0) {
      warnings.push('No demographic fields detected. Digital twin creation may be limited.');
    }
    
    warnings.push(`Large file detected - processing in ${totalChunks} chunks. This may take a few minutes.`);

    // Store chunk data temporarily (you might want to use Redis or a temp table for this)
    // For now, we'll return the preview and let the client handle subsequent chunks
    const chunkData: ChunkData = {
      chunkIndex,
      totalChunks,
      data: rawData,
      fileName: originalFileName,
      userId,
      timestamp: Date.now()
    };

    await storeChunk(chunkData);

    const preview: ImportPreview = {
      fileName: originalFileName,
      totalRows: rawData.length, // This is just the first chunk, actual total will be higher
      columns,
      previewData: rawData.slice(0, 5),
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
        chunkRows: rawData.length,
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
      chunkRows: rawData.length,
      isFirstChunk,
      isLastChunk
    },
    message: `Processed chunk ${chunkIndex + 1} of ${totalChunks} (${rawData.length} rows)`
  });
} 