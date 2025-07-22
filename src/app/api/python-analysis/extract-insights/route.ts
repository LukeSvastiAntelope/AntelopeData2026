import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface InsightExtractionRequest {
  step: {
    id: string;
    type: 'explore' | 'analyze' | 'visualize' | 'synthesize' | 'verify';
    description: string;
  };
  output: string;
  context: {
    question: string;
    key_findings: string[];
    dataset_info?: {
      codebook_mappings?: any[];
    };
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: InsightExtractionRequest = await req.json();
    
    const systemPrompt = `You are an expert data analyst. Extract key insights from analysis step outputs.

MAIN QUESTION: ${request.context.question}

STEP CONTEXT:
- Step Type: ${request.step.type}
- Description: ${request.step.description}

EXISTING FINDINGS:
${request.context.key_findings.length > 0 ? 
  request.context.key_findings.map((finding, i) => `${i + 1}. ${finding}`).join('\n') :
  'No previous findings yet.'
}

${request.context.dataset_info?.codebook_mappings ? `
**CODEBOOK CONTEXT:**
This dataset has a codebook with question text and value labels. When extracting insights, reference the actual survey questions rather than just variable names.
` : ''}

TASK: Extract 1-3 specific, actionable insights from the step output that help answer the main question.

INSIGHT CRITERIA:
- Be specific and evidence-based
- Focus on what the data actually shows
- Relate directly to the main question
- Avoid generic statements
- Include quantitative details when available`;

    const userPrompt = `Extract insights from this analysis output:

STEP OUTPUT:
${request.output}

Return insights as a JSON array:
{
  "insights": [
    "Specific insight 1 with evidence",
    "Specific insight 2 with evidence", 
    "Specific insight 3 with evidence"
  ]
}`;

    const completion = await createCompletion({
      model: 'gpt-4o-mini', // Fast model for insight extraction
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      maxTokens: 400
    });

    let responseText = completion.content?.trim() || '';
    
    // Extract JSON from potential markdown formatting
    if (responseText.includes('```json')) {
      responseText = responseText.split('```json')[1].split('```')[0].trim();
    } else if (responseText.includes('```')) {
      responseText = responseText.split('```')[1].trim();
    }

    try {
      const result = JSON.parse(responseText);
      return NextResponse.json({
        insights: result.insights || [],
        model: 'gpt-4o-mini'
      });
    } catch (parseError) {
      console.warn('Failed to parse insights JSON, using fallback extraction');
      
      // Fallback: Simple pattern-based insight extraction
      const fallbackInsights: string[] = [];
      const output = request.output.toLowerCase();
      
      // Look for correlation patterns
      if (output.includes('correlation') && output.includes('0.')) {
        const correlationMatch = output.match(/correlation[^0-9]*([0-9.-]+)/);
        if (correlationMatch) {
          fallbackInsights.push(`Correlation coefficient found: ${correlationMatch[1]}`);
        }
      }
      
      // Look for statistical significance
      if (output.includes('significant') || output.includes('p-value')) {
        fallbackInsights.push('Statistical significance detected in analysis');
      }
      
      // Look for distribution patterns
      if (output.includes('distribution') || output.includes('mean')) {
        fallbackInsights.push('Distribution patterns identified in the data');
      }
      
      // Look for variable discoveries
      if (output.includes('variables:') || output.includes('columns:')) {
        fallbackInsights.push('Relevant variables identified for analysis');
      }
      
      // Default insight if nothing specific found
      if (fallbackInsights.length === 0) {
        fallbackInsights.push(`${request.step.type} step completed successfully`);
      }
      
      return NextResponse.json({
        insights: fallbackInsights,
        model: 'fallback',
        note: 'Used pattern-based extraction due to parsing error'
      });
    }

  } catch (error) {
    console.error('Insight extraction error:', error);
    return NextResponse.json({ 
      error: 'Failed to extract insights' 
    }, { status: 500 });
  }
} 