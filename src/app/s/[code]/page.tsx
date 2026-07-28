'use client'

import { useEffect, useState, use as usePromise } from 'react'
import LogoText from '@/components/logo-text'

interface SurveyLookup {
  status: boolean
  survey?: { id: number; title: string; slug: string; status: string }
  isSingleTap?: boolean
  firstQuestion?: { id: number; prompt: string; options: string[] }
  methodologyNote?: string
  publisherName?: string
  message?: string
}

interface SplitRow {
  label: string
  count: number
  pct: number
}

export default function GarrysListShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = usePromise(params)

  const [loading, setLoading] = useState(true)
  const [lookup, setLookup] = useState<SurveyLookup | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [split, setSplit] = useState<SplitRow[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/garrys-list/survey?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d: SurveyLookup) => {
        if (cancelled) return
        setLookup(d);
        if (d.status && d.isSingleTap === false && d.survey?.slug) {
          window.location.replace(`/survey/${d.survey.slug}`)
          return
        }
        // Email-safe deep link: /s/<code>?a=<value> records the tap immediately.
        const params = new URLSearchParams(window.location.search)
        const preAnswer = params.get('a')
        if (d.status && d.firstQuestion && preAnswer) {
          submitAnswer(d.firstQuestion.id, preAnswer)
        }
      })
      .catch(() => {
        if (!cancelled) setLookup({ status: false, message: 'Could not load this survey.' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const submitAnswer = async (questionId: number, value: string) => {
    setSubmitting(true)
    setPicked(value)
    try {
      const res = await fetch('/api/garrys-list/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortCode: code, questionId, value }),
      })
      const data = await res.json()
      if (data.status) setSplit(data.split)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!lookup?.status || !lookup.firstQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted-foreground text-center">{lookup?.message || 'Survey not found.'}</p>
      </div>
    )
  }

  const { firstQuestion, publisherName, methodologyNote } = lookup

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center">
          <LogoText className="text-zinc-900 dark:text-zinc-100" width={110} height={28} />
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm space-y-4">
          {!split ? (
            <>
              <p className="text-xs text-muted-foreground text-center">— your turn —</p>
              <p className="font-medium text-center">{firstQuestion.prompt}</p>
              <div className="space-y-2">
                {firstQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={submitting}
                    onClick={() => submitAnswer(firstQuestion.id, opt)}
                    className="w-full h-11 rounded-md border border-input text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-60"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">Tap to answer and see how readers responded</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Thanks — here&apos;s the split</p>
              <div className="space-y-3">
                {split.map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">
                        {row.label}
                        {row.label === picked ? ' ✓' : ''}
                      </span>
                      <span className="text-muted-foreground">{row.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">
                Reader survey by {publisherName || 'the publisher'} · self-selected, not a poll · your answer counted once
              </p>
            </>
          )}
        </div>

        {methodologyNote && !split && (
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">{methodologyNote}</p>
        )}
      </div>
    </div>
  )
}
