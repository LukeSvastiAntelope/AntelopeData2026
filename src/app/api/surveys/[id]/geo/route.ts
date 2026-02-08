import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * GET /api/surveys/[id]/geo
 * 
 * Get geographic aggregation of survey responses by state.
 * Returns counts and basic sentiment data per state.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Verify survey ownership
    const [surveys]: any = await db.execute(
      'SELECT id FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found' },
        { status: 404 }
      );
    }

    // Get responses with demographics
    const [responses]: any = await db.execute(
      'SELECT demographics FROM survey_responses WHERE survey_id = ?',
      [surveyId]
    );

    // Aggregate by state
    const stateCounts: Record<string, number> = {};
    let totalWithState = 0;

    for (const row of responses) {
      let demographics;
      try {
        demographics = typeof row.demographics === 'string' 
          ? JSON.parse(row.demographics) 
          : row.demographics;
      } catch {
        continue;
      }

      // Check for state field (could be in state, location, or as part of other fields)
      const state = demographics?.state || demographics?.location;
      
      if (state && typeof state === 'string') {
        // Normalize state name
        const normalized = state.trim();
        stateCounts[normalized] = (stateCounts[normalized] || 0) + 1;
        totalWithState++;
      }
    }

    const stateData = Object.entries(stateCounts)
      .map(([state, count]) => ({
        state,
        count,
        percentage: totalWithState > 0 ? Math.round((count / totalWithState) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      status: true,
      totalResponses: responses.length,
      totalWithState,
      stateData,
    });

  } catch (error) {
    console.error('Geo aggregation error:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to get geographic data' },
      { status: 500 }
    );
  }
}
