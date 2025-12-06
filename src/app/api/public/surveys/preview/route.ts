import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';
// Increase body size limit for file uploads (50MB)
export const maxDuration = 300; // 5 minutes for large file processing
export const runtime = 'nodejs';

// Demographic field patterns for detection
const DEMOGRAPHIC_PATTERNS = {
  age: /^(age|years?_old|birth_year|dob|date_of_birth)$/i,
  gender: /^(gender|sex|male_female)$/i,
  location: /^(location|city|state|country|region|address|zip|postal)$/i,
  income: /^(income|salary|earnings|household_income)$/i,
  education: /^(education|degree|school|university|college)$/i,
  occupation: /^(occupation|job|work|profession|employment|career)$/i,
  ethnicity: /^(ethnicity|race|ethnic|background)$/i,
  marital: /^(marital|married|relationship|spouse)$/i
};

// Question type detection patterns
const QUESTION_TYPE_PATTERNS = {
  scale: /^(rate|rating|scale|score|satisfaction|likely|agree|disagree|\d+\s*-\s*\d+)/i,
  yesno: /^(yes|no|y\/n|true|false|boolean)/i,
  multiple: /^(select|choose|pick|option|which|what)/i,
  text: /^(comment|feedback|describe|explain|why|how|other|text)/i
};

function detectQuestionType(columnName: string, sampleValues: any[]): string {
  const name = columnName.toLowerCase();
  
  // Check for scale questions
  if (QUESTION_TYPE_PATTERNS.scale.test(name)) return 'scale';
  
  // Check for yes/no questions
  if (QUESTION_TYPE_PATTERNS.yesno.test(name)) return 'yesno';
  
  // Check sample values for patterns
  const uniqueValues = [...new Set(sampleValues.filter(v => v != null && v !== ''))];
  
  if (uniqueValues.length <= 2 && uniqueValues.some(v => 
    String(v).toLowerCase().match(/^(yes|no|y|n|true|false|1|0)$/))) {
    return 'yesno';
  }
  
  if (uniqueValues.length <= 10 && uniqueValues.every(v => 
    typeof v === 'number' || !isNaN(Number(v)))) {
    return 'scale';
  }
  
  if (uniqueValues.length <= 15) return 'multiple';
  
  return 'text';
}

function detectDemographicField(columnName: string): string | null {
  const name = columnName.toLowerCase();
  
  for (const [field, pattern] of Object.entries(DEMOGRAPHIC_PATTERNS)) {
    if (pattern.test(name)) return field;
  }
  
  return null;
}

function generateSuggestedTitle(fileName: string, columns: any[]): string {
  // Remove file extension
  const baseName = fileName.replace(/\.(csv|xlsx?|xls)$/i, '');
  
  // Clean up the name
  const cleanName = baseName
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
  
  // If it looks like a generic name, try to infer from columns
  if (cleanName.match(/^(data|survey|responses?|export|file\d*)$/i)) {
    const questionColumns = columns.filter(col => !col.isDemographic);
    if (questionColumns.length > 0) {
      const firstQuestion = questionColumns[0].name;
      const topic = firstQuestion.split(/[\s_-]/)[0];
      return `${topic} Survey`;
    }
  }
  
  return cleanName.includes('Survey') ? cleanName : `${cleanName} Survey`;
}

async function parseFile(file: File): Promise<any[]> {
  const buffer = await file.arrayBuffer();
  
  if (file.name.endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data;
  } else if (file.name.match(/\.(xlsx?|xls)$/i)) {
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  } else {
    throw new Error('Unsupported file format');
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ status: false, message: 'No file provided' });
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ status: false, message: 'File size exceeds 10MB limit' });
    }
    
    // Validate file type
    if (!file.name.match(/\.(csv|xlsx?|xls)$/i)) {
      return NextResponse.json({ status: false, message: 'Unsupported file format. Please upload CSV or Excel files.' });
    }
    
    console.log('Processing file:', file.name, 'size:', file.size);
    
    // Parse the file
    const data = await parseFile(file);
    
    if (!data || data.length === 0) {
      return NextResponse.json({ status: false, message: 'File appears to be empty or invalid' });
    }
    
    // Analyze the data structure
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);
    
    if (columnNames.length === 0) {
      return NextResponse.json({ status: false, message: 'No columns found in the file' });
    }
    
    // Analyze each column
    const columns = columnNames.map(name => {
      const sampleValues = data.slice(0, 100).map(row => row[name]);
      const demographicField = detectDemographicField(name);
      const questionType = detectQuestionType(name, sampleValues);
      
      return {
        name,
        label: name.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: questionType,
        isDemographic: !!demographicField,
        demographicField,
        isRequired: false,
        sampleValues: sampleValues.slice(0, 5).filter(v => v != null && v !== '')
      };
    });
    
    // Detect demographic fields
    const detectedDemographics = columns
      .filter(col => col.isDemographic)
      .map(col => col.demographicField);
    
    // Generate suggested title
    const suggestedTitle = generateSuggestedTitle(file.name, columns);
    
    const preview = {
      fileName: file.name,
      suggestedTitle,
      totalRows: data.length,
      columns,
      detectedDemographics: [...new Set(detectedDemographics)],
      sampleData: data.slice(0, 3) // First 3 rows for preview
    };
    
    console.log('Analysis complete:', {
      rows: data.length,
      columns: columns.length,
      demographics: detectedDemographics.length
    });
    
    return NextResponse.json({ 
      status: true, 
      preview,
      message: 'File analyzed successfully'
    });
    
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json({ 
      status: false, 
      message: error instanceof Error ? error.message : 'Failed to process file'
    });
  }
} 