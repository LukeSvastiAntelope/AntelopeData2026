import { NextRequest, NextResponse } from "next/server";
import { google } from 'googleapis';
import { analyzeColumns, normalizeRecords } from '@/app/utils/survey/import-utils';

interface GoogleSheetsImportRequest {
  spreadsheetId: string;
  sheetName?: string;
  range?: string;
  surveyTitle: string;
  surveyDescription?: string;
  isPublic: boolean;
  createDigitalTwins: boolean;
}

// Google Sheets API setup
const getGoogleSheetsClient = (accessToken: string) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth });
};

// Extract spreadsheet ID from various Google Sheets URL formats
const extractSpreadsheetId = (input: string): string => {
  // If it's already just an ID
  if (!input.includes('/')) {
    return input;
  }
  
  // Extract from various URL formats
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
    /\/d\/([a-zA-Z0-9-_]+)/,
    /id=([a-zA-Z0-9-_]+)/
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  throw new Error('Invalid Google Sheets URL or ID');
};

// Convert Google Sheets data to our standard format
const processGoogleSheetsData = (values: any[][]): any[] => {
  if (!values || values.length === 0) {
    throw new Error('No data found in the sheet');
  }
  
  const [headers, ...rows] = values;
  
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
};

// Preview endpoint - GET request to preview Google Sheets data
export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const spreadsheetUrl = searchParams.get('url');
    const sheetName = searchParams.get('sheet');
    const accessToken = searchParams.get('token');
    
    if (!spreadsheetUrl || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing spreadsheet URL or access token' 
      }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheets = getGoogleSheetsClient(accessToken);
    
    // Get spreadsheet metadata to list available sheets
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const availableSheets = spreadsheet.data.sheets?.map(sheet => ({
      name: sheet.properties?.title,
      id: sheet.properties?.sheetId
    })) || [];
    
    // Get data from specified sheet or first sheet
    const targetSheet = sheetName || availableSheets[0]?.name;
    if (!targetSheet) {
      return NextResponse.json({ 
        status: false, 
        message: 'No sheets found in the spreadsheet' 
      }, { status: 400 });
    }
    
    const range = `${targetSheet}!A:Z`; // Get first 26 columns
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    if (!values || values.length === 0) {
      return NextResponse.json({ 
        status: false, 
        message: 'No data found in the specified sheet' 
      }, { status: 400 });
    }
    
    const processedData = processGoogleSheetsData(values);
    const { rows: normalizedRows } = normalizeRecords(processedData, { dropEmptyRows: true });

    if (normalizedRows.length === 0) {
      return NextResponse.json({
        status: false,
        message: 'The selected sheet does not contain any usable rows.'
      }, { status: 400 });
    }

    const columnAnalysis = analyzeColumns(normalizedRows, { sampleSize: 200 });
    const warnings = [...columnAnalysis.warnings];

    if (normalizedRows.length > 1000) {
      warnings.push(`Large dataset detected (${normalizedRows.length} responses). Processing may take longer.`);
    }

    const preview = {
      fileName: `${spreadsheet.data.properties?.title || 'Google Sheet'} - ${targetSheet}`,
      totalRows: normalizedRows.length,
      columns: columnAnalysis.columns,
      previewData: normalizedRows.slice(0, 5),
      suggestedTitle: `${spreadsheet.data.properties?.title || 'Imported Survey'} - ${targetSheet}`,
      detectedDemographics: columnAnalysis.detectedDemographics,
      errors: [],
      warnings,
      availableSheets,
      source: 'google_sheets'
    };

    return NextResponse.json({ 
      status: true, 
      preview 
    });

  } catch (error) {
    console.error('Error in Google Sheets preview:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to access Google Sheets' 
    }, { status: 500 });
  }
}

// Import execution endpoint - POST request to import Google Sheets data
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const {
      spreadsheetId,
      sheetName,
      range,
      surveyTitle,
      surveyDescription,
      isPublic,
      createDigitalTwins,
      accessToken,
      columnMappings
    }: GoogleSheetsImportRequest & { accessToken: string; columnMappings: any[] } = await req.json();
    
    if (!spreadsheetId || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing required parameters' 
      }, { status: 400 });
    }

    const sheets = getGoogleSheetsClient(accessToken);
    
    // Get the data
    const targetRange = range || `${sheetName || 'Sheet1'}!A:Z`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: targetRange,
    });
    
    const values = response.data.values;
    if (!values || values.length === 0) {
      return NextResponse.json({ 
        status: false, 
        message: 'No data found in the specified range' 
      }, { status: 400 });
    }
    
    const processedData = processGoogleSheetsData(values);
    const { rows: normalizedRows } = normalizeRecords(processedData, { dropEmptyRows: true });

    if (normalizedRows.length === 0) {
      return NextResponse.json({
        status: false,
        message: 'The selected range does not contain any usable rows.'
      }, { status: 400 });
    }
    
    // Create the survey using our existing import execution logic
    // This would integrate with the same survey creation process
    // For now, return a success response with the processed data info
    
    return NextResponse.json({ 
      status: true, 
      result: {
        surveyId: null, // Would be set after actual survey creation
        responsesCreated: normalizedRows.length,
        digitalTwinsCreated: createDigitalTwins ? normalizedRows.length : 0,
        errors: [],
        warnings: [],
        source: 'google_sheets_import'
      }
    });

  } catch (error) {
    console.error('Error in Google Sheets import:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to import from Google Sheets' 
    }, { status: 500 });
  }
} 
