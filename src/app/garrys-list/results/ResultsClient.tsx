'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import LogoText from '@/components/logo-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lightbulb, ShieldAlert, ExternalLink } from 'lucide-react'

interface SplitRow {
  label: string
  count: number
  pct: number
}

interface QuestionResult {
  id: number
  type: 'opinion' | 'demographic'
  prompt: string
  answered: number
  split: SplitRow[]
}

interface BreakdownChart {
  questionPrompt: string
  headlineOption: string
  bars: { bucket: string; pct: number; n: number }[]
}

interface ResultsData {
  status: boolean
  survey?: { id: number; title: string; slug: string }
  totalResponses?: number
  methodologyNote?: string
  storyUrl?: string
  questions?: QuestionResult[]
  breakdownCharts?: BreakdownChart[]
  insight?: string
  message?: string
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

export function ResultsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenFromUrl = searchParams.get('token') || ''

  const [tokenInput, setTokenInput] = useState(tokenFromUrl)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ResultsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchResults = async (token: string) => {
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/garrys-list/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const json = await res.json()
      if (!json.status) {
        setError(json.message || 'Could not load results')
        setData(null)
        return
      }
      setData(json)
    } catch {
      setError('Could not load results')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tokenFromUrl) fetchResults(tokenFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tokenInput.trim()) return
    router.replace(`/garrys-list/results?token=${encodeURIComponent(tokenInput.trim())}`)
    fetchResults(tokenInput.trim())
  }

  const opinionQs = (data?.questions || []).filter((q) => q.type === 'opinion')
  const demoQs = (data?.questions || []).filter((q) => q.type === 'demographic')

  const tiles: { label: string; value: string }[] = []
  if (data?.totalResponses !== undefined) {
    tiles.push({ label: 'Responses', value: String(data.totalResponses) })
  }
  for (const q of opinionQs) {
    if (tiles.length >= 4) break
    const top = q.split.slice().sort((a, b) => b.pct - a.pct)[0]
    if (top && q.answered > 0) {
      tiles.push({ label: `${q.prompt} — ${top.label}`, value: `${top.pct}%` })
    }
  }
  for (const q of demoQs) {
    if (tiles.length >= 4) break
    const total = data?.totalResponses || 0
    const pct = total > 0 ? Math.round((q.answered / total) * 100) : 0
    tiles.push({ label: `Gave ${q.prompt.replace(/\?$/, '').toLowerCase()}`, value: `${pct}%` })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-4">
          <Link href="/" className="flex items-center">
            <LogoText className="text-zinc-900 dark:text-zinc-100" width={120} height={30} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        {!data && (
          <form onSubmit={handleSubmit} className="rounded-xl border bg-background p-6 shadow-sm space-y-3">
            <p className="text-sm font-medium">Enter your survey token</p>
            <div className="flex gap-2">
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ANT-XXXX-XXXX-XXXX-XXXX"
                className="font-mono"
              />
              <Button type="submit" disabled={loading}>
                {loading ? 'Loading…' : 'View results'}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}

        {data && (
          <div className="rounded-xl border bg-background p-6 shadow-sm space-y-6">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <p className="font-semibold">{data.survey?.title}</p>
                {data.storyUrl && (
                  <a
                    href={data.storyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:underline mt-0.5"
                  >
                    From the source story <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setData(null); setError(null) }}>
                Use another token
              </Button>
            </div>

            {tiles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {tiles.map((t) => (
                  <StatTile key={t.label} label={t.label} value={t.value} />
                ))}
              </div>
            )}

            {/* Opinion question splits */}
            <div className="space-y-4">
              {opinionQs.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-medium">{q.prompt}</p>
                  {q.answered === 0 ? (
                    <p className="text-xs text-muted-foreground">No responses yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {q.split.map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span>{row.label}</span>
                            <span className="text-muted-foreground">{row.pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${row.pct}%` }} />
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">{q.answered} responses</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Breakdown charts */}
            {data.breakdownCharts && data.breakdownCharts.length > 0 && (
              <div className="space-y-5 border-t pt-4">
                {data.breakdownCharts.map((chart) => (
                  <div key={chart.questionPrompt} className="space-y-2">
                    <p className="text-sm font-medium">
                      &quot;{chart.headlineOption}&quot; by {chart.questionPrompt.replace(/\?$/, '').toLowerCase()}
                    </p>
                    <div className="space-y-1.5">
                      {chart.bars.map((bar) => (
                        <div key={bar.bucket}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span>{bar.bucket}</span>
                            <span className="text-muted-foreground">{bar.pct}% (n={bar.n})</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${bar.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.insight && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lightbulb className="h-4 w-4" /> What stands out
                </p>
                <p className="text-sm text-muted-foreground">{data.insight}</p>
              </div>
            )}

            {data.methodologyNote && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground pt-2 border-t">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {data.methodologyNote}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
