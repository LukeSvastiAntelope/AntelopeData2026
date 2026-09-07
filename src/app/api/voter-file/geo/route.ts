import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * GET /api/voter-file/geo
 *
 * Aggregates voter file demographics by state, county, and congressional district.
 * Used by the dashboard map heatmap layer.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Digital twins / responder agents are the imported voter file records
    // They have demographics stored as JSON
    const [rows]: any = await db.execute(
      `SELECT ra.demographics
       FROM responder_agents ra
       JOIN survey_responses sr ON ra.agent_token = sr.agent_token
       JOIN surveys s ON sr.survey_id = s.id
       WHERE s.created_by = ?
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = s.organization_id
              AND om.user_id = ?
              AND om.status = 'active'
          )
       GROUP BY ra.id`,
      [userId, userId]
    );

    const states: Record<string, { count: number; parties: Record<string, number> }> = {};
    const counties: Record<string, { count: number; state: string }> = {};
    const districts: Record<string, { count: number; parties: Record<string, number> }> = {};

    for (const row of rows) {
      let demographics: any;
      try {
        demographics = typeof row.demographics === 'string'
          ? JSON.parse(row.demographics)
          : row.demographics;
      } catch {
        continue;
      }
      if (!demographics) continue;

      const state = demographics.state?.trim();
      const party = demographics.party_affiliation?.trim();

      // State
      if (state) {
        if (!states[state]) states[state] = { count: 0, parties: {} };
        states[state].count++;
        if (party) states[state].parties[party] = (states[state].parties[party] || 0) + 1;
      }

      // County
      const county = demographics.county?.trim();
      if (county && state) {
        const key = `${state}|${county}`;
        if (!counties[key]) counties[key] = { count: 0, state };
        counties[key].count++;
      }

      // Congressional district
      const cd = demographics.congressional_district?.trim();
      if (cd && state) {
        const key = `${state}-${cd}`;
        if (!districts[key]) districts[key] = { count: 0, parties: {} };
        districts[key].count++;
        if (party) districts[key].parties[party] = (districts[key].parties[party] || 0) + 1;
      }
    }

    return NextResponse.json({
      status: true,
      totalVoters: rows.length,
      states,
      counties,
      districts,
    });
  } catch (error) {
    console.error('Voter file geo error:', error);
    return NextResponse.json({ status: false, message: 'Failed to get voter geo data' }, { status: 500 });
  }
}
