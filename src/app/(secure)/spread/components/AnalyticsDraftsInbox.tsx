'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  Mic,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContentDraftSummary } from '@/app/(secure)/python-analysis/components/TurnIntoContentCard';

const KIND_LABEL: Record<ContentDraftSummary['draftKind'], string> = {
  chart_post: 'Chart post',
  explainer_video: 'Explainer video',
  candidate_clip: 'Candidate clip',
};

const KIND_ICON = {
  chart_post: ImageIcon,
  explainer_video: Clapperboard,
  candidate_clip: Mic,
} as const;

export function AnalyticsDraftsInbox() {
  const [drafts, setDrafts] = useState<ContentDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/analytics/to-content');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load drafts');
        if (!cancelled) {
          setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDraftStatus = async (
    id: number,
    status: 'dismissed' | 'used'
  ) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/analytics/to-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed');
      }
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <h3 className="font-medium">From your analytics</h3>
        <Badge variant="secondary">Drafts</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Chart posts, explainer videos, and candidate talking points generated
        from finished analyses. Open one to continue in the right tool —
        nothing posts without approval. Dismissed or opened drafts stop the
        Campaign Flow “Next: Spread” nudge.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading drafts…
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && drafts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No analytics drafts yet. Finish a Cohort Chat analysis and use “Turn
          this into content”.
        </p>
      )}

      <div className="space-y-2">
        {drafts.map((d) => {
          const Icon = KIND_ICON[d.draftKind];
          const href =
            d.draftKind === 'chart_post'
              ? '/cohort-chat/chat'
              : d.draftKind === 'explainer_video'
                ? `/spread/video?draft=${d.id}&kind=explainer`
                : `/spread/video?tab=clip&draft=${d.id}&kind=clip`;
          return (
            <div
              key={d.id}
              className="flex items-start gap-3 rounded-md border border-border/70 p-3"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {KIND_LABEL[d.draftKind]}
                  </span>
                  <Badge
                    variant={
                      d.flag === 'publishable' ? 'secondary' : 'outline'
                    }
                    className="text-[10px]"
                  >
                    {d.flag === 'publishable' ? 'Publishable' : 'Directional'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {d.claim}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={href}
                    onClick={() => {
                      // Video Studio GET ?id= also marks used; chart_post needs PATCH.
                      if (d.draftKind === 'chart_post') {
                        void setDraftStatus(d.id, 'used');
                      }
                    }}
                  >
                    Open
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={busyId === d.id}
                  title="Dismiss draft"
                  onClick={() => void setDraftStatus(d.id, 'dismissed')}
                >
                  {busyId === d.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
