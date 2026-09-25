'use client'

/**
 * Live L4 — Audience intelligence: participants, attribution drill-down,
 * profile drawer, live cross-tab with significance gate.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import {
  Loader2,
  ExternalLink,
  Copy,
  MonitorPlay,
  Users,
  X,
  AlertTriangle,
} from 'lucide-react'

type Session = {
  id: number
  code: string
  title: string
  hostName: string | null
  eventType: string
  identifyMode: string
  status: string
}

type Question = {
  id: number
  kind: string
  prompt: string
  state: string
  options?: unknown
  identifyOverride?: string | null
}

type ParticipantRow = {
  id: number
  displayName: string | null
  linkedinUrl: string | null
  email: string | null
  headline: string | null
  isAnonymous: boolean
  joinedAt: string
  profile: Record<string, string | null>
  intake: Record<string, unknown>
}

export default function LiveAudiencePage() {
  const params = useParams()
  const sessionId = Number(params?.id)

  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [joinPath, setJoinPath] = useState('')
  const [screenPath, setScreenPath] = useState('')
  const [loading, setLoading] = useState(true)

  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [intakeFields, setIntakeFields] = useState<
    Array<{ id: string; label: string }>
  >([])
  const [segmentKeys, setSegmentKeys] = useState<string[]>([])

  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null
  )
  const [questionMeta, setQuestionMeta] = useState<{
    attributed: boolean
    identifyEffective: string
    prompt: string
    kind: string
  } | null>(null)
  const [pollBars, setPollBars] = useState<
    Array<{ label: string; count: number; pct: number }>
  >([])

  const [segmentField, setSegmentField] = useState('role')
  const [crosstab, setCrosstab] = useState<any>(null)
  const [crosstabBusy, setCrosstabBusy] = useState(false)

  const [attribution, setAttribution] = useState<any>(null)
  const [drawer, setDrawer] = useState<{
    participant: ParticipantRow
    trail: Array<{
      id: number
      type: string
      payload: unknown
      createdAt: string
      redacted: boolean
    }>
  } | null>(null)
  const [drawerBusy, setDrawerBusy] = useState(false)

  const [newPrompt, setNewPrompt] = useState('')
  const [newOptions, setNewOptions] = useState('Yes, No, Undecided')

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/dashboard/live/sessions/${sessionId}`)
    const data = await res.json()
    if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
    setSession(data.session)
    setQuestions(data.questions || [])
    setParticipantCount(data.participantCount || 0)
    setJoinPath(data.joinPath)
    setScreenPath(data.screenPath)
    const active = (data.questions || []).find((q: Question) => q.state === 'active')
    const first = active || (data.questions || [])[0]
    if (first) setSelectedQuestionId(first.id)
  }, [sessionId])

  const loadAudience = useCallback(async () => {
    const res = await fetch(
      `/api/dashboard/live/sessions/${sessionId}/audience`
    )
    const data = await res.json()
    if (!res.ok || !data.status) throw new Error(data.message || 'Audience failed')
    setParticipants(data.participants || [])
    setIntakeFields(data.intakeFields || [])
    setSegmentKeys(data.segmentKeys || ['role'])
    if (data.segmentKeys?.length && !data.segmentKeys.includes(segmentField)) {
      setSegmentField(data.segmentKeys[0])
    }
  }, [sessionId, segmentField])

  const loadQuestionResults = useCallback(async (qid: number) => {
    const res = await fetch(
      `/api/dashboard/live/sessions/${sessionId}/attribution?questionId=${qid}`
    )
    const data = await res.json()
    if (!res.ok || !data.status) throw new Error(data.message || 'Results failed')
    setQuestionMeta({
      attributed: Boolean(data.question?.attributed),
      identifyEffective: data.question?.identifyEffective || '',
      prompt: data.question?.prompt || '',
      kind: data.question?.kind || '',
    })
    setPollBars(data.results?.pollBars || [])
    setAttribution(null)
  }, [sessionId])

  const loadCrosstab = useCallback(async () => {
    if (!selectedQuestionId || !segmentField) return
    setCrosstabBusy(true)
    try {
      const res = await fetch(
        `/api/dashboard/live/sessions/${sessionId}/crosstab?questionId=${selectedQuestionId}&segmentField=${encodeURIComponent(segmentField)}`
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Cross-tab failed')
      setCrosstab(data.crosstab)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cross-tab failed')
    } finally {
      setCrosstabBusy(false)
    }
  }, [sessionId, selectedQuestionId, segmentField])

  useEffect(() => {
    if (!Number.isFinite(sessionId)) return
    setLoading(true)
    Promise.all([loadSession(), loadAudience()])
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [sessionId, loadSession, loadAudience])

  useEffect(() => {
    if (!selectedQuestionId) return
    void loadQuestionResults(selectedQuestionId)
  }, [selectedQuestionId, loadQuestionResults])

  useEffect(() => {
    if (!selectedQuestionId) return
    void loadCrosstab()
  }, [selectedQuestionId, segmentField, loadCrosstab])

  // Light poll while live
  useEffect(() => {
    if (!session || session.status === 'ended') return
    const id = window.setInterval(() => {
      void loadAudience().catch(() => undefined)
      if (selectedQuestionId) {
        void loadQuestionResults(selectedQuestionId).catch(() => undefined)
        void loadCrosstab().catch(() => undefined)
      }
      void loadSession().catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(id)
  }, [
    session,
    selectedQuestionId,
    loadAudience,
    loadQuestionResults,
    loadCrosstab,
    loadSession,
  ])

  const profileColumns = useMemo(() => {
    const cols = ['name', 'email', 'role', 'company', 'headline', 'linkedin']
    for (const f of intakeFields) {
      if (!cols.includes(f.id)) cols.push(f.id)
    }
    return cols
  }, [intakeFields])

  const openAttribution = async (value: string) => {
    if (!selectedQuestionId) return
    try {
      const res = await fetch(
        `/api/dashboard/live/sessions/${sessionId}/attribution?questionId=${selectedQuestionId}&value=${encodeURIComponent(value)}`
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setAttribution(data.attribution)
      if (!data.attribution.attributed) {
        toast.message(data.attribution.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Attribution failed')
    }
  }

  const openDrawer = async (participantId: number) => {
    setDrawerBusy(true)
    try {
      const res = await fetch(
        `/api/dashboard/live/sessions/${sessionId}/participants/${participantId}`
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setDrawer({ participant: data.participant, trail: data.trail || [] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Drawer failed')
    } finally {
      setDrawerBusy(false)
    }
  }

  const addQuestion = async () => {
    if (!newPrompt.trim()) return
    const options = newOptions
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      const res = await fetch(
        `/api/dashboard/live/sessions/${sessionId}/questions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'poll',
            prompt: newPrompt.trim(),
            options,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setNewPrompt('')
      await loadSession()
      toast.success('Question queued')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const setQuestionState = async (questionId: number, state: string) => {
    try {
      const res = await fetch(
        `/api/dashboard/live/sessions/${sessionId}/questions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_state',
            questionId,
            state,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      await loadSession()
      setSelectedQuestionId(questionId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const copyJoin = () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${joinPath}`
        : joinPath
    void navigator.clipboard?.writeText(url)
    toast.success('Join link copied')
  }

  if (loading || !session) {
    return (
      <div className="flex-1 p-2 w-full bg-background">
        <div className="mx-auto rounded-lg bg-card shadow-lg p-12 flex justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audience…
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center min-w-0">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <div className="min-w-0">
                <h1 className="text-base font-medium text-card-foreground truncate">
                  {session.title}
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {session.code} · Audience intelligence
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={session.status === 'live' ? 'default' : 'secondary'}>
                {session.status}
              </Badge>
              <Badge variant="outline">
                <Users className="h-3 w-3 mr-1" />
                {participantCount}
              </Badge>
              <Button size="sm" variant="outline" onClick={copyJoin}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy join
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={screenPath} target="_blank" rel="noreferrer">
                  <MonitorPlay className="h-3.5 w-3.5 mr-1" />
                  Screen
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/live-sessions">All sessions</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-8">
          {/* Questions + results */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Results</h2>
                <p className="text-xs text-muted-foreground">
                  Click a poll bar to see who chose it (identified questions only).
                </p>
              </div>
              <Select
                value={selectedQuestionId ? String(selectedQuestionId) : ''}
                onValueChange={(v) => setSelectedQuestionId(Number(v))}
              >
                <SelectTrigger className="h-9 w-[280px] text-xs">
                  <SelectValue placeholder="Select question" />
                </SelectTrigger>
                <SelectContent>
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={String(q.id)}>
                      [{q.state}] {q.prompt.slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {questionMeta && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <p className="text-sm font-medium flex-1 min-w-0">
                    {questionMeta.prompt}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {questionMeta.kind} · {questionMeta.identifyEffective}
                  </Badge>
                  {!questionMeta.attributed && (
                    <Badge variant="secondary" className="text-[10px]">
                      Aggregate only
                    </Badge>
                  )}
                  {selectedQuestionId && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[10px]"
                        onClick={() =>
                          void setQuestionState(selectedQuestionId, 'active')
                        }
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() =>
                          void setQuestionState(selectedQuestionId, 'closed')
                        }
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </div>

                {pollBars.length > 0 ? (
                  <ul className="space-y-2">
                    {pollBars.map((bar) => (
                      <li key={bar.label}>
                        <button
                          type="button"
                          className="w-full text-left space-y-1 group"
                          onClick={() => void openAttribution(bar.label)}
                          disabled={!questionMeta.attributed}
                          title={
                            questionMeta.attributed
                              ? 'See who chose this'
                              : 'Anonymous — no attribution'
                          }
                        >
                          <div className="flex justify-between text-xs">
                            <span className="font-medium group-hover:underline">
                              {bar.label}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {bar.pct}% · {bar.count}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-teal-600/80 transition-[width]"
                              style={{ width: `${bar.pct}%` }}
                            />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No responses yet for this question.
                  </p>
                )}

                {attribution && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    {attribution.attributed ? (
                      <>
                        <p className="text-xs font-medium">
                          Chose “{attribution.value}” ({attribution.participants.length})
                        </p>
                        <ul className="space-y-1">
                          {attribution.participants.map((p: ParticipantRow) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="text-xs text-teal-800 dark:text-teal-300 hover:underline"
                                onClick={() => void openDrawer(p.id)}
                              >
                                {p.profile.name || `Participant #${p.id}`}
                                {p.profile.role ? ` · ${p.profile.role}` : ''}
                              </button>
                            </li>
                          ))}
                          {attribution.participants.length === 0 && (
                            <li className="text-xs text-muted-foreground">
                              No identified respondents in this segment.
                            </li>
                          )}
                        </ul>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {attribution.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Add question */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label className="text-[10px]">Queue a poll</Label>
                <Input
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Prompt"
                  className="h-9 text-sm"
                />
              </div>
              <div className="w-48 space-y-1">
                <Label className="text-[10px]">Options (comma-sep)</Label>
                <Input
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button size="sm" onClick={() => void addQuestion()}>
                Add
              </Button>
            </div>
          </section>

          {/* Cross-tab */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Live cross-tab</h2>
                <p className="text-xs text-muted-foreground">
                  Split results by any intake field. Significance from code
                  (N≥{crosstab?.thresholds?.minTotalResponses ?? 80} / cell≥
                  {crosstab?.thresholds?.minCellSize ?? 25}).
                </p>
              </div>
              <Select value={segmentField} onValueChange={setSegmentField}>
                <SelectTrigger className="h-9 w-[180px] text-xs">
                  <SelectValue placeholder="Segment by" />
                </SelectTrigger>
                <SelectContent>
                  {segmentKeys.map((k) => (
                    <SelectItem key={k} value={k}>
                      {intakeFields.find((f) => f.id === k)?.label || k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {crosstabBusy && !crosstab ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Computing…
              </div>
            ) : crosstab ? (
              <div className="space-y-3">
                {(crosstab.insufficientData || crosstab.smallSampleDisclaimer) && (
                  <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      {crosstab.insufficientDataMessage ||
                        crosstab.smallSampleDisclaimer}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {crosstab.segments?.map((seg: any) => (
                    <div
                      key={seg.key}
                      className="rounded-lg border border-border p-3 space-y-2"
                    >
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{seg.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          n={seg.n}
                          {seg.belowMinCell ? ' · thin' : ''}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {seg.bars?.slice(0, 6).map((b: any) => (
                          <li key={b.label} className="text-[11px]">
                            <div className="flex justify-between gap-2">
                              <span className="truncate">{b.label}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {b.pct}%
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-teal-600/70"
                                style={{ width: `${b.pct}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {crosstab.contrasts?.length > 0 && (
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="p-2 font-medium">Contrast</th>
                          <th className="p-2 font-medium">Outcome</th>
                          <th className="p-2 font-medium">Δ</th>
                          <th className="p-2 font-medium">p (BH)</th>
                          <th className="p-2 font-medium">Gate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crosstab.contrasts.slice(0, 12).map((c: any, i: number) => (
                          <tr key={i} className="border-b border-border/60">
                            <td className="p-2">
                              {c.groupA} vs {c.groupB}
                              <span className="text-muted-foreground">
                                {' '}
                                (n={c.nA}/{c.nB})
                              </span>
                            </td>
                            <td className="p-2">{c.outcomeValue}</td>
                            <td className="p-2 tabular-nums">
                              {(c.absoluteEffect * 100).toFixed(1)} pp
                            </td>
                            <td className="p-2 tabular-nums">
                              {c.pCorrected < 0.001
                                ? '<0.001'
                                : c.pCorrected.toFixed(3)}
                            </td>
                            <td className="p-2">
                              {c.publishable ? (
                                <Badge className="text-[9px] h-5">Publishable</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[9px] h-5">
                                  Directional
                                  {c.smallSampleDisclaimer ? ' · small-n' : ''}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* Participant table */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Audience</h2>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {profileColumns.map((c) => (
                      <th key={c} className="p-2.5 font-medium capitalize">
                        {intakeFields.find((f) => f.id === c)?.label || c}
                      </th>
                    ))}
                    <th className="p-2.5 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                      onClick={() => void openDrawer(p.id)}
                    >
                      {profileColumns.map((c) => (
                        <td key={c} className="p-2.5 max-w-[140px] truncate">
                          {c === 'linkedin' && p.profile.linkedin ? (
                            <a
                              href={p.profile.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-700 dark:text-teal-300 inline-flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Profile <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            p.profile[c] || (p.isAnonymous && c === 'name'
                              ? 'Anonymous'
                              : '—')
                          )}
                        </td>
                      ))}
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(p.joinedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {participants.length === 0 && (
                    <tr>
                      <td
                        colSpan={profileColumns.length + 1}
                        className="p-8 text-center text-muted-foreground"
                      >
                        Waiting for people to join…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Profile drawer */}
      {(drawer || drawerBusy) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setDrawer(null)}
          />
          <div className="relative w-full max-w-md h-full bg-card border-l border-border shadow-xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">
                  {drawer?.participant.profile.name || 'Participant'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {drawer?.participant.isAnonymous
                    ? 'Anonymous'
                    : drawer?.participant.profile.headline || 'Profile'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setDrawer(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {drawerBusy && !drawer ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : drawer ? (
              <>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(drawer.participant.profile).map(([k, v]) => (
                    <div key={k} className="rounded-md bg-muted/40 px-2 py-1.5">
                      <dt className="text-[10px] text-muted-foreground capitalize">
                        {k}
                      </dt>
                      <dd className="font-medium truncate">{v || '—'}</dd>
                    </div>
                  ))}
                </dl>

                {drawer.participant.linkedinUrl && (
                  <a
                    href={drawer.participant.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-teal-700 dark:text-teal-300 inline-flex items-center gap-1"
                  >
                    LinkedIn <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                <div>
                  <h4 className="text-xs font-semibold mb-2">Action trail</h4>
                  <ul className="space-y-1.5">
                    {drawer.trail.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-md border border-border px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{e.type}</span>
                          <span className="text-muted-foreground">
                            {new Date(e.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                          {e.redacted
                            ? 'Redacted — anonymous question'
                            : JSON.stringify(e.payload, null, 0)}
                        </pre>
                      </li>
                    ))}
                    {drawer.trail.length === 0 && (
                      <li className="text-xs text-muted-foreground">No events yet.</li>
                    )}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
