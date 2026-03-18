'use client'

import { useEffect, useMemo, useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, MapPinned, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type Report = {
  id: string
  survey_id: number
  survey_title: string
  query: string
  query_type: string
  status: string
  created_at: string
  metadata?: any
}

const METRIC_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'gender', label: 'Gender' },
  { key: 'education', label: 'Education' },
  { key: 'voting_percentage', label: 'Voting %' },
  { key: 'likelihood', label: 'Likelihood' },
  { key: 'messages_sent', label: 'Messages sent' },
]

export default function FundraisingReportsPage() {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<Report[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const [pinOpen, setPinOpen] = useState(false)
  const [pinReport, setPinReport] = useState<Report | null>(null)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['gender', 'education'])
  const [pinSaving, setPinSaving] = useState(false)

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      if (!res.ok || !data?.status) throw new Error(data?.error || 'Failed to load reports')
      setReports(Array.isArray(data.reports) ? data.reports : [])
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load reports')
      setReports([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const completedReports = useMemo(
    () => reports.filter(r => r.status === 'completed'),
    [reports]
  )

  const openPin = (r: Report) => {
    setPinReport(r)
    setSelectedMetrics(['gender', 'education'])
    setPinOpen(true)
  }

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }

  const savePin = async () => {
    if (!pinReport) return
    setPinSaving(true)
    try {
      const res = await fetch('/api/dashboard/fundraising/overlays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: pinReport.id,
          enabledMetrics: selectedMetrics,
          status: 'enabled',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.status) throw new Error(data?.message || 'Failed to pin report')
      toast.success('Pinned to dashboard map')
      setPinOpen(false)
      setPinReport(null)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to pin report')
    } finally {
      setPinSaving(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Fundraising reports
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRefreshing(true); void fetchReports() }}
              disabled={refreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-4 max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle>Completed reports</CardTitle>
              <CardDescription>
                Pin a report to show selected high-level insights on the dashboard map (toggle “Fundraising” layer on Dashboard).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : completedReports.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No completed reports found yet. Generate a report from surveys/cohort chat, then come back here to pin it.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {completedReports.map(r => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" title={r.query}>
                            {r.query}
                          </div>
                          <div className="text-xs text-muted-foreground truncate" title={r.survey_title}>
                            Survey: {r.survey_title}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openPin(r)}>
                          <MapPinned className="h-4 w-4 mr-2" />
                          Pin
                        </Button>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Type: {r.query_type}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pin report insights to dashboard map</DialogTitle>
            <DialogDescription>
              Choose which metrics you want visible on the campaign map. You can change this later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {METRIC_OPTIONS.map(opt => (
              <label key={opt.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedMetrics.includes(opt.key)}
                  onCheckedChange={() => toggleMetric(opt.key)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(false)} disabled={pinSaving}>
              Cancel
            </Button>
            <Button onClick={savePin} disabled={pinSaving || !pinReport}>
              {pinSaving ? 'Saving…' : 'Pin to map'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

