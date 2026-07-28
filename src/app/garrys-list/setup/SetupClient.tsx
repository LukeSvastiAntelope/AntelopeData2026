'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import LogoText from '@/components/logo-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2 } from 'lucide-react'

type NumQuestions = 1 | 3 | 5
type QuestionStyle = 'yes_no_unsure' | 'multiple_choice' | 'scale_1_5'
type Breakdown = 'district' | 'occupation' | 'income' | 'age'
type RevealMode = 'percentage_split' | 'hide_count' | 'unlock_at_50'

const NUM_QUESTIONS_OPTIONS: { value: NumQuestions; label: string; sub: string }[] = [
  { value: 1, label: '1 · single tap', sub: 'Single-tap gets the most responses in a newsletter.' },
  { value: 3, label: '3 · short', sub: '' },
  { value: 5, label: '5 · full', sub: '' },
]
const QUESTION_STYLE_OPTIONS: { value: QuestionStyle; label: string }[] = [
  { value: 'yes_no_unsure', label: 'Yes / No / unsure' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'scale_1_5', label: '1–5 scale' },
]
const BREAKDOWN_OPTIONS: { value: Breakdown; label: string }[] = [
  { value: 'district', label: 'District' },
  { value: 'occupation', label: 'Occupation' },
  { value: 'income', label: 'Income' },
  { value: 'age', label: 'Age' },
]
const REVEAL_OPTIONS: { value: RevealMode; label: string }[] = [
  { value: 'percentage_split', label: 'Percentage split' },
  { value: 'hide_count', label: 'Hide count' },
  { value: 'unlock_at_50', label: 'Unlock at 50' },
]

export function SetupClient() {
  const router = useRouter()
  const params = useSearchParams()
  const url = params.get('url') || ''

  const [parsing, setParsing] = useState(true)
  const [parseError, setParseError] = useState<string | null>(null)
  const [storyText, setStoryText] = useState('')
  const [topic, setTopic] = useState('')

  const [title, setTitle] = useState('')
  const [numQuestions, setNumQuestions] = useState<NumQuestions>(3)
  const [questionStyle, setQuestionStyle] = useState<QuestionStyle>('yes_no_unsure')
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>(['district', 'occupation', 'income'])
  const [revealMode, setRevealMode] = useState<RevealMode>('percentage_split')
  const [contextNotes, setContextNotes] = useState('')

  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!url) {
      router.replace('/')
      return
    }
    let cancelled = false
    setParsing(true)
    setParseError(null)
    fetch('/api/garrys-list/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.status) {
          setParseError(d.message || 'Could not read that URL.')
          return
        }
        setStoryText(d.storyText || '')
        setTopic(d.topic || '')
        setTitle(d.suggestedTitle || d.storyTitle || '')
      })
      .catch(() => {
        if (!cancelled) setParseError('Could not read that URL.')
      })
      .finally(() => {
        if (!cancelled) setParsing(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, router])

  const toggleBreakdown = (b: Breakdown) => {
    setBreakdowns((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
  }

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error('Give the survey a short subject')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/garrys-list/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          storyText,
          title,
          topic,
          numQuestions,
          questionStyle,
          breakdowns,
          revealMode,
          contextInstructions: contextNotes,
        }),
      })
      const data = await res.json()
      if (!data.status) {
        toast.error(data.message || 'Could not generate a survey for this story.')
        return
      }
      sessionStorage.setItem('garrys-list-ready', JSON.stringify(data))
      router.push('/garrys-list/ready')
    } catch {
      toast.error('Something went wrong generating the survey. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
          <Link href="/" className="flex items-center">
            <LogoText className="text-zinc-900 dark:text-zinc-100" width={120} height={30} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border bg-background p-6 shadow-sm space-y-5">
          {/* Reading from / parse status */}
          <div className="flex items-start justify-between gap-3 border-b pb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Reading from</p>
              <p className="text-sm font-medium truncate">{url}</p>
            </div>
            {parsing ? (
              <Badge variant="secondary" className="shrink-0">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Reading…
              </Badge>
            ) : parseError ? (
              <Badge variant="destructive" className="shrink-0">Failed</Badge>
            ) : (
              <Badge className="shrink-0 bg-green-100 text-green-700 hover:bg-green-100">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Parsed
              </Badge>
            )}
          </div>

          {parseError ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">{parseError}</p>
              <Button variant="outline" onClick={() => router.push('/')}>Try a different URL</Button>
            </div>
          ) : parsing ? (
            <p className="text-sm text-muted-foreground">Reading the story and figuring out what to ask…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground -mt-2">
                Everything below is pre-filled from the story. Confirm, or change what you want.
              </p>

              {/* 1. Subject */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">1 · What is this survey about?</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Where readers stand on…" />
              </div>

              {/* 2. Number of questions */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">2 · How many questions?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {NUM_QUESTIONS_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={numQuestions === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNumQuestions(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {numQuestions === 1 && (
                  <p className="text-xs text-muted-foreground">Single-tap gets the most responses in a newsletter.</p>
                )}
              </div>

              {/* 3. Question style */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">3 · Question style</Label>
                <div className="grid grid-cols-3 gap-2">
                  {QUESTION_STYLE_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={questionStyle === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuestionStyle(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 4. Breakdowns */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">4 · What breakdowns do you want to collect?</Label>
                <div className="flex flex-wrap gap-2">
                  {BREAKDOWN_OPTIONS.map((opt) => {
                    const active = breakdowns.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleBreakdown(opt.value)}
                        className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                          active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">These become the regression axes on your dashboard.</p>
              </div>

              {/* 5. Reveal mode */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">5 · Reveal to readers</Label>
                <div className="grid grid-cols-3 gap-2">
                  {REVEAL_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={revealMode === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRevealMode(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Context notes */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Context for the generator <span className="text-muted-foreground font-normal">— optional, ~3 sentences</span>
                </Label>
                <Textarea
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="Keep questions neutral and non-leading. Focus on…"
                  className="min-h-[70px] text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {generating ? 'Generating…' : 'Survey ready in ~25s'}
                </p>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                    </>
                  ) : (
                    'Generate survey →'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
