'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared "review before it goes out" card — used by the consultant panel
 * and intended for Auto-Post / other agents so the product speaks one language.
 */
export type DistributionStatusModel = {
  status: 'none' | 'queued' | 'sent' | 'failed' | 'partial';
  label: string;
  deliveryIds?: number[];
  contentType?: string | null;
};

export type StagedActionCardModel = {
  id: number;
  toolName: string;
  summary: string;
  status: 'pending' | 'approved' | 'executed' | 'dismissed';
  payload?: Record<string, unknown>;
  distribution?: DistributionStatusModel | null;
};

type Props = {
  action: StagedActionCardModel;
  onApprove: (id: number) => void | Promise<void>;
  onDismiss: (id: number) => void | Promise<void>;
  onRetryDelivery?: (id: number) => void | Promise<void>;
  busyId?: number | null;
  className?: string;
};

function humanToolLabel(name: string) {
  return name.replace(/_/g, ' ');
}

export function StagedActionCard({
  action,
  onApprove,
  onDismiss,
  onRetryDelivery,
  busyId,
  className,
}: Props) {
  const busy = busyId === action.id;
  const pending = action.status === 'pending';
  const [distribution, setDistribution] = useState<DistributionStatusModel | null>(
    action.distribution || null
  );
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setDistribution(action.distribution || null);
  }, [action.distribution]);

  // Poll while queued / partial so the card flips to Sent ✓ without a refresh
  useEffect(() => {
    if (pending) return;
    const status = distribution?.status;
    if (status !== 'queued' && status !== 'partial') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/agents/consultant/staged/${action.id}/distribution`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.status && data.distribution) {
          setDistribution(data.distribution as DistributionStatusModel);
        }
      } catch {
        /* ignore poll errors */
      }
    };

    void tick();
    const t = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [action.id, pending, distribution?.status]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      if (onRetryDelivery) {
        await onRetryDelivery(action.id);
      } else {
        const res = await fetch(
          `/api/agents/consultant/staged/${action.id}/distribution`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (data?.distribution) {
          setDistribution(data.distribution as DistributionStatusModel);
        }
      }
    } finally {
      setRetrying(false);
    }
  };

  const showDelivery =
    !pending &&
    distribution &&
    distribution.status !== 'none' &&
    Boolean(distribution.label);

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2',
        !pending && 'opacity-90',
        className
      )}
      data-staged-action-id={action.id}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">
              Review before it goes out
            </p>
            <Badge variant="outline" className="text-[10px] h-5 capitalize">
              {humanToolLabel(action.toolName)}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[10px] h-5 capitalize"
            >
              {action.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {action.summary.length > 420
              ? `${action.summary.slice(0, 420)}…`
              : action.summary}
          </p>
          {pending && (
            <p className="text-[11px] text-muted-foreground">
              This reaches voters, posts publicly, or spends money. Nothing runs until you Approve.
            </p>
          )}
          {showDelivery && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p
                className={cn(
                  'text-xs font-medium',
                  distribution.status === 'sent' && 'text-emerald-700 dark:text-emerald-400',
                  (distribution.status === 'failed' ||
                    distribution.status === 'partial') &&
                    'text-destructive',
                  distribution.status === 'queued' && 'text-muted-foreground'
                )}
              >
                {distribution.status === 'queued' && (
                  <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                )}
                {distribution.label}
              </p>
              {(distribution.status === 'failed' ||
                distribution.status === 'partial') && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={retrying || busy}
                  onClick={() => void handleRetry()}
                >
                  {retrying ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Retry now
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="flex items-center gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onDismiss(action.id)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Dismiss
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onApprove(action.id)}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
