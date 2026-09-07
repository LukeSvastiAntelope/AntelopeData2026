import { NextRequest, NextResponse } from 'next/server'
import { SurveyRepo } from '@/app/utils/database/survey-repo'

// GET /api/surveys/[id]/responses?page=1&limit=20
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth – user ID should be attached by middleware
    const userIdHeader = request.headers.get('x-user-id')
    if (!userIdHeader) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }
    const userId = parseInt(userIdHeader)

    // Survey ID
    const { id } = await params
    const surveyId = parseInt(id)
    if (isNaN(surveyId)) {
      return NextResponse.json({ error: 'Invalid survey ID' }, { status: 400 })
    }

    // Pagination params
    const { searchParams } = new URL(request.url)
    const pageParam = parseInt(searchParams.get('page') || '1')
    const limitParam = parseInt(searchParams.get('limit') || '20')

    const page = Math.max(pageParam, 1)
    const limit = Math.min(Math.max(limitParam, 1), 100) // safety cap 100
    const offset = (page - 1) * limit

    const result = await SurveyRepo.getSurveyResponsesPage(
      surveyId,
      userId,
      limit,
      offset
    )

    if (!result) {
      return NextResponse.json({ error: 'Survey not found or access denied' }, { status: 404 })
    }

    return NextResponse.json({
      total: result.total,
      page,
      limit,
      responses: result.responses,
      totalPages: Math.ceil(result.total / limit)
    })
  } catch (error) {
    console.error('Error in GET /api/surveys/[id]/responses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 