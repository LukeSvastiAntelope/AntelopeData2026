import { NextRequest, NextResponse } from 'next/server'
import { SurveyRepo } from '@/app/utils/database/survey-repo'

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

    const summary = await SurveyRepo.getSurveySummary(surveyId, userId)
    if (!summary) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 })
    }
    return NextResponse.json(summary)
  } catch (e) {
    console.error('Error in GET /api/surveys/[id]/summary:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 