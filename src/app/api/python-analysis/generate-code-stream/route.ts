import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createStreamingCompletion } from '@/app/utils/services/ai-service';
import { formatDatasetGrainForPrompt } from '@/app/utils/services/dataset-grain';

interface CodeGenerationRequest {
  query: string;
  dataSchema: {
    columns: string[];
    types: Record<string, string>;
    sampleData: any[];
    rowCount?: number;
    codebookMappings?: Record<string, any>;
  };
  analysisHistory: Array<{
    code: string;
    output: string;
    timestamp: string;
    question?: string;
  }>;
  analysisType?: 'statistical' | 'exploratory' | 'visualization' | 'auto';
  model?: string;
  analyticsContextPrompt?: string;
}

function selectModel(analysisType: string, complexity: string, dataSize: number): string {
  if (analysisType === 'quick-query' || dataSize < 1000) {
    return 'gpt-4o-mini';
  }
  return 'gpt-4o';
}

function classifyAnalysisType(query: string, dataSchema: any): {
  type: string;
  complexity: string;
} {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('correlation') || queryLower.includes('regression') || 
      queryLower.includes('significance') || queryLower.includes('p-value') ||
      queryLower.includes('hypothesis') || queryLower.includes('statistical')) {
    return { type: 'statistical', complexity: 'medium' };
  }
  
  if (queryLower.includes('plot') || queryLower.includes('chart') || 
      queryLower.includes('graph') || queryLower.includes('visualiz')) {
    return { type: 'visualization', complexity: 'simple' };
  }
  
  if (queryLower.includes('transform') || queryLower.includes('merge') ||
      queryLower.includes('pivot') || queryLower.includes('aggregate') ||
      dataSchema.columns.length > 20) {
    return { type: 'exploratory', complexity: 'complex' };
  }
  
  return { type: 'exploratory', complexity: 'simple' };
}

function createSurveyAnalysisPrompt(
  dataSchema: CodeGenerationRequest['dataSchema'],
  analyticsContextPrompt?: string
): string {
  const grain = formatDatasetGrainForPrompt({
    columns: dataSchema.columns,
    types: dataSchema.types,
    sampleData: dataSchema.sampleData,
    row_count: dataSchema.rowCount ?? dataSchema.sampleData?.length,
    codebookMappings: dataSchema.codebookMappings,
  });
  const rich = analyticsContextPrompt?.trim()
    ? `\n\nCAMPAIGN / SURVEY CONTEXT (buildAnalyticsContext):\n${analyticsContextPrompt}`
    : '';

  return `You are an expert data analyst specializing in survey research and statistical analysis.

${rich}

${grain}

IMPORTANT GUIDELINES:
1. Always consider statistical significance for survey data
2. Account for sample sizes when making claims
3. Plan against the real dataframe head + dtypes — do not invent columns
4. Generate clean, well-commented Python code for Pyodide (pandas/numpy/matplotlib)
5. Always check for missing values and data quality issues
6. You may request more grain via print(df.describe()), value_counts, etc. — full frame is df

The dataset is available as 'df' in the Python environment.`;
}

function createUserPrompt(request: CodeGenerationRequest, analysisType: string): string {
  const history = request.analysisHistory || [];
  const historyContext = history.length > 0 
    ? `\n\nPrevious analysis context (continuity):\n${history.slice(-6).map((h, i) => 
        `${i + 1}. ${h.question ? `Q: ${h.question}\n` : ''}Code: ${(h.code || '').slice(0, 400)}\nResult: ${(h.output || '').slice(0, 400)}`
      ).join('\n\n')}`
    : '';

  const rowCount = request.dataSchema.rowCount ?? request.dataSchema.sampleData.length;

  return `Please generate Python code to answer this question: "${request.query}"

Analysis type: ${analysisType}
Dataset shape: ${rowCount} rows, ${request.dataSchema.columns.length} columns

Requirements:
1. Write clean, executable Python code
2. Include appropriate error handling
3. Add helpful comments explaining the approach
4. Consider survey methodology best practices
5. Suggest follow-up analyses if relevant
6. Use real column names from the grain above

${historyContext}

Generate Python code directly (no JSON wrapper needed for streaming):`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: CodeGenerationRequest = await req.json();
    
    if (!request.query || !request.dataSchema) {
      return NextResponse.json({ 
        error: 'Missing required fields: query and dataSchema' 
      }, { status: 400 });
    }

    const classification = classifyAnalysisType(request.query, request.dataSchema);
    const analysisType = request.analysisType || classification.type;
    const selectedModel = request.model || selectModel(
      analysisType, 
      classification.complexity, 
      request.dataSchema.sampleData.length
    );

    console.log(`[PYTHON-ANALYSIS-STREAM] Query: "${request.query}"`);
    console.log(`[PYTHON-ANALYSIS-STREAM] Analysis type: ${analysisType}, Model: ${selectedModel}`);

    const systemPrompt = createSurveyAnalysisPrompt(
      request.dataSchema,
      request.analyticsContextPrompt
    );
    const userPrompt = createUserPrompt(request, analysisType);

    const streamingResponse = await createStreamingCompletion({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 800
    });

    const headers = new Headers({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Analysis-Type': analysisType,
      'X-Model-Used': selectedModel
    });

    return new Response(streamingResponse.stream, { headers });

  } catch (error) {
    console.error('[PYTHON-ANALYSIS-STREAM] Code generation error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate code' 
    }, { status: 500 });
  }
}
