import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface StepPlanningRequest {
  question: string;
  datasetInfo: {
    columns: string[];
    types: Record<string, string>;
    sample_data: any[];
    codebook_mappings?: Record<string, any>;
  };
  executedSteps: Array<{
    step: any;
    output: string;
    success: boolean;
    insights: string[];
  }>;
  currentFindings: string[];
}

interface AnalysisStep {
  id: string;
  type: 'explore' | 'analyze' | 'visualize' | 'synthesize' | 'verify';
  description: string;
  code?: string;
  dependencies?: string[];
  priority: number;
  estimated_complexity: 'low' | 'medium' | 'high';
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: StepPlanningRequest = await req.json();
    
    const systemPrompt = `You are an expert data analysis strategist. Your job is to create a dynamic, adaptive analysis plan.

ANALYSIS CONTEXT:
- Question: "${request.question}"
- Dataset: ${request.datasetInfo.columns.length} columns, ${request.datasetInfo.sample_data.length} sample rows
- Previous steps completed: ${request.executedSteps.length}
- Current findings: ${request.currentFindings.length} insights discovered
- Codebook available: ${request.datasetInfo.codebook_mappings ? 'YES - Question text and value labels available' : 'NO - Raw data only'}

${request.datasetInfo.codebook_mappings ? `
**CODEBOOK (column -> question text, type, options, multi-select indicator columns):**
${JSON.stringify(request.datasetInfo.codebook_mappings, null, 2)}

**VARIABLE MAPPING (critical):** Map the user's everyday wording to the right
columns using each question's TEXT. Examples: "race"/"ethnicity" -> the
racial/ethnic-background question; "flavor"/"flavors" -> the flavor question;
"healthier options"/"health" -> the healthier-attributes question; "price"/"spend"
-> the spending question. Name the exact columns to use in your step descriptions.
For multiple-choice questions use the 0/1 indicator columns (see indicatorColumns)
for cross-tabs/chi-square/regression. When the user compares which of two things a
variable relates to more (e.g. "is race more related to flavor or to healthier
options"), plan to run BOTH relationships (race x flavor AND race x healthier) and
compare their effect sizes (chi-square / Cramér's V).
` : ''}

STEP TYPES:
- explore: Find and examine relevant variables
- analyze: Perform statistical analysis and calculations  
- visualize: Create charts and visual representations
- synthesize: Combine findings and draw insights
- verify: Validate findings or test hypotheses

PLANNING PRINCIPLES:
1. **Adaptive Planning**: Adjust based on what's already been discovered
2. **Logical Dependencies**: Each step should build on previous findings
3. **Progressive Complexity**: Start simple, then dive deeper
4. **Gap Identification**: Look for missing pieces in current analysis
5. **Insight-Driven**: Each step should aim to answer specific sub-questions

CURRENT ANALYSIS STATE:
${request.executedSteps.length > 0 ? `
Previous Steps Completed:
${request.executedSteps.map((step, i) => `
${i + 1}. ${step.step.description} - ${step.success ? 'Success' : 'Failed'}
   Output: ${step.output.substring(0, 200)}...
   Insights: ${step.insights.join('; ')}
`).join('\n')}

Current Findings:
${request.currentFindings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')}
` : 'No previous steps - this is initial planning.'}

TASK: Generate 3-6 logical next steps that will advance the analysis toward answering the main question.`;

    const userPrompt = `Plan the next analysis steps for: "${request.question}"

Requirements:
1. Generate steps that build on existing findings (if any)
2. Each step should have a clear, specific purpose
3. Consider what information is still missing
4. Prioritize steps that will yield the most insights
5. Include both analytical and visual components
6. Ensure steps are executable with pandas/matplotlib

Return a JSON array of steps in this format:
[
  {
    "id": "unique-step-id",
    "type": "explore|analyze|visualize|synthesize|verify", 
    "description": "Clear description of what this step accomplishes",
    "dependencies": ["previous-step-id"] or [],
    "priority": 1-5 (1=highest),
    "estimated_complexity": "low|medium|high"
  }
]`;

    const completion = await createCompletion({
      model: 'gpt-4o', // Use more powerful model for planning
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      maxTokens: 1000
    });

    let stepsText = completion.content?.trim() || '';
    
    // Extract JSON from potential markdown formatting
    if (stepsText.includes('```json')) {
      stepsText = stepsText.split('```json')[1].split('```')[0].trim();
    } else if (stepsText.includes('```')) {
      stepsText = stepsText.split('```')[1].trim();
    }

    try {
      const steps: AnalysisStep[] = JSON.parse(stepsText);
      
      // Validate and enhance steps
      const enhancedSteps = steps.map((step, index) => ({
        ...step,
        id: step.id || `step-${Date.now()}-${index}`,
        priority: step.priority || (index + 1),
        estimated_complexity: step.estimated_complexity || 'medium'
      }));

      console.log(`Generated ${enhancedSteps.length} analysis steps for: ${request.question}`);
      
      return NextResponse.json({
        steps: enhancedSteps,
        model: 'gpt-4o'
      });

    } catch (parseError) {
      console.error('Failed to parse steps JSON:', parseError);
      
      // Fallback: Generate basic steps based on question type
      const fallbackSteps: AnalysisStep[] = [];
      
      if (request.executedSteps.length === 0) {
        // Initial exploration steps
        fallbackSteps.push(
          {
            id: 'explore-variables',
            type: 'explore',
            description: 'Identify and examine relevant variables in the dataset',
            priority: 1,
            estimated_complexity: 'low'
          },
          {
            id: 'basic-stats',
            type: 'analyze', 
            description: 'Calculate basic statistics and distributions',
            dependencies: ['explore-variables'],
            priority: 2,
            estimated_complexity: 'low'
          }
        );
      }

      // Add analysis steps based on question content
      if (request.question.toLowerCase().includes('correlation') || 
          request.question.toLowerCase().includes('relationship')) {
        fallbackSteps.push({
          id: 'correlation-analysis',
          type: 'analyze',
          description: 'Perform correlation analysis between key variables',
          priority: 3,
          estimated_complexity: 'medium'
        });
      }

      // Always add visualization
      fallbackSteps.push({
        id: 'create-visualizations',
        type: 'visualize',
        description: 'Create visualizations to illustrate key findings',
        priority: 4,
        estimated_complexity: 'medium'
      });

      return NextResponse.json({
        steps: fallbackSteps,
        model: 'fallback',
        note: 'Used fallback planning due to parsing error'
      });
    }

  } catch (error) {
    console.error('Step planning error:', error);
    return NextResponse.json({ 
      error: 'Failed to plan analysis steps' 
    }, { status: 500 });
  }
} 