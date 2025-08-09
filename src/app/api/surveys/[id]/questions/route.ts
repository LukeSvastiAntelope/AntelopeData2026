import { NextRequest, NextResponse } from 'next/server';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

interface QuestionSchema {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'scale' | 'text' | 'demographic' | 'yes_no' | 'other';
  category: 'demographic' | 'attitude' | 'behavior' | 'opinion' | 'factual' | 'other';
  response_options: string[];
  variable_name: string;
  analysis_tags: string[];
  is_demographic: boolean;
  semantic_keywords: string[];
}

interface SurveyQuestionsResponse {
  surveyId: string;
  surveyTitle: string;
  totalQuestions: number;
  questions: QuestionSchema[];
  demographics: QuestionSchema[];
  analysisCategories: {
    [category: string]: QuestionSchema[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userIdHeader = request.headers.get('x-user-id');
    
    console.log('🔍 Questions API Debug - Survey ID:', surveyId);
    console.log('🔍 Questions API Debug - User ID:', userIdHeader);

    if (!userIdHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = parseInt(userIdHeader);
    const surveyIdNum = parseInt(surveyId);

    const connection = await getMySQLConnection();

    // Verify survey access
    const [surveyRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id, title FROM surveys WHERE id = ? AND created_by = ?',
      [surveyIdNum, userId]
    );

    if (surveyRows.length === 0) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 });
    }

    const survey = surveyRows[0];
    console.log('🔍 Questions API Debug - Survey found:', survey);

    // Get all questions with enhanced metadata
    const [questionRows] = await connection.execute<RowDataPacket[]>(`
      SELECT 
        q.id,
        q.question_order,
        q.prompt as question_text,
        q.type as question_type,
        q.options as response_options,
        0 as is_demographic
      FROM survey_questions q
      WHERE q.survey_id = ?
      ORDER BY q.question_order
    `, [surveyIdNum]);

    console.log('🔍 Questions API Debug - Question rows found:', questionRows.length);

    // Process questions into enhanced schema
    const questions: QuestionSchema[] = questionRows.map((row: any) => {
      const responseOptions = row.response_options ? 
        (typeof row.response_options === 'string' ? 
          JSON.parse(row.response_options) : 
          row.response_options) : 
        [];

      // Determine question type and category
      const questionType = determineQuestionType(row.question_type, responseOptions);
      const category = determineQuestionCategory(row.question_text, row.is_demographic);
      
      // Generate semantic keywords for matching
      const semanticKeywords = generateSemanticKeywords(row.question_text, responseOptions);
      
      // Generate analysis tags
      const analysisTags = generateAnalysisTags(row.question_text, questionType, category);

      return {
        id: `Q${row.question_order}`,
        question_text: row.question_text,
        question_type: questionType,
        category: category,
        response_options: responseOptions,
        variable_name: `Q${row.question_order}`,
        analysis_tags: analysisTags,
        is_demographic: Boolean(row.is_demographic),
        semantic_keywords: semanticKeywords
      };
    });

    // Separate demographics from other questions
    const demographics = questions.filter(q => q.is_demographic);
    const nonDemographics = questions.filter(q => !q.is_demographic);

    // Group questions by analysis category
    const analysisCategories = questions.reduce((acc, question) => {
      if (!acc[question.category]) {
        acc[question.category] = [];
      }
      acc[question.category].push(question);
      return acc;
    }, {} as { [category: string]: QuestionSchema[] });

    const response: SurveyQuestionsResponse = {
      surveyId: surveyId,
      surveyTitle: survey.title,
      totalQuestions: questions.length,
      questions: nonDemographics,
      demographics: demographics,
      analysisCategories: analysisCategories
    };

    console.log('🔍 Questions API Debug - Response summary:', {
      totalQuestions: response.totalQuestions,
      demographics: response.demographics.length,
      categories: Object.keys(response.analysisCategories)
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Questions API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey questions', details: error.message },
      { status: 500 }
    );
  }
}

// Helper functions for question analysis
function determineQuestionType(
  rawType: string, 
  responseOptions: string[]
): QuestionSchema['question_type'] {
  if (responseOptions.length === 2 && 
      responseOptions.some(opt => opt.toLowerCase().includes('yes')) &&
      responseOptions.some(opt => opt.toLowerCase().includes('no'))) {
    return 'yes_no';
  }
  
  if (responseOptions.length >= 3 && responseOptions.length <= 10) {
    // Check if it's a scale (numeric or ordered)
    const isScale = responseOptions.every(opt => 
      /^\d+$/.test(opt) || 
      /^(strongly|somewhat|neither|agree|disagree|very|not)/i.test(opt) ||
      /^(never|rarely|sometimes|often|always)/i.test(opt)
    );
    
    if (isScale) return 'scale';
    return 'multiple_choice';
  }
  
  if (responseOptions.length === 0 || responseOptions.length > 15) {
    return 'text';
  }
  
  return 'other';
}

function determineQuestionCategory(
  questionText: string, 
  isDemographic: boolean
): QuestionSchema['category'] {
  if (isDemographic) return 'demographic';
  
  const text = questionText.toLowerCase();
  
  // Attitude/Opinion indicators
  if (/\b(think|feel|believe|opinion|agree|disagree|satisfied|rate|how much)\b/.test(text)) {
    return 'attitude';
  }
  
  // Behavior indicators
  if (/\b(do you|have you|frequency|often|usually|typically|use|visit|participate)\b/.test(text)) {
    return 'behavior';
  }
  
  // Factual indicators
  if (/\b(when|where|what|which|how many|income|education|year|date)\b/.test(text)) {
    return 'factual';
  }
  
  return 'opinion';
}

function generateSemanticKeywords(questionText: string, responseOptions: string[]): string[] {
  const keywords = new Set<string>();
  
  // Extract key terms from question text
  const questionWords = questionText.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !isStopWord(word));
  
  questionWords.forEach(word => keywords.add(word));
  
  // Add response option keywords
  responseOptions.forEach(option => {
    const optionWords = option.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !isStopWord(word));
    
    optionWords.forEach(word => keywords.add(word));
  });
  
  // Add conceptual keywords based on question patterns
  const conceptualKeywords = extractConceptualKeywords(questionText);
  conceptualKeywords.forEach(keyword => keywords.add(keyword));
  
  return Array.from(keywords);
}

function generateAnalysisTags(
  questionText: string, 
  questionType: string, 
  category: string
): string[] {
  const tags = new Set<string>();
  
  // Add type and category as base tags
  tags.add(questionType);
  tags.add(category);
  
  const text = questionText.toLowerCase();
  
  // Add domain-specific tags
  if (/\b(gender|age|income|education|race|ethnicity)\b/.test(text)) {
    tags.add('demographic_analysis');
  }
  
  if (/\b(satisfaction|rating|quality|performance)\b/.test(text)) {
    tags.add('satisfaction_analysis');
  }
  
  if (/\b(frequency|often|usually|always|never)\b/.test(text)) {
    tags.add('frequency_analysis');
  }
  
  if (/\b(compare|difference|between|versus|vs)\b/.test(text)) {
    tags.add('comparison_analysis');
  }
  
  if (/\b(correlation|relationship|association|related)\b/.test(text)) {
    tags.add('correlation_analysis');
  }
  
  return Array.from(tags);
}

function extractConceptualKeywords(questionText: string): string[] {
  const keywords: string[] = [];
  const text = questionText.toLowerCase();
  
  // Transportation concepts
  if (/\b(drive|driving|car|vehicle|transport|travel|commute)\b/.test(text)) {
    keywords.push('transportation', 'mobility', 'commuting');
  }
  
  // Safety concepts
  if (/\b(safe|safety|secure|danger|risk|concern)\b/.test(text)) {
    keywords.push('safety', 'security', 'risk');
  }
  
  // Experience concepts
  if (/\b(experience|skilled|expert|comfortable|confident)\b/.test(text)) {
    keywords.push('experience', 'skill_level', 'competence');
  }
  
  // Geographic concepts
  if (/\b(city|urban|rural|location|area|region|country)\b/.test(text)) {
    keywords.push('geography', 'location', 'regional');
  }
  
  return keywords;
}

function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'out', 'off', 'down', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very', 'can',
    'will', 'just', 'should', 'now', 'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'having', 'this', 'that', 'these', 'those'
  ]);
  
  return stopWords.has(word.toLowerCase());
}