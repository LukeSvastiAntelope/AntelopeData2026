"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Tooltip, LabelList,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Loader2, MessageSquareText } from 'lucide-react'

interface SurveyQuestionChartsProps {
  surveyId: number
}

type QuestionType = 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no' | 'email' | 'number'

interface SurveyQuestion {
  id: number
  type: QuestionType
  prompt: string
  options: string[] | null
  question_order: number
}

interface ResponseAnswer {
  questionId: number
  questionText: string
  value: string | string[]
}

interface SurveyResponse {
  id: number
  demographics: Record<string, any>
  answers: ResponseAnswer[]
}

const CHART_COLORS = [
  'var(--chart-2)', 'var(--chart-3)', 'var(--chart-1)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--neutral-500)',
  'var(--neutral-700)', 'var(--neutral-400)',
]

const OPEN_ENDED: QuestionType[] = ['text', 'email']

type ChartKind = 'bar' | 'pie' | 'line'

interface QuestionStat {
  question: SurveyQuestion
  answered: number
  data: Array<{ name: string; value: number; pct: number }>
  isNumeric: boolean
  defaultKind: ChartKind
  availableKinds: ChartKind[]
  topAnswer: string | null
}

// Parse a single stored answer value into one-or-more discrete values.
function explodeValue(value: string | string[]): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  const s = String(value).trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean)
    } catch { /* fall through */ }
  }
  return [s]
}

function buildQuestionStat(q: SurveyQuestion, responses: SurveyResponse[]): QuestionStat | null {
  if (OPEN_ENDED.includes(q.type)) {
    // Open-ended: count answered only, no chart.
    let answered = 0
    for (const r of responses) {
      const a = r.answers.find((x) => x.questionId === q.id)
      if (a && explodeValue(a.value).length) answered++
    }
    return { question: q, answered, data: [], isNumeric: false, defaultKind: 'bar', availableKinds: [], topAnswer: null }
  }

  const counts = new Map<string, number>()
  let answered = 0
  for (const r of responses) {
    const a = r.answers.find((x) => x.questionId === q.id)
    if (!a) continue
    const vals = explodeValue(a.value)
    if (!vals.length) continue
    answered++
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1)
  }
  if (counts.size === 0) {
    return { question: q, answered: 0, data: [], isNumeric: false, defaultKind: 'bar', availableKinds: [], topAnswer: null }
  }

  const isNumeric = q.type === 'rating' || q.type === 'number' ||
    [...counts.keys()].every((k) => k !== '' && !Number.isNaN(Number(k)))

  let ordered: Array<[string, number]>
  if (isNumeric) {
    // Histogram: sort ascending and fill integer gaps for a clean distribution.
    const nums = [...counts.keys()].map(Number).filter((n) => !Number.isNaN(n))
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    ordered = []
    if (max - min <= 20 && Number.isInteger(min) && Number.isInteger(max)) {
      for (let n = min; n <= max; n++) ordered.push([String(n), counts.get(String(n)) || 0])
    } else {
      ordered = [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
    }
  } else if (q.options && q.options.length) {
    // Choice: keep canonical option order, then append any unexpected values.
    const seen = new Set<string>()
    ordered = q.options.map((opt) => { seen.add(opt); return [opt, counts.get(opt) || 0] as [string, number] })
    for (const [k, v] of counts) if (!seen.has(k)) ordered.push([k, v])
  } else {
    ordered = [...counts.entries()].sort((a, b) => b[1] - a[1])
  }

  const total = answered || 1
  const data = ordered.map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
  const topAnswer = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const defaultKind: ChartKind = isNumeric ? 'bar' : (counts.size <= 6 ? 'pie' : 'bar')
  const availableKinds: ChartKind[] = isNumeric ? ['bar', 'line'] : ['bar', 'pie']

  return { question: q, answered, data, isNumeric, defaultKind, availableKinds, topAnswer }
}

function typeLabel(t: QuestionType): string {
  switch (t) {
    case 'single-choice': return 'Single choice'
    case 'multiple-choice': return 'Multiple choice'
    case 'rating': return 'Rating'
    case 'yes-no': return 'Yes / No'
    case 'number': return 'Number'
    case 'text': return 'Open-ended'
    case 'email': return 'Open-ended'
    default: return t
  }
}

// Measure a container's width with a ResizeObserver so we can pass an explicit
// pixel width to recharts. ResponsiveContainer measures 0 unreliably inside the
// tab/grid layout here, leaving charts blank — explicit width is deterministic.
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

const CHART_HEIGHT = 220

function QuestionChartCard({ stat, index }: { stat: QuestionStat; index: number }) {
  const { question, answered, data, isNumeric, availableKinds, topAnswer } = stat
  const [kind, setKind] = useState<ChartKind>(stat.defaultKind)
  const isOpenEnded = OPEN_ENDED.includes(question.type)
  const { ref: chartRef, width } = useMeasuredWidth()
  const horizontalBars = !isNumeric && data.length > 5

  return (
    <Card className="break-inside-avoid">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium leading-snug">
              <span className="text-muted-foreground mr-1">Q{index + 1}.</span>
              {question.prompt}
            </CardTitle>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px] font-normal">{typeLabel(question.type)}</Badge>
              <span>{answered} response{answered === 1 ? '' : 's'}</span>
            </div>
          </div>
          {!isOpenEnded && availableKinds.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 no-print">
              {availableKinds.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-label={`Show ${k} chart`}
                  className={`flex h-6 w-6 items-center justify-center rounded ${kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {k === 'bar' && <BarChart3 className="h-3.5 w-3.5" />}
                  {k === 'pie' && <PieChartIcon className="h-3.5 w-3.5" />}
                  {k === 'line' && <LineChartIcon className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isOpenEnded ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-6 text-sm text-muted-foreground">
            <MessageSquareText className="h-4 w-4 shrink-0" />
            <span>Open-ended question — {answered} written response{answered === 1 ? '' : 's'}. View full text in the responses table.</span>
          </div>
        ) : data.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No responses yet.</div>
        ) : (
          <>
            <div ref={chartRef} className="w-full" style={{ height: CHART_HEIGHT }}>
              {width > 0 && (
                kind === 'pie' ? (
                  <PieChart width={width} height={CHART_HEIGHT}>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={42} paddingAngle={2}>
                      {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} (${data.find(d => d.name === n)?.pct ?? 0}%)`, n]} />
                  </PieChart>
                ) : kind === 'line' ? (
                  <LineChart width={width} height={CHART_HEIGHT} data={data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip formatter={(v: any) => [`${v}`, 'Responses']} />
                    <Line type="monotone" dataKey="value" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                ) : (
                  <BarChart width={width} height={CHART_HEIGHT} data={data} layout={horizontalBars ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, left: horizontalBars ? 4 : -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!horizontalBars} vertical={horizontalBars} />
                    {horizontalBars ? (
                      <>
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
                      </>
                    ) : (
                      <>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={data.length > 4 ? -15 : 0} textAnchor={data.length > 4 ? 'end' : 'middle'} height={data.length > 4 ? 48 : 24} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                      </>
                    )}
                    <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v: any, _n: any, p: any) => [`${v} (${p?.payload?.pct ?? 0}%)`, 'Responses']} />
                    <Bar dataKey="value" radius={4}>
                      {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      {horizontalBars && <LabelList dataKey="value" position="right" className="fill-foreground" fontSize={11} />}
                    </Bar>
                  </BarChart>
                )
              )}
            </div>
            {topAnswer && !isNumeric && (
              <p className="mt-2 text-xs text-muted-foreground">
                Most common: <span className="font-medium text-foreground">{topAnswer}</span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function SurveyQuestionCharts({ surveyId }: SurveyQuestionChartsProps) {
  const [questions, setQuestions] = useState<SurveyQuestion[] | null>(null)
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [sRes, aRes] = await Promise.all([
          fetch(`/api/surveys/${surveyId}`, { credentials: 'include' }),
          fetch(`/api/surveys/${surveyId}/analytics`, { credentials: 'include' }),
        ])
        const sJson = await sRes.json()
        const aJson = await aRes.json()
        if (cancelled) return
        const qs: SurveyQuestion[] = (sJson?.survey?.questions || [])
          .slice()
          .sort((a: SurveyQuestion, b: SurveyQuestion) => (a.question_order || 0) - (b.question_order || 0))
        setQuestions(qs)
        setResponses(aJson?.responses || [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load question statistics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [surveyId])

  const stats = useMemo(() => {
    if (!questions || !responses) return []
    return questions
      .map((q) => buildQuestionStat(q, responses))
      .filter((s): s is QuestionStat => s !== null)
  }, [questions, responses])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading question statistics…
      </div>
    )
  }
  if (error) {
    return <div className="py-8 text-sm text-destructive">{error}</div>
  }
  if (!stats.length) {
    return <div className="py-8 text-sm text-muted-foreground">No questions to chart yet.</div>
  }

  const chartable = stats.filter((s) => !OPEN_ENDED.includes(s.question.type))
  const totalResponses = responses?.length || 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Per-question results</h3>
          <p className="text-sm text-muted-foreground">
            {chartable.length} question{chartable.length === 1 ? '' : 's'} charted · {totalResponses} total response{totalResponses === 1 ? '' : 's'} · toggle bar / pie / line per question
          </p>
        </div>
      </div>
      {/* Scrollable grid of per-question charts */}
      <div className="max-h-[1400px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {stats.map((stat, i) => (
            <QuestionChartCard key={stat.question.id} stat={stat} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
