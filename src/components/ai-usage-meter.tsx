'use client'

/**
 * Campaign AI credit meter — used vs plan allowance for the current period.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type UsagePayload = {
  usedCredits: number
  allowance: number
  remainingCredits: number
  percentUsed: number
  warn: boolean
  blocked: boolean
  planLabel: string
  periodLabel: string
  hardEnforce: boolean
}

export function AiUsageMeter({ className }: { className?: string }) {
  const [usage, setUsage] = useState<UsagePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/ai/usage', { credentials: 'include' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok || !data?.status) {
          throw new Error(data?.message || 'Failed to load AI usage')
        }
        setUsage(data.usage)
        setError(null)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed')
      })
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  if (error && !usage) {
    return null
  }
  if (!usage) {
    return (
      <div
        className={cn(
          'rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground',
          className
        )}
      >
        Loading AI credits…
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, usage.percentUsed))
  const barColor = usage.blocked
    ? 'bg-destructive'
    : usage.warn
      ? 'bg-amber-500'
      : 'bg-foreground/80'

  return (
    <div
      className={cn(
        'rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 space-y-1.5',
        usage.warn && 'border-amber-500/40',
        usage.blocked && 'border-destructive/50',
        className
      )}
      title={`${usage.planLabel} plan · ${usage.periodLabel} UTC`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          AI credits
        </p>
        <p className="text-[11px] text-muted-foreground">{usage.planLabel}</p>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-sidebar-foreground tabular-nums">
          {Math.round(usage.usedCredits).toLocaleString()}
          <span className="text-muted-foreground font-normal">
            {' '}
            / {usage.allowance.toLocaleString()}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {pct.toFixed(0)}%
        </p>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {usage.warn && (
        <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {usage.blocked
            ? usage.hardEnforce
              ? 'Allowance reached — new AI calls are blocked.'
              : 'Allowance reached — soft limit (calls still allowed).'
            : 'Approaching this period’s credit allowance.'}
        </p>
      )}
    </div>
  )
}
