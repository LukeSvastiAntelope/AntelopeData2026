import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * GET /api/dashboard/political
 *
 * Viewport-driven political data API.
 * Returns state, district, or county level data based on zoom level.
 *
 * Query params:
 *   zoom     - current map zoom level (determines detail level)
 *   sw_lng   - southwest longitude of viewport
 *   sw_lat   - southwest latitude of viewport
 *   ne_lng   - northeast longitude of viewport
 *   ne_lat   - northeast latitude of viewport
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const zoom = parseFloat(searchParams.get('zoom') || '4');

    const db = await getConnection();

    // Determine detail level based on zoom
    if (zoom < 5) {
      // State level - return all states
      const [rows]: any = await db.execute(
        'SELECT * FROM political_data_states ORDER BY state'
      );

      return NextResponse.json({
        status: true,
        level: 'state',
        features: rows.map((r: any) => ({
          id: r.state,
          name: r.state_name,
          pvi: r.cook_pvi,
          pviNumeric: parseFloat(r.cook_pvi_numeric) || 0,
          electoralVotes: r.electoral_votes,
          margin2024: parseFloat(r.margin_2024) || 0,
          governorParty: r.governor_party,
          senateSeats: r.senate_seats,
          donations: {
            dem: parseInt(r.total_donations_dem) || 0,
            rep: parseInt(r.total_donations_rep) || 0,
          },
        })),
      });
    }

    if (zoom < 9) {
      // District level - return all districts (or filter by state if viewport is small)
      const [rows]: any = await db.execute(
        'SELECT * FROM political_data_districts ORDER BY state, district_number'
      );

      return NextResponse.json({
        status: true,
        level: 'district',
        features: rows.map((r: any) => ({
          id: r.district_code,
          state: r.state,
          districtNumber: r.district_number,
          pvi: r.cook_pvi,
          pviNumeric: parseFloat(r.cook_pvi_numeric) || 0,
          incumbentName: r.incumbent_name,
          incumbentParty: r.incumbent_party,
          margin2024: parseFloat(r.margin_2024) || 0,
          donations: {
            dem: parseInt(r.total_donations_dem) || 0,
            rep: parseInt(r.total_donations_rep) || 0,
            other: parseInt(r.total_donations_other) || 0,
          },
        })),
      });
    }

    // County level
    const [rows]: any = await db.execute(
      'SELECT * FROM political_data_counties ORDER BY state, county_fips'
    );

    return NextResponse.json({
      status: true,
      level: 'county',
      features: rows.map((r: any) => ({
        id: r.county_fips,
        state: r.state,
        name: r.county_name,
        margin2024: parseFloat(r.margin_2024) || 0,
        margin2020: parseFloat(r.margin_2020) || 0,
        swing: parseFloat(r.swing) || 0,
        totalVotes: r.total_votes_2024,
        population: r.population,
      })),
    });
  } catch (error) {
    console.error('Political data error:', error);
    return NextResponse.json({ status: false, message: 'Failed to get political data' }, { status: 500 });
  }
}
