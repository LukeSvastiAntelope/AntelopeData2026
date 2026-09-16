'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldAlert, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared "review before it goes out" card — used by the consultant panel
 * and intended for Auto-Post / other agents so the product speaks one language.
 */
export type StagedActionCardModel = {
  id: number;
  toolName: string;
  summary: string;
  status: 'pending' | 'approved' | 'executed' | 'dismissed';
  payload?: Record<string, unknown>;
};

type Props = {
  action: StagedActionCardModel;
  onApprove: (id: number) => void | Promise<void>;
  onDismiss: (id: number) => void | Promise<void>;
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
  busyId,
  className,
}: Props) {
  const busy = busyId === action.id;
  const pending = action.status === 'pending';

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2',
        !pending && 'opacity-70',
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
