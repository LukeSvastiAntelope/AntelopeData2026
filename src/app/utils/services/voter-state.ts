/**
 * VT2 — Current-state rollup + change tracking.
 *
 * Derived from the VT1 timeline projection. Observed history only: latest
 * value per tracked attribute plus its change history. State is recomputed
 * from events on every read — never overwritten, never a targeting score.
 */

import {
  voterTimeline,
  type TimelineEvent,
} from '@/app/utils/services/voter-timeline';

export type AttributeCategory =
  | 'issue'
  | 'partisanship'
  | 'donation'
  | 'engagement'
  | 'survey';

export type AttributeChange = {
  ts: string;
  value: string | null;
  previousValue: string | null;
  source: string;
  eventType: string;
  /** Short human label for this observation (e.g. survey title) */
  label: string | null;
  context?: Record<string, unknown>;
};

export type TrackedAttribute = {
  key: string;
  label: string;
  category: AttributeCategory;
  /** Latest observed value (null if never observed) */
  current: string | null;
  /** Timestamp of the latest observation */
  asOf: string | null;
  /** Chronological observations, oldest → newest. History is preserved. */
  history: AttributeChange[];
  /**
   * Human-readable rollup, e.g.
   * "major concern — as of Sep 2026 survey; was neutral in Jul 2026"
   */
  changeSummary: string | null;
};

export type VoterState = {
  personId: number;
  computedAt: string;
  attributes: TrackedAttribute[];
  issuePositions: TrackedAttribute[];
  partisanship: TrackedAttribute | null;
  donationStatus: TrackedAttribute | null;
  engagement: TrackedAttribute | null;
  lastSurvey: TrackedAttribute | null;
};

type MutableAttr = {
  key: string;
  label: string;
  category: AttributeCategory;
  history: AttributeChange[];
};

function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function issueKeyFromPrompt(prompt: string | null, questionId: number): string {
  const raw = (prompt || `question-${questionId}`).trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `issue:${slug || questionId}`;
}

function issueLabelFromPrompt(prompt: string | null, questionId: number): string {
  const p = (prompt || '').trim();
  if (!p) return `Question #${questionId}`;
  // Trim trailing punctuation / survey-ese for a short attribute label
  return p.replace(/\?+\s*$/, '').trim() || `Question #${questionId}`;
}

function normalizeValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  return v.length ? v : null;
}

function appendObservation(
  bag: Map<string, MutableAttr>,
  params: {
    key: string;
    label: string;
    category: AttributeCategory;
    ts: string;
    value: string | null;
    source: string;
    eventType: string;
    observationLabel?: string | null;
    context?: Record<string, unknown>;
  }
) {
  let attr = bag.get(params.key);
  if (!attr) {
    attr = {
      key: params.key,
      label: params.label,
      category: params.category,
      history: [],
    };
    bag.set(params.key, attr);
  }

  const previousValue =
    attr.history.length > 0 ? attr.history[attr.history.length - 1].value : null;

  // Skip exact no-op duplicates (same value + same ts) — preserve real changes
  const last = attr.history[attr.history.length - 1];
  if (
    last &&
    last.ts === params.ts &&
    last.value === params.value &&
    last.source === params.source
  ) {
    return;
  }

  attr.history.push({
    ts: params.ts,
    value: params.value,
    previousValue,
    source: params.source,
    eventType: params.eventType,
    label: params.observationLabel ?? null,
    context: params.context,
  });
}

function buildChangeSummary(attr: MutableAttr): string | null {
  if (!attr.history.length) return null;
  const latest = attr.history[attr.history.length - 1];
  const current = latest.value ?? 'unknown';
  const asOfLabel = latest.label
    ? `${monthLabel(latest.ts)} (${latest.label})`
    : monthLabel(latest.ts);

  // Find most recent prior value that differs
  let prior: AttributeChange | null = null;
  for (let i = attr.history.length - 2; i >= 0; i--) {
    if (attr.history[i].value !== latest.value) {
      prior = attr.history[i];
      break;
    }
  }

  if (!prior) {
    return `${current} — as of ${asOfLabel}`;
  }

  const priorLabel = prior.label
    ? `${monthLabel(prior.ts)} (${prior.label})`
    : monthLabel(prior.ts);
  return `${current} — as of ${asOfLabel}; was ${prior.value ?? 'unknown'} in ${priorLabel}`;
}

function finalize(attr: MutableAttr): TrackedAttribute {
  const latest = attr.history.length ? attr.history[attr.history.length - 1] : null;
  return {
    key: attr.key,
    label: attr.label,
    category: attr.category,
    current: latest?.value ?? null,
    asOf: latest?.ts ?? null,
    history: attr.history,
    changeSummary: buildChangeSummary(attr),
  };
}

function partyFromCanvass(ev: TimelineEvent): string | null {
  const party = normalizeValue(ev.payload.party as string | null | undefined);
  if (party) return party;
  const status = normalizeValue(ev.payload.status as string | null | undefined);
  // Door disposition that implies lean when party is absent
  if (
    status &&
    ['supporter', 'lean_support', 'undecided', 'lean_against', 'refused', 'dnc_request'].includes(
      status
    )
  ) {
    return status;
  }
  return null;
}

function donationValueFromEvent(ev: TimelineEvent): string {
  const payload = (ev.payload.payload as Record<string, unknown>) || {};
  const raw = (payload.raw as Record<string, unknown>) || payload;
  const amount = raw.amount ?? raw.donation_amount ?? raw.gift ?? null;
  if (amount != null && amount !== '') return `donor (${amount})`;
  return 'donor';
}

/**
 * Engagement / contactability ladder (latest wins, but history kept):
 *   suppressed / dnc  >  opted_in  >  on_contact_list  >  unknown
 */
function engagementFromEvent(ev: TimelineEvent): { value: string; label: string } | null {
  if (ev.type === 'contact.suppression') {
    const reason = normalizeValue(ev.payload.reason as string | null | undefined) || 'do_not_contact';
    return { value: `suppressed:${reason}`, label: 'suppression' };
  }
  if (ev.type === 'optin.signup') {
    const consent = ev.payload.consent !== false;
    return {
      value: consent ? 'opted_in' : 'optin_declined',
      label: (ev.payload.surveySlug as string) || 'opt-in',
    };
  }
  if (ev.type === 'contact.list_entry') {
    return {
      value: 'on_contact_list',
      label: (ev.payload.listName as string) || 'contact list',
    };
  }
  return null;
}

/**
 * Pure rollup: derive VoterState from an already-projected timeline.
 * Prefer this in tests; production uses voterState(personId).
 */
export function voterStateFromTimeline(
  personId: number,
  events: TimelineEvent[]
): VoterState {
  const bag = new Map<string, MutableAttr>();
  const chronological = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  for (const ev of chronological) {
    // ── Issue positions (survey answers) ──────────────────────────────
    if (ev.type === 'survey.response') {
      const surveyTitle =
        (ev.payload.surveyTitle as string | null | undefined) ||
        (ev.payload.surveyId != null ? `survey #${ev.payload.surveyId}` : 'survey');
      const answers = (ev.payload.answers as Array<{
        questionId: number;
        prompt: string | null;
        answerValue: string | null;
        answerCode: string | null;
      }>) || [];

      for (const a of answers) {
        const value = normalizeValue(a.answerValue) ?? normalizeValue(a.answerCode);
        if (value == null) continue;
        appendObservation(bag, {
          key: issueKeyFromPrompt(a.prompt, a.questionId),
          label: issueLabelFromPrompt(a.prompt, a.questionId),
          category: 'issue',
          ts: ev.ts,
          value,
          source: ev.source,
          eventType: ev.type,
          observationLabel: surveyTitle,
          context: {
            questionId: a.questionId,
            responseId: ev.payload.responseId,
            surveyId: ev.payload.surveyId,
          },
        });
      }

      // Last-survey participation attribute (one key, updates each response)
      appendObservation(bag, {
        key: 'survey:last_participation',
        label: 'Last survey participation',
        category: 'survey',
        ts: ev.ts,
        value: surveyTitle,
        source: ev.source,
        eventType: ev.type,
        observationLabel: surveyTitle,
        context: {
          responseId: ev.payload.responseId,
          surveyId: ev.payload.surveyId,
          answerCount: ev.payload.answerCount,
          channel: ev.payload.channel,
        },
      });
    }

    // ── Confirmed partisanship (canvass) ──────────────────────────────
    if (
      ev.type === 'canvass.contact' ||
      ev.type === 'canvass.confirmation' ||
      ev.type === 'canvass.turf_outcome'
    ) {
      const value = partyFromCanvass(ev);
      if (value) {
        appendObservation(bag, {
          key: 'partisanship:confirmed',
          label: 'Confirmed partisanship',
          category: 'partisanship',
          ts: ev.ts,
          value,
          source: ev.source,
          eventType: ev.type,
          observationLabel: ev.type === 'canvass.confirmation' ? 'door confirmation' : 'door knock',
          context: {
            status: ev.payload.status,
            party: ev.payload.party,
            personRecordId: ev.payload.personRecordId,
          },
        });
      }
    }

    // ── Donation status ───────────────────────────────────────────────
    if (ev.type === 'fundraising.capture') {
      appendObservation(bag, {
        key: 'donation:status',
        label: 'Donation status',
        category: 'donation',
        ts: ev.ts,
        value: donationValueFromEvent(ev),
        source: ev.source,
        eventType: ev.type,
        observationLabel: (ev.payload.sourceName as string) || 'fundraising',
        context: {
          sourceName: ev.payload.sourceName,
          sourceRowId: ev.payload.sourceRowId,
        },
      });
    }

    // ── Engagement / contactability ───────────────────────────────────
    const eng = engagementFromEvent(ev);
    if (eng) {
      appendObservation(bag, {
        key: 'engagement:contactability',
        label: 'Engagement / contactability',
        category: 'engagement',
        ts: ev.ts,
        value: eng.value,
        source: ev.source,
        eventType: ev.type,
        observationLabel: eng.label,
        context: { ...ev.payload },
      });
    }
  }

  const attributes = [...bag.values()].map(finalize).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.label.localeCompare(b.label);
  });

  const issuePositions = attributes.filter((a) => a.category === 'issue');
  const partisanship =
    attributes.find((a) => a.key === 'partisanship:confirmed') || null;
  const donationStatus = attributes.find((a) => a.key === 'donation:status') || null;
  const engagement =
    attributes.find((a) => a.key === 'engagement:contactability') || null;
  const lastSurvey =
    attributes.find((a) => a.key === 'survey:last_participation') || null;

  return {
    personId,
    computedAt: new Date().toISOString(),
    attributes,
    issuePositions,
    partisanship,
    donationStatus,
    engagement,
    lastSurvey,
  };
}

/**
 * Recompute current voter state from the live timeline projection.
 */
export async function voterState(personId: number): Promise<VoterState> {
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) {
    return {
      personId: id || 0,
      computedAt: new Date().toISOString(),
      attributes: [],
      issuePositions: [],
      partisanship: null,
      donationStatus: null,
      engagement: null,
      lastSurvey: null,
    };
  }
  const events = await voterTimeline(id);
  return voterStateFromTimeline(id, events);
}
