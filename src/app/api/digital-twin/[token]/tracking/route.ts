import { NextRequest, NextResponse } from 'next/server';
import { loadTwinTracking } from '@/app/utils/services/voter-tracking';

export const runtime = 'nodejs';

/**
 * GET /api/digital-twin/[token]/tracking
 * VT1 timeline + VT2 state for the Voter Profile detail (Voter 360).
 * Optional ?personId= to pin a person_records cluster.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ status: false, message: 'Missing token' }, { status: 400 });
    }

    const personRaw = req.nextUrl.searchParams.get('personId');
    const personIdOverride = personRaw ? Number(personRaw) : null;

    const bundle = await loadTwinTracking(
      token,
      personIdOverride != null && Number.isFinite(personIdOverride)
        ? personIdOverride
        : null
    );

    if (!bundle) {
      return NextResponse.json(
        { status: false, message: 'Voter profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: true,
      agentToken: bundle.agentToken,
      personId: bundle.personId,
      linked: bundle.linked,
      email: bundle.email,
      disclaimer: bundle.disclaimer,
      timeline: bundle.timeline,
      state: bundle.state,
    });
  } catch (error) {
    console.error('[digital-twin/tracking GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
