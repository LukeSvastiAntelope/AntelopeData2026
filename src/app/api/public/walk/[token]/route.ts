import { NextRequest, NextResponse } from 'next/server';
import { TurfRepo } from '@/app/utils/database/turf-repo';
import { WalkTokenRepo } from '@/app/utils/database/walk-token-repo';
import { openSql } from '@/app/utils/database/db';

export const runtime = 'nodejs';

const ALLOWED_OUTCOMES = [
  { status: 'not_home', label: 'Not home' },
  { status: 'refused', label: 'Refused' },
  { status: 'supporter', label: 'Supporter' },
  { status: 'undecided', label: 'Undecided' },
  { status: 'lean_support', label: 'Follow-up' },
] as const;

/**
 * GET /api/public/walk/[token]
 * Public canvasser pull — doors ONLY for the token's turf. No login.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token: raw } = await context.params;
    const rawToken = String(raw || '').trim();
    if (!rawToken || rawToken.length < 16) {
      return NextResponse.json({ status: false, message: 'Invalid token' }, { status: 404 });
    }

    const walk = await WalkTokenRepo.resolveActive(rawToken);
    if (!walk) {
      return NextResponse.json(
        { status: false, message: 'Link expired or revoked' },
        { status: 403 }
      );
    }

    // Hard scope: org + turf from token only
    const listed = await TurfRepo.listAddresses(walk.turf_id, walk.organization_id, {
      limit: 20000,
    });
    if (!listed.turf || listed.turf.organization_id !== walk.organization_id) {
      return NextResponse.json({ status: false, message: 'Turf not found' }, { status: 404 });
    }

    // Optional canvasser display (no email / other PII beyond name)
    let canvasserName: string | null = null;
    try {
      const sql = await openSql();
      const [rows] = await sql.execute(
        `SELECT display_name FROM users WHERE id = ? LIMIT 1`,
        [walk.canvasser_user_id]
      );
      const u = (rows as any[])[0];
      canvasserName = u?.display_name ? String(u.display_name) : null;
    } catch {
      /* ignore */
    }

    void WalkTokenRepo.touchLastUsed(walk.id);

    // Minimal door payload — only fields needed to knock this turf
    const doors = listed.addresses.map((a) => ({
      voterGeoId: a.voterGeoId,
      sortOrder: a.sortOrder ?? 0,
      lat: a.latitude,
      lng: a.longitude,
      label: a.label,
      street: a.street,
      city: a.city,
      zip: a.zip,
      party: a.party,
      fieldStatus: a.canvassStatus,
      notes: a.fieldNotes ?? null,
    }));

    return NextResponse.json({
      status: true,
      walkTokenId: walk.id,
      expiresAt: walk.expires_at.toISOString(),
      turf: {
        id: listed.turf.id,
        label: listed.turf.label,
        addressCount: listed.turf.address_count,
      },
      canvasser: { name: canvasserName },
      outcomes: ALLOWED_OUTCOMES,
      doors,
    });
  } catch (error) {
    console.error('[public/walk GET]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
