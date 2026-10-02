/**
 * Shared social-card stage guards (server). Caveat + owned media.
 */

import { NextResponse } from 'next/server';
import {
  assertOwnership,
  normalizeUserId,
} from '@/app/utils/auth/require-user';
import { sanitizeBlobKey } from '@/app/utils/services/storage/vercel-blob-storage';
import { POSTABLE_INSIGHT_THRESHOLDS } from '@/app/utils/services/postable-insight-service';
import { SMALL_SAMPLE_DISCLAIMER } from '@/app/utils/services/autotrigger-outputs';
import {
  assertAggregateOnly,
} from '@/app/utils/services/aggregate-only-guard';

/** Directional / non-significant finding — never optional when p is weak or missing. */
export const NOT_SIGNIFICANT_DISCLAIMER =
  'Not statistically significant at α=0.05 (or p unavailable): treat this as directional, not definitive.';

export type SocialCardStatInput = {
  sampleN?: number | null;
  pValue?: number | null;
};

export function isSmallSample(
  sampleN: number | null | undefined,
  thresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  if (sampleN == null || !Number.isFinite(sampleN)) return true;
  return (
    sampleN < thresholds.minCellSize ||
    sampleN < thresholds.minTotalResponses
  );
}

export function isNotSignificant(
  pValue: number | null | undefined,
  thresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  if (pValue == null || !Number.isFinite(pValue)) return true;
  return pValue >= thresholds.alpha;
}

/** Server-side caveat gate — never trust a client caveatRequired flag. */
export function isSocialCardCaveatRequired(
  stats: SocialCardStatInput,
  thresholds = POSTABLE_INSIGHT_THRESHOLDS
): boolean {
  return (
    isSmallSample(stats.sampleN, thresholds) ||
    isNotSignificant(stats.pValue, thresholds)
  );
}

export function buildRequiredSocialCardCaveat(
  stats: SocialCardStatInput,
  thresholds = POSTABLE_INSIGHT_THRESHOLDS
): string {
  const parts: string[] = [];
  if (isSmallSample(stats.sampleN, thresholds)) {
    parts.push(SMALL_SAMPLE_DISCLAIMER);
  }
  if (isNotSignificant(stats.pValue, thresholds)) {
    parts.push(NOT_SIGNIFICANT_DISCLAIMER);
  }
  return parts.join(' ') || SMALL_SAMPLE_DISCLAIMER;
}

/**
 * If caveat is required, ensure caption/caveat carry the server disclaimer.
 * Ignores client caveatRequired.
 */
export function enforceSocialCardCaveat(opts: {
  stats: SocialCardStatInput;
  clientCaveat?: string | null;
  caption?: string | null;
}): {
  required: boolean;
  caveat: string | null;
  caption: string;
} {
  const required = isSocialCardCaveatRequired(opts.stats);
  const caption = String(opts.caption || '').trim();
  if (!required) {
    const caveat = String(opts.clientCaveat || '').trim() || null;
    return { required: false, caveat, caption };
  }

  const requiredText = buildRequiredSocialCardCaveat(opts.stats);
  let caveat = String(opts.clientCaveat || '').trim();
  if (!caveat) {
    caveat = requiredText;
  } else {
    // Ensure both small-n and not-significant language are present when needed
    if (
      isSmallSample(opts.stats.sampleN) &&
      !/small-sample/i.test(caveat)
    ) {
      caveat = `${caveat}\n\n${SMALL_SAMPLE_DISCLAIMER}`.trim();
    }
    if (
      isNotSignificant(opts.stats.pValue) &&
      !/not statistically significant/i.test(caveat)
    ) {
      caveat = `${caveat}\n\n${NOT_SIGNIFICANT_DISCLAIMER}`.trim();
    }
  }

  let nextCaption = caption;
  const lower = nextCaption.toLowerCase();
  if (caveat && !lower.includes(caveat.slice(0, 24).toLowerCase())) {
    if (
      isSmallSample(opts.stats.sampleN) &&
      !lower.includes('small-sample')
    ) {
      nextCaption = `${nextCaption}\n\n${SMALL_SAMPLE_DISCLAIMER}`.trim();
    }
    if (
      isNotSignificant(opts.stats.pValue) &&
      !lower.includes('not statistically significant')
    ) {
      nextCaption = `${nextCaption}\n\n${NOT_SIGNIFICANT_DISCLAIMER}`.trim();
    }
  }

  return { required: true, caveat, caption: nextCaption };
}

export function normalizeStorageKey(raw: string): string | null {
  const trimmed = String(raw || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^api\/media\//i, '');
  if (!trimmed) return null;
  try {
    return sanitizeBlobKey(trimmed);
  } catch {
    return null;
  }
}

/** Same ownership rule as /api/media: first key segment == caller user id. */
export function assertCallerOwnsStorageKey(
  userId: string | number,
  storageKey: string
): { ok: true; key: string } | { ok: false; response: NextResponse } {
  const key = normalizeStorageKey(storageKey);
  if (!key) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid storageKey', status: false },
        { status: 400 }
      ),
    };
  }
  const ownerSegment = key.split('/')[0] || '';
  const forbidden = assertOwnership(String(userId), ownerSegment);
  if (forbidden) {
    return { ok: false, response: forbidden };
  }
  return { ok: true, key };
}

/**
 * Stage input: require an owned storageKey. Reject arbitrary external mediaUrl.
 * mediaUrl may only be the matching /api/media/{key} (or omitted).
 */
export function resolveOwnedSocialCardMedia(opts: {
  userId: string | number;
  storageKey?: string | null;
  mediaUrl?: string | null;
}):
  | { ok: true; storageKey: string; mediaUrl: string }
  | { ok: false; response: NextResponse } {
  const rawKey = String(opts.storageKey || '').trim();
  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'storageKey is required and must be an owned media object. External mediaUrl is not allowed.',
          status: false,
        },
        { status: 400 }
      ),
    };
  }

  const owned = assertCallerOwnsStorageKey(opts.userId, rawKey);
  if (owned.ok === false) return owned;

  const mediaUrlRaw = String(opts.mediaUrl || '').trim();
  if (mediaUrlRaw) {
    // Absolute http(s) to foreign hosts — reject
    if (/^https?:\/\//i.test(mediaUrlRaw)) {
      try {
        const u = new URL(mediaUrlRaw);
        // Allow same-origin /api/media/... if path matches key
        const path = u.pathname.replace(/^\/+/, '');
        const expected = `api/media/${owned.key}`;
        if (path !== expected && path !== owned.key) {
          return {
            ok: false,
            response: NextResponse.json(
              {
                error:
                  'External mediaUrl is not allowed. Use an owned storageKey.',
                status: false,
              },
              { status: 400 }
            ),
          };
        }
      } catch {
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Invalid mediaUrl', status: false },
            { status: 400 }
          ),
        };
      }
    } else {
      const path = mediaUrlRaw.replace(/^\/+/, '');
      const expected = `api/media/${owned.key}`;
      if (
        path !== expected &&
        path !== owned.key &&
        normalizeStorageKey(path) !== owned.key
      ) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error:
                'mediaUrl must match the owned storageKey (/api/media/...).',
              status: false,
            },
            { status: 400 }
          ),
        };
      }
    }
  }

  return {
    ok: true,
    storageKey: owned.key,
    mediaUrl: `/api/media/${owned.key}`,
  };
}

export function assertSocialCardAggregateColumns(
  sourceColumns: unknown
): { ok: true; columns: string[] } | { ok: false; response: NextResponse } {
  const columns = Array.isArray(sourceColumns)
    ? sourceColumns.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  // Fail closed: without recorded source columns we cannot prove aggregate-only
  if (!columns.length) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'sourceColumns required: shareable cards need the figure’s recorded plot columns (aggregate-only).',
          status: false,
        },
        { status: 400 }
      ),
    };
  }
  const guard = assertAggregateOnly(columns);
  if (!guard.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: guard.message, status: false, identifying: guard.identifying },
        { status: 400 }
      ),
    };
  }
  return { ok: true, columns };
}

/** Tool-path throw helpers (no NextResponse). */
export function assertOwnedStorageKeyOrThrow(
  userId: string | number,
  storageKey: string
): string {
  const key = normalizeStorageKey(storageKey);
  if (!key) throw new Error('Invalid storageKey');
  const caller = normalizeUserId(String(userId));
  const owner = normalizeUserId(key.split('/')[0] || '');
  if (!caller || !owner || caller !== owner) {
    throw new Error('Forbidden: storageKey is not owned by the caller');
  }
  return key;
}

export function resolveOwnedSocialCardMediaOrThrow(opts: {
  userId: string | number;
  storageKey?: string | null;
  mediaUrl?: string | null;
}): { storageKey: string; mediaUrl: string } {
  const result = resolveOwnedSocialCardMedia(opts);
  if (result.ok === false) {
    throw new Error(
      'storageKey is required and must be an owned media object. External mediaUrl is not allowed.'
    );
  }
  return result;
}

export function assertSocialCardAggregateColumnsOrThrow(
  sourceColumns: unknown
): string[] {
  const columns = Array.isArray(sourceColumns)
    ? sourceColumns.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  if (!columns.length) {
    throw new Error(
      'sourceColumns required: shareable cards need the figure’s recorded plot columns (aggregate-only).'
    );
  }
  const guard = assertAggregateOnly(columns);
  if (!guard.ok) {
    throw new Error(guard.message || 'Aggregate-only guard failed');
  }
  return columns;
}
