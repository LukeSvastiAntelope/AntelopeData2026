'use client';

import { useState } from 'react';
import {
  Copy,
  Download,
  FilePlus2,
  Megaphone,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  copyImageToClipboard,
  downloadPng,
} from '../utils/persist-figure';
import { exportFigureToPdf } from '../utils/export-pdf';

export type ChartActionFigure = {
  /** Displayable src (data URL or /api/media/...) */
  src: string;
  label?: string;
  caption?: string;
  n?: number | null;
  /** Optional p-value for the finding (caveat gate) */
  pValue?: number | null;
  storageKey?: string | null;
  stepId?: string | null;
  /** Preceding step Python for social-card re-render */
  code?: string | null;
  /**
   * Columns referenced by the plot step (recorded at render).
   * Aggregate-only guard uses these — not the whole dataset.
   */
  sourceColumns?: string[] | null;
};

interface ChartActionsProps {
  figure: ChartActionFigure;
  /** Accumulate for Export report */
  onAddToReport?: (figure: ChartActionFigure) => void;
  /** S2 wires the social-card composer; optional no-op until then */
  onMakePost?: (figure: ChartActionFigure) => void;
  /** Open S3 content drafts for this chart / finding */
  onTurnIntoContent?: (figure: ChartActionFigure) => void;
  className?: string;
  /** When true, actions stay visible (mobile / always-on contexts) */
  alwaysVisible?: boolean;
}

/**
 * Compact action row under chart images in ConversationView.
 * Hover-reveal on desktop; always visible on mobile (or when alwaysVisible).
 */
export function ChartActions({
  figure,
  onAddToReport,
  onMakePost,
  onTurnIntoContent,
  className,
  alwaysVisible = false,
}: ChartActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const label = figure.label || 'chart';

  const run = async (key: string, fn: () => Promise<void>) => {
    setHint(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        'mt-2 flex flex-col gap-1',
        !alwaysVisible &&
          'opacity-100 md:opacity-0 md:group-hover/chart:opacity-100 md:focus-within:opacity-100 transition-opacity',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={busy !== null}
          onClick={() =>
            void run('download', () => downloadPng(figure.src, label))
          }
          title="Download PNG"
        >
          <Download className="w-3 h-3 mr-1" />
          {busy === 'download' ? '…' : 'Download'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={busy !== null}
          onClick={() =>
            void run('copy', async () => {
              await copyImageToClipboard(figure.src);
              setHint('Copied');
              setTimeout(() => setHint(null), 1500);
            })
          }
          title="Copy image"
        >
          <Copy className="w-3 h-3 mr-1" />
          {busy === 'copy' ? '…' : 'Copy'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={busy !== null || !onAddToReport}
          onClick={() => {
            onAddToReport?.(figure);
            setHint('Added to report');
            setTimeout(() => setHint(null), 1500);
          }}
          title="Add to report"
        >
          <FilePlus2 className="w-3 h-3 mr-1" />
          Add to report
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={busy !== null}
          onClick={() => {
            if (onMakePost) {
              onMakePost(figure);
              return;
            }
            setHint('Make a post — coming next');
            setTimeout(() => setHint(null), 2000);
          }}
          title="Make a post (social card)"
        >
          <Megaphone className="w-3 h-3 mr-1" />
          Make a post
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={busy !== null || !onTurnIntoContent}
          onClick={() => onTurnIntoContent?.(figure)}
          title="Turn this finding into content drafts"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Content
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2 text-muted-foreground"
          disabled={busy !== null}
          onClick={() =>
            void run('pdf', async () => {
              const dataUrl = figure.src.startsWith('data:')
                ? figure.src
                : await (await import('../utils/persist-figure')).fetchImageAsDataUrl(
                    figure.src
                  );
              await exportFigureToPdf(dataUrl, label);
            })
          }
          title="Export this figure as PDF"
        >
          {busy === 'pdf' ? '…' : 'PDF'}
        </Button>
      </div>
      {hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
      {typeof figure.n === 'number' && figure.n > 0 && (
        <span className="text-[11px] text-muted-foreground">
          N={figure.n}
          {figure.caption ? ` · ${figure.caption}` : ''}
        </span>
      )}
    </div>
  );
}
