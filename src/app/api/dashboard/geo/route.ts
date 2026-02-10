import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * GET /api/dashboard/geo
 *
 * Aggregates geographic data across ALL surveys the user has access to
 * (own surveys + org-shared surveys). Used by the dashboard map.
 *
 * Returns state-level counts, congressional district counts, and GPS points.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Get all survey IDs the user can access (own + org)
    const [surveyRows]: any = await db.execute(
      `SELECT DISTINCT s.id FROM surveys s
       WHERE s.created_by = ?
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = s.organization_id
              AND om.user_id = ?
              AND om.status = 'active'
          )`,
      [userId, userId]
    );

    const surveyIds: number[] = surveyRows.map((r: any) => r.id);

    if (surveyIds.length === 0) {
      return NextResponse.json({
        status: true,
        states: {},
        districts: {},
        points: [],
        totalResponses: 0,
        totalSurveys: 0,
      });
    }

    // Build placeholders for IN clause
    const placeholders = surveyIds.map(() => '?').join(',');

    // Get all response demographics for these surveys
    const [responses]: any = await db.execute(
      `SELECT sr.survey_id, sr.demographics
       FROM survey_responses sr
       WHERE sr.survey_id IN (${placeholders})`,
      surveyIds
    );

    // Aggregate
    const states: Record<string, { responses: number; surveys: Set<number> }> = {};
    const districts: Record<string, { responses: number; parties: Record<string, number> }> = {};
    const points: { lat: number; lng: number; surveyId: number }[] = [];

    for (const row of responses) {
      let demographics: any;
      try {
        demographics = typeof row.demographics === 'string'
          ? JSON.parse(row.demographics)
          : row.demographics;
      } catch {
        continue;
      }
      if (!demographics) continue;

      // State aggregation
      const state = demographics.state?.trim();
      if (state) {
        if (!states[state]) states[state] = { responses: 0, surveys: new Set() };
        states[state].responses++;
        states[state].surveys.add(row.survey_id);
      }

      // Congressional district aggregation
      const cd = demographics.congressional_district?.trim();
      if (cd && state) {
        const key = `${state}-${cd}`;
        if (!districts[key]) districts[key] = { responses: 0, parties: {} };
        districts[key].responses++;
        const party = demographics.party_affiliation?.trim();
        if (party) {
          districts[key].parties[party] = (districts[key].parties[party] || 0) + 1;
        }
      }

      // GPS points from canvass responses
      const location = demographics.location;
      if (typeof location === 'string' && location.includes(',')) {
        const parts = location.split(',').map((s: string) => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && Math.abs(parts[0]) <= 90) {
          points.push({ lat: parts[0], lng: parts[1], surveyId: row.survey_id });
        }
      }
    }

    // Serialize states (convert Set to count)
    const statesOut: Record<string, { responses: number; surveys: number }> = {};
    for (const [key, val] of Object.entries(states)) {
      statesOut[key] = { responses: val.responses, surveys: val.surveys.size };
    }

    // Get user's primary org location for map center
    let orgCenter = null;
    try {
      const [orgRows]: any = await db.execute(
        `SELECT o.latitude, o.longitude, o.default_zoom, o.name
         FROM organizations o
         JOIN organization_members om ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.status = 'active'
         ORDER BY om.role = 'owner' DESC, o.created_at ASC
         LIMIT 1`,
        [userId]
      );
      if (orgRows.length > 0) {
        orgCenter = {
          latitude: parseFloat(orgRows[0].latitude),
          longitude: parseFloat(orgRows[0].longitude),
          zoom: orgRows[0].default_zoom || 10,
          name: orgRows[0].name,
        };
      }
    } catch {
      // Org tables may not exist
    }

    return NextResponse.json({
      status: true,
      states: statesOut,
      districts,
      points: points.slice(0, 5000), // Cap for performance
      totalResponses: responses.length,
      totalSurveys: surveyIds.length,
      orgCenter,
    });
  } catch (error) {
    console.error('Dashboard geo error:', error);
    return NextResponse.json({ status: false, message: 'Failed to get geo data' }, { status: 500 });
  }
}
