'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  HandCoins,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export type TrackingTimelineEvent = {
  ts: string;
  source: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
};

export type TrackingAttribute = {
  key: string;
  label: string;
  category: string;
  current: string | null;
  asOf: string | null;
  changeSummary: string | null;
  history: Array<{
    ts: string;
    value: string | null;
    previousValue: string | null;
    label: string | null;
  }>;
};

export type TrackingState = {
  personId: number;
  computedAt: string;
  attributes: TrackingAttribute[];
  issuePositions: TrackingAttribute[];
  partisanship: TrackingAttribute | null;
  donationStatus: TrackingAttribute | null;
  engagement: TrackingAttribute | null;
  lastSurvey: TrackingAttribute | null;
};

export type TwinTrackingPayload = {
  linked: boolean;
  personId: number | null;
  disclaimer: string;
  timeline: TrackingTimelineEvent[];
  state: TrackingState;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return iso.slice(0, 10);
  }
}

function sourceBadge(source: string): string {
  const map: Record<string, string> = {
    survey_responses: 'Survey',
    canvass_contacts: 'Canvass',
    person_records: 'Person',
    survey_optins: 'Opt-in',
    contact_list_entries: 'Contact list',
    contact_suppression: 'Suppression',
    person_merge_audit: 'Merge',
    fundraising: 'Fundraising',
    person_source_rows: 'Source',
    turf_stop_outcomes: 'Turf',
  };
  return map[source] || source;
}

function AttributeRow({ attr }: { attr: TrackingAttribute }) {
  const [open, setOpen] = useState(false);
  const hasHistory = (attr.history?.length || 0) > 1;

  return (
    <div className="border-b border-border last:border-0 py-3">
      <button
        type="button"
        className="w-full text-left flex items-start gap-2 group"
        onClick={() => hasHistory && setOpen((v) => !v)}
        disabled={!hasHistory}
      >
        {hasHistory ? (
          open ? (
            <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-sm">{attr.label}</span>
            <Badge variant="secondary" className="text-xs font-normal">
              {attr.current ?? '—'}
            </Badge>
            {attr.asOf && (
              <span className="text-xs text-muted-foreground">as of {fmtWhen(attr.asOf)}</span>
            )}
          </div>
          {attr.changeSummary && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {attr.changeSummary}
            </p>
          )}
        </div>
      </button>
      {open && hasHistory && (
        <ol className="mt-2 ml-6 space-y-1.5 border-l border-border pl-3">
          {[...attr.history].reverse().map((h, i) => (
            <li key={`${h.ts}-${i}`} className="text-xs text-muted-foreground">
              <span className="text-foreground">{h.value ?? '—'}</span>
              {' · '}
              {fmtWhen(h.ts)}
              {h.label ? ` · ${h.label}` : ''}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Voter360Panel({
  tracking,
  loading,
  error,
  onRetry,
}: {
  tracking: TwinTrackingPayload | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Voter 360…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!tracking) return null;

  const { state, timeline, linked, personId, disclaimer } = tracking;
  const issues = state.issuePositions || [];
  // Journey: chronological ascending (oldest → newest)
  const feed = [...timeline].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Quick context — canvasser / candidate glance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Voter 360
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{disclaimer}</p>
            </div>
            <div className="flex items-center gap-2">
              {linked && personId != null ? (
                <Badge variant="outline" className="font-mono text-xs">
                  person #{personId}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Survey-linked only
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickStat
              icon={<Shield className="h-4 w-4" />}
              label="Partisanship"
              value={state.partisanship?.current ?? 'Unknown'}
              hint={state.partisanship?.changeSummary}
            />
            <QuickStat
              icon={<HandCoins className="h-4 w-4" />}
              label="Donation (observed)"
              value={state.donationStatus?.current ?? 'No gift events'}
              hint={
                state.donationStatus?.changeSummary ||
                'From donation/list events only — never acquired financial data'
              }
            />
            <QuickStat
              icon={<MessageSquare className="h-4 w-4" />}
              label="Contactability"
              value={state.engagement?.current ?? 'Unknown'}
              hint={state.engagement?.changeSummary}
            />
            <QuickStat
              icon={<MapPin className="h-4 w-4" />}
              label="Last survey"
              value={state.lastSurvey?.current ?? 'None yet'}
              hint={
                state.lastSurvey?.asOf
                  ? `Submitted ${fmtWhen(state.lastSurvey.asOf)}`
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Current positions + change history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Current positions
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Latest value per tracked attribute, with change history preserved
          </p>
        </CardHeader>
        <CardContent>
          {issues.length === 0 &&
          !state.partisanship &&
          !state.donationStatus &&
          !state.engagement ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tracked positions yet — answers and door knocks will appear here as events arrive.
            </p>
          ) : (
            <div>
              {issues.map((a) => (
                <AttributeRow key={a.key} attr={a} />
              ))}
              {state.partisanship && <AttributeRow attr={state.partisanship} />}
              {state.donationStatus && <AttributeRow attr={state.donationStatus} />}
              {state.engagement && <AttributeRow attr={state.engagement} />}
              {state.lastSurvey && <AttributeRow attr={state.lastSurvey} />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            Activity timeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Chronological journey across surveys, canvass, opt-ins, contacts, and merges
            {feed.length ? ` · ${feed.length} event${feed.length === 1 ? '' : 's'}` : ''}
          </p>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No events projected yet for this voter.
            </p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-4">
              {feed.map((ev, i) => (
                <li key={`${ev.ts}-${ev.type}-${i}`} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-border bg-card" />
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {sourceBadge(ev.source)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmtWhen(ev.ts)}
                      {' · '}
                      {formatDistanceToNow(new Date(ev.ts), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{ev.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium truncate" title={value}>
        {value}
      </div>
      {hint && (
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
