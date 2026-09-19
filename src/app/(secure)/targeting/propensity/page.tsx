'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Crosshair,
  Flame,
  Loader2,
  RefreshCw,
  Snowflake,
  SunMedium,
  Bot,
  LayoutDashboard,
} from 'lucide-react'

type FunnelSummary = {
  hot: number
  warm: number
  cold: number
  total: number
  avgPropensity: number | null
  avgConfidence: number | null
  decayK: number
  estimated?: number
  confirmed?: number
}

type VoterRow = {
  person_record_id: number
  label?: string
  party?: string | null
  district?: string | null
  propensity: number
  confidence: number
  prior_weight: number
  posterior_q: number | null
  p0: number
  evidence_e: number
  tier: 'hot' | 'warm' | 'cold'
  signal?: 'estimated' | 'confirmed'
  recomputed_at: string
}

type TierFilter = 'all' | 'hot' | 'warm' | 'cold'

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(0)}%`
}

function tierTone(tier: string) {
  if (tier === 'hot') return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
  if (tier === 'warm') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
}

export default function PropensityPlanningPage() {
  const [summary, setSummary] = useState<FunnelSummary | null>(null)
  const [voters, setVoters] = useState<VoterRow[]>([])
  const [whoToWork, setWhoToWork] = useState<VoterRow[]>([])
  const [tier, setTier] = useState<TierFilter>('all')
  const [excludeDnc, setExcludeDnc] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async (tierFilter: TierFilter, notDnc: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ list: '1', whoNext: '1', limit: '200' })
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      if (notDnc) params.set('excludeSuppressed', '1')
      const res = await fetch(`/api/dashboard/propensity?${params}`)
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Failed to load propensity')
      }
      setSummary(data.summary)
      setVoters(data.voters || [])
      setWhoToWork(data.whoToWork || [])
      setNote(data.note || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setSummary(null)
      setVoters([])
      setWhoToWork([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(tier, excludeDnc)
  }, [load, tier, excludeDnc])

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/propensity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 2000 }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Refresh failed')
      }
      setSummary(data.summary)
      setNote(data.note || `Refreshed ${data.refreshed ?? 0} voters`)
      await load(tier, excludeDnc)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const total = summary?.total || 0
  const hotShare = total ? (summary!.hot / total) * 100 : 0
  const warmShare = total ? (summary!.warm / total) * 100 : 0
  const coldShare = total ? (summary!.cold / total) * 100 : 0

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center min-w-0">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-muted-foreground shrink-0" />
                  <h1 className="text-base font-medium text-card-foreground truncate">
                    Targeting / Propensity Planning
                  </h1>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Materialized view
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  P = w·p₀ + (1−w)·q · w = exp(−k·e). Prior decays as engagement lands — not a frozen score.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                  Dashboard
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/agents/campaign-consultant">
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  Consultant
                </Link>
              </Button>
              <Button size="sm" onClick={() => void refresh()} disabled={refreshing}>
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Recompute
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {note && !error && (
            <p className="text-xs text-muted-foreground border border-border/60 rounded-md px-3 py-2 bg-muted/20">
              {note}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FunnelCard
              icon={<Flame className="h-4 w-4" />}
              label="Hot"
              count={summary?.hot ?? 0}
              hint="P ≥ 0.70"
              tone="text-orange-600 dark:text-orange-400"
              active={tier === 'hot'}
              onClick={() => setTier(tier === 'hot' ? 'all' : 'hot')}
            />
            <FunnelCard
              icon={<SunMedium className="h-4 w-4" />}
              label="Warm"
              count={summary?.warm ?? 0}
              hint="0.40 ≤ P < 0.70"
              tone="text-amber-600 dark:text-amber-400"
              active={tier === 'warm'}
              onClick={() => setTier(tier === 'warm' ? 'all' : 'warm')}
            />
            <FunnelCard
              icon={<Snowflake className="h-4 w-4" />}
              label="Cold"
              count={summary?.cold ?? 0}
              hint="P < 0.40"
              tone="text-sky-600 dark:text-sky-400"
              active={tier === 'cold'}
              onClick={() => setTier(tier === 'cold' ? 'all' : 'cold')}
            />
            <div className="rounded-md border border-border px-3 py-3 space-y-1 bg-muted/10">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Blend dial</p>
              <p className="text-2xl font-semibold tabular-nums">
                k = {summary?.decayK?.toFixed(2) ?? '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Avg P {pct(summary?.avgPropensity)} · conf {pct(summary?.avgConfidence)} ·{' '}
                {summary?.total ?? 0} voters
                {summary?.estimated != null
                  ? ` · ${summary.estimated} est / ${summary.confirmed ?? 0} confirmed`
                  : ''}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Config: <code className="text-[10px]">PROPENSITY_DECAY_K</code> (default 0.85)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Funnel mix</h2>
              <p className="text-[11px] text-muted-foreground">
                Confidence = 1 − w · door confirm collapses prior weight
              </p>
            </div>
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
              {total === 0 ? (
                <div className="w-full bg-muted" />
              ) : (
                <>
                  <div className="bg-orange-500/80 h-full" style={{ width: `${hotShare}%` }} title={`Hot ${summary?.hot}`} />
                  <div className="bg-amber-500/80 h-full" style={{ width: `${warmShare}%` }} title={`Warm ${summary?.warm}`} />
                  <div className="bg-sky-500/80 h-full" style={{ width: `${coldShare}%` }} title={`Cold ${summary?.cold}`} />
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-medium">Who to work next</h2>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeDnc}
                  onChange={(e) => setExcludeDnc(e.target.checked)}
                />
                Not DNC
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ranked by tier × freshness — hot confirmed doors first; already-done doors sink.
              Compose with Area A on the Dashboard map filters.
            </p>
            {loading ? null : whoToWork.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No open leads in this filter.</p>
            ) : (
              <ol className="space-y-1.5 rounded-md border border-border divide-y divide-border/60">
                {whoToWork.slice(0, 20).map((v, i) => (
                  <li
                    key={v.person_record_id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {i + 1}. {v.label || `Person #${v.person_record_id}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[v.party, v.district].filter(Boolean).join(' · ') || '—'} · P=
                        {v.propensity.toFixed(3)} · {v.signal || 'estimated'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] capitalize ${tierTone(v.tier)}`}
                    >
                      {v.tier}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-medium">
                Voters {tier !== 'all' ? `(${tier})` : ''}
              </h2>
              <div className="flex gap-1">
                {(['all', 'hot', 'warm', 'cold'] as TierFilter[]).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={tier === t ? 'default' : 'outline'}
                    className="h-7 text-[11px] capitalize"
                    onClick={() => setTier(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading propensity view…
              </div>
            ) : voters.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-10 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  No materialized rows yet. Upload households, canvass, then recompute.
                </p>
                <Button size="sm" onClick={() => void refresh()} disabled={refreshing}>
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Populate from Map + engagement
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Voter</th>
                      <th className="text-left font-medium px-3 py-2">Tier</th>
                      <th className="text-left font-medium px-3 py-2">Signal</th>
                      <th className="text-right font-medium px-3 py-2">P</th>
                      <th className="text-right font-medium px-3 py-2">Conf</th>
                      <th className="text-right font-medium px-3 py-2">w (prior)</th>
                      <th className="text-right font-medium px-3 py-2">q</th>
                      <th className="text-right font-medium px-3 py-2">p₀</th>
                      <th className="text-right font-medium px-3 py-2">e</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voters.map((v) => (
                      <tr key={v.person_record_id} className="border-t border-border/60 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="font-medium text-[13px]">
                            {v.label || `Person #${v.person_record_id}`}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {[v.party, v.district].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] capitalize ${tierTone(v.tier)}`}
                          >
                            {v.tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground capitalize">
                          {v.signal || (v.confidence >= 0.55 ? 'confirmed' : 'estimated')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {v.propensity.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {pct(v.confidence)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {v.prior_weight.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {v.posterior_q == null ? '—' : v.posterior_q.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {v.p0.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {v.evidence_e.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border/70 bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">How the blend works</p>
            <p>
              Cold start (e = 0): w ≈ 1 → P equals Map prior p₀. A door-knock confirm or substantive
              response drives e high enough that w → 0 and live posterior q dominates. Opt-out / refuse
              pulls q low. Confidence = 1 − w so the UI can show estimated vs confirmed on one path.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FunnelCard({
  icon,
  label,
  count,
  hint,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  hint: string
  tone: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border px-3 py-3 space-y-1 transition-colors ${
        active ? 'border-foreground/40 bg-muted/40' : 'border-border hover:bg-muted/20'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wide ${tone}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </button>
  )
}
