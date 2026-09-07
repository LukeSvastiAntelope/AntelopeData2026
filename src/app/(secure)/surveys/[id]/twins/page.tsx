'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Brain, Filter, ListChecks, Rocket, Settings, Users, Loader2 } from 'lucide-react'

export default function SurveyTwinCohortPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.id as string

  const [threshold, setThreshold] = useState(0.6)
  const [maxTwins, setMaxTwins] = useState(100)
  const [filter, setFilter] = useState<any>({})
  const [preview, setPreview] = useState<any[]>([])
  const [allTwins, setAllTwins] = useState<any[]>([])
  const [showEligibleOnly, setShowEligibleOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // load saved cohort config if any
    (async () => {
      try {
        const res = await fetch(`/api/surveys/${surveyId}/twins/cohort`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        const data = await res.json()
        if (data.status && data.cohort) {
          setThreshold(data.cohort.threshold ?? 0.6)
          setMaxTwins(data.cohort.maxTwins ?? 100)
          setFilter(data.cohort.filter ?? {})
        }
      } catch {}
    })()
    // load all twins initially (no filters)
    ;(async () => {
      try {
        const res = await fetch('/api/digital-twins/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ query: '', topK: 500 })
        })
        const data = await res.json()
        if (data.status) setAllTwins(data.results || [])
      } catch {}
    })()
  }, [surveyId])

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/twins/preview-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ topK: maxTwins, filter })
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Preview failed')
      setPreview(data.results)
    } catch (e: any) {
      setError(e.message || 'Preview failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCohort = async () => {
    setSaving(true)
    setError(null)
    try {
      const cohort = { threshold, maxTwins, filter }
      const res = await fetch(`/api/surveys/${surveyId}/twins/cohort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ cohort })
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Save failed')
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeploy = async (dryRun: boolean) => {
    setDeploying(true)
    setError(null)
    try {
      const candidates = preview.filter(m => (m.readiness ?? 0) >= threshold).slice(0, maxTwins)
      const res = await fetch(`/api/surveys/${surveyId}/twins/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ threshold, candidates, dryRun })
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Deploy failed')
      if (dryRun) {
        alert(`Dry run: would deploy ${data.eligibleCount ?? candidates.length} twins`)
      } else {
        alert(`Deployed ${data.created} synthetic responses`)
      }
    } catch (e: any) {
      setError(e.message || 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/surveys">Surveys</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Deploy Twins</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Overview & Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Voter Profiles
              </CardTitle>
              <CardDescription>Review your entire twin pool, then refine with filters and threshold</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">Total</Badge>
                  <span>{allTwins.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">Eligible ≥ {Math.round(threshold*100)}%</Badge>
                  <span>{preview.filter(p => (p.readiness ?? 0) >= threshold).length}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Label className="text-xs">Show only eligible (after Preview)</Label>
                  <input type="checkbox" checked={showEligibleOnly} onChange={(e)=>setShowEligibleOnly(e.target.checked)} />
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Name/Email</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Political</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Eligible</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(showEligibleOnly && preview.length > 0
                      ? allTwins.filter(t => preview.some(p => p.agentToken === t.agentToken && (p.readiness ?? 0) >= threshold))
                      : allTwins
                    ).map((twin, idx) => {
                      const demo = twin.demographics || {}
                      const created = twin.createdAt ? new Date(twin.createdAt).toLocaleDateString() : '—'
                      const eligible = preview.find(p => p.agentToken === twin.agentToken) && (preview.find(p => p.agentToken === twin.agentToken)?.readiness ?? 0) >= threshold
                      return (
                        <TableRow key={twin.agentToken || idx} className={eligible ? 'bg-green-50/40 dark:bg-green-950/10' : ''}>
                          <TableCell className="font-mono text-xs">{twin.agentToken?.slice(0,8)}...{twin.agentToken?.slice(-6)}</TableCell>
                          <TableCell className="text-sm">{demo.name || demo.email || 'Anonymous'}</TableCell>
                          <TableCell className="text-sm">{demo.age || '—'}</TableCell>
                          <TableCell className="text-sm">{demo.location || '—'}</TableCell>
                          <TableCell className="text-sm">{demo.politicalViews || '—'}</TableCell>
                          <TableCell className="text-sm">{created}</TableCell>
                          <TableCell className="text-sm">{eligible ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Cohort Filters
              </CardTitle>
              <CardDescription>Define which voter profiles are eligible for this survey</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Min Completion %</Label>
                  <Input type="number" min={0} max={100} value={filter.minCompletion ?? ''} onChange={(e)=>setFilter({ ...filter, minCompletion: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Anonymity</Label>
                  <select className="w-full border rounded-md px-2 py-2" value={filter.anonymityLevel ?? ''} onChange={(e)=>setFilter({ ...filter, anonymityLevel: e.target.value || undefined })}>
                    <option value="">Any</option>
                    <option value="full">Full</option>
                    <option value="semi_anonymous">Semi-Anonymous</option>
                    <option value="anonymous">Anonymous</option>
                  </select>
                </div>
                <div>
                  <Label>Topics (comma-separated)</Label>
                  <Input value={filter.topics ?? ''} onChange={(e)=>setFilter({ ...filter, topics: e.target.value })} placeholder="e.g., technology, healthcare" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Location contains</Label>
                  <Input value={filter.locationContains ?? ''} onChange={(e)=>setFilter({ ...filter, locationContains: e.target.value })} />
                </div>
                <div>
                  <Label>Education contains</Label>
                  <Input value={filter.educationContains ?? ''} onChange={(e)=>setFilter({ ...filter, educationContains: e.target.value })} />
                </div>
                <div>
                  <Label>Max Twins</Label>
                  <Input type="number" min={1} max={1000} value={maxTwins} onChange={(e)=>setMaxTwins(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <Label>Readiness Threshold: {Math.round(threshold * 100)}%</Label>
                <input type="range" min="0" max="1" step="0.05" value={threshold} onChange={(e)=>setThreshold(Number(e.target.value))} className="w-full" />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePreview}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ListChecks className="h-4 w-4 mr-2" />}
                  {loading ? 'Loading...' : 'Preview Matches'}
                </Button>
                <Button variant="outline" onClick={handleSaveCohort} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Filter className="h-4 w-4 mr-2" />}
                  {saving ? 'Saving...' : 'Save Cohort'}
                </Button>
                <Button onClick={()=>handleDeploy(true)} disabled={deploying || preview.length === 0}>
                  <Rocket className="h-4 w-4 mr-2" />
                  Dry-run Deploy
                </Button>
                <Button onClick={()=>handleDeploy(false)} disabled={deploying || preview.length === 0}>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy Twins
                </Button>
              </div>
              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Preview Cohort
              </CardTitle>
              <CardDescription>Top matches ranked by readiness</CardDescription>
            </CardHeader>
            <CardContent>
              {preview.length === 0 ? (
                <p className="text-sm text-muted-foreground">No preview yet. Configure filters and click Preview Matches.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-6 gap-2 p-2 bg-muted text-xs font-medium">
                    <div>Agent</div>
                    <div>Similarity</div>
                    <div>Completion</div>
                    <div>Readiness</div>
                    <div>Survey Title</div>
                    <div>Reasons</div>
                  </div>
                  {preview.map((m, idx) => (
                    <div key={m.agentToken || idx} className="grid grid-cols-6 gap-2 p-2 border-t text-xs items-center">
                      <div className="font-mono truncate" title={m.agentToken}>{m.agentToken?.slice(0,8)}...{m.agentToken?.slice(-6)}</div>
                      <div>{(m.similarity ?? 0).toFixed(2)}</div>
                      <div>{Math.round(m.completionPercentage ?? 0)}%</div>
                      <div className={((m.readiness ?? 0) >= threshold) ? 'text-green-600' : 'text-muted-foreground'}>
                        {Math.round(((m.readiness ?? 0) * 100))}%
                      </div>
                      <div className="truncate" title={m.surveyTitle}>{m.surveyTitle || '—'}</div>
                      <div className="truncate" title={(m.reasons||[]).join('; ')}>{(m.reasons||[]).slice(0,2).join('; ')}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


