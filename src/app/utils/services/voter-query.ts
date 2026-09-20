/**
 * VT3 — Queryable tracked attributes (feeds #3 outbound, does not build it).
 *
 * Composes D2 map/collation filters with the VT2 rollup so a selection like
 * "woman, 35+, public-security = major issue, has donated" is one query.
 * Change-state filters (changed / was / changedSince) are first-class.
 * Observed history only — not a targeting score for the Orchestrator.
 */

import {
  PersonRepo,
  type PersonMapFilters,
  type PersonRecordRow,
} from '@/app/utils/database/person-repo';
import {
  voterState,
  type AttributeCategory,
  type TrackedAttribute,
  type VoterState,
} from '@/app/utils/services/voter-state';

export type TrackedAttributeFilter = {
  /**
   * Attribute key (`issue:public-security`, `donation:status`, …)
   * or free-text issue label (`public security`, `public-security`).
   */
  key?: string;
  /** Alias for key when filtering an issue by label/slug. */
  issue?: string;
  category?: AttributeCategory;
  /** Current value must match (case-insensitive; allows substring). */
  equals?: string;
  /** Convenience: current value starts with "donor". */
  hasDonated?: boolean;
  /** Change-state: attribute has at least two distinct observed values. */
  changed?: boolean;
  /** Change-state: a prior value matched this (case-insensitive substring). */
  was?: string;
  /** Change-state: latest change (asOf) is on/after this ISO date. */
  changedSince?: string;
};

export type VoterQueryFilters = PersonMapFilters & {
  /** VT2 tracked-attribute predicates (AND). */
  tracked?: TrackedAttributeFilter[];
  /**
   * Convenience shortcut — same as tracked: [{ hasDonated: true }]
   * plus SQL pre-narrow via hasDonatedSource.
   */
  hasDonated?: boolean;
  /** Attach full VoterState on each hit (default true when tracked filters present). */
  includeState?: boolean;
  /** Max candidates from D2 before VT2 post-filter. */
  candidateLimit?: number;
};

export type VoterQueryHit = {
  personId: number;
  person: PersonRecordRow;
  state: VoterState | null;
  matchedAttributes: TrackedAttribute[];
};

export type VoterQueryResult = {
  count: number;
  candidateCount: number;
  people: VoterQueryHit[];
  filters: VoterQueryFilters;
};

function slugify(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function norm(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .toLowerCase();
}

function valueMatches(actual: string | null | undefined, expected: string): boolean {
  const a = norm(actual);
  const e = norm(expected);
  if (!e) return true;
  if (!a) return false;
  return a === e || a.includes(e) || e.includes(a);
}

function resolveAttrKey(filter: TrackedAttributeFilter): string | null {
  const raw = filter.key || filter.issue;
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.includes(':')) return s.toLowerCase();
  const slug = slugify(s);
  return slug ? `issue:${slug}` : null;
}

function findMatchingAttributes(
  state: VoterState,
  filter: TrackedAttributeFilter
): TrackedAttribute[] {
  const key = resolveAttrKey(filter);
  let pool = state.attributes;

  if (filter.category) {
    pool = pool.filter((a) => a.category === filter.category);
  }
  if (key) {
    pool = pool.filter(
      (a) =>
        a.key === key ||
        a.key.endsWith(`:${slugify(key.replace(/^issue:/, ''))}`) ||
        slugify(a.label) === slugify(key.replace(/^issue:/, '')) ||
        slugify(a.label).includes(slugify(filter.issue || filter.key || ''))
    );
  } else if (filter.hasDonated) {
    pool = pool.filter((a) => a.key === 'donation:status' || a.category === 'donation');
  }

  return pool.filter((attr) => {
    if (filter.hasDonated) {
      const cur = norm(attr.current);
      if (!(cur.startsWith('donor') || cur.includes('donat'))) return false;
    }
    if (filter.equals != null && !valueMatches(attr.current, filter.equals)) {
      return false;
    }
    if (filter.changed) {
      const distinct = new Set(attr.history.map((h) => norm(h.value)).filter(Boolean));
      if (distinct.size < 2 && attr.history.length < 2) return false;
      if (distinct.size < 2) return false;
    }
    if (filter.was != null) {
      // Any prior observation matching `was` that isn't the current value
      const histWas = attr.history.some(
        (h) =>
          valueMatches(h.value, filter.was!) &&
          (!attr.current || norm(h.value) !== norm(attr.current))
      );
      const viaPrevious = attr.history.some(
        (h) =>
          h.previousValue != null && valueMatches(h.previousValue, filter.was!)
      );
      if (!histWas && !viaPrevious) return false;
    }
    if (filter.changedSince) {
      const since = new Date(filter.changedSince).getTime();
      if (!Number.isFinite(since)) return false;
      const changedAt = attr.asOf ? new Date(attr.asOf).getTime() : NaN;
      if (!Number.isFinite(changedAt) || changedAt < since) return false;
      // Require an actual change (not first observation only) when since is set
      // unless history is single and asOf >= since (first sighting counts as state change)
      if (attr.history.length >= 2) {
        const lastChange = attr.history[attr.history.length - 1];
        const prev = attr.history[attr.history.length - 2];
        if (norm(lastChange.value) === norm(prev.value)) {
          // look for any change after since
          let found = false;
          for (let i = 1; i < attr.history.length; i++) {
            const t = new Date(attr.history[i].ts).getTime();
            if (
              t >= since &&
              norm(attr.history[i].value) !== norm(attr.history[i - 1].value)
            ) {
              found = true;
              break;
            }
          }
          if (!found) return false;
        } else if (new Date(lastChange.ts).getTime() < since) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Pure predicate: does this VT2 state satisfy all tracked filters?
 */
export function matchesTrackedFilters(
  state: VoterState,
  filters: TrackedAttributeFilter[]
): { ok: boolean; matched: TrackedAttribute[] } {
  if (!filters.length) return { ok: true, matched: [] };
  const matched: TrackedAttribute[] = [];
  for (const f of filters) {
    const hits = findMatchingAttributes(state, f);
    if (!hits.length) return { ok: false, matched: [] };
    matched.push(...hits);
  }
  // Dedupe by key
  const byKey = new Map(matched.map((a) => [a.key, a]));
  return { ok: true, matched: [...byKey.values()] };
}

function buildTrackedList(filters: VoterQueryFilters): TrackedAttributeFilter[] {
  const list = [...(filters.tracked || [])];
  if (filters.hasDonated) {
    const already = list.some((t) => t.hasDonated || t.key === 'donation:status');
    if (!already) list.push({ hasDonated: true, category: 'donation' });
  }
  return list;
}

/**
 * One query over D2 map/collation filters + VT2 tracked attributes / change-state.
 * Does not invent outbound or targeting scores.
 */
export async function queryVoters(
  filters: VoterQueryFilters = {}
): Promise<VoterQueryResult> {
  const tracked = buildTrackedList(filters);
  const needsState =
    filters.includeState === true ||
    (filters.includeState !== false && tracked.length > 0);

  const mapFilters: PersonMapFilters = {
    ...filters,
    hasDonatedSource: filters.hasDonatedSource || filters.hasDonated || undefined,
    requireCoordinates: filters.requireCoordinates,
    limit: filters.candidateLimit || filters.limit || 5000,
  };

  const candidates = await PersonRepo.listForMap(mapFilters);
  const people: VoterQueryHit[] = [];

  if (!tracked.length && !needsState) {
    for (const person of candidates) {
      people.push({
        personId: person.id,
        person,
        state: null,
        matchedAttributes: [],
      });
    }
    return {
      count: people.length,
      candidateCount: candidates.length,
      people,
      filters,
    };
  }

  // VT2 post-filter (recomputed on read — no frozen verdict store)
  for (const person of candidates) {
    const state = await voterState(person.id);
    if (tracked.length) {
      const { ok, matched } = matchesTrackedFilters(state, tracked);
      if (!ok) continue;
      people.push({
        personId: person.id,
        person,
        state: needsState ? state : null,
        matchedAttributes: matched,
      });
    } else {
      people.push({
        personId: person.id,
        person,
        state,
        matchedAttributes: [],
      });
    }
  }

  return {
    count: people.length,
    candidateCount: candidates.length,
    people,
    filters,
  };
}
