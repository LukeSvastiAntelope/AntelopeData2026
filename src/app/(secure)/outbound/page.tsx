'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Send, Sparkles, ShieldAlert, Wand2, Bot } from 'lucide-react'
import {
  StagedActionCard,
  type StagedActionCardModel,
} from '@/components/consultant/staged-action-card'
import { cn } from '@/lib/utils'

type CatalogItem = {
  id: string
  name: string
  description: string | null
  source: 'preset' | 'saved'
  category?: string
}

type GoalTemplate = {
  id: string
  label: string
  description: string
  starterGoal: string
}

type Draft = {
  format: string
  title: string
  body: string
  groundedIn: Array<{ label: string; value: string }>
  honest: boolean
  smallSampleDisclaimerApplied?: boolean
}

type DraftResponse = {
  status: boolean
  message?: string
  context?: {
    segmentName: string
    segmentId: string
    voterCount: number
    thinSegment?: boolean
    observedAttributes: string[]
    statedPositions: Array<{ label: string; value: string; count: number }>
    disclaimer: string
  }
  drafts?: Draft[]
  modelUsed?: string | null
  usedFallback?: boolean
}

type StageResult = {
  stagedActionId: number
  toolName: string
  status: string
  heldAtGate: boolean
  fullAutoApplied: boolean
  autonomy: string
  summary: string
  thinSegment: boolean
  smallSampleDisclaimerApplied: boolean
  recipients?: { note: string; emails: string[]; phones: string[] }
}

const ALL_FORMATS = ['letter', 'email', 'sms', 'ad_copy'] as const

const STEPS = [
  { n: 1, label: 'Segment' },
  { n: 2, label: 'Generate' },
  { n: 3, label: 'Review' },
  { n: 4, label: 'Send (gated)' },
] as const

export default function OutboundPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [templates, setTemplates] = useState<GoalTemplate[]>([])
  const [segmentId, setSegmentId] = useState<string>('')
  const [formats, setFormats] = useState<string[]>(['letter', 'email', 'sms', 'ad_copy'])
  const [goal, setGoal] = useState('')
  const [assistNote, setAssistNote] = useState<string | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [stagingFormat, setStagingFormat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DraftResponse | null>(null)
  const [stagedCards, setStagedCards] = useState<StagedActionCardModel[]>([])
  const [stageNotes, setStageNotes] = useState<StageResult[]>([])
  const [busyStagedId, setBusyStagedId] = useState<number | null>(null)

  const activeStep = stagedCards.some((c) => c.status === 'pending')
    ? 4
    : result?.drafts?.length
      ? 3
      : segmentId
        ? 2
        : 1

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    try {
      const [draftRes, assistRes] = await Promise.all([
        fetch('/api/outbound/draft'),
        fetch('/api/outbound/prompt-assist'),
      ])
      const data = await draftRes.json()
      if (!data.status) throw new Error(data.message || 'Failed to load segments')
      const items = (data.catalog || []) as CatalogItem[]
      setCatalog(items)
      const preferred =
        items.find((c) => c.id === 'women-35-homeowners-public-security') ||
        items.find((c) => c.category === 'tracked') ||
        items[0]
      if (preferred) setSegmentId(preferred.id)

      const assistData = await assistRes.json().catch(() => ({}))
      if (assistData.status && Array.isArray(assistData.templates)) {
        setTemplates(assistData.templates as GoalTemplate[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const toggleFormat = (f: string) => {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    )
  }

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (t?.starterGoal) {
      setGoal(t.starterGoal)
      setAssistNote(null)
    }
  }

  const assistGoal = async () => {
    if (!goal.trim()) {
      setError('Enter a rough goal first, then Assist')
      return
    }
    setAssisting(true)
    setError(null)
    try {
      const selected = catalog.find((c) => c.id === segmentId)
      const res = await fetch('/api/outbound/prompt-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plainDescription: goal.trim(),
          segmentName: selected?.name,
          formats,
        }),
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Assist failed')
      setGoal(String(data.goal || goal))
      setAssistNote(String(data.explanation || 'Goal sharpened for drafting.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assist failed')
    } finally {
      setAssisting(false)
    }
  }

  const generate = async () => {
    if (!segmentId) {
      setError('Pick a segment')
      return
    }
    if (!formats.length) {
      setError('Pick at least one format')
      return
    }
    setGenerating(true)
    setError(null)
    setResult(null)
    setStagedCards([])
    setStageNotes([])
    try {
      const res = await fetch('/api/outbound/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segmentId,
          formats,
          goal: goal.trim() || undefined,
        }),
      })
      const data = (await res.json()) as DraftResponse
      if (!data.status) throw new Error(data.message || 'Draft failed')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft failed')
    } finally {
      setGenerating(false)
    }
  }

  const stageDraft = async (draft: Draft) => {
    if (!result?.context) return
    setStagingFormat(draft.format)
    setError(null)
    try {
      const res = await fetch('/api/outbound/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segmentId,
          draft,
          context: result.context,
          fullAutoSend: false,
        }),
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Stage failed')
      const note = data as StageResult
      setStageNotes((prev) => [note, ...prev])
      setStagedCards((prev) => [
        {
          id: note.stagedActionId,
          toolName: note.toolName,
          summary: note.summary,
          status: note.heldAtGate || note.status === 'review_only' ? 'pending' : 'executed',
        },
        ...prev,
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed')
    } finally {
      setStagingFormat(null)
    }
  }

  const approve = async (id: number) => {
    setBusyStagedId(id)
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/approve`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.status && !data.ok) {
        throw new Error(data.message || data.error || 'Approve failed')
      }
      setStagedCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status:
                  data.staged?.status === 'executed' || data.execution?.status === 'executed'
                    ? 'executed'
                    : 'approved',
              }
            : c
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusyStagedId(null)
    }
  }

  const dismiss = async (id: number) => {
    setBusyStagedId(id)
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/dismiss`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (!data.status && !data.ok) {
          throw new Error(data.message || 'Dismiss failed')
        }
      }
      setStagedCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'dismissed' } : c))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed')
    } finally {
      setBusyStagedId(null)
    }
  }

  const selected = catalog.find((c) => c.id === segmentId)

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center flex-wrap gap-2">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Outbound
            </h1>
            <Badge variant="secondary" className="ml-1">
              Microtargeting
            </Badge>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/agents/campaign-consultant" className="gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                Ask consultant
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-6 max-w-4xl">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Segment → draft → review → gated send</h2>
            <p className="text-muted-foreground text-sm">
              Tailor the message from observed attributes and survey-stated positions. Who to
              contact stays with the propensity loop. Public send uses the same Auto-Post
              approval cards as every other outreach — never a one-shot fire.
            </p>
            <ol className="flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md border',
                    activeStep === s.n
                      ? 'border-foreground/40 bg-muted font-medium'
                      : activeStep > s.n
                        ? 'border-border text-muted-foreground'
                        : 'border-dashed border-border text-muted-foreground/70'
                  )}
                >
                  {s.n}. {s.label}
                </li>
              ))}
            </ol>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                1–2 · Segment & generate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Segment</Label>
                {loadingCatalog ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading segments…
                  </div>
                ) : (
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((c) => (
                        <SelectItem key={`${c.source}-${c.id}`} value={c.id}>
                          {c.name}
                          {c.source === 'saved' ? ' (saved)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selected?.description && (
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Formats</Label>
                <div className="flex flex-wrap gap-4">
                  {ALL_FORMATS.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm capitalize">
                      <Checkbox
                        checked={formats.includes(f)}
                        onCheckedChange={() => toggleFormat(f)}
                      />
                      {f.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="goal">Goal / CTA (optional)</Label>
                  {templates.length > 0 && (
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Goal template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Textarea
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Invite to town hall on public safety plan"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={assisting || !goal.trim()}
                    onClick={() => void assistGoal()}
                  >
                    {assisting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Assist goal
                  </Button>
                  {assistNote && (
                    <p className="text-xs text-muted-foreground flex-1">{assistNote}</p>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={generate} disabled={generating || !segmentId}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Drafting…
                  </>
                ) : (
                  'Draft for segment'
                )}
              </Button>
            </CardContent>
          </Card>

          {result?.context && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">3 · Review tailoring context</CardTitle>
                <p className="text-xs text-muted-foreground">{result.context.disclaimer}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{result.context.segmentName}</Badge>
                  <Badge variant="secondary">
                    {result.context.voterCount} live voter
                    {result.context.voterCount === 1 ? '' : 's'}
                  </Badge>
                  {result.context.thinSegment && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                      Thin segment · coarse + disclaimer
                    </Badge>
                  )}
                  {result.usedFallback && (
                    <Badge variant="outline">Fallback templates</Badge>
                  )}
                  {result.modelUsed && !result.usedFallback && (
                    <Badge variant="outline">{result.modelUsed}</Badge>
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1">Stated positions</div>
                  {result.context.statedPositions.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      None stated — drafts will not invent issue concerns.
                    </p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                      {result.context.statedPositions.map((p) => (
                        <li key={`${p.label}-${p.value}`}>
                          {p.label}: “{p.value}” (n={p.count})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {stagedCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                4 · Staged for approval (same gate as Auto-Post)
              </div>
              {stageNotes[0]?.recipients?.note && (
                <p className="text-xs text-muted-foreground">{stageNotes[0].recipients.note}</p>
              )}
              {stagedCards.map((action) => (
                <StagedActionCard
                  key={action.id}
                  action={action}
                  onApprove={approve}
                  onDismiss={dismiss}
                  busyId={busyStagedId}
                />
              ))}
            </div>
          )}

          {result?.drafts?.map((d) => (
            <Card key={`${d.format}-${d.title}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">{d.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {d.format.replace('_', ' ')}
                    </Badge>
                    {d.smallSampleDisclaimerApplied && (
                      <Badge variant="outline" className="text-[10px]">
                        Small-sample disclaimer
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Grounded in:{' '}
                  {d.groundedIn.length
                    ? d.groundedIn.map((g) => `${g.label}=${g.value}`).join('; ')
                    : 'demographic/map attributes only (no stated issue)'}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed bg-muted/30 rounded-md p-4 border border-border">
                  {d.body}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={stagingFormat === d.format}
                  onClick={() => void stageDraft(d)}
                >
                  {stagingFormat === d.format ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                      Staging…
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5 mr-2" />
                      Stage for approval
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
