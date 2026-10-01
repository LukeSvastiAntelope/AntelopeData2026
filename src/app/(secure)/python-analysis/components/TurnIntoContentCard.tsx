'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Clapperboard,
  ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ContentDraftSummary = {
  id: number;
  draftKind: 'chart_post' | 'explainer_video' | 'candidate_clip';
  title: string;
  claim: string;
  honestCaveat?: string | null;
  suggestedAngle?: string | null;
  flag: 'publishable' | 'directional_only';
  caption?: string | null;
  blurb?: string | null;
  figureStorageKey?: string | null;
  figureMediaUrl?: string | null;
  figureCaption?: string | null;
  sampleN?: number | null;
  sourceLine?: string | null;
  scriptJson?: Record<string, unknown> | null;
};

type Props = {
  drafts: ContentDraftSummary[];
  loading?: boolean;
  error?: string | null;
  onOpenChartPost?: (draft: ContentDraftSummary) => void;
  onRefresh?: () => void;
  compact?: boolean;
};

const KIND_META: Record<
  ContentDraftSummary['draftKind'],
  { label: string; icon: typeof ImageIcon; href?: string }
> = {
  chart_post: { label: 'Chart post', icon: ImageIcon },
  explainer_video: {
    label: 'Short video',
    icon: Clapperboard,
    href: '/spread/video',
  },
  candidate_clip: {
    label: 'Candidate clip',
    icon: Mic,
    href: '/spread/video?tab=clip',
  },
};

export function TurnIntoContentCard({
  drafts,
  loading,
  error,
  onOpenChartPost,
  compact,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Turning findings into content drafts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!drafts.length) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 space-y-3',
        compact && 'p-2 space-y-2'
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Turn this into content →</h3>
        <Badge variant="outline" className="text-[10px]">
          From your analytics
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {drafts.map((draft) => {
          const meta = KIND_META[draft.draftKind];
          const Icon = meta.icon;
          const videoHref =
            draft.draftKind === 'explainer_video'
              ? `/spread/video?draft=${draft.id}&kind=explainer`
              : draft.draftKind === 'candidate_clip'
                ? `/spread/video?tab=clip&draft=${draft.id}&kind=clip`
                : null;

          return (
            <div
              key={draft.id}
              className="rounded-md border border-border/80 p-2.5 space-y-2 flex flex-col"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-medium truncate">{meta.label}</span>
                <Badge
                  variant={
                    draft.flag === 'publishable' ? 'secondary' : 'outline'
                  }
                  className="ml-auto text-[10px] shrink-0"
                >
                  {draft.flag === 'publishable' ? 'Publishable' : 'Directional'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 flex-1">
                {draft.claim}
              </p>
              {draft.flag === 'directional_only' && draft.honestCaveat && (
                <p className="text-[10px] text-amber-800 dark:text-amber-200/90 line-clamp-2">
                  {draft.honestCaveat}
                </p>
              )}
              {draft.draftKind === 'chart_post' ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => onOpenChartPost?.(draft)}
                >
                  Open composer
                </Button>
              ) : videoHref ? (
                <Button asChild size="sm" className="h-7 text-xs w-full">
                  <Link href={videoHref}>
                    {draft.draftKind === 'explainer_video'
                      ? 'Open Video Studio'
                      : 'Record & upload'}
                  </Link>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Megaphone className="h-3 w-3" />
        Saved under Spread → From your analytics. Approval still required before
        anything posts.
      </p>
    </div>
  );
}
