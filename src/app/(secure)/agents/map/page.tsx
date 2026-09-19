'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Bot,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  X,
  Network,
} from 'lucide-react'
import { toast } from '@/components/ui/sonner'

type TopologyNode = {
  id: string
  label: string
  role: string
  zone: string
  description: string
  col: number
  row: number
  enabled: boolean
  autonomy: string
  lastRun: string | null
  nextScheduledRun: string
  version: number | null
  summary: string
  findingsCount: number
  directivesCount: number
  pendingGates: number
  triggerAgentId?: string
  loopMeta?: {
    lastAction?: string | null
    lastReasoningTrace?: string | null
    lastTriggers?: string[]
  }
}

type MapPayload = {
  organizationId: number
  topology: { nodes: TopologyNode[]; edges: { from: string; to: string; label?: string }[]; note: string }
  loopConfig: {
    autonomy: 'manual' | 'propose' | 'auto_within_limits'
    memory: { lookbackCycles: number; decayHalfLife: number }
    triggers: Record<string, { enabled: boolean; threshold: number }>
    budgets: {
      spendCapPerCycle: number
      maxSurveysPerListPerWindow: number
      windowDays: number
    }
  }
  cockpit: {
    autonomy: string
    lastAction: string | null
    lastProposerAt: string | null
    lastTriggers: string[]
    lastReasoningTrace: string | null
    lastStagedActionId: number | null
    humanDirectives: { text: string; recordedAt: string }[]
    nextActions: string[]
    summary: string
  }
  pendingGates: { id: number; toolName: string; summary: string; createdAt: string | null }[]
  scheduler: { lastRunAt: string | null; lastRunStatus: string | null; nextScheduledRun: string }
  invariant: { title: string; body: string; approvalTools: string[] }
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function roleTone(role: string) {
  switch (role) {
    case 'core':
      return 'border-foreground/40 bg-foreground text-background'
    case 'feeder':
      return 'border-sky-500/40 bg-sky-500/10'
    case 'executor':
      return 'border-violet-500/40 bg-violet-500/10'
    case 'situation':
      return 'border-emerald-500/40 bg-emerald-500/10'
    case 'human_gate':
      return 'border-amber-500/50 bg-amber-500/10'
    default:
      return 'border-border bg-card'
  }
}

export default function AgentMapPage() {
  const [data, setData] = useState<MapPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>('campaign_consultant')
  const [triggering, setTriggering] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [directive, setDirective] = useState('')
  const [autonomy, setAutonomy] = useState<'manual' | 'propose' | 'auto_within_limits'>('propose')
  const [lookback, setLookback] = useState(3)
  const [halfLife, setHalfLife] = useState(14)
  const [maxSurveys, setMaxSurveys] = useState(2)
  const [windowDays, setWindowDays] = useState(30)
  const [responseThreshold, setResponseThreshold] = useState(80)
  const [daysThreshold, setDaysThreshold] = useState(7)
  const [surveyAutotriggers, setSurveyAutotriggers] = useState<
    Array<{
      surveyId: number
      surveyTitle: string
      enabled: boolean
      threshold: number
      autonomy: string
      firedCount: number
      lastFiredAt: string | null
      responseCount: number
      actions: string[]
    }>
  >([])
  const [scrapers, setScrapers] = useState<
    Array<{ id: number; type: string; name: string; enabled: boolean; lastRunAt: string | null }>
  >([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agents/map')
      const json = await res.json()
      if (!res.ok || !json.status) throw new Error(json.message || 'Failed to load map')
      setData(json)
      setAutonomy(json.loopConfig.autonomy)
      setLookback(json.loopConfig.memory.lookbackCycles)
      setHalfLife(json.loopConfig.memory.decayHalfLife)
      setMaxSurveys(json.loopConfig.budgets.maxSurveysPerListPerWindow)
      setWindowDays(json.loopConfig.budgets.windowDays)
      setResponseThreshold(json.loopConfig.triggers.response_count?.threshold ?? 80)
      setDaysThreshold(json.loopConfig.triggers.days_elapsed?.threshold ?? 7)

      const atRes = await fetch('/api/autotriggers')
      const atJson = await atRes.json().catch(() => null)
      if (atRes.ok && atJson?.status) {
        setSurveyAutotriggers(atJson.surveyAutotriggers || [])
        setScrapers(atJson.scrapers || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => data?.topology.nodes.find((n) => n.id === selectedId) || null,
    [data, selectedId]
  )

  const isCommandPoint = selected?.role === 'core'

  const triggerNode = async (node: TopologyNode) => {
    if (!data || !node.triggerAgentId) return
    setTriggering(node.id)
    try {
      const res = await fetch(`/api/admin/scheduler/trigger/${node.triggerAgentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: data.organizationId, force: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Trigger failed')
      toast.success(json.message || 'Triggered')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Trigger failed')
    } finally {
      setTriggering(null)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/agents/loop/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autonomy,
          memory: { lookbackCycles: lookback, decayHalfLife: halfLife },
          budgets: {
            maxSurveysPerListPerWindow: maxSurveys,
            windowDays,
          },
          triggers: {
            response_count: { enabled: true, threshold: responseThreshold },
            days_elapsed: { enabled: true, threshold: daysThreshold },
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.status) throw new Error(json.message || 'Save failed')
      toast.success(json.invariant || 'Loop config saved')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const submitDirective = async () => {
    if (!data || !directive.trim()) return
    try {
      const res = await fetch('/api/agents/loop/directives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: data.organizationId, text: directive.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed')
      toast.success('Steering directive recorded')
      setDirective('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Directive failed')
    }
  }

  const maxCol = 3

  return (
    <div className="flex-1 p-2 w-full bg-background min-h-0">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg flex flex-col min-h-[calc(100vh-1rem)]">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center min-w-0">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <h1 className="text-base font-medium truncate">Agent map</h1>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Read-only topology
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fixed harness view + light control — not a workflow authoring canvas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/agents/campaign-consultant">
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  Consultant
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
        <div className="border-b border-border" />

        {error && (
          <div className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* H3.3 — autonomy invariant, always visible */}
        <div className="mx-6 mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 flex gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground text-xs">
              {data?.invariant.title || 'Autonomy never promotes approval tools'}
            </p>
            <p>
              {data?.invariant.body ||
                'Even auto_within_limits cannot promote an approval tool. Full-auto still cannot send. Enforced in the executor, not the prompt.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] flex-1 min-h-0">
          {/* Map canvas */}
          <div className="p-6 overflow-auto border-b xl:border-b-0 xl:border-r border-border">
            {loading && !data ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading topology…
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="uppercase tracking-wide font-semibold">Auto zone</span>
                  <span>
                    Cron: {data?.scheduler.nextScheduledRun} · last{' '}
                    {fmtWhen(data?.scheduler.lastRunAt ?? null)}
                  </span>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
                  {data?.topology.edges.map((e) => (
                    <div key={`${e.from}-${e.to}`} className="sr-only">
                      {e.from} → {e.to}
                    </div>
                  ))}

                  {/* Auto zone — feeders / situation / executors / core */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${maxCol}, minmax(0, 1fr))`,
                      gridTemplateRows: 'repeat(3, minmax(88px, auto))',
                    }}
                  >
                    {data?.topology.nodes
                      .filter((n) => n.zone === 'auto')
                      .map((node) => {
                        const active = selectedId === node.id
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => setSelectedId(node.id)}
                            className={`relative rounded-lg border px-3 py-2.5 text-left transition-shadow hover:shadow-md ${roleTone(
                              node.role
                            )} ${active ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/40' : ''}`}
                            style={{ gridColumn: node.col, gridRow: node.row }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium leading-tight">{node.label}</p>
                                <p className="text-[10px] opacity-70 capitalize mt-0.5">
                                  {node.role.replace('_', ' ')}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={`h-5 text-[9px] ${
                                  node.enabled
                                    ? 'border-emerald-500/40'
                                    : 'border-muted-foreground/30'
                                }`}
                              >
                                {node.enabled ? 'on' : 'manual'}
                              </Badge>
                            </div>
                            <p className="text-[10px] opacity-80 mt-2 line-clamp-2">
                              {node.summary || node.description}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-1 text-[9px] opacity-70">
                              <span>Last {fmtWhen(node.lastRun)}</span>
                              {node.pendingGates > 0 && (
                                <span className="text-amber-700 dark:text-amber-400">
                                  {node.pendingGates} gate
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                  </div>

                  {/* Checkpoint line between auto and approval zones */}
                  <div className="relative flex items-center gap-3 py-1" aria-hidden>
                    <div className="flex-1 border-t-2 border-dashed border-amber-500/50" />
                    <p className="shrink-0 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 px-1">
                      Human gate — approval zone below
                    </p>
                    <div className="flex-1 border-t-2 border-dashed border-amber-500/50" />
                  </div>

                  {/* Approval zone */}
                  <div className="grid grid-cols-3 gap-3">
                    {data?.topology.nodes
                      .filter((n) => n.zone !== 'auto')
                      .map((node) => {
                        const active = selectedId === node.id
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => setSelectedId(node.id)}
                            className={`relative rounded-lg border px-3 py-2.5 text-left transition-shadow hover:shadow-md col-start-2 ${roleTone(
                              node.role
                            )} ${active ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/40' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium leading-tight">{node.label}</p>
                                <p className="text-[10px] opacity-70 capitalize mt-0.5">
                                  {node.role.replace('_', ' ')}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={`h-5 text-[9px] ${
                                  node.pendingGates > 0
                                    ? 'border-amber-500/50'
                                    : 'border-muted-foreground/30'
                                }`}
                              >
                                {node.pendingGates > 0 ? `${node.pendingGates} pending` : 'clear'}
                              </Badge>
                            </div>
                            <p className="text-[10px] opacity-80 mt-2 line-clamp-2">
                              {node.description}
                            </p>
                          </button>
                        )
                      })}
                  </div>
                </div>

                <div className="rounded-md border border-border/60 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>
                    {data?.topology.note} Edges are fixed in code (feeders → situation → consultant →
                    gate). No node authoring.
                  </p>
                </div>

                {data && data.pendingGates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pending human gates
                    </p>
                    <ul className="space-y-1.5">
                      {data.pendingGates.map((g) => (
                        <li
                          key={g.id}
                          className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
                        >
                          <p className="font-medium text-[13px]">{g.toolName}</p>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{g.summary}</p>
                          <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-[11px]">
                            <Link href="/agents/campaign-consultant">Review in consultant</Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Command point / node panel */}
          <aside className="p-4 overflow-y-auto space-y-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a node.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{selected.label}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {isCommandPoint ? 'Command point' : selected.role.replace('_', ' ')}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground">{selected.description}</p>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/60 px-2 py-1.5">
                    <p className="text-muted-foreground">Last run</p>
                    <p className="font-medium">{fmtWhen(selected.lastRun)}</p>
                  </div>
                  <div className="rounded border border-border/60 px-2 py-1.5">
                    <p className="text-muted-foreground">Next</p>
                    <p className="font-medium leading-snug">{selected.nextScheduledRun}</p>
                  </div>
                </div>

                {selected.triggerAgentId && selected.role !== 'human_gate' && (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={triggering === selected.id}
                    onClick={() => void triggerNode(selected)}
                  >
                    {triggering === selected.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Manual trigger
                  </Button>
                )}

                {isCommandPoint && data && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div>
                      <p className="text-xs font-semibold">Governor — loop_config</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Autonomy dial governs auto tools only. Sends stay gated.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Autonomy</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={autonomy}
                        onChange={(e) =>
                          setAutonomy(e.target.value as typeof autonomy)
                        }
                      >
                        <option value="manual">manual — cron skips</option>
                        <option value="propose">propose — stage recommendations</option>
                        <option value="auto_within_limits">
                          auto_within_limits — still cannot send
                        </option>
                      </select>
                      {autonomy === 'auto_within_limits' && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Reminder: auto_within_limits cannot promote approval tools. Publish / SMS /
                          email / charge stay behind Approve.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Memory lookback</Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={lookback}
                          onChange={(e) => setLookback(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Decay half-life (days)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={halfLife}
                          onChange={(e) => setHalfLife(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Response trigger</Label>
                        <Input
                          type="number"
                          min={1}
                          value={responseThreshold}
                          onChange={(e) => setResponseThreshold(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Days trigger</Label>
                        <Input
                          type="number"
                          min={1}
                          value={daysThreshold}
                          onChange={(e) => setDaysThreshold(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Surveys / list / window</Label>
                        <Input
                          type="number"
                          min={0}
                          value={maxSurveys}
                          onChange={(e) => setMaxSurveys(Number(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Budget window (days)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={windowDays}
                          onChange={(e) => setWindowDays(Number(e.target.value) || 1)}
                        />
                      </div>
                    </div>

                    <Button size="sm" className="w-full" disabled={saving} onClick={() => void saveConfig()}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                      Save loop_config
                    </Button>

                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs font-semibold">Cockpit</p>
                      <div className="rounded border border-border/60 px-2 py-2 text-[11px] space-y-1">
                        <p>
                          <span className="text-muted-foreground">Last action:</span>{' '}
                          {data.cockpit.lastAction || '—'}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Last proposer:</span>{' '}
                          {fmtWhen(data.cockpit.lastProposerAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Triggers:</span>{' '}
                          {data.cockpit.lastTriggers?.join(', ') || '—'}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Pending gates:</span>{' '}
                          {data.pendingGates.length}
                        </p>
                      </div>
                      {data.cockpit.lastReasoningTrace && (
                        <div className="rounded border border-border/60 px-2 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Reasoning trace
                          </p>
                          <p className="text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {data.cockpit.lastReasoningTrace}
                          </p>
                        </div>
                      )}
                      {data.cockpit.nextActions?.length > 0 && (
                        <ul className="text-[11px] list-disc pl-4 text-muted-foreground">
                          {data.cockpit.nextActions.slice(0, 5).map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs font-semibold">Steering directive</p>
                      <Textarea
                        rows={3}
                        placeholder='e.g. "Focus on housing, not childcare"'
                        value={directive}
                        onChange={(e) => setDirective(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        disabled={!directive.trim()}
                        onClick={() => void submitDirective()}
                      >
                        Record directive
                      </Button>
                      {data.cockpit.humanDirectives?.length > 0 && (
                        <ul className="space-y-1 max-h-28 overflow-y-auto">
                          {data.cockpit.humanDirectives.slice(0, 5).map((d, i) => (
                            <li
                              key={`${d.recordedAt}-${i}`}
                              className="text-[11px] text-muted-foreground border-l-2 border-border pl-2"
                            >
                              {d.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs font-semibold">Automations</p>
                      <p className="text-[10px] text-muted-foreground">
                        Survey auto-triggers and scrapers in one place. Configure a survey on its
                        edit page.
                      </p>

                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Survey auto-triggers
                        </p>
                        {surveyAutotriggers.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            None configured yet. Enable on a survey&apos;s Auto-trigger card.
                          </p>
                        ) : (
                          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                            {surveyAutotriggers.map((t) => (
                              <li
                                key={t.surveyId}
                                className="rounded border border-border/60 px-2 py-1.5 text-[11px]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <Link
                                    href={`/surveys/${t.surveyId}/edit`}
                                    className="font-medium text-foreground hover:underline truncate"
                                  >
                                    {t.surveyTitle || `Survey #${t.surveyId}`}
                                  </Link>
                                  <Badge
                                    variant={t.enabled ? 'default' : 'secondary'}
                                    className="text-[9px] shrink-0"
                                  >
                                    {t.enabled ? 'on' : 'off'}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground mt-0.5">
                                  ≥{t.threshold} · {t.autonomy} · {t.responseCount} responses · fired{' '}
                                  {t.firedCount}
                                  {t.lastFiredAt ? ` · ${fmtWhen(t.lastFiredAt)}` : ''}
                                </p>
                                <p className="text-muted-foreground">
                                  {(t.actions || []).join(', ') || 'analytics'}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Scraper automations
                          </p>
                          <Link
                            href="/dashboard"
                            className="text-[10px] text-muted-foreground hover:underline"
                          >
                            Manage on dashboard
                          </Link>
                        </div>
                        {scrapers.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No scrapers yet.</p>
                        ) : (
                          <ul className="space-y-1 max-h-28 overflow-y-auto">
                            {scrapers.map((s) => (
                              <li
                                key={s.id}
                                className="flex items-center justify-between gap-2 text-[11px] border-l-2 border-border pl-2"
                              >
                                <span className="truncate">
                                  {s.name}{' '}
                                  <span className="text-muted-foreground">({s.type})</span>
                                </span>
                                <span className="text-muted-foreground shrink-0">
                                  {s.enabled ? 'on' : 'off'}
                                  {s.lastRunAt ? ` · ${fmtWhen(s.lastRunAt)}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!isCommandPoint && selected.role !== 'human_gate' && (
                  <div className="border-t border-border pt-3 text-[11px] text-muted-foreground space-y-1">
                    <p>
                      Findings: {selected.findingsCount} · Directives: {selected.directivesCount} ·
                      Version: {selected.version ?? '—'}
                    </p>
                    <p>Open the Consultant node for the full governor + cockpit.</p>
                  </div>
                )}

                {selected.role === 'human_gate' && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Approval zone</p>
                    <p>
                      World-touching tools ({data?.invariant.approvalTools?.slice(0, 4).join(', ')}
                      …) require Approve. The proposer never self-deploys.
                    </p>
                    <Button asChild size="sm" variant="outline" className="w-full h-7 mt-1">
                      <Link href="/agents/campaign-consultant">Open approval cards</Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
