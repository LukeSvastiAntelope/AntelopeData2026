import { NextRequest, NextResponse } from 'next/server';
import { SurveyRepo } from '@/app/utils/database/survey-repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth – user ID should be attached by middleware
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader);

    const { id: surveyId } = await params;
    const surveyIdNum = parseInt(surveyId);

    // First, verify the user owns this survey
    const survey = await SurveyRepo.getSurveyById(surveyIdNum, userId);

    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Convert survey questions to codebook format (schema-aware)
    const codebookMappings = survey.questions.map((question: any) => {
      // Dynamically detect the correct column names
      const questionOrder = question.question_order || question.order || question.sort_order || 1;
      const questionText = question.question_text || question.prompt || question.text || 'Question';
      const questionType = question.question_type || question.type || 'text';
      
      const variableName = `Q${questionOrder}`;
      
      // Extract value labels from options
      const valueLabels: Record<string, string> = {};
      if (question.options && Array.isArray(question.options)) {
        question.options.forEach((option: any, index: number) => {
          if (typeof option === 'string') {
            valueLabels[String(index + 1)] = option;
          } else if (option.value && option.label) {
            valueLabels[String(option.value)] = option.label;
          }
        });
      }

      return {
        variableName,
        questionText,
        questionType,
        valueLabels,
        order: questionOrder
      };
    });

    return NextResponse.json({
      surveyId: surveyIdNum,
      surveyTitle: (survey as any).title || (survey as any).slug,
      totalQuestions: survey.questions.length,
      codebookMappings
    });

  } catch (error) {
    console.error('Error exporting survey codebook:', error);
    return NextResponse.json(
      { error: 'Failed to export survey codebook' },
      { status: 500 }
    );
  }
} 