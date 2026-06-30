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
    
    const systemPrompt = `You extract insights from a Python analysis step's PRINTED OUTPUT.

MAIN QUESTION: ${request.context.question}
STEP: ${request.step.type} — ${request.step.description}

ABSOLUTE GROUNDING RULES (most important):
- Use ONLY numbers, labels, and facts that LITERALLY appear in the STEP OUTPUT below.
- Every count, percentage, coefficient, p-value, or statistic you mention MUST be
  copied verbatim from the output. Do NOT invent, estimate, round from memory,
  infer, or "fill in" any number. If it is not printed, you may not state it.
- If the output has NO quantitative results (e.g. it only produced a chart, or
  says "no text output", or is empty), return an EMPTY insights array (or a single
  insight that describes what the step did, with NO numbers). Never fabricate
  statistics to look helpful.
- Do not contradict the output. If the output prints "Public transit  4", the
  insight must say 4 — never 5, 7, or 8.

${request.context.dataset_info?.codebook_mappings ? `When naming variables, use the human-readable survey question/option labels from the codebook rather than raw column names.` : ''}

TASK: Extract 1-3 specific insights that are DIRECTLY supported by numbers/facts in the output and help answer the main question.`;

    const userPrompt = `STEP OUTPUT (your only source of truth — quote its numbers exactly):
"""
${request.output}
"""

Return JSON only:
{ "insights": ["insight grounded in the output above", "..."] }
If the output contains no usable numbers, return: { "insights": [] }`;

    const completion = await createCompletion({
      // gpt-4o (not mini): this step converts executed output into stated claims —
      // it is THE place hallucinations enter. The stronger model adheres to the
      // strict "only numbers literally in the output" grounding rules far more
      // reliably than mini. temp 0 for deterministic, faithful extraction.
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      maxTokens: 500
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
        model: 'gpt-4o'
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