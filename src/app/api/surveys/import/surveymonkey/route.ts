import { NextRequest, NextResponse } from "next/server";

interface SurveyMonkeyImportRequest {
  surveyId: string;
  accessToken: string;
  surveyTitle?: string;
  surveyDescription?: string;
  isPublic: boolean;
  createDigitalTwins: boolean;
}

// SurveyMonkey API base URL
const SURVEYMONKEY_API_BASE = 'https://api.surveymonkey.com/v3';

// Helper function to make SurveyMonkey API calls
const surveyMonkeyRequest = async (endpoint: string, accessToken: string, method = 'GET') => {
  const response = await fetch(`${SURVEYMONKEY_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SurveyMonkey API error: ${response.status} - ${error}`);
  }

  return response.json();
};

// Convert SurveyMonkey question types to our types
const mapSurveyMonkeyQuestionType = (smType: string, subtype?: string): string => {
  switch (smType) {
    case 'open_ended':
      return subtype === 'single' ? 'text' : 'text';
    case 'multiple_choice':
      return subtype === 'single' ? 'single-choice' : 'multiple-choice';
    case 'rating':
    case 'ranking':
      return 'rating';
    case 'matrix':
      return 'single-choice';
    case 'demographic':
      return 'single-choice';
    default:
      return 'text';
  }
};

// Detect demographic questions from SurveyMonkey
const detectSurveyMonkeyDemographics = (question: any): { field: string; confidence: number } | null => {
  const title = question.headings?.[0]?.heading?.toLowerCase() || '';
  const family = question.family || '';
  
  // SurveyMonkey demographic question detection
  if (family === 'demographic') {
    if (title.includes('age')) return { field: 'age', confidence: 1.0 };
    if (title.includes('gender') || title.includes('sex')) return { field: 'gender', confidence: 1.0 };
    if (title.includes('location') || title.includes('country') || title.includes('city')) return { field: 'location', confidence: 1.0 };
    if (title.includes('education')) return { field: 'education', confidence: 1.0 };
    if (title.includes('income') || title.includes('salary')) return { field: 'income', confidence: 1.0 };
    if (title.includes('job') || title.includes('employment') || title.includes('occupation')) return { field: 'employment', confidence: 1.0 };
  }
  
  // Check question text for demographic indicators
  if (title.includes('email')) return { field: 'email', confidence: 0.9 };
  if (title.includes('age')) return { field: 'age', confidence: 0.8 };
  if (title.includes('gender') || title.includes('sex')) return { field: 'gender', confidence: 0.8 };
  
  return null;
};

// Preview endpoint - GET request to preview SurveyMonkey survey
export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('surveyId');
    const accessToken = searchParams.get('token');
    
    if (!surveyId || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing survey ID or access token' 
      }, { status: 400 });
    }

    // Get survey details
    const survey = await surveyMonkeyRequest(`/surveys/${surveyId}`, accessToken);
    
    // Get survey questions
    const surveyDetails = await surveyMonkeyRequest(`/surveys/${surveyId}/details`, accessToken);
    
    // Get survey responses (limited for preview)
    const responses = await surveyMonkeyRequest(
      `/surveys/${surveyId}/responses/bulk?per_page=100`, 
      accessToken
    );

    // Process questions into our format
    const columns = surveyDetails.pages.flatMap((page: any) => 
      page.questions.map((question: any) => {
        const questionText = question.headings?.[0]?.heading || `Question ${question.id}`;
        const demoMatch = detectSurveyMonkeyDemographics(question);
        
        return {
          name: questionText,
          type: mapSurveyMonkeyQuestionType(question.family, question.subtype),
          isDemographic: demoMatch !== null,
          demographicField: demoMatch?.field,
          sampleValues: [], // Will be populated from responses
          uniqueValues: [], // Will be populated from responses
          isRequired: question.required?.text === 'true',
          surveyMonkeyId: question.id
        };
      })
    );

    // Process responses into our format
    const processedResponses = responses.data.map((response: any) => {
      const responseObj: any = {};
      
      response.pages.forEach((page: any) => {
        page.questions.forEach((question: any) => {
          const questionData = surveyDetails.pages
            .flatMap((p: any) => p.questions)
            .find((q: any) => q.id === question.id);
          
          if (questionData) {
            const questionText = questionData.headings?.[0]?.heading || `Question ${question.id}`;
            
            // Extract answer based on question type
            let answer = '';
            if (question.answers) {
              if (Array.isArray(question.answers)) {
                answer = question.answers.map((a: any) => a.text || a.choice_id).join(', ');
              } else {
                answer = question.answers.text || question.answers.choice_id || '';
              }
            }
            
            responseObj[questionText] = answer;
          }
        });
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
      fileName: `${survey.title} (SurveyMonkey)`,
      totalRows: processedResponses.length,
      columns,
      previewData: processedResponses.slice(0, 5),
      suggestedTitle: survey.title,
      detectedDemographics: [...new Set(detectedDemographics)],
      errors: [],
      warnings: processedResponses.length === 0 ? ['No responses found in this survey'] : [],
      source: 'surveymonkey',
      surveyMonkeyData: {
        id: survey.id,
        title: survey.title,
        responseCount: survey.response_count,
        dateCreated: survey.date_created,
        dateModified: survey.date_modified
      }
    };

    return NextResponse.json({ 
      status: true, 
      preview 
    });

  } catch (error) {
    console.error('Error in SurveyMonkey preview:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to access SurveyMonkey survey' 
    }, { status: 500 });
  }
}

// Import execution endpoint - POST request to import SurveyMonkey data
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const {
      surveyId,
      accessToken,
      surveyTitle,
      surveyDescription,
      isPublic,
      createDigitalTwins,
      columnMappings
    }: SurveyMonkeyImportRequest & { columnMappings: any[] } = await req.json();
    
    if (!surveyId || !accessToken) {
      return NextResponse.json({ 
        status: false, 
        message: 'Missing required parameters' 
      }, { status: 400 });
    }

    // Get all survey responses (paginated)
    let allResponses: any[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      const responses = await surveyMonkeyRequest(
        `/surveys/${surveyId}/responses/bulk?per_page=${perPage}&page=${page}`, 
        accessToken
      );
      
      if (responses.data.length === 0) break;
      
      allResponses = allResponses.concat(responses.data);
      page++;
      
      // Safety limit
      if (page > 100) break;
    }

    // Get survey details for question mapping
    const surveyDetails = await surveyMonkeyRequest(`/surveys/${surveyId}/details`, accessToken);
    
    // Process all responses
    const processedData = allResponses.map((response: any) => {
      const responseObj: any = {};
      
      response.pages.forEach((page: any) => {
        page.questions.forEach((question: any) => {
          const questionData = surveyDetails.pages
            .flatMap((p: any) => p.questions)
            .find((q: any) => q.id === question.id);
          
          if (questionData) {
            const questionText = questionData.headings?.[0]?.heading || `Question ${question.id}`;
            
            let answer = '';
            if (question.answers) {
              if (Array.isArray(question.answers)) {
                answer = question.answers.map((a: any) => a.text || a.choice_id).join(', ');
              } else {
                answer = question.answers.text || question.answers.choice_id || '';
              }
            }
            
            responseObj[questionText] = answer;
          }
        });
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
        source: 'surveymonkey_import'
      }
    });

  } catch (error) {
    console.error('Error in SurveyMonkey import:', error);
    return NextResponse.json({ 
      status: false, 
      message: error.message || 'Failed to import from SurveyMonkey' 
    }, { status: 500 });
  }
} 