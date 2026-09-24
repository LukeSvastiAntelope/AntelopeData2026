import { NextRequest, NextResponse } from 'next/server';
import { TurfRepo, type TurfStopStatus } from '@/app/utils/database/turf-repo';
import { WalkTokenRepo } from '@/app/utils/database/walk-token-repo';

export const runtime = 'nodejs';

const ALLOWED = new Set<string>([
  'not_home',
  'refused',
  'supporter',
  'undecided',
  'lean_support',
  'lean_against',
  'moved',
  'wrong_address',
  'dnc_request',
  'contacted',
  'confirmed',
]);

type SyncEvent = {
  clientEventId: string;
  voterGeoId: number;
  status: string;
  party?: string | null;
  notes?: string | null;
  recordedAt?: string | null;
};

/**
 * POST /api/public/walk/[token]/sync
 * Flush offline door outcomes. Each event must include client_event_id (idempotent).
 * voterGeoId must be on the token's turf — otherwise 403 (no cross-turf PII/writes).
 */
export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({}));
    const events: SyncEvent[] = Array.isArray(body.events)
      ? body.events
      : body.clientEventId
        ? [body as SyncEvent]
        : [];

    if (!events.length) {
      return NextResponse.json(
        { status: false, message: 'events[] required' },
        { status: 400 }
      );
    }
    if (events.length > 200) {
      return NextResponse.json(
        { status: false, message: 'Max 200 events per sync' },
        { status: 400 }
      );
    }

    const results: Array<{
      clientEventId: string;
      ok: boolean;
      contactId?: number;
      error?: string;
    }> = [];

    for (const ev of events) {
      const clientEventId = String(ev.clientEventId || '').trim().slice(0, 64);
      const voterGeoId = Number(ev.voterGeoId);
      const status = String(ev.status || '').trim();

      if (!clientEventId || !Number.isFinite(voterGeoId) || !status) {
        results.push({
          clientEventId: clientEventId || 'missing',
          ok: false,
          error: 'clientEventId, voterGeoId, status required',
        });
        continue;
      }
      if (!ALLOWED.has(status)) {
        results.push({ clientEventId, ok: false, error: 'invalid status' });
        continue;
      }

      // Hard scope: door must belong to this turf
      const onTurf = await WalkTokenRepo.isDoorOnTurf(walk.turf_id, voterGeoId);
      if (!onTurf) {
        results.push({
          clientEventId,
          ok: false,
          error: 'voterGeoId not on this turf',
        });
        continue;
      }

      try {
        const { contactId } = await TurfRepo.recordStop({
          organizationId: walk.organization_id,
          turfId: walk.turf_id,
          voterGeoId,
          recordedBy: walk.canvasser_user_id,
          status: status as TurfStopStatus,
          party: ev.party ?? null,
          notes: ev.notes ?? null,
          recordedAt: ev.recordedAt ?? null,
          clientEventId,
        });
        results.push({ clientEventId, ok: true, contactId });
      } catch (e) {
        results.push({
          clientEventId,
          ok: false,
          error: e instanceof Error ? e.message : 'record failed',
        });
      }
    }

    void WalkTokenRepo.touchLastUsed(walk.id);

    const accepted = results.filter((r) => r.ok).length;
    const failed = results.length - accepted;
    return NextResponse.json({
      status: true,
      accepted,
      failed,
      results,
    });
  } catch (error) {
    console.error('[public/walk sync]', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
