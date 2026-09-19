/**
 * P2 engagement evidence + posterior from event stream.
 * Recency-weighted; directional signals produce posterior q.
 */

export type EngagementEventKind =
  | 'canvass_confirmed'
  | 'canvass_contacted'
  | 'canvass_refused'
  | 'canvass_not_home'
  | 'canvass_moved'
  | 'turf_confirmed'
  | 'turf_refused'
  | 'survey_response'
  | 'opt_out';

export type EngagementEvent = {
  kind: EngagementEventKind;
  /** Event time (ms). Missing → treated as "now" for weight. */
  atMs?: number | null;
  /** Optional party lean from the event (door confirm / turf). */
  party?: string | null;
  /** Optional survey sentiment on Dem-lean scale [0,1]. */
  sentiment01?: number | null;
};

export type EvidenceResult = {
  /** Accumulated recency-weighted evidence e ≥ 0 */
  e: number;
  /** Posterior q ∈ [0,1] when directional signal exists; else null */
  q: number | null;
  events: Array<{ kind: EngagementEventKind; weight: number; contribution: number }>;
};

const HALF_LIFE_DAYS = 45;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normParty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw.trim().toLowerCase();
  if (!p) return null;
  if (p.startsWith('democrat') || p === 'd' || p === 'dem') return 'Democrat';
  if (p.startsWith('republican') || p === 'r' || p === 'rep') return 'Republican';
  if (p.startsWith('independent') || p === 'i') return 'Independent';
  if (p.startsWith('unaffil')) return 'Unaffiliated';
  return raw.trim();
}

function partyToQ(party: string | null): number | null {
  switch (normParty(party)) {
    case 'Democrat':
      return 0.88;
    case 'Republican':
      return 0.12;
    case 'Independent':
      return 0.5;
    case 'Unaffiliated':
      return 0.48;
    default:
      return null;
  }
}

/** Base evidence magnitude by kind (before recency). */
function baseWeight(kind: EngagementEventKind): number {
  switch (kind) {
    case 'canvass_confirmed':
    case 'turf_confirmed':
      return 3.0; // collapses prior
    case 'canvass_refused':
    case 'turf_refused':
    case 'opt_out':
      return 3.2;
    case 'survey_response':
      return 2.2;
    case 'canvass_contacted':
      return 1.4;
    case 'canvass_not_home':
      return 0.45;
    case 'canvass_moved':
      return 0.8;
    default:
      return 0.5;
  }
}

function isDirectional(kind: EngagementEventKind): boolean {
  return (
    kind === 'canvass_confirmed' ||
    kind === 'turf_confirmed' ||
    kind === 'canvass_refused' ||
    kind === 'turf_refused' ||
    kind === 'opt_out' ||
    kind === 'survey_response' ||
    kind === 'canvass_contacted'
  );
}

function recencyMultiplier(atMs: number | null | undefined, nowMs: number): number {
  if (atMs == null || !Number.isFinite(atMs)) return 1;
  const ageDays = Math.max(0, (nowMs - atMs) / (1000 * 60 * 60 * 24));
  // Exponential half-life
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Accumulate evidence e and posterior q from engagement events.
 */
export function accumulateEvidence(
  events: EngagementEvent[],
  nowMs = Date.now()
): EvidenceResult {
  let e = 0;
  const detail: EvidenceResult['events'] = [];
  const qSamples: Array<{ q: number; w: number }> = [];

  for (const ev of events) {
    const w = baseWeight(ev.kind) * recencyMultiplier(ev.atMs ?? null, nowMs);
    e += w;
    detail.push({ kind: ev.kind, weight: w, contribution: w });

    if (!isDirectional(ev.kind)) continue;

    if (ev.kind === 'opt_out' || ev.kind === 'canvass_refused' || ev.kind === 'turf_refused') {
      qSamples.push({ q: 0.12, w });
      continue;
    }
    if (ev.sentiment01 != null && Number.isFinite(ev.sentiment01)) {
      qSamples.push({ q: clamp01(ev.sentiment01), w });
      continue;
    }
    const fromParty = partyToQ(ev.party ?? null);
    if (fromParty != null) {
      qSamples.push({ q: fromParty, w });
    } else if (ev.kind === 'survey_response') {
      // Response without lean → mild positive engagement toward center-high
      qSamples.push({ q: 0.58, w: w * 0.5 });
    } else if (ev.kind === 'canvass_contacted') {
      qSamples.push({ q: 0.52, w: w * 0.35 });
    }
  }

  let q: number | null = null;
  if (qSamples.length) {
    let num = 0;
    let den = 0;
    for (const s of qSamples) {
      num += s.q * s.w;
      den += s.w;
    }
    q = den > 0 ? clamp01(num / den) : null;
  }

  return { e, q, events: detail };
}

/** Map person_records canvass_status → engagement events. */
export function eventsFromPersonCanvass(row: {
  canvass_status?: string | null;
  canvass_party?: string | null;
  canvass_confirmed_at?: Date | string | null;
}): EngagementEvent[] {
  const status = (row.canvass_status || '').trim().toLowerCase();
  if (!status || status === 'not_contacted') return [];
  const at =
    row.canvass_confirmed_at != null ? new Date(row.canvass_confirmed_at).getTime() : null;
  const party = row.canvass_party;

  switch (status) {
    case 'confirmed':
      return [{ kind: 'canvass_confirmed', atMs: at, party }];
    case 'contacted':
      return [{ kind: 'canvass_contacted', atMs: at, party }];
    case 'refused':
      return [{ kind: 'canvass_refused', atMs: at, party }];
    case 'not_home':
      return [{ kind: 'canvass_not_home', atMs: at }];
    case 'moved':
    case 'wrong_address':
      return [{ kind: 'canvass_moved', atMs: at }];
    default:
      return [{ kind: 'canvass_contacted', atMs: at, party }];
  }
}

/** Map turf_stop_outcomes row → events. */
export function eventsFromTurfOutcome(row: {
  status?: string | null;
  party?: string | null;
  recorded_at?: Date | string | null;
}): EngagementEvent[] {
  const status = (row.status || '').trim().toLowerCase();
  const at = row.recorded_at != null ? new Date(row.recorded_at).getTime() : null;
  if (status === 'confirmed') {
    return [{ kind: 'turf_confirmed', atMs: at, party: row.party }];
  }
  if (status === 'refused') {
    return [{ kind: 'turf_refused', atMs: at, party: row.party }];
  }
  if (status === 'contacted') {
    return [{ kind: 'canvass_contacted', atMs: at, party: row.party }];
  }
  if (status === 'not_home') {
    return [{ kind: 'canvass_not_home', atMs: at }];
  }
  return [];
}
