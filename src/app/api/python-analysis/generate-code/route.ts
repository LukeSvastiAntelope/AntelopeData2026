import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface CodeGenerationRequest {
  query: string;
  dataSchema: {
    columns: string[];
    types: Record<string, string>;
    sampleData: any[];
    codebookMappings?: Record<string, any>;
  };
  analysisHistory?: Array<{
    code: string;
    output: string;
    timestamp: string;
  }>;
  analysisType?: 'statistical' | 'exploratory' | 'visualization' | 'auto';
  model?: string;
}

interface CodeGenerationResponse {
  code: string;
  explanation: string;
  suggestedFollowups: string[];
  analysisType: string;
  model: string;
}

// Model routing logic based on analysis type and complexity
function selectModel(analysisType: string, complexity: string, dataSize: number): string {
  if (analysisType === 'quick-query' || dataSize < 1000) {
    return 'gpt-4o-mini';
  }
  if (analysisType === 'statistical') {
    return 'o3-mini'; // Best for statistical reasoning
  }
  if (analysisType === 'exploratory' && complexity === 'complex') {
    return 'deepseek-coder'; // Best for complex data transformations
  }
  return 'gpt-4o'; // Default for code generation
}

// Determine analysis type from query
function classifyAnalysisType(query: string, dataSchema: any): {
  type: string;
  complexity: string;
} {
  const queryLower = query.toLowerCase();
  
  // Statistical analysis patterns
  if (queryLower.includes('correlation') || queryLower.includes('regression') || 
      queryLower.includes('significance') || queryLower.includes('p-value') ||
      queryLower.includes('hypothesis') || queryLower.includes('statistical')) {
    return { type: 'statistical', complexity: 'medium' };
  }
  
  // Visualization patterns
  if (queryLower.includes('plot') || queryLower.includes('chart') || 
      queryLower.includes('graph') || queryLower.includes('visualiz')) {
    return { type: 'visualization', complexity: 'simple' };
  }
  
  // Complex data manipulation
  if (queryLower.includes('transform') || queryLower.includes('merge') ||
      queryLower.includes('pivot') || queryLower.includes('aggregate') ||
      dataSchema.columns.length > 20) {
    return { type: 'exploratory', complexity: 'complex' };
  }
  
  // Simple exploratory
  return { type: 'exploratory', complexity: 'simple' };
}

// Create survey-specific system prompt
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

${dataSchema.codebookMappings ? `\n**CODEBOOK MAPPINGS:**\n${JSON.stringify(dataSchema.codebookMappings, null, 2)}\n` : ''}

CRITICAL: You must approach each question with THOROUGH, ITERATIVE ANALYSIS like a senior researcher would:

ANALYTICAL APPROACH - STEP BY STEP:
1. **STEP 1 - EXPLORE VARIABLES**: Start with simple exploration to find relevant variables. Generate SHORT, SIMPLE code that just explores and prints findings
2. **FUTURE STEPS**: After Step 1 executes successfully, the user can ask follow-up questions to proceed to:
   - Step 2: Basic descriptive statistics
   - Step 3: Simple correlations or cross-tabulations  
   - Step 4: Visualizations
   - Step 5: Statistical tests if appropriate

CRITICAL FOR COMPLEX QUESTIONS:
- Break the analysis into SMALL, SIMPLE steps
- Each step should be 5-15 lines of basic Python code
- Focus on ONE specific task per step
- Let the user guide the next step based on findings
- Don't try to do comprehensive analysis in one code block

EXAMPLE FOR "How does education influence healthcare opinions?":
Generate code with ALL steps in sequence, each step clearly marked with print headers.

TECHNICAL GUIDELINES:
1. Always consider statistical significance for survey data
2. Account for sample sizes when making claims
3. Suggest appropriate demographic breakdowns
4. Use proper survey analysis techniques
5. Generate clean, well-commented Python code
6. Use pandas, numpy, matplotlib, and scipy effectively
7. Always check for missing values and data quality issues
8. IMPORTANT: Check if advanced packages are available before importing (e.g., try/except for seaborn)
9. Fall back to matplotlib if seaborn is not available
10. MATPLOTLIB PLOTS: Always end visualization code with plt.show() - plots will be automatically captured and displayed
11. **CRITICAL - CODEBOOK USAGE**: When codebook information is provided above, you MUST use the exact value labels from the codebook, not make up your own labels. For example:
    - If codebook shows "F_EDUCCAT: 1=Less than high school, 2=High school graduate, 3=Some college, 4=College graduate+", use EXACTLY those labels
    - Create a mapping dictionary from the codebook: label_map = {'1': 'Less than high school', '2': 'High school graduate', ...}
    - Use df['column'].map(label_map) to apply labels before visualization
    - NEVER hardcode different labels like ['Less than HS', 'HS Graduate'] - use the exact codebook labels
12. OUTPUT FORMATTING: For lists and dictionaries, use json.dumps() with indent=2 for readable output, or create formatted tables with pandas
13. TABLE DISPLAY: When showing distributions, counts, or statistical results, display both the data values AND create nice tables using print(df.to_string()) or df.head() for better readability

PYODIDE COMPATIBILITY REQUIREMENTS:
14. **CRITICAL**: This code runs in Pyodide (browser-based Python). Use simple, compatible pandas operations
15. **AVOID**: Complex groupby operations, advanced string operations, or multi-level operations that might fail in Pyodide
16. **SIMPLE AGGREGATIONS**: Use basic operations: df.value_counts(), df.groupby('col').size(), df.groupby('col').mean()
17. **CORRELATIONS**: Use simple df.corr() - avoid complex statistical tests that might fail
18. **ERROR HANDLING**: Always wrap operations in try/except blocks with print statements for debugging
23. **VARIABLE EXPLORATION**: Before assuming variable names, always explore the dataset first with df.columns to find actual variable names
24. **SEARCH PATTERNS**: Use multiple search patterns to find variables:
    - Healthcare: df.columns[df.columns.str.contains('HEALTH|MEDICAL|CARE|HOSPITAL|DOCTOR|MEDICARE|MEDICAID', case=False)]
    - Also try broader patterns and manually inspect column names for topic-related variables
    - Look for question codes that might relate to topics (e.g., variables ending with topic indicators)
19. **CROSS-TABS**: Use simple pd.crosstab(df['col1'], df['col2']) without complex parameters
20. **VISUALIZATIONS**: Use basic matplotlib - plt.bar(), plt.plot(), plt.hist() - avoid complex seaborn
21. **STRING HANDLING**: Avoid f-strings or complex string operations that might cause syntax errors. Use simple string concatenation or .format() method
25. **INDENTATION**: Use simple 4-space indentation consistently. Avoid mixing tabs and spaces which can cause IndentationError in Pyodide
26. **PYODIDE DEBUGGING**: Add print statements after each major step to help debug where execution fails
27. **SIMPLE FIRST**: Start with very basic operations and build up complexity gradually
22. **DEBUG FRIENDLY**: Add lots of print statements to show intermediate results and help with debugging

AVAILABLE PACKAGES: pandas, numpy, matplotlib, scipy are guaranteed. Seaborn may not be available.
The dataset is available as 'df' in the Python environment.`;
}

// Create user prompt with context
function createUserPrompt(request: CodeGenerationRequest, analysisType: string): string {
  const analysisHistory = request.analysisHistory || [];
  const historyContext = analysisHistory.length > 0 
    ? `\n\nPrevious analysis context:\n${analysisHistory.slice(-3).map(h => 
        `Code: ${h.code}\nResult: ${h.output.slice(0, 200)}...`
      ).join('\n\n')}`
    : '';

  return `Please generate Python code to answer this question: "${request.query}"

Analysis type: ${analysisType}
Dataset shape: ${request.dataSchema.sampleData.length} rows, ${request.dataSchema.columns.length} columns

🔍 **CRITICAL**: For complex questions, generate MULTIPLE STEPS automatically like Julius AI:

**MULTI-STEP ANALYSIS APPROACH:**
1. **STEP 1**: Find and explore relevant variables (5-10 lines)
2. **STEP 2**: Show basic statistics and distributions (5-10 lines) 
3. **STEP 3**: Create correlations or cross-tabulations (5-10 lines)
4. **STEP 4**: Generate visualizations (5-10 lines)
5. **STEP 5**: Summary and insights (3-5 lines)

**IMPLEMENTATION:**
- For complex questions, generate ALL steps in sequence
- Each step should be SHORT (5-10 lines max)
- Separate each step with clear headers
- Include print statements between steps to show progress
- Each step builds on the previous step's findings

Requirements:
1. Write clean, executable Python code with comprehensive analysis
2. Include appropriate error handling
3. Add helpful comments explaining the analytical approach
4. Consider survey methodology best practices
5. **MANDATORY**: If codebook mappings are provided above, extract the exact value labels and use them in your code
6. Create label mapping dictionaries directly from the codebook information (e.g., edu_labels = {'1': 'Less than high school', '2': 'High school graduate', ...})
7. Apply these mappings before any visualization or analysis to show meaningful labels instead of numeric codes
8. Suggest specific follow-up analyses based on findings and gaps

${historyContext}

Respond with a JSON object containing:
{
  "code": "# Python code here - must be comprehensive and thorough",
  "explanation": "Clear explanation of the analytical approach and key findings",
  "suggestedFollowups": ["Specific follow-up question 1", "Specific follow-up question 2"]
}`;
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

    console.log(`[PYTHON-ANALYSIS] Query: "${request.query}"`);
    console.log(`[PYTHON-ANALYSIS] Analysis type: ${analysisType}, Model: ${selectedModel}`);

    // Generate code using AI
    const systemPrompt = createSurveyAnalysisPrompt(request.dataSchema);
    const userPrompt = createUserPrompt(request, analysisType);

    const completion = await createCompletion({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 1500 // Increased to avoid truncation
    });

    // Parse AI response
    let aiResponse;
    try {
      // Clean the response content first
      let cleanContent = completion.content.trim();
      
      // Remove ```json wrapper if present
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      
      // Remove any other code block markers
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
      }
      
      // Fix truncated JSON - if it doesn't end properly, try to fix it
      if (!cleanContent.trim().endsWith('}')) {
        console.log('Detected truncated JSON, attempting to fix...');
        
        // Try to find the last complete array entry and close the JSON
        if (cleanContent.includes('"suggestedFollowups"')) {
          const beforeFollowups = cleanContent.substring(0, cleanContent.lastIndexOf('"suggestedFollowups"'));
          cleanContent = beforeFollowups + '"suggestedFollowups": ["Try a different approach", "Ask for more details"]\n}';
        } else {
          // If we can't fix it, close the object
          const lastQuote = cleanContent.lastIndexOf('"');
          if (lastQuote > 0) {
            cleanContent = cleanContent.substring(0, lastQuote + 1) + '\n}';
          }
        }
      }
      
      console.log('Parsing AI response:', cleanContent.substring(0, 200) + '...');
      aiResponse = JSON.parse(cleanContent);
    } catch (error) {
      console.error('Failed to parse AI response as JSON:', error);
      console.log('Raw response length:', completion.content?.length);
      console.log('Raw response preview:', completion.content?.substring(0, 500));
      
      // Better fallback that generates simple, working code
      aiResponse = {
        code: `# Simplified analysis due to parsing error
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Basic dataset exploration
print("Dataset shape:", df.shape)
print("\\nColumn names:")
print(df.columns.tolist())

# Show basic statistics
print("\\nBasic statistics:")
print(df.describe())

# Show first few rows
print("\\nFirst 5 rows:")
print(df.head())`,
        explanation: 'Generated a simplified analysis due to response parsing issues. This shows basic dataset information.',
        suggestedFollowups: ['Ask about specific columns', 'Try a more specific question']
      };
    }

    // Validate code exists
    if (!aiResponse.code) {
      return NextResponse.json({ 
        error: 'Failed to generate valid code' 
      }, { status: 500 });
    }

    const response: CodeGenerationResponse = {
      code: aiResponse.code,
      explanation: aiResponse.explanation || "AI-generated analysis code",
      suggestedFollowups: aiResponse.suggestedFollowups || [],
      analysisType,
      model: selectedModel
    };

    console.log(`[PYTHON-ANALYSIS] Generated ${aiResponse.code.split('\n').length} lines of code`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[PYTHON-ANALYSIS] Code generation error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate code' 
    }, { status: 500 });
  }
} 