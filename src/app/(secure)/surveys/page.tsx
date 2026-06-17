'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Upload, Search, ArrowUpDown, Calculator, Sigma, Sparkles, MoreHorizontal, FlaskConical, Eraser, Copy, Share2, Radio, BarChart2, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type SurveyRow = {
  id: number
  title: string
  description?: string | null
  status?: string | null
  created_at?: string | null
  response_count?: number
  survey_type?: 'own' | 'org' | 'featured' | string
  is_editable?: boolean
  slug?: string | null
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'own' | 'org' | 'featured'>('all')
  const [sortKey, setSortKey] = useState<'created_at' | 'title' | 'response_count'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [populationSize, setPopulationSize] = useState('500000')
  const [confidenceLevel, setConfidenceLevel] = useState<'99' | '95' | '90' | '85' | '80' | '75' | '70' | '65' | '60' | '55' | '50'>('95')
  const [marginOfError, setMarginOfError] = useState('3')
  const [estimatedProportion, setEstimatedProportion] = useState('50')
  const [designEffect, setDesignEffect] = useState('1')
  const [stdDevInput, setStdDevInput] = useState('')
  const [ciProportion, setCiProportion] = useState('50')
  const [ciSampleSize, setCiSampleSize] = useState('1000')
  const [testLoadingId, setTestLoadingId] = useState<number | null>(null)
  const [reverseTestLoadingId, setReverseTestLoadingId] = useState<number | null>(null)
  const [cloneLoadingId, setCloneLoadingId] = useState<number | null>(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  const refetchSurveys = async () => {
    const res = await fetch('/api/surveys', { credentials: 'include' })
    const data = await res.json()
    if (!res.ok || !data?.status) {
      setError(data?.message || data?.error || 'Failed to load surveys')
      return
    }
    setSurveys(Array.isArray(data.surveys) ? data.surveys : [])
    setError(null)
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/surveys', { credentials: 'include' })
        const data = await res.json()
        if (!mounted) return
        if (!res.ok || !data?.status) {
          setError(data?.message || data?.error || 'Failed to load surveys')
          return
        }
        setSurveys(Array.isArray(data.surveys) ? data.surveys : [])
      } catch {
        if (mounted) setError('Failed to load surveys')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const filteredSurveys = useMemo(() => {
    const base = surveys.filter((s) => {
      const type = (s.survey_type || 'own') as string
      if (tab !== 'all' && type !== tab) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        (s.title || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        String(s.id).includes(q) ||
        (s.status || '').toLowerCase().includes(q)
      )
    })

    const sorted = [...base].sort((a, b) => {
      let lhs: string | number = ''
      let rhs: string | number = ''
      if (sortKey === 'created_at') {
        lhs = a.created_at ? new Date(a.created_at).getTime() : 0
        rhs = b.created_at ? new Date(b.created_at).getTime() : 0
      } else if (sortKey === 'response_count') {
        lhs = a.response_count || 0
        rhs = b.response_count || 0
      } else {
        lhs = (a.title || '').toLowerCase()
        rhs = (b.title || '').toLowerCase()
      }
      if (lhs < rhs) return sortDir === 'asc' ? -1 : 1
      if (lhs > rhs) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [surveys])

  const counts = useMemo(() => {
    const own = surveys.filter((s) => (s.survey_type || 'own') === 'own').length
    const org = surveys.filter((s) => s.survey_type === 'org').length
    const featured = surveys.filter((s) => s.survey_type === 'featured').length
    return { all: surveys.length, own, org, featured }
  }, [surveys])

  const toggleSort = (key: 'created_at' | 'title' | 'response_count') => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'title' ? 'asc' : 'desc')
  }

  const zScoreByConfidence: Record<string, number> = {
    '99': 2.576,
    '95': 1.960,
    '90': 1.645,
    '85': 1.440,
    '80': 1.282,
    '75': 1.150,
    '70': 1.036,
    '65': 0.935,
    '60': 0.842,
    '55': 0.755,
    '50': 0.674,
  }

  const stats = useMemo(() => {
    const N = Number(populationSize)
    const z = zScoreByConfidence[confidenceLevel]
    const moe = Number(marginOfError) / 100
    const p = Number(estimatedProportion) / 100
    const deff = Math.max(0.1, Number(designEffect) || 1)

    const safeP = Number.isFinite(p) ? Math.min(0.99, Math.max(0.01, p)) : 0.5
    const safeMoe = Number.isFinite(moe) ? Math.min(0.25, Math.max(0.001, moe)) : 0.03
    const safeN = Number.isFinite(N) && N > 0 ? N : null

    const n0 = ((z * z) * safeP * (1 - safeP)) / (safeMoe * safeMoe)
    const nInfinite = Math.ceil(n0 * deff)
    const nFinite = safeN ? Math.ceil((safeN * nInfinite) / (safeN + nInfinite - 1)) : null

    const ciP = Number(ciProportion) / 100
    const ciN = Number(ciSampleSize)
    const safeCiP = Number.isFinite(ciP) ? Math.min(0.99, Math.max(0.01, ciP)) : 0.5
    const safeCiN = Number.isFinite(ciN) && ciN > 0 ? ciN : 1
    const moeFromN = z * Math.sqrt((safeCiP * (1 - safeCiP)) / safeCiN)

    const numbers = stdDevInput
      .split(/[,\s]+/)
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v))
    const mean = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
    const sampleStdDev = numbers.length > 1 && mean !== null
      ? Math.sqrt(numbers.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (numbers.length - 1))
      : null

    return {
      nInfinite,
      nFinite,
      moeFromNPercent: +(moeFromN * 100).toFixed(2),
      ciLowPercent: +((safeCiP - moeFromN) * 100).toFixed(2),
      ciHighPercent: +((safeCiP + moeFromN) * 100).toFixed(2),
      count: numbers.length,
      mean: mean === null ? null : +mean.toFixed(4),
      sampleStdDev: sampleStdDev === null ? null : +sampleStdDev.toFixed(4),
    }
  }, [populationSize, confidenceLevel, marginOfError, estimatedProportion, designEffect, ciProportion, ciSampleSize, stdDevInput])

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium">Surveys</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/surveys/import"><Upload className="h-4 w-4 mr-1" />Import</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/create"><Plus className="h-4 w-4 mr-1" />Create Survey</Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'own' | 'org' | 'featured')}>
                <TabsList>
                  <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                  <TabsTrigger value="own">Mine ({counts.own})</TabsTrigger>
                  <TabsTrigger value="org">Org ({counts.org})</TabsTrigger>
                  <TabsTrigger value="featured">Featured ({counts.featured})</TabsTrigger>
                </TabsList>
              </Tabs>
              <Link
                href="/create/survey/ai"
                className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-background px-3 text-sm font-medium text-foreground shadow-sm ring-offset-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                AI create survey
              </Link>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search surveys, status, id..."
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Population Size Calculator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 w-fit">Population (N)</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        The total size of the group you want to draw conclusions about (e.g. 500,000 registered voters in your city). Leave blank or very large to ignore the finite-population correction.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input value={populationSize} onChange={(e) => setPopulationSize(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 w-fit">Confidence</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        How certain you want to be that your results reflect the true population. 95% is the research standard — it means if you ran the survey 100 times, 95 of those results would contain the true value. Lower confidence = smaller required sample.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value as '99' | '95' | '90' | '85' | '80' | '75' | '70' | '65' | '60' | '55' | '50')}
                  >
                    <option value="99">99%</option>
                    <option value="95">95%</option>
                    <option value="90">90%</option>
                    <option value="85">85%</option>
                    <option value="80">80%</option>
                    <option value="75">75%</option>
                    <option value="70">70%</option>
                    <option value="65">65%</option>
                    <option value="60">60%</option>
                    <option value="55">55%</option>
                    <option value="50">50%</option>
                  </select>
                </div>
                <div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 w-fit">Margin of error (%)</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        How much your result can differ from the true population value (±). A 3% MOE at 95% confidence means your finding of, say, 52% support could be anywhere from 49%–55% in reality. Smaller MOE = larger required sample.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input value={marginOfError} onChange={(e) => setMarginOfError(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 w-fit">Expected support p (%)</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        Your best estimate of the true proportion in the population (e.g. 40% if you expect 40% to answer &quot;yes&quot;). 50% is the most conservative — it produces the largest sample size. If you already have a prior estimate, enter it here to reduce the required sample.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input value={estimatedProportion} onChange={(e) => setEstimatedProportion(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 w-fit">Design effect</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        A multiplier for non-simple-random sampling. Use 1 for a standard online survey. Use 1.5–2.5 if you&apos;re sampling clusters (e.g. households in chosen neighborhoods) — responses within a cluster tend to be similar, reducing the effective information per respondent and requiring a larger sample.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input value={designEffect} onChange={(e) => setDesignEffect(e.target.value)} inputMode="decimal" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Recommended sample (large population)</p>
                  <p className="text-xl font-semibold">{stats.nInfinite.toLocaleString()}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Recommended sample (finite population)</p>
                  <p className="text-xl font-semibold">{stats.nFinite ? stats.nFinite.toLocaleString() : '—'}</p>
                </div>
              </div>

              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
                  <Sigma className="h-4 w-4 inline" />
                  Advanced statistical tools
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Standard deviation (comma or space separated values)</p>
                    <Input
                      value={stdDevInput}
                      onChange={(e) => setStdDevInput(e.target.value)}
                      placeholder="e.g. 42, 38, 51, 47, 44"
                    />
                    <p className="text-sm">
                      n = <span className="font-medium">{stats.count}</span>
                      {' · '}mean = <span className="font-medium">{stats.mean ?? '—'}</span>
                      {' · '}sample SD = <span className="font-medium">{stats.sampleStdDev ?? '—'}</span>
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">Margin of error / confidence interval from sample size</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Observed support (%)</p>
                        <Input value={ciProportion} onChange={(e) => setCiProportion(e.target.value)} inputMode="decimal" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Sample size (n)</p>
                        <Input value={ciSampleSize} onChange={(e) => setCiSampleSize(e.target.value)} inputMode="numeric" />
                      </div>
                    </div>
                    <p className="text-sm">
                      MOE ≈ <span className="font-medium">±{stats.moeFromNPercent}%</span>
                      {' · '}CI ≈ <span className="font-medium">{stats.ciLowPercent}% to {stats.ciHighPercent}%</span>
                    </p>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          {loading ? <p className="text-muted-foreground text-sm">Loading surveys...</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {testMessage ? (
            <p className="text-sm text-muted-foreground" role="status">
              {testMessage}
            </p>
          ) : null}
          {!loading && !error ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Survey Table View</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('title')}>
                          Title <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('response_count')}>
                          Responses <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('created_at')}>
                          Created <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSurveys.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No surveys found for this filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSurveys.map((survey) => (
                        <TableRow key={survey.id}>
                          <TableCell className="font-mono text-xs">{survey.id}</TableCell>
                          <TableCell>
                            <div className="font-medium">{survey.title}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {survey.description || 'No description'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{survey.status || 'draft'}</Badge>
                          </TableCell>
                          <TableCell className="capitalize">{survey.survey_type || 'own'}</TableCell>
                          <TableCell>{survey.response_count || 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {survey.created_at ? new Date(survey.created_at).toLocaleDateString() : 'Unknown'}
                          </TableCell>
                          <TableCell className="text-right">
                            <TooltipProvider delayDuration={300}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    aria-label="Survey actions"
                                    disabled={testLoadingId === survey.id || reverseTestLoadingId === survey.id || cloneLoadingId === survey.id || deleteLoadingId === survey.id}
                                  >
                                    {(testLoadingId === survey.id || reverseTestLoadingId === survey.id || cloneLoadingId === survey.id || deleteLoadingId === survey.id)
                                      ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                      : <MoreHorizontal className="h-4 w-4" />
                                    }
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {/* Open / edit */}
                                  <DropdownMenuItem asChild>
                                    <Link href={`/surveys/${survey.id}/edit`} className="flex items-center gap-2 cursor-pointer">
                                      <Pencil className="h-4 w-4" />
                                      Open
                                    </Link>
                                  </DropdownMenuItem>

                                  {/* Results */}
                                  <DropdownMenuItem asChild>
                                    <Link href={`/surveys/${survey.id}/results`} className="flex items-center gap-2 cursor-pointer">
                                      <BarChart2 className="h-4 w-4" />
                                      Results
                                    </Link>
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator />

                                  {/* Test — only for editable surveys */}
                                  {survey.is_editable !== false ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DropdownMenuItem
                                          className="flex items-center gap-2 cursor-pointer"
                                          disabled={testLoadingId === survey.id}
                                          onSelect={async (e) => {
                                            e.preventDefault()
                                            setTestMessage(null)
                                            setTestLoadingId(survey.id)
                                            try {
                                              const res = await fetch(`/api/surveys/${survey.id}/test-responses`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                credentials: 'include',
                                                body: JSON.stringify({ count: 20 }),
                                              })
                                              const data = await res.json().catch(() => ({}))
                                              if (!res.ok || !data?.status) {
                                                setTestMessage(data?.message || 'Could not add test responses.')
                                                return
                                              }
                                              setTestMessage(data?.message || `Added ${data.inserted ?? 20} test responses.`)
                                              await refetchSurveys()
                                            } catch {
                                              setTestMessage('Could not add test responses.')
                                            } finally {
                                              setTestLoadingId(null)
                                            }
                                          }}
                                        >
                                          <FlaskConical className="h-4 w-4" />
                                          {testLoadingId === survey.id ? 'Testing…' : 'Test'}
                                        </DropdownMenuItem>
                                      </TooltipTrigger>
                                      <TooltipContent side="left">
                                        Add 20 synthetic responses to test
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}

                                  {/* Reverse Test — only for editable surveys */}
                                  {survey.is_editable !== false ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DropdownMenuItem
                                          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                                          disabled={reverseTestLoadingId === survey.id}
                                          onSelect={async (e) => {
                                            e.preventDefault()
                                            setTestMessage(null)
                                            setReverseTestLoadingId(survey.id)
                                            try {
                                              const res = await fetch(`/api/surveys/${survey.id}/test-responses`, {
                                                method: 'DELETE',
                                                credentials: 'include',
                                              })
                                              const data = await res.json().catch(() => ({}))
                                              if (!res.ok || !data?.status) {
                                                setTestMessage(data?.message || 'Could not remove test responses.')
                                                return
                                              }
                                              setTestMessage(data?.message || 'Synthetic responses removed.')
                                              await refetchSurveys()
                                            } catch {
                                              setTestMessage('Could not remove test responses.')
                                            } finally {
                                              setReverseTestLoadingId(null)
                                            }
                                          }}
                                        >
                                          <Eraser className="h-4 w-4" />
                                          {reverseTestLoadingId === survey.id ? 'Removing…' : 'Reverse Test'}
                                        </DropdownMenuItem>
                                      </TooltipTrigger>
                                      <TooltipContent side="left">
                                        Remove all synthetic test responses
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}

                                  {/* Clone — only for editable surveys */}
                                  {survey.is_editable !== false ? (
                                    <DropdownMenuItem
                                      className="flex items-center gap-2 cursor-pointer"
                                      disabled={cloneLoadingId === survey.id}
                                      onSelect={async (e) => {
                                        e.preventDefault()
                                        setCloneLoadingId(survey.id)
                                        try {
                                          const res = await fetch(`/api/surveys/${survey.id}/clone`, {
                                            method: 'POST',
                                            credentials: 'include',
                                          })
                                          const data = await res.json().catch(() => ({}))
                                          if (!res.ok || !data?.status) {
                                            setTestMessage(data?.message || 'Could not clone survey.')
                                            return
                                          }
                                          setTestMessage('Survey cloned successfully.')
                                          await refetchSurveys()
                                        } catch {
                                          setTestMessage('Could not clone survey.')
                                        } finally {
                                          setCloneLoadingId(null)
                                        }
                                      }}
                                    >
                                      <Copy className="h-4 w-4" />
                                      {cloneLoadingId === survey.id ? 'Cloning…' : 'Clone'}
                                    </DropdownMenuItem>
                                  ) : null}

                                  <DropdownMenuSeparator />

                                  {/* Share — copy public link */}
                                  <DropdownMenuItem
                                    className="flex items-center gap-2 cursor-pointer"
                                    onSelect={() => {
                                      const slug = survey.slug
                                      const url = slug
                                        ? `${window.location.origin}/survey/${slug}`
                                        : `${window.location.origin}/survey/${survey.id}`
                                      navigator.clipboard.writeText(url).then(() => {
                                        setTestMessage('Survey link copied to clipboard.')
                                      }).catch(() => {
                                        setTestMessage('Could not copy link.')
                                      })
                                    }}
                                  >
                                    <Share2 className="h-4 w-4" />
                                    Share
                                  </DropdownMenuItem>

                                  {/* Distribute — channels page */}
                                  <DropdownMenuItem asChild>
                                    <Link href={`/surveys/${survey.id}/distribute`} className="flex items-center gap-2 cursor-pointer">
                                      <Radio className="h-4 w-4" />
                                      Distribute
                                    </Link>
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator />

                                  {/* Delete — destructive, requires confirmation */}
                                  <DropdownMenuItem
                                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                                    disabled={deleteLoadingId === survey.id}
                                    onSelect={async (e) => {
                                      e.preventDefault()
                                      if (!window.confirm(`Delete "${survey.title}"? This permanently removes the survey and all its responses. This cannot be undone.`)) {
                                        return
                                      }
                                      setTestMessage(null)
                                      setDeleteLoadingId(survey.id)
                                      try {
                                        const res = await fetch(`/api/surveys/${survey.id}/delete`, {
                                          method: 'DELETE',
                                          credentials: 'include',
                                        })
                                        const data = await res.json().catch(() => ({}))
                                        if (!res.ok || !data?.status) {
                                          setTestMessage(data?.message || 'Could not delete survey.')
                                          return
                                        }
                                        setTestMessage(data?.message || 'Survey deleted.')
                                        await refetchSurveys()
                                      } catch {
                                        setTestMessage('Could not delete survey.')
                                      } finally {
                                        setDeleteLoadingId(null)
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {deleteLoadingId === survey.id ? 'Deleting…' : 'Delete'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
