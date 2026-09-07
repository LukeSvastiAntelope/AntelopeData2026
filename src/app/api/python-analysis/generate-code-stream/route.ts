import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createStreamingCompletion } from '@/app/utils/services/ai-service';

interface CodeGenerationRequest {
  query: string;
  dataSchema: {
    columns: string[];
    types: Record<string, string>;
    sampleData: any[];
  };
  analysisHistory: Array<{
    code: string;
    output: string;
    timestamp: string;
  }>;
  analysisType?: 'statistical' | 'exploratory' | 'visualization' | 'auto';
  model?: string;
}

// Model routing logic (same as non-streaming)
function selectModel(analysisType: string, complexity: string, dataSize: number): string {
  // Only OpenAI is configured in this deployment, so route everything to
  // available GPT models (o3-mini / deepseek-coder would 401 with no key).
  if (analysisType === 'quick-query' || dataSize < 1000) {
    return 'gpt-4o-mini';
  }
  return 'gpt-4o';
}

// Determine analysis type from query (same as non-streaming)
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

// Create survey-specific system prompt (same as non-streaming)
function createSurveyAnalysisPrompt(dataSchema: any): string {
  const columnInfo = dataSchema.columns.map((col: string, idx: number) => 
    `${col} (${dataSchema.types[col] || 'unknown'})`
  ).join(', ');

  return `You are an expert data analyst specializing in survey research and statistical analysis. You have deep knowledge of:

- Survey methodology and response patterns
- Statistical significance testing
- Demographic analysis and segmentation  
- Cross-tabulation and correlation analysis
- Data visualization best practices
- Common survey biases and limitations

You are helping analyze a dataset with the following structure:
- Columns: ${columnInfo}
- Sample size: ${dataSchema.sampleData.length} rows shown
- Data types detected: ${JSON.stringify(dataSchema.types)}

IMPORTANT GUIDELINES:
1. Always consider statistical significance for survey data
2. Account for sample sizes when making claims
3. Suggest appropriate demographic breakdowns
4. Use proper survey analysis techniques
5. Generate clean, well-commented Python code
6. Use pandas, numpy, matplotlib, and scipy effectively
7. Always check for missing values and data quality issues

The dataset is available as 'df' in the Python environment.`;
}

// Create user prompt with context (same as non-streaming)
function createUserPrompt(request: CodeGenerationRequest, analysisType: string): string {
  const historyContext = request.analysisHistory.length > 0 
    ? `\n\nPrevious analysis context:\n${request.analysisHistory.slice(-3).map(h => 
        `Code: ${h.code}\nResult: ${h.output.slice(0, 200)}...`
      ).join('\n\n')}`
    : '';

  return `Please generate Python code to answer this question: "${request.query}"

Analysis type: ${analysisType}
Dataset shape: ${request.dataSchema.sampleData.length} rows, ${request.dataSchema.columns.length} columns

Requirements:
1. Write clean, executable Python code
2. Include appropriate error handling
3. Add helpful comments explaining the approach
4. Consider survey methodology best practices
5. Suggest follow-up analyses if relevant

${historyContext}

Generate Python code directly (no JSON wrapper needed for streaming):`;
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const request: CodeGenerationRequest = await req.json();
    
    // Validate required fields
    if (!request.query || !request.dataSchema) {
      return NextResponse.json({ 
        error: 'Missing required fields: query and dataSchema' 
      }, { status: 400 });
    }

    // Classify analysis type and select model
    const classification = classifyAnalysisType(request.query, request.dataSchema);
    const analysisType = request.analysisType || classification.type;
    const selectedModel = request.model || selectModel(
      analysisType, 
      classification.complexity, 
      request.dataSchema.sampleData.length
    );

    console.log(`[PYTHON-ANALYSIS-STREAM] Query: "${request.query}"`);
    console.log(`[PYTHON-ANALYSIS-STREAM] Analysis type: ${analysisType}, Model: ${selectedModel}`);

    // Generate code using streaming AI
    const systemPrompt = createSurveyAnalysisPrompt(request.dataSchema);
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

    // Add metadata headers
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