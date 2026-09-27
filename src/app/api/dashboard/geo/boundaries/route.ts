import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getStateLegislativeBoundaries,
  layerForOfficeType,
  type TigerLayer,
} from '@/app/utils/services/geo/tiger-boundaries';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/geo/boundaries?state=NJ&layer=sldl|sldu
 *   or ?state=NJ&officeType=state_house
 * Returns cached/normalized TIGER state-legislative district GeoJSON.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { status: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const sp = new URL(request.url).searchParams;
    const state = (sp.get('state') || '').trim().toUpperCase();
    const officeType = sp.get('officeType');
    let layer = (sp.get('layer') || '') as TigerLayer | '';
    if (!layer && officeType) {
      layer = (layerForOfficeType(officeType) || '') as TigerLayer | '';
    }
    if (!state || (layer !== 'sldl' && layer !== 'sldu')) {
      return NextResponse.json(
        {
          status: false,
          message: 'state and layer=sldl|sldu (or officeType=state_house|state_senate) required',
        },
        { status: 400 }
      );
    }

    const forceRefresh = sp.get('refresh') === '1';
    const result = await getStateLegislativeBoundaries({
      state,
      layer,
      forceRefresh,
    });

    return NextResponse.json({
      status: result.status === 'ok',
      ...result,
    });
  } catch (error) {
    console.error('[geo/boundaries]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
