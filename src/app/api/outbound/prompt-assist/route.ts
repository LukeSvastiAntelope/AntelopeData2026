import { NextRequest, NextResponse } from 'next/server';
import {
  assistOutboundGoal,
  OUTBOUND_GOAL_TEMPLATES,
} from '@/app/utils/services/outbound-prompt-assist';

export const runtime = 'nodejs';

/** GET /api/outbound/prompt-assist — goal/CTA templates for the Outbound UI. */
export async function GET() {
  return NextResponse.json({
    status: true,
    templates: OUTBOUND_GOAL_TEMPLATES,
  });
}

/**
 * POST /api/outbound/prompt-assist
 * Body: { plainDescription, segmentName?, formats?, mock? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const plainDescription = String(
      body?.plainDescription || body?.goal || body?.prompt || ''
    ).trim();
    if (!plainDescription) {
      return NextResponse.json(
        { status: false, message: 'plainDescription is required' },
        { status: 400 }
      );
    }

    const assisted = await assistOutboundGoal({
      plainDescription,
      segmentName: body?.segmentName ? String(body.segmentName) : null,
      formats: Array.isArray(body?.formats) ? body.formats.map(String) : undefined,
      mock: body?.mock === true,
    });

    return NextResponse.json({ status: true, ...assisted });
  } catch (error) {
    console.error('[outbound/prompt-assist]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
