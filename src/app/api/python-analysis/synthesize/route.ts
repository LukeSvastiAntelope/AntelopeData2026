import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface SynthesisRequest {
  question: string;
  executedSteps: Array<{
    step: {
      type: string;
      description: string;
    };
    code: string;
    output: string;
    success: boolean;
    insights: string[];
    timestamp: Date;
  }>;
  keyFindings: string[];
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: SynthesisRequest = await req.json();
    
    const systemPrompt = `You are an expert survey analyst and data scientist specializing in extracting meaningful insights from survey responses. Your role is to help users understand their survey data through comprehensive analysis and clear communication.

CORE PRINCIPLES:
• Always ground your analysis in the actual computed results from the analysis steps below — never invent numbers.
• Use statistical measures (percentages, correlations, distributions) and cite specific data points.
• Highlight demographic differences and segment/cohort variations when the analysis surfaced them.
• Distinguish correlation from causation; acknowledge limitations and potential biases.
• Offer actionable, decision-oriented recommendations.

ORIGINAL QUESTION: ${request.question}

ANALYSIS JOURNEY:
${request.executedSteps.map((step, i) => `
Step ${i + 1}: ${step.step.description} (${step.step.type})
Success: ${step.success}
Key Output: ${step.output.substring(0, 300)}...
Insights: ${step.insights.join('; ')}
`).join('\n')}

ALL FINDINGS:
${request.keyFindings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')}

SYNTHESIS REQUIREMENTS:
1. **Answer the Original Question**: Provide a clear, evidence-based answer
2. **Synthesize Evidence**: Combine findings from all analysis steps
3. **Quantify Relationships**: Include specific numbers and statistical measures
4. **Acknowledge Limitations**: Note any gaps or uncertainties
5. **Executive Summary**: Concise conclusion for stakeholders

TONE: Professional, analytical, evidence-based, accessible to non-technical audience`;

    const userPrompt = `Create a comprehensive synthesis of this analysis.

Structure your response as:

**EXECUTIVE SUMMARY**
[2-3 sentences answering the main question]

**KEY FINDINGS** 
[3-5 bullet points of the most important discoveries]

**EVIDENCE SUMMARY**
[Detailed explanation of the analysis results with specific numbers]

**LIMITATIONS & CAVEATS**
[Any important limitations or assumptions]

**RECOMMENDATIONS**
[Suggested next steps or actions based on findings]

Focus on being clear, specific, and actionable.`;

    const completion = await createCompletion({
      model: 'gpt-4o', // Use powerful model for synthesis
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 1200
    });

    const synthesis = completion.content?.trim() || 'Analysis synthesis could not be generated.';

    console.log(`Generated synthesis for question: ${request.question}`);

    return NextResponse.json({
      synthesis,
      model: 'gpt-4o',
      analysisSteps: request.executedSteps.length,
      totalFindings: request.keyFindings.length
    });

  } catch (error) {
    console.error('Synthesis generation error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate synthesis' 
    }, { status: 500 });
  }
} 