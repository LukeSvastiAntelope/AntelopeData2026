import { NextRequest, NextResponse } from "next/server";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Configure route for longer timeout
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

interface ColumnMapping {
  originalName: string;
  mappedName: string;
  questionType: 'text' | 'single-choice' | 'multiple-choice' | 'multi-choice' | 'rating' | 'email' | 'number';
  isDemographic: boolean;
  demographicField?: string;
  isRequired: boolean;
  includeInSurvey: boolean;
}

interface ImportConfig {
  fileName: string;
  surveyTitle: string;
  surveyDescription: string;
  isPublic: boolean;
  columnMappings: ColumnMapping[];
  createDigitalTwins: boolean;
}

interface ImportResult {
  surveyId: number;
  responsesCreated: number;
  digitalTwinsCreated: number;
  errors: string[];
  warnings: string[];
}

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

// Helper function to get data from either chunked upload or direct file
async function getImportData(file: File, config: ImportConfig, userId: string): Promise<any[]> {
  // First, check if we have chunked data for this file
  const chunks = await getAllChunks(userId, config.fileName);
  
  if (chunks.length > 0) {
    console.log(`Found ${chunks.length} chunks for ${config.fileName}, combining data...`);
    
    // Combine all chunk data
    const combinedData: any[] = [];
    let totalRows = 0;
    
    for (const chunk of chunks) {
      combinedData.push(...chunk.data);
      totalRows += chunk.data.length;
    }
    
    console.log(`Combined chunked data: ${totalRows} total rows`);
    
    // Clean up temporary files after successful combination
    await cleanupChunks(userId, config.fileName);
    
    return combinedData;
  }
  
  // No chunked data found, parse the file directly
  console.log(`No chunked data found for ${config.fileName}, parsing file directly...`);
  return await parseFileData(file);
}

// Helper function to parse file data again (since we don't store it from preview)
async function parseFileData(file: File): Promise<any[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  
  if (file.type === 'text/csv') {
    return new Promise((resolve, reject) => {
      const csvString = buffer.toString('utf-8');
      
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
          } else {
            resolve(results.data);
          }
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  } else {
    // Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }
}

// Helper function to extract demographic data from a row
function extractDemographics(row: any, mappings: ColumnMapping[]): any {
  const demographics: any = {};
  
  for (const mapping of mappings) {
    if (mapping.isDemographic && mapping.demographicField && row[mapping.originalName]) {
      demographics[mapping.demographicField] = row[mapping.originalName];
    }
  }
  
  return demographics;
}

// Helper function to map question types to database-compatible types
function mapQuestionType(type: string): string {
  // Types should already be in the correct format now
  // This function is kept for safety and future compatibility
  const typeMap: Record<string, string> = {
    'text': 'text',
    'single-choice': 'single-choice',
    'multiple-choice': 'multiple-choice',
    'rating': 'rating',
    'email': 'email',
    'number': 'number',
    // Legacy mappings for backward compatibility
    'multi-choice': 'multiple-choice',
    'scale': 'rating'
  };
  
  return typeMap[type] || 'text';
}

// Helper function to generate survey questions from mappings
function generateSurveyQuestions(mappings: ColumnMapping[]): any[] {
  const questions: any[] = [];
  let order = 1;
  
  for (const mapping of mappings) {
    if (mapping.includeInSurvey) {
      const question: any = {
        type: mapQuestionType(mapping.questionType), // Use mapped type
        prompt: mapping.mappedName,
        isRequired: mapping.isRequired,
        order: order++
      };
      
      // For single-choice questions, we'll need to determine options from the data
      // This will be handled during response processing
      if (mapping.questionType === 'single-choice' || mapping.questionType === 'multiple-choice' || mapping.questionType === 'multi-choice') {
        question.options = []; // Will be populated later
      }
      
      questions.push(question);
    }
  }
  
  return questions;
}

// Helper function to collect unique values for choice questions
function collectChoiceOptions(data: any[], mappings: ColumnMapping[]): Map<string, string[]> {
  const optionsMap = new Map<string, string[]>();
  
  for (const mapping of mappings) {
    if ((mapping.questionType === 'single-choice' || mapping.questionType === 'multiple-choice' || mapping.questionType === 'multi-choice') && mapping.includeInSurvey) {
      const values = data
        .map(row => String(row[mapping.originalName] || '').trim())
        .filter(v => v !== '')
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique values
        .slice(0, 50); // Limit to 50 options max
      
      optionsMap.set(mapping.originalName, values);
    }
  }
  
  return optionsMap;
}

export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const configStr = formData.get('config') as string;
    
    if (!file || !configStr) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing file or configuration' 
      }, { status: 400 });
    }

    const config: ImportConfig = JSON.parse(configStr);
    
    // Parse file data
    let rawData: any[];
    try {
      rawData = await getImportData(file, config, userId.toString());
    } catch (parseError) {
      return NextResponse.json({ 
        status: false, 
        message: `Failed to parse file: ${parseError.message}` 
      }, { status: 400 });
    }

    if (rawData.length === 0) {
      return NextResponse.json({ 
        status: false, 
        message: 'No data found in file' 
      }, { status: 400 });
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Collect options for choice questions
    const choiceOptions = collectChoiceOptions(rawData, config.columnMappings);
    
    // Generate survey questions
    const questions = generateSurveyQuestions(config.columnMappings);
    
    // Add options to choice questions
    questions.forEach(question => {
      const mapping = config.columnMappings.find(m => m.mappedName === question.prompt);
      if (mapping && choiceOptions.has(mapping.originalName)) {
        question.options = choiceOptions.get(mapping.originalName);
      }
    });
    
    // Determine source type based on file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const sourceType = fileExtension === 'csv' ? 'csv_import' : 'excel_import';
    
    // Create survey with source tracking
    const surveyData = {
      title: config.surveyTitle,
      description: config.surveyDescription,
      questions: questions,
      isPublic: config.isPublic,
      autoPublish: true, // Auto-publish imported surveys
      source: sourceType,
      sourceMetadata: {
        originalFileName: file.name,
        importedAt: new Date().toISOString(),
        totalRows: rawData.length,
        columnMappings: config.columnMappings
      }
    };
    
    let surveyId: number;
    try {
      surveyId = await SurveyRepo.createSurvey(surveyData, userId);
    } catch (surveyError) {
      return NextResponse.json({ 
        status: false, 
        message: `Failed to create survey: ${surveyError.message}` 
      }, { status: 500 });
    }

    // Get the created survey to get question IDs
    const createdSurvey = await SurveyRepo.getSurveyById(surveyId, userId);
    if (!createdSurvey) {
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to retrieve created survey' 
      }, { status: 500 });
    }

    // Create a mapping from question prompts to question IDs
    const questionIdMap = new Map<string, number>();
    (createdSurvey as any).questions.forEach((q: any) => {
      questionIdMap.set(q.prompt, q.id);
    });

    let responsesCreated = 0;
    let digitalTwinsCreated = 0;
    
    // Process rows in batches to prevent timeouts
    const BATCH_SIZE = 100; // Process 100 rows at a time
    const totalBatches = Math.ceil(rawData.length / BATCH_SIZE);
    
    console.log(`Processing ${rawData.length} rows in ${totalBatches} batches of ${BATCH_SIZE}`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, rawData.length);
      const batch = rawData.slice(startIndex, endIndex);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (rows ${startIndex + 1}-${endIndex})`);
      
      // Process batch
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const globalRowIndex = startIndex + i;
      
      try {
        // Extract demographics
        const demographics = extractDemographics(row, config.columnMappings);
        
        // Build answers array
        const answers: any[] = [];
        for (const mapping of config.columnMappings) {
          if (mapping.includeInSurvey && row[mapping.originalName] !== undefined) {
            const questionId = questionIdMap.get(mapping.mappedName);
            if (questionId) {
                          let answerValue: string | string[] = String(row[mapping.originalName] || '').trim();
            
            // For multi-choice questions, handle comma-separated values
            if ((mapping.questionType === 'multiple-choice' || mapping.questionType === 'multi-choice') && answerValue.includes(',')) {
              answerValue = answerValue.split(',').map(v => v.trim());
            }
              
              answers.push({
                questionId: questionId,
                value: answerValue
              });
            }
          }
        }
        
        // Submit survey response with source tracking
        const responseData = {
          surveyId: surveyId,
          demographics: demographics,
          answers: answers,
          source: 'import'
        };
        
        const result = await SurveyRepo.submitSurveyResponse(
          responseData, 
          '127.0.0.1', // Default IP for imported responses
          'Survey Import Tool'
        );
        
        responsesCreated++;
        
        if (config.createDigitalTwins && result.agentToken && !result.isExistingTwin) {
          digitalTwinsCreated++;
        }
        
      } catch (rowError) {
          errors.push(`Row ${globalRowIndex + 1}: ${rowError.message}`);
        
        // Stop if too many errors
          if (errors.length > 50) {
            warnings.push(`Too many errors encountered. Stopped processing at row ${globalRowIndex + 1}.`);
          break;
        }
        }
      }
      
      // Stop processing if too many errors
      if (errors.length > 50) {
        break;
      }
      
      // Add a small delay between batches to prevent overwhelming the database
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // Add summary warnings
    if (errors.length > 0) {
      warnings.push(`${errors.length} rows failed to import.`);
    }
    
    if (rawData.length > responsesCreated) {
      warnings.push(`${rawData.length - responsesCreated} rows were skipped due to errors.`);
    }

    const result: ImportResult = {
      surveyId,
      responsesCreated,
      digitalTwinsCreated,
      errors: errors.slice(0, 20), // Limit error messages
      warnings
    };

    console.log(`Import completed: ${responsesCreated} responses created, ${digitalTwinsCreated} digital twins created`);

    return NextResponse.json({ 
      status: true, 
      result 
    });

  } catch (error) {
    console.error('Error in survey import execution:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during import execution' 
    }, { status: 500 });
  }
} 