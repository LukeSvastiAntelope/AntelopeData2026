import { NextRequest, NextResponse } from 'next/server';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

interface TargetedDataRequest {
  query: string;
  includeAllDemographics?: boolean;
}

interface QuestionCandidate {
  id: string;
  question_order: number;
  question_text: string;
  question_type: string;
  response_options: string[];
  variable_name: string;
  relevanceReason?: string;
}

interface TargetedDataResponse {
  query: string;
  analysisContext: {
    totalQuestionsAnalyzed: number;
    selectedQuestions: QuestionCandidate[];
    selectedDemographics: string[];
    reasoning: string;
    suggestedAnalysisType: string;
  };
  data: {
    columns: string[];
    rows: any[][];
    shape: [number, number];
    metadata: {
      totalResponses: number;
      selectedColumns: number;
      totalAvailableColumns: number;
      performanceGain: string;
    };
  };
  codebookMappings: Array<{
    variable: string;
    question: string;
    options: string[];
  }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userIdHeader = request.headers.get('x-user-id');
    
    console.log('🎯 Targeted Data API - Survey ID:', surveyId);
    console.log('🎯 Targeted Data API - User ID:', userIdHeader);

    if (!userIdHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = parseInt(userIdHeader);
    const surveyIdNum = parseInt(surveyId);

    // Parse request body
    const body: TargetedDataRequest = await request.json();
    const { query, includeAllDemographics = false } = body;

    console.log('🎯 Targeted Data Request:', {
      query: query.substring(0, 80) + '...',
      includeAllDemographics
    });

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
    console.log('🎯 Targeted Data - Survey found:', survey.title);

    // Step 1: Load ALL questions with complete content (the "codebook")
    const [questionRows] = await connection.execute<RowDataPacket[]>(`
      SELECT 
        q.id,
        q.question_order,
        q.prompt as question_text,
        q.type as question_type,
        q.options as response_options
      FROM survey_questions q
      WHERE q.survey_id = ?
      ORDER BY q.question_order
    `, [surveyIdNum]);

    console.log(`📚 Loaded complete codebook: ${questionRows.length} questions`);

    // Step 2: Parse all questions into analyzable format
    const allQuestions: QuestionCandidate[] = questionRows.map((row: any) => {
      const responseOptions = row.response_options ? 
        (typeof row.response_options === 'string' ? 
          JSON.parse(row.response_options) : 
          row.response_options) : 
        [];

      return {
        id: `Q${row.question_order}`,
        question_order: row.question_order,
        question_text: row.question_text,
        question_type: row.question_type,
        response_options: responseOptions,
        variable_name: `Q${row.question_order}`
      };
    });

    // Step 3: Use LLM to analyze ALL questions and select relevant ones
    const selectedQuestions = await analyzeQuestionsWithLLM(query, allQuestions);
    
    console.log(`🧠 LLM Analysis: Selected ${selectedQuestions.length} relevant questions from ${allQuestions.length} total`);

    // Step 4: Determine demographics to include
    const demographicColumns = includeAllDemographics ? 
      ['demo_age', 'demo_gender', 'demo_location', 'demo_education', 'demo_maritalStatus'] :
      ['demo_age', 'demo_gender']; // Always include basic demographics

    // Step 5: Build targeted data query
    const baseColumns = ['response_id', 'submitted_at'];
    const questionVariables = selectedQuestions.map(q => q.variable_name);
    const targetColumns = [...baseColumns, ...demographicColumns, ...questionVariables];

    console.log(`🎯 Target columns: ${targetColumns.length} (vs ${questionRows.length + baseColumns.length + 5} total available)`);

    // Step 6: Execute smart data query
    const questionSelectors = selectedQuestions.map(q => 
      `MAX(CASE WHEN q.question_order = ${q.question_order} THEN a.answer_value END) as \`${q.variable_name}\``
    ).join(',\n        ');

    const [dataRows] = await connection.execute<RowDataPacket[]>(`
      SELECT 
        sr.id as response_id,
        sr.submitted_at,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.age')) as demo_age,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.gender')) as demo_gender,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.location')) as demo_location,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.education')) as demo_education,
        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.maritalStatus')) as demo_maritalStatus,
        ${questionSelectors}
      FROM survey_responses sr
      JOIN survey_answers a ON sr.id = a.response_id
      JOIN survey_questions q ON a.question_id = q.id
      WHERE sr.survey_id = ?
      GROUP BY sr.id, sr.submitted_at, sr.demographics
      HAVING COUNT(DISTINCT q.id) >= 1
      LIMIT 10000
    `, [surveyIdNum]);

    console.log(`💾 Data loaded: ${dataRows.length} responses with ${targetColumns.length} columns`);

    // Step 7: Transform data for analysis
    const transformedRows = dataRows.map(row => 
      targetColumns.map(col => row[col])
    );

    // Step 8: Calculate performance metrics
    const totalAvailableColumns = questionRows.length + baseColumns.length + 5; // 5 demographic columns
    const performanceGain = `${Math.round((1 - targetColumns.length / totalAvailableColumns) * 100)}% reduction in data size`;

    // Step 9: Build codebook mappings
    const codebookMappings = selectedQuestions.map(q => ({
      variable: q.variable_name,
      question: q.question_text,
      options: q.response_options
    }));

    // Step 10: Generate reasoning and analysis type
    const reasoning = generateAnalysisReasoning(query, selectedQuestions);
    const suggestedAnalysisType = determineSuggestedAnalysisType(query, selectedQuestions);

    const response: TargetedDataResponse = {
      query,
      analysisContext: {
        totalQuestionsAnalyzed: allQuestions.length,
        selectedQuestions,
        selectedDemographics: demographicColumns,
        reasoning,
        suggestedAnalysisType
      },
      data: {
        columns: targetColumns,
        rows: transformedRows,
        shape: [transformedRows.length, targetColumns.length],
        metadata: {
          totalResponses: transformedRows.length,
          selectedColumns: targetColumns.length,
          totalAvailableColumns,
          performanceGain
        }
      },
      codebookMappings
    };

    console.log('🎯 Targeted Data API Success:', {
      query: query.substring(0, 50) + '...',
      dataShape: response.data.shape,
      performanceGain: response.data.metadata.performanceGain,
      selectedQuestions: selectedQuestions.length
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Targeted Data API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch targeted survey data', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Use LLM to analyze ALL questions and select only those relevant to the user's query
 * This is the core function that replaces keyword-based matching with semantic understanding
 */
async function analyzeQuestionsWithLLM(
  userQuery: string, 
  allQuestions: QuestionCandidate[]
): Promise<QuestionCandidate[]> {
  
  // Prepare the full codebook for LLM analysis
  const codebookForLLM = allQuestions.map(q => {
    const optionsText = q.response_options.length > 0 ? 
      `\nOptions: ${q.response_options.join(', ')}` : '';
    
    return `${q.variable_name}: ${q.question_text}${optionsText}`;
  }).join('\n\n');

  const prompt = `You are a survey research analyst. A user wants to analyze: "${userQuery}"

Here is the complete survey codebook with ALL ${allQuestions.length} questions:

${codebookForLLM}

Your task:
1. Read and understand what each question actually measures
2. Identify which questions could provide data to answer the user's query
3. Don't limit yourself to keyword matching - understand the semantic meaning
4. Include questions that might be indirectly relevant or provide important context

For example:
- If user asks about "education impact on healthcare", include questions about schooling/degrees AND questions about medical opinions/satisfaction
- If user asks about "age differences in voting", include age-related questions AND political preference questions
- Look at response options to understand what data each question provides

Respond with ONLY a JSON array of the relevant question variable names (like ["Q1", "Q5", "Q23"]).
Include ALL potentially relevant questions - don't artificially limit the count.
Better to include too many relevant questions than to miss important ones.

Relevant questions:`;

  try {
    // Make request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent, focused analysis
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const llmResponse = data.choices[0].message.content.trim();
    
    console.log('🧠 LLM Response:', llmResponse);

    // Parse the LLM response
    const selectedVariableNames: string[] = JSON.parse(llmResponse);
    
    // Map back to full question objects
    const selectedQuestions = allQuestions.filter(q => 
      selectedVariableNames.includes(q.variable_name)
    );

    // Add relevance reasons (could be enhanced further)
    selectedQuestions.forEach(q => {
      q.relevanceReason = `Selected by semantic analysis for query: "${userQuery}"`;
    });

    console.log(`🎯 LLM selected ${selectedQuestions.length} questions:`, 
      selectedQuestions.map(q => `${q.variable_name}: ${q.question_text.substring(0, 50)}...`));

    return selectedQuestions;

  } catch (error) {
    console.error('❌ LLM Analysis Error:', error);
    
    // Fallback: Use basic keyword matching if LLM fails
    console.log('⚠️ Falling back to keyword matching');
    return fallbackKeywordMatching(userQuery, allQuestions);
  }
}

/**
 * Fallback keyword matching if LLM analysis fails
 */
function fallbackKeywordMatching(query: string, allQuestions: QuestionCandidate[]): QuestionCandidate[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  
  const scoredQuestions = allQuestions.map(q => {
    const questionText = q.question_text.toLowerCase();
    const optionsText = q.response_options.join(' ').toLowerCase();
    const combinedText = `${questionText} ${optionsText}`;
    
    let score = 0;
    queryWords.forEach(word => {
      if (combinedText.includes(word)) {
        score += 1;
      }
    });
    
    return { question: q, score };
  });
  
  // Return questions with any keyword matches
  const relevantQuestions = scoredQuestions
    .filter(sq => sq.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(sq => ({
      ...sq.question,
      relevanceReason: `Keyword match (score: ${sq.score})`
    }));
  
  console.log(`🔤 Fallback selected ${relevantQuestions.length} questions`);
  return relevantQuestions;
}

/**
 * Generate human-readable reasoning for the question selection
 */
function generateAnalysisReasoning(query: string, selectedQuestions: QuestionCandidate[]): string {
  const questionSummaries = selectedQuestions.map(q => 
    `${q.variable_name}: ${q.question_text}`
  ).join('\n');
  
  return `Based on your query "${query}", I analyzed all ${selectedQuestions.length} relevant questions that could provide data to answer your research question. The selected questions cover the key concepts mentioned in your query and will provide the necessary data for comprehensive analysis.\n\nSelected Questions:\n${questionSummaries}`;
}

/**
 * Determine suggested analysis type based on query and selected questions
 */
function determineSuggestedAnalysisType(query: string, selectedQuestions: QuestionCandidate[]): string {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('correlat') || queryLower.includes('relationship') || queryLower.includes('impact')) {
    return 'correlation';
  }
  
  if (queryLower.includes('difference') || queryLower.includes('compare') || queryLower.includes('between')) {
    return 'comparison';
  }
  
  if (queryLower.includes('distribution') || queryLower.includes('breakdown') || queryLower.includes('how many')) {
    return 'distribution';
  }
  
  if (queryLower.includes('predict') || queryLower.includes('effect') || queryLower.includes('influence')) {
    return 'regression';
  }
  
  if (selectedQuestions.length >= 2) {
    return 'crosstab';
  }
  
  return 'descriptive';
}