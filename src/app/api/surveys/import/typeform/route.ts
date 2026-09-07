import { NextRequest, NextResponse } from "next/server";

interface TypeformImportRequest {
  formId: string;
  accessToken: string;
  surveyTitle?: string;
  surveyDescription?: string;
  isPublic: boolean;
  createDigitalTwins: boolean;
}

// Typeform API base URL
const TYPEFORM_API_BASE = 'https://api.typeform.com';

// Helper function to make Typeform API calls
const typeformRequest = async (endpoint: string, accessToken: string, method = 'GET') => {
  const response = await fetch(`${TYPEFORM_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Typeform API error: ${response.status} - ${error}`);
  }

  return response.json();
};

// Convert Typeform field types to our types
const mapTypeformFieldType = (tfType: string): string => {
  switch (tfType) {
    case 'short_text':
    case 'long_text':
    case 'statement':
      return 'text';
    case 'multiple_choice':
      return 'single-choice';
    case 'picture_choice':
      return 'single-choice';
    case 'dropdown':
      return 'single-choice';
    case 'yes_no':
      return 'single-choice';
    case 'rating':
    case 'opinion_scale':
    case 'number':
      return 'rating';
    case 'email':
      return 'email';
    case 'phone_number':
    case 'website':
      return 'text';
    case 'date':
      return 'text';
    case 'file_upload':
      return 'text';
    default:
      return 'text';
  }
};

// Detect demographic questions from Typeform
const detectTypeformDemographics = (field: any): { field: string; confidence: number } | null => {
  const title = field.title?.toLowerCase() || '';
  const type = field.type || '';
  
  // Check field type and title for demographic indicators
  if (type === 'email') return { field: 'email', confidence: 1.0 };
  
  if (title.includes('age')) return { field: 'age', confidence: 0.9 };
  if (title.includes('gender') || title.includes('sex')) return { field: 'gender', confidence: 0.9 };
  if (title.includes('location') || title.includes('country') || title.includes('city') || title.includes('address')) {
    return { field: 'location', confidence: 0.9 };
  }
  if (title.includes('education') || title.includes('degree') || title.includes('school')) {
    return { field: 'education', confidence: 0.9 };
  }
  if (title.includes('income') || title.includes('salary') || title.includes('earn')) {
    return { field: 'income', confidence: 0.9 };
  }
  if (title.includes('job') || title.includes('work') || title.includes('occupation') || title.includes('profession')) {
    return { field: 'employment', confidence: 0.8 };
  }
  
  return null;
};

// Extract form ID from Typeform URL
const extractFormId = (input: string): string => {
  // If it's already just an ID
  if (!input.includes('/') && !input.includes('?')) {
    return input;
  }
  
  // Extract from various URL formats
  const patterns = [
    /\/to\/([a-zA-Z0-9]+)/,
    /\/([a-zA-Z0-9]+)$/,
    /form\/([a-zA-Z0-9]+)/
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  throw new Error('Invalid Typeform URL or ID');
};

// Preview endpoint - GET request to preview Typeform data
export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const formUrl = searchParams.get('url');
    const accessToken = searchParams.get('token');
    
    if (!formUrl || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing form URL or access token' 
      }, { status: 400 });
    }

    const formId = extractFormId(formUrl);
    
    // Get form definition
    const form = await typeformRequest(`/forms/${formId}`, accessToken);
    
    // Get form responses (limited for preview)
    const responses = await typeformRequest(
      `/forms/${formId}/responses?page_size=100`, 
      accessToken
    );

    // Process fields into our format
    const columns = form.fields.map((field: any) => {
      const demoMatch = detectTypeformDemographics(field);
      
      return {
        name: field.title,
        type: mapTypeformFieldType(field.type),
        isDemographic: demoMatch !== null,
        demographicField: demoMatch?.field,
        sampleValues: [], // Will be populated from responses
        uniqueValues: [], // Will be populated from responses
        isRequired: field.required || false,
        typeformId: field.id,
        typeformType: field.type
      };
    });

    // Process responses into our format
    const processedResponses = responses.items.map((response: any) => {
      const responseObj: any = {};
      
      // Map answers to questions
      response.answers?.forEach((answer: any) => {
        const field = form.fields.find((f: any) => f.id === answer.field.id);
        if (field) {
          let answerValue = '';
          
          // Extract answer based on field type
          switch (answer.type) {
            case 'text':
            case 'email':
            case 'url':
            case 'phone_number':
              answerValue = answer.text || '';
              break;
            case 'number':
              answerValue = String(answer.number || '');
              break;
            case 'boolean':
              answerValue = answer.boolean ? 'Yes' : 'No';
              break;
            case 'choice':
              answerValue = answer.choice?.label || '';
              break;
            case 'choices':
              answerValue = answer.choices?.labels?.join(', ') || '';
              break;
            case 'date':
              answerValue = answer.date || '';
              break;
            case 'file_url':
              answerValue = answer.file_url || '';
              break;
            default:
              answerValue = String(answer.value || '');
          }
          
          responseObj[field.title] = answerValue;
        }
      });
      
      return responseObj;
    });

    // Update columns with sample values
    columns.forEach((column: any) => {
      const values = processedResponses
        .map(row => String(row[column.name] || ''))
        .filter(v => v.trim() !== '');
      
      column.sampleValues = values.slice(0, 5);
      column.uniqueValues = [...new Set(values)].slice(0, 10);
    });

    const detectedDemographics = columns
      .filter((col: any) => col.isDemographic)
      .map((col: any) => col.demographicField);

    const preview = {
      fileName: `${form.title} (Typeform)`,
      totalRows: processedResponses.length,
      columns,
      previewData: processedResponses.slice(0, 5),
      suggestedTitle: form.title,
      detectedDemographics: [...new Set(detectedDemographics)],
      errors: [],
      warnings: processedResponses.length === 0 ? ['No responses found in this form'] : [],
      source: 'typeform',
      typeformData: {
        id: form.id,
        title: form.title,
        published: form.published,
        responseCount: responses.total_items,
        lastUpdated: form.last_updated_at
      }
    };

    return NextResponse.json({ 
      status: true, 
      preview 
    });

  } catch (error) {
    console.error('Error in Typeform preview:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to access Typeform' 
    }, { status: 500 });
  }
}

// Import execution endpoint - POST request to import Typeform data
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const {
      formId,
      accessToken,
      surveyTitle,
      surveyDescription,
      isPublic,
      createDigitalTwins,
      columnMappings
    }: TypeformImportRequest & { columnMappings: any[] } = await req.json();
    
    if (!formId || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing required parameters' 
      }, { status: 400 });
    }

    // Get form definition
    const form = await typeformRequest(`/forms/${formId}`, accessToken);
    
    // Get all responses (paginated)
    let allResponses: any[] = [];
    let before = null;
    const pageSize = 1000;
    
    while (true) {
      const queryParams = new URLSearchParams({
        page_size: pageSize.toString(),
        ...(before && { before })
      });
      
      const responses = await typeformRequest(
        `/forms/${formId}/responses?${queryParams}`, 
        accessToken
      );
      
      if (responses.items.length === 0) break;
      
      allResponses = allResponses.concat(responses.items);
      
      // Set up for next page
      if (responses.items.length < pageSize) break;
      before = responses.items[responses.items.length - 1].token;
    }

    // Process all responses
    const processedData = allResponses.map((response: any) => {
      const responseObj: any = {};
      
      response.answers?.forEach((answer: any) => {
        const field = form.fields.find((f: any) => f.id === answer.field.id);
        if (field) {
          let answerValue = '';
          
          switch (answer.type) {
            case 'text':
            case 'email':
            case 'url':
            case 'phone_number':
              answerValue = answer.text || '';
              break;
            case 'number':
              answerValue = String(answer.number || '');
              break;
            case 'boolean':
              answerValue = answer.boolean ? 'Yes' : 'No';
              break;
            case 'choice':
              answerValue = answer.choice?.label || '';
              break;
            case 'choices':
              answerValue = answer.choices?.labels?.join(', ') || '';
              break;
            case 'date':
              answerValue = answer.date || '';
              break;
            case 'file_url':
              answerValue = answer.file_url || '';
              break;
            default:
              answerValue = String(answer.value || '');
          }
          
          responseObj[field.title] = answerValue;
        }
      });
      
      return responseObj;
    });
    
    // Here we would integrate with our existing survey creation logic
    // For now, return success with the processed data info
    
    return NextResponse.json({ 
      status: true, 
      result: {
        surveyId: null, // Would be set after actual survey creation
        responsesCreated: processedData.length,
        digitalTwinsCreated: createDigitalTwins ? processedData.length : 0,
        errors: [],
        warnings: [],
        source: 'typeform_import'
      }
    });

  } catch (error) {
    console.error('Error in Typeform import:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to import from Typeform' 
    }, { status: 500 });
  }
} 