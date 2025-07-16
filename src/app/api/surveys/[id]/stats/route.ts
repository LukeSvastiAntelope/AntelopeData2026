import { NextRequest, NextResponse } from 'next/server'
import { openSql } from '@/app/utils/database/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userIdHeader = request.headers.get('x-user-id')
    if (!userIdHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = parseInt(userIdHeader)
    const { id } = await params
    const surveyId = parseInt(id)
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: 'Invalid survey ID' }, { status: 400 })
    }

    const db = await openSql()

    // 1. Check if user has access to this survey
    const [surveyCheck] = await db.execute(
      `SELECT s.id, s.title, s.description, s.status, s.created_at, s.is_public, s.processed_stats,
              COUNT(DISTINCT sr.id) as response_count
       FROM surveys s
       LEFT JOIN survey_responses sr ON s.id = sr.survey_id
       WHERE s.id = ? AND (s.created_by = ? OR s.is_public = 1)
       GROUP BY s.id`,
      [surveyId, userId]
    ) as any[]

    if (!surveyCheck || surveyCheck.length === 0) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 })
    }

    const survey = surveyCheck[0]

    // 2. If stats aren't processed yet, fall back to legacy summary
    if (!survey.processed_stats) {
      console.log(`Survey ${surveyId} stats not processed yet, falling back to runtime calculation`)
      // You could call the existing SurveyRepo.getSurveySummary here or return a message
      return NextResponse.json({ 
        error: 'Survey statistics are being processed. Please try again in a few minutes.',
        survey: survey,
        statsReady: false
      }, { status: 202 })
    }

    // 3. Get all questions first
    const [allQuestions] = await db.execute(
      `SELECT sq.id as question_id, sq.prompt, sq.type, sq.options, sq.question_order
       FROM survey_questions sq
       WHERE sq.survey_id = ?
       ORDER BY sq.question_order ASC`,
      [surveyId]
    ) as any[]

    // 4. Get pre-computed question statistics
    const [statsRows] = await db.execute(
      `SELECT sq.id as question_id, sq.prompt, sq.type, sq.options,
              sqs.option_value, sqs.respondent_count, sqs.respondent_pct
       FROM survey_questions sq
       LEFT JOIN survey_question_stats sqs ON sq.id = sqs.question_id
       WHERE sq.survey_id = ?
       ORDER BY sq.question_order ASC, sqs.respondent_count DESC`,
      [surveyId]
    ) as any[]

    console.log(`Survey ${surveyId}: Found ${allQuestions.length} total questions, ${statsRows.length} stat rows`)

    // 5. Get basic demographic distributions (age, location, education)
    const [demoRows] = await db.execute(
      `SELECT 
         JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.age')) as age,
         JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.location')) as location,
         JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.education')) as education
       FROM survey_responses sr
       WHERE sr.survey_id = ?`,
      [surveyId]
    ) as any[]

    // 6. Get response timeline
    const [timelineRows] = await db.execute(
      `SELECT DATE(submitted_at) as date, COUNT(*) as count
       FROM survey_responses 
       WHERE survey_id = ?
       GROUP BY DATE(submitted_at)
       ORDER BY date ASC`,
      [surveyId]
    ) as any[]

    // 7. First create entries for all questions
    const questionStats: Record<number, any> = {}
    
    for (const question of allQuestions) {
      questionStats[question.question_id] = {
        id: question.question_id,
        prompt: question.prompt,
        type: question.type,
        options: question.options,
        distribution: []
      }
    }
    
    // 8. Then add stats data where available
    for (const row of statsRows) {
      if (questionStats[row.question_id] && row.option_value) {
        questionStats[row.question_id].distribution.push({
          option: row.option_value,
          count: row.respondent_count,
          percentage: parseFloat(row.respondent_pct)
        })
      }
    }

    // 9. Process demographics into chart-friendly format
    const ageData: Record<string, number> = {}
    const locationData: Record<string, number> = {}
    const educationData: Record<string, number> = {}

    for (const demo of demoRows) {
      if (demo.age) {
        ageData[demo.age] = (ageData[demo.age] || 0) + 1
      }
      if (demo.location) {
        locationData[demo.location] = (locationData[demo.location] || 0) + 1
      }
      if (demo.education) {
        educationData[demo.education] = (educationData[demo.education] || 0) + 1
      }
    }

    // 10. Format response data
    const allQuestionsList = Object.values(questionStats)
    console.log(`Survey ${surveyId}: Returning ${allQuestionsList.length} questions in response`)
    
    const response = {
      survey: survey,
      statsReady: true,
      processedAt: new Date().toISOString(),
      questions: allQuestionsList,
      demographics: {
        age: Object.entries(ageData).map(([range, count]) => ({ range, count })),
        location: Object.entries(locationData).map(([location, count]) => ({ location, count })),
        education: Object.entries(educationData).map(([education, count]) => ({ education, count }))
      },
      timeline: timelineRows.map(row => ({
        date: row.date,
        responses: row.count
      })),
      // Legacy format compatibility
      ageData: Object.entries(ageData).map(([range, count]) => ({ range, count })),
      locationData: Object.entries(locationData).map(([location, count]) => ({ location, count })),
      educationData: Object.entries(educationData).map(([education, count]) => ({ education, count }))
    }

    return NextResponse.json(response)

  } catch (e) {
    console.error('Error in GET /api/surveys/[id]/stats:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 