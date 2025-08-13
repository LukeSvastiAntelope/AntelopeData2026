import { NextRequest, NextResponse } from 'next/server'
import { SurveyRepo } from '@/app/utils/database/survey-repo'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get user ID from the request (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const surveyId = parseInt(id)
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: 'Invalid survey ID' }, { status: 400 })
    }

    const includeSynthetic = request.nextUrl.searchParams.get('includeSynthetic') !== '0'
    // Get survey analytics data (respect includeSynthetic)
    const analytics = await SurveyRepo.getSurveyAnalytics(surveyId, parseInt(userId))
    
    if (!analytics) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 })
    }

    // If includeSynthetic is false, filter responses client-side fallback (for now)
    if (includeSynthetic === false && Array.isArray((analytics as any).responses)) {
      (analytics as any).responses = (analytics as any).responses.filter((r: any) => !r.response_origin || r.response_origin === 'human')
    }
    return NextResponse.json(analytics)

  } catch (error) {
    console.error('Error in GET /api/surveys/[id]/analytics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 