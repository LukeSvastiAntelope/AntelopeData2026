import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import QRCode from 'qrcode';

export const runtime = 'nodejs';

/**
 * GET /api/surveys/[id]/qr?mode=default|canvass&format=png|dataurl
 *
 * Generate a QR code pointing to the public survey URL.
 *
 * Query params:
 *  - mode: "default" (standard survey) or "canvass" (mobile canvassing mode)
 *  - format: "png" (returns PNG image) or "dataurl" (returns JSON with data URL)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await openSql();

    // Verify survey ownership and get slug
    const [surveys]: any = await db.execute(
      'SELECT id, slug FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found' },
        { status: 404 }
      );
    }

    const slug = surveys[0].slug;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'default';
    const format = searchParams.get('format') || 'png';

    // Build the target URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://antelope.ai';
    const path = mode === 'canvass' ? `/survey/${slug}/canvass` : `/survey/${slug}`;
    const surveyUrl = `${baseUrl}${path}`;

    if (format === 'dataurl') {
      const dataUrl = await QRCode.toDataURL(surveyUrl, {
        width: 512,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      return NextResponse.json({
        status: true,
        dataUrl,
        surveyUrl,
      });
    }

    // Default: return PNG image
    const pngBuffer = await QRCode.toBuffer(surveyUrl, {
      width: 512,
      margin: 2,
      type: 'png',
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new NextResponse(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="survey-${surveyId}-qr.png"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed to generate QR code',
      },
      { status: 500 }
    );
  }
}
