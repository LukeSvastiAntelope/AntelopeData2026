'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Copy,
  Download,
  Loader2,
  Send,
  AlertTriangle,
} from 'lucide-react';
import type { ChartActionFigure } from './ChartActions';
import {
  SOCIAL_CARD_FORMATS,
  getSocialCardFormat,
  type SocialCardFormatId,
} from '../utils/social-card-formats';
import {
  buildAntelopeSocialStylePython,
  CAPTURE_SOCIAL_PLOTS_PYTHON,
} from '../utils/antelope-social-style';
import { assertAggregateOnly, extractSourceColumnsFromCode } from '../utils/aggregate-only-guard';
import { composeSocialCardPng } from '../utils/compose-social-card';
import {
  downloadPng,
  uploadChartPng,
} from '../utils/persist-figure';

/** Keep in sync with autotrigger-outputs / social-card-guards (client-safe copy). */
const SMALL_SAMPLE_DISCLAIMER =
  'Small-sample caveat: this finding is based on a limited number of responses and may not generalize. Treat it as directional, not definitive.';
const NOT_SIGNIFICANT_DISCLAIMER =
  'Not statistically significant at α=0.05 (or p unavailable): treat this as directional, not definitive.';

/** Client-safe mirrors of POSTABLE_INSIGHT_THRESHOLDS defaults (gate for caveat lock). */
const MIN_CELL_SIZE = 25;
const MIN_TOTAL_RESPONSES = 80;
const ALPHA = 0.05;

export type SocialCardComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  figure: ChartActionFigure | null;
  /** Preceding step Python for re-render (preferred over stretching the PNG) */
  stepCode?: string | null;
  pyodide?: any;
  datasetColumns?: string[];
  surveyTitle?: string | null;
  campaignName?: string | null;
  findingClaim?: string | null;
  initialCaveat?: string | null;
  /** When set (e.g. from S3 chart_post draft), skip AI headline rewrite */
  initialCaption?: string | null;
};

function buildSourceLine(surveyTitle: string | null | undefined, n: number | null | undefined) {
  const month = new Date().toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  const parts = [
    surveyTitle?.trim() || 'Survey',
    typeof n === 'number' && n > 0 ? `N=${n}` : null,
    month,
  ].filter(Boolean);
  return parts.join(', ');
}

function isSmallSample(n: number | null | undefined): boolean {
  if (n == null || !Number.isFinite(n)) return true;
  return n < MIN_CELL_SIZE || n < MIN_TOTAL_RESPONSES;
}

function isNotSignificant(p: number | null | undefined): boolean {
  if (p == null || !Number.isFinite(p)) return true;
  return p >= ALPHA;
}

function caveatRequiredForStats(
  n: number | null | undefined,
  p: number | null | undefined
): boolean {
  return isSmallSample(n) || isNotSignificant(p);
}

function buildRequiredCaveat(
  n: number | null | undefined,
  p: number | null | undefined
): string {
  const parts: string[] = [];
  if (isSmallSample(n)) parts.push(SMALL_SAMPLE_DISCLAIMER);
  if (isNotSignificant(p)) parts.push(NOT_SIGNIFICANT_DISCLAIMER);
  return parts.join('\n\n') || SMALL_SAMPLE_DISCLAIMER;
}

export function SocialCardComposer({
  open,
  onOpenChange,
  figure,
  stepCode,
  pyodide,
  datasetColumns = [],
  surveyTitle,
  campaignName,
  findingClaim,
  initialCaveat,
  initialCaption,
}: SocialCardComposerProps) {
  const [formatId, setFormatId] = useState<SocialCardFormatId>('linkedin_square');
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState('');
  const [caveat, setCaveat] = useState('');
  const [includeCaveat, setIncludeCaveat] = useState(true);
  const [chartSrc, setChartSrc] = useState<string | null>(null);
  const [cardSrc, setCardSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [orgName, setOrgName] = useState(campaignName || 'Campaign');

  const format = useMemo(() => getSocialCardFormat(formatId), [formatId]);
  const n = figure?.n ?? null;
  const pValue = figure?.pValue ?? null;
  const caveatRequired = caveatRequiredForStats(n, pValue);
  const sourceLine = useMemo(
    () => buildSourceLine(surveyTitle, n),
    [surveyTitle, n]
  );

  const sourceColumns = useMemo(() => {
    if (figure?.sourceColumns?.length) return figure.sourceColumns;
    return extractSourceColumnsFromCode(stepCode || figure?.code, datasetColumns);
  }, [figure?.sourceColumns, figure?.code, stepCode, datasetColumns]);

  const aggregateGuard = useMemo(
    () => assertAggregateOnly(sourceColumns),
    [sourceColumns]
  );

  // Load campaign name once
  useEffect(() => {
    if (!open) return;
    if (campaignName) {
      setOrgName(campaignName);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const name =
          data?.candidateName ||
          data?.name ||
          data?.user?.name ||
          'Campaign';
        setOrgName(String(name));
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, campaignName]);

  // Reset + draft when opening
  useEffect(() => {
    if (!open || !figure) return;
    setFormatId('linkedin_square');
    setError(null);
    setHint(null);
    setCardSrc(null);
    setChartSrc(figure.src);
    const claim =
      findingClaim ||
      figure.caption ||
      'Key finding from our survey';
    const captionSeed = initialCaption?.trim() || claim;
    setHeadline(captionSeed.slice(0, 90));
    setCaption(captionSeed);
    const required = caveatRequiredForStats(figure.n, figure.pValue);
    setIncludeCaveat(true);
    setCaveat(
      initialCaveat?.trim() ||
        (required ? buildRequiredCaveat(figure.n, figure.pValue) : '')
    );
    // Prefill from analytics draft — don't overwrite with a fresh headline
    if (!initialCaption?.trim()) {
      void draftHeadline(
        claim,
        sourceLine,
        required ? buildRequiredCaveat(figure.n, figure.pValue) : ''
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, figure?.src, figure?.stepId, initialCaption, findingClaim]);

  const draftHeadline = async (
    claim: string,
    source: string,
    caveatText: string
  ) => {
    setBusy('headline');
    try {
      const res = await fetch('/api/social-card/headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim,
          sourceLine: source,
          caveat: caveatText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.headline) {
        setHeadline(String(data.headline));
        setCaption(String(data.headline));
      }
    } catch {
      /* keep fallback claim */
    } finally {
      setBusy(null);
    }
  };

  const reRenderChart = useCallback(async () => {
    if (!figure) return null;
    if (!aggregateGuard.ok) {
      throw new Error(aggregateGuard.message);
    }
    const fmt = getSocialCardFormat(formatId);
    if (pyodide && stepCode?.trim()) {
      pyodide.runPython(buildAntelopeSocialStylePython(fmt.figsize));
      try {
        pyodide.runPython(stepCode);
      } catch (err) {
        console.warn('[social-card] step re-run failed, using original chart', err);
        return figure.src;
      }
      const plots = pyodide.runPython(CAPTURE_SOCIAL_PLOTS_PYTHON);
      const list =
        typeof plots?.toJs === 'function' ? plots.toJs() : plots;
      if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'string') {
        return list[0] as string;
      }
    }
    return figure.src;
  }, [aggregateGuard, figure, formatId, pyodide, stepCode]);

  const rebuildCard = useCallback(async () => {
    if (!figure) return;
    setBusy('compose');
    setError(null);
    try {
      if (!aggregateGuard.ok) {
        throw new Error(aggregateGuard.message);
      }
      const rendered = await reRenderChart();
      if (!rendered) throw new Error('No chart to compose');
      setChartSrc(rendered);
      const effectiveCaveat =
        includeCaveat || caveatRequired
          ? caveat.trim() || buildRequiredCaveat(n, pValue)
          : null;
      if (caveatRequired && !effectiveCaveat) {
        throw new Error('Caveat is required for this finding');
      }
      const card = await composeSocialCardPng({
        width: format.width,
        height: format.height,
        chartDataUrl: rendered,
        headline: headline.trim() || 'Insight',
        sourceLine,
        caveat: effectiveCaveat,
        campaignName: orgName,
      });
      setCardSrc(card);
      setHint('Card ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compose failed');
    } finally {
      setBusy(null);
      setTimeout(() => setHint(null), 2000);
    }
  }, [
    aggregateGuard,
    caveat,
    caveatRequired,
    figure,
    format,
    headline,
    includeCaveat,
    n,
    orgName,
    pValue,
    reRenderChart,
    sourceLine,
  ]);

  // Auto-compose when format/headline/caveat settle after open
  useEffect(() => {
    if (!open || !figure) return;
    const t = setTimeout(() => {
      void rebuildCard();
    }, 400);
    return () => clearTimeout(t);
    // intentionally limited deps — rebuild on format change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, formatId, figure?.src]);

  const handleDownload = async () => {
    if (!cardSrc) {
      await rebuildCard();
    }
    const src = cardSrc;
    if (!src) return;
    setBusy('download');
    try {
      await downloadPng(src, `social-card-${format.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyCaption = async () => {
    const effectiveCaveat =
      includeCaveat || caveatRequired
        ? caveat.trim() || buildRequiredCaveat(n, pValue)
        : '';
    const text = [caption.trim() || headline.trim(), sourceLine, effectiveCaveat]
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setHint('Caption copied');
      setTimeout(() => setHint(null), 1500);
    } catch {
      setError('Clipboard unavailable');
    }
  };

  const handleSendForApproval = async () => {
    if (!aggregateGuard.ok) {
      setError(aggregateGuard.message || 'Blocked by aggregate-only guard');
      return;
    }
    setBusy('stage');
    setError(null);
    try {
      let png = cardSrc;
      if (!png) {
        await rebuildCard();
        png = cardSrc;
      }
      // rebuildCard is async state — compose once more if needed
      if (!png) {
        const rendered = (await reRenderChart()) || figure?.src;
        if (!rendered) throw new Error('No chart');
        const effectiveCaveat =
          includeCaveat || caveatRequired
            ? caveat.trim() || buildRequiredCaveat(n, pValue)
            : null;
        png = await composeSocialCardPng({
          width: format.width,
          height: format.height,
          chartDataUrl: rendered,
          headline: headline.trim() || 'Insight',
          sourceLine,
          caveat: effectiveCaveat,
          campaignName: orgName,
        });
        setCardSrc(png);
      }
      if (caveatRequired && !(caveat.trim() || buildRequiredCaveat(n, pValue))) {
        throw new Error('Caveat is required and cannot be removed');
      }
      if (!sourceColumns.length) {
        throw new Error(
          'This chart is missing recorded source columns — re-run the plot step before posting.'
        );
      }
      const uploaded = await uploadChartPng(png, {
        filename: `social-card-${format.id}-${Date.now()}.png`,
      });
      const effectiveCaveat =
        includeCaveat || caveatRequired
          ? caveat.trim() || buildRequiredCaveat(n, pValue)
          : null;
      const platform =
        formatId.startsWith('linkedin')
          ? 'linkedin'
          : formatId === 'story_reel'
            ? 'story'
            : 'instagram';
      const res = await fetch('/api/social-card/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: uploaded.storageKey,
          mediaUrl: uploaded.url,
          headline: headline.trim(),
          caption: caption.trim() || headline.trim(),
          caveat: effectiveCaveat,
          sourceLine,
          format: format.id,
          platform,
          sampleN: n,
          pValue,
          sourceColumns,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to stage for approval');
      }
      setHint('Sent for approval');
      setTimeout(() => {
        onOpenChange(false);
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make a post</DialogTitle>
          <DialogDescription>
            Re-render the chart for the format, then send a branded card for
            approval. Numbers come from the real chart — never invented.
          </DialogDescription>
        </DialogHeader>

        {!aggregateGuard.ok && (
          <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{aggregateGuard.message}</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Format</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {SOCIAL_CARD_FORMATS.map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    size="sm"
                    variant={formatId === f.id ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setFormatId(f.id)}
                  >
                    {f.label}
                    <span className="ml-1 opacity-60">
                      {f.width}×{f.height}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="sc-headline" className="text-xs">
                Headline
              </Label>
              <Input
                id="sc-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="mt-1"
                maxLength={120}
              />
            </div>

            <div>
              <Label htmlFor="sc-caption" className="text-xs">
                Caption
              </Label>
              <Textarea
                id="sc-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="mt-1 min-h-[72px]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sc-caveat" className="text-xs">
                  Caveat
                  {caveatRequired
                    ? isSmallSample(n) && isNotSignificant(pValue)
                      ? ' (required — small n + not significant)'
                      : isSmallSample(n)
                        ? ' (required — small n)'
                        : ' (required — not significant)'
                    : ''}
                </Label>
                {!caveatRequired && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={includeCaveat}
                      onChange={(e) => setIncludeCaveat(e.target.checked)}
                    />
                    Include
                  </label>
                )}
              </div>
              <Textarea
                id="sc-caveat"
                value={caveat}
                onChange={(e) => {
                  if (caveatRequired && !e.target.value.trim()) return;
                  setCaveat(e.target.value);
                }}
                disabled={caveatRequired ? false : !includeCaveat}
                className="mt-1 min-h-[64px] text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Source: {sourceLine}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null || !aggregateGuard.ok}
                onClick={() => void rebuildCard()}
              >
                {busy === 'compose' || busy === 'headline' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                Refresh card
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null || !cardSrc}
                onClick={() => void handleDownload()}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download PNG
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void handleCopyCaption()}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy caption
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null || !aggregateGuard.ok}
                onClick={() => void handleSendForApproval()}
              >
                {busy === 'stage' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Send for approval
              </Button>
            </div>
            {hint && (
              <p className="text-[11px] text-muted-foreground">{hint}</p>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Preview ({format.width}×{format.height})</Label>
            <div
              className="rounded border bg-muted/30 overflow-hidden flex items-center justify-center min-h-[280px]"
              style={{ aspectRatio: `${format.width} / ${format.height}` }}
            >
              {cardSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardSrc}
                  alt="Social card preview"
                  className="max-w-full max-h-full object-contain"
                />
              ) : chartSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={chartSrc}
                  alt="Chart"
                  className="max-w-full max-h-full object-contain opacity-70"
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {busy ? 'Composing…' : 'No preview yet'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Footer includes “Powered by Antelope”. Approval goes through the
              existing queue, then image destinations on Publishing.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
