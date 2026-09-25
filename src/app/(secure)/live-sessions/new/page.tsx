'use client'

/**
 * Live L7 — create/schedule a session: event type, identify mode,
 * intake form, question deck, then draft / schedule / go live.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Plus,
  Trash2,
  Radio,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

type IntakeField = {
  id: string
  label: string
  type: 'text' | 'select' | 'email' | 'url' | 'number'
  required?: boolean
  options?: string[]
  mapsTo?: string
}

type DeckQuestion = {
  key: string
  kind: 'poll' | 'wordcloud' | 'open' | 'qa' | 'scale'
  prompt: string
  optionsText: string
  identifyOverride: '' | 'identified' | 'anonymous'
}

const EVENT_TYPES = [
  { id: 'expert_brief', label: 'Expert brief' },
  { id: 'town_hall', label: 'Town hall' },
  { id: 'deliberation', label: 'Deliberation' },
] as const

const IDENTIFY_MODES = [
  {
    id: 'identified',
    label: 'Identified',
    hint: 'Participants share profile + consent; attribution enabled.',
  },
  {
    id: 'anonymous',
    label: 'Anonymous',
    hint: 'Aggregate-only results; no person trail.',
  },
  {
    id: 'per_question',
    label: 'Per question',
    hint: 'Default identified; override per question in the deck.',
  },
] as const

const DEFAULT_INTAKE: IntakeField[] = [
  { id: 'name', label: 'Full name', type: 'text', required: true, mapsTo: 'name' },
  { id: 'email', label: 'Email', type: 'email', required: true, mapsTo: 'email' },
  { id: 'role', label: 'Role', type: 'text', mapsTo: 'role' },
  { id: 'company', label: 'Organization', type: 'text', mapsTo: 'company' },
]

const DEFAULT_CONSENT =
  'By joining, you agree that this session may capture your responses and profile for campaign follow-up within this organization. You can leave at any time.'

function slugify(label: string, used: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || 'field'
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}_${n++}`
  }
  used.add(id)
  return id
}

export default function NewLiveSessionPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [hostName, setHostName] = useState('')
  const [eventType, setEventType] =
    useState<(typeof EVENT_TYPES)[number]['id']>('expert_brief')
  const [identifyMode, setIdentifyMode] =
    useState<(typeof IDENTIFY_MODES)[number]['id']>('identified')
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT)
  const [scheduledAt, setScheduledAt] = useState('')

  const [fields, setFields] = useState<IntakeField[]>(DEFAULT_INTAKE)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] =
    useState<IntakeField['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')

  const [deck, setDeck] = useState<DeckQuestion[]>([
    {
      key: 'q1',
      kind: 'poll',
      prompt: 'Which priority matters most to you today?',
      optionsText: 'Jobs, Healthcare, Education, Public safety',
      identifyOverride: '',
    },
  ])

  const showConsent = identifyMode !== 'anonymous'
  const showIntake = identifyMode !== 'anonymous'

  const identifyHint = useMemo(
    () => IDENTIFY_MODES.find((m) => m.id === identifyMode)?.hint,
    [identifyMode]
  )

  const addField = () => {
    if (!newFieldLabel.trim()) return
    const used = new Set(fields.map((f) => f.id))
    const id = slugify(newFieldLabel, used)
    const options =
      newFieldType === 'select'
        ? newFieldOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    setFields((prev) => [
      ...prev,
      {
        id,
        label: newFieldLabel.trim(),
        type: newFieldType,
        options,
        required: false,
      },
    ])
    setNewFieldLabel('')
    setNewFieldOptions('')
  }

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  const addQuestion = () => {
    setDeck((prev) => [
      ...prev,
      {
        key: `q${Date.now()}`,
        kind: 'poll',
        prompt: '',
        optionsText: 'Yes, No, Undecided',
        identifyOverride: '',
      },
    ])
  }

  const updateQuestion = (key: string, patch: Partial<DeckQuestion>) => {
    setDeck((prev) =>
      prev.map((q) => (q.key === key ? { ...q, ...patch } : q))
    )
  }

  const removeQuestion = (key: string) => {
    setDeck((prev) => prev.filter((q) => q.key !== key))
  }

  const moveQuestion = (key: string, dir: -1 | 1) => {
    setDeck((prev) => {
      const i = prev.findIndex((q) => q.key === key)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const create = async (mode: 'draft' | 'schedule' | 'live') => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (mode === 'schedule' && !scheduledAt) {
      toast.error('Pick a schedule time')
      return
    }
    const questions = deck
      .filter((q) => q.prompt.trim())
      .map((q, i) => ({
        kind: q.kind,
        prompt: q.prompt.trim(),
        options:
          q.kind === 'poll' || q.kind === 'scale'
            ? q.optionsText
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        identifyOverride: q.identifyOverride || null,
        orderIdx: i,
        state: 'queued' as const,
      }))

    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/live/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          hostName: hostName.trim() || null,
          eventType,
          identifyMode,
          consentText: showConsent ? consentText.trim() || null : null,
          intakeSchema: {
            fields: showIntake ? fields : [],
            consentPrompt: showConsent ? consentText.trim() || undefined : undefined,
          },
          questions,
          goLive: mode === 'live',
          scheduledAt: mode === 'schedule' ? scheduledAt : null,
          status:
            mode === 'live'
              ? 'live'
              : mode === 'schedule'
                ? 'scheduled'
                : 'draft',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Create failed')
      toast.success(
        mode === 'live'
          ? 'Session is live'
          : mode === 'schedule'
            ? 'Session scheduled'
            : 'Draft saved'
      )
      router.push(`/live-sessions/${data.session.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">
                New session
              </h1>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/live-sessions">Cancel</Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-8 max-w-3xl">
          <p className="text-sm text-muted-foreground">
            Define the room once — expert brief, town hall, or deliberation —
            then share a join link/QR. One engine for all event types.
          </p>

          {/* Basics */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Session
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Downtown housing town hall"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host">Host name</Label>
                <Input
                  id="host"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Event type</Label>
                <Select
                  value={eventType}
                  onValueChange={(v) => setEventType(v as typeof eventType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Identify mode</Label>
                <Select
                  value={identifyMode}
                  onValueChange={(v) =>
                    setIdentifyMode(v as typeof identifyMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IDENTIFY_MODES.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {identifyHint && (
                  <p className="text-xs text-muted-foreground">{identifyHint}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sched">Schedule (optional)</Label>
                <Input
                  id="sched"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Intake */}
          {showIntake && (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Intake form</h2>
                <p className="text-xs text-muted-foreground">
                  Shown on join before the consent step. Fields map into
                  tenant-scoped contacts — no scoring.
                </p>
              </div>
              <ul className="space-y-2">
                {fields.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium flex-1 min-w-0 truncate">
                      {f.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {f.type}
                      {f.required ? ' · required' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => removeField(f.id)}
                      aria-label={`Remove ${f.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Label>Field label</Label>
                  <Input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="e.g. Neighborhood"
                  />
                </div>
                <div className="space-y-1.5 w-[120px]">
                  <Label>Type</Label>
                  <Select
                    value={newFieldType}
                    onValueChange={(v) =>
                      setNewFieldType(v as IntakeField['type'])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newFieldType === 'select' && (
                  <div className="space-y-1.5 flex-1 min-w-[160px]">
                    <Label>Options (comma-separated)</Label>
                    <Input
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="A, B, C"
                    />
                  </div>
                )}
                <Button size="sm" variant="secondary" onClick={addField}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add field
                </Button>
              </div>
            </section>
          )}

          {showConsent && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Consent copy</h2>
              <p className="text-xs text-muted-foreground">
                Participants must accept before joining when identified.
              </p>
              <Textarea
                value={consentText}
                onChange={(e) => setConsentText(e.target.value)}
                rows={3}
              />
            </section>
          )}

          {/* Question deck */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Question deck</h2>
                <p className="text-xs text-muted-foreground">
                  Polls, word clouds, open responses, Q&A — activate live from
                  the host view.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={addQuestion}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
            <ul className="space-y-3">
              {deck.map((q, idx) => (
                <li
                  key={q.key}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-muted-foreground tabular-nums w-6">
                      {idx + 1}
                    </span>
                    <Select
                      value={q.kind}
                      onValueChange={(v) =>
                        updateQuestion(q.key, {
                          kind: v as DeckQuestion['kind'],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="poll">Poll</SelectItem>
                        <SelectItem value="wordcloud">Word cloud</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="qa">Q&A</SelectItem>
                        <SelectItem value="scale">Scale</SelectItem>
                      </SelectContent>
                    </Select>
                    {identifyMode === 'per_question' && (
                      <Select
                        value={q.identifyOverride || 'default'}
                        onValueChange={(v) =>
                          updateQuestion(q.key, {
                            identifyOverride:
                              v === 'default'
                                ? ''
                                : (v as 'identified' | 'anonymous'),
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue placeholder="Identify" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Session default</SelectItem>
                          <SelectItem value="identified">Identified</SelectItem>
                          <SelectItem value="anonymous">Anonymous</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex gap-0.5 ml-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => moveQuestion(q.key, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => moveQuestion(q.key, 1)}
                        disabled={idx === deck.length - 1}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => removeQuestion(q.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    value={q.prompt}
                    onChange={(e) =>
                      updateQuestion(q.key, { prompt: e.target.value })
                    }
                    placeholder="Question prompt"
                  />
                  {(q.kind === 'poll' || q.kind === 'scale') && (
                    <Input
                      value={q.optionsText}
                      onChange={(e) =>
                        updateQuestion(q.key, { optionsText: e.target.value })
                      }
                      placeholder="Options, comma-separated"
                      className="text-sm"
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void create('draft')}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Save draft
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || !scheduledAt}
              onClick={() => void create('schedule')}
            >
              Schedule
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void create('live')}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Go live
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
