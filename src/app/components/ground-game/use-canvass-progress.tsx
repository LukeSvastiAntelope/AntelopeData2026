'use client'

/**
 * MiniVAN M4 — poll canvass progress for Ground Game managers.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type TurfProgress = {
  turfId: number
  label: string
  addressCount: number
  assignedTo: number | null
  contactedCount: number
  coveragePct: number
  outcomes: Record<string, number>
  lastOutcomeAt: string | null
  lastContactAt: string | null
  lastTokenSyncAt: string | null
  lastSyncedAt: string | null
  canvasserLastSyncedAt: string | null
}

export type CanvassProgressSnapshot = {
  asOf: string
  maxContactId: number
  turfs: TurfProgress[]
}

const DEFAULT_MS = 5000

export function useCanvassProgress(opts?: {
  enabled?: boolean
  intervalMs?: number
}) {
  const enabled = opts?.enabled !== false
  const intervalMs = opts?.intervalMs ?? DEFAULT_MS
  const [data, setData] = useState<CanvassProgressSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [bump, setBump] = useState(0)
  const prevMax = useRef(0)

  const refresh = useCallback(async (silent = true) => {
    try {
      const res = await fetch('/api/dashboard/canvass-progress')
      const json = await res.json()
      if (!res.ok || !json.status) {
        throw new Error(json.message || 'Progress load failed')
      }
      const next: CanvassProgressSnapshot = {
        asOf: json.asOf,
        maxContactId: Number(json.maxContactId) || 0,
        turfs: json.turfs || [],
      }
      if (next.maxContactId > prevMax.current && prevMax.current > 0) {
        setBump((b) => b + 1)
      }
      prevMax.current = Math.max(prevMax.current, next.maxContactId)
      setData(next)
      setError(null)
      setLive(true)
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : 'Failed')
      }
      setLive(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh(false)
    const id = window.setInterval(() => void refresh(true), intervalMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, intervalMs, refresh])

  const byTurfId = useCallback(
    (turfId: number) => data?.turfs.find((t) => t.turfId === turfId) || null,
    [data]
  )

  return { data, error, live, bump, refresh, byTurfId }
}

const OUTCOME_LABELS: Record<string, string> = {
  not_home: 'Not home',
  refused: 'Refused',
  supporter: 'Supporter',
  undecided: 'Undecided',
  lean_support: 'Follow-up',
  lean_against: 'Lean against',
  moved: 'Moved',
  wrong_address: 'Wrong address',
  dnc_request: 'DNC',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
}

export function formatOutcomeLabel(status: string): string {
  return OUTCOME_LABELS[status] || status.replace(/_/g, ' ')
}

export function formatSyncedAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never synced'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'Never synced'
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 15) return 'Just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  return new Date(iso).toLocaleString()
}

/** Compact outcome chips + last-synced line for a turf card. */
export function TurfProgressDetails({
  progress,
  compact,
}: {
  progress: TurfProgress | null | undefined
  compact?: boolean
}) {
  if (!progress) return null
  const entries = Object.entries(progress.outcomes || {}).sort(
    (a, b) => b[1] - a[1]
  )
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entries.map(([status, count]) => (
            <span
              key={status}
              className={`inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-1.5 ${
                compact ? 'text-[9px] h-5' : 'text-[10px] h-6'
              } text-muted-foreground`}
            >
              <span className="font-medium text-foreground mr-1">{count}</span>
              {formatOutcomeLabel(status)}
            </span>
          ))}
        </div>
      )}
      <p
        className={
          compact
            ? 'text-[9px] text-muted-foreground'
            : 'text-[11px] text-muted-foreground'
        }
      >
        Last synced:{' '}
        <span className="text-foreground/80">
          {formatSyncedAgo(
            progress.canvasserLastSyncedAt || progress.lastSyncedAt
          )}
        </span>
      </p>
    </div>
  )
}
