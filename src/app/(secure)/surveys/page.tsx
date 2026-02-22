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
import { Plus, Upload, Search, ArrowUpDown } from 'lucide-react'

type SurveyRow = {
  id: number
  title: string
  description?: string | null
  status?: string | null
  created_at?: string | null
  response_count?: number
  survey_type?: 'own' | 'org' | 'featured' | string
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'own' | 'org' | 'featured'>('all')
  const [sortKey, setSortKey] = useState<'created_at' | 'title' | 'response_count'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/surveys')
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
              <Link href="/create/survey"><Plus className="h-4 w-4 mr-1" />Create Survey</Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'own' | 'org' | 'featured')}>
              <TabsList>
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                <TabsTrigger value="own">Mine ({counts.own})</TabsTrigger>
                <TabsTrigger value="org">Org ({counts.org})</TabsTrigger>
                <TabsTrigger value="featured">Featured ({counts.featured})</TabsTrigger>
              </TabsList>
            </Tabs>
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

          {loading ? <p className="text-muted-foreground text-sm">Loading surveys...</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
                            <div className="inline-flex gap-2">
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/surveys/${survey.id}/results`}>Results</Link>
                              </Button>
                              <Button size="sm" asChild>
                                <Link href={`/surveys/${survey.id}/edit`}>Open</Link>
                              </Button>
                            </div>
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
