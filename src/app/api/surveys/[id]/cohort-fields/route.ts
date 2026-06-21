import { NextRequest, NextResponse } from 'next/server';
import { openSql as getMySQLConnection } from '@/app/utils/database/db';
import { auth } from '@/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate request
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const surveyId = parseInt(resolvedParams.id);
    if (isNaN(surveyId)) {
      return NextResponse.json({ status: false, message: "Invalid survey ID" }, { status: 400 });
    }

    const db = await getMySQLConnection();

    // Get survey questions that are suitable for cohort filtering
    const [questions] = await db.execute(`
      SELECT 
        id,
        prompt,
        type,
        question_order,
        options
      FROM survey_questions 
      WHERE survey_id = ? 
      ORDER BY question_order ASC
    `, [surveyId]) as any[];

    const cohortFields = [];

    for (const question of questions) {
      const fieldData: any = {
        questionId: question.id,
        label: question.prompt,
        type: question.type,
        fieldName: `question_${question.id}`,
        questionOrder: question.question_order
      };

      // For questions with predefined options, get the actual response values
      if (['single-choice', 'multiple-choice', 'rating', 'yes-no'].includes(question.type)) {
        // Get unique answer values from actual responses
        const [answerValues] = await db.execute(`
          SELECT DISTINCT sa.answer_value, COUNT(*) as count
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa.answer_value IS NOT NULL 
          AND sa.answer_value != ''
          AND sa.answer_value != 'null'
          GROUP BY sa.answer_value
          ORDER BY count DESC
        `, [question.id, surveyId]) as any[];

        fieldData.possibleValues = answerValues.map((av: any) => ({
          value: av.answer_value,
          label: av.answer_value,
          count: av.count
        }));

        fieldData.inputType = answerValues.length > 8 ? 'select' : 'checkbox';
      } else if (['text', 'textarea'].includes(question.type)) {
        // For text questions, provide text input
        fieldData.inputType = 'text';
        fieldData.placeholder = 'Enter text to search for (supports partial matching)';
        
        // Get sample responses to help user understand the data
        const [sampleResponses] = await db.execute(`
          SELECT DISTINCT sa.answer_value
          FROM survey_answers sa
          JOIN survey_responses sr ON sa.response_id = sr.id
          WHERE sa.question_id = ? 
          AND sr.survey_id = ?
          AND sa.answer_value IS NOT NULL 
          AND sa.answer_value != ''
          AND LENGTH(TRIM(sa.answer_value)) > 5
          ORDER BY sa.answer_value ASC
          LIMIT 5
        `, [question.id, surveyId]) as any[];

        fieldData.sampleValues = sampleResponses.map((sr: any) => sr.answer_value);
      } else {
        // Skip unsupported question types
        continue;
      }

      // Skip questions with no data
      if (fieldData.possibleValues && fieldData.possibleValues.length === 0) {
        continue;
      }
      if (fieldData.sampleValues && fieldData.sampleValues.length === 0) {
        continue;
      }

      cohortFields.push(fieldData);
    }

    return NextResponse.json({
      status: true,
      surveyId: surveyId,
      cohortFields: cohortFields
    });

  } catch (error) {
    console.error('Error fetching cohort fields:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to fetch cohort fields' },
      { status: 500 }
    );
  }
} 