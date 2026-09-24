'use client'

/**
 * MiniVAN M3 Payroll — miles / hours / doors rollup + CSV + paid flags.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import {
  Banknote,
  Download,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react'

type PayrollRow = {
  canvasserUserId: number
  canvasserName: string | null
  canvasserEmail: string | null
  workDate: string
  miles: number
  hours: number
  doors: number
  breadcrumbCount: number
  firstAt: string | null
  lastAt: string | null
  isPaid: boolean
}

type MemberFlag = {
  userId: number
  paid: boolean
  displayName: string | null
  email: string | null
}

function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 7 * 86400000)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function PayrollPage() {
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [rows, setRows] = useState<PayrollRow[]>([])
  const [members, setMembers] = useState<MemberFlag[]>([])
  const [totals, setTotals] = useState({ miles: 0, hours: 0, doors: 0, rows: 0 })
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to })
      const res = await fetch(`/api/dashboard/payroll?${qs}`)
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Could not load payroll')
      }
      setRows(data.rows || [])
      setMembers(data.members || [])
      setTotals(data.totals || { miles: 0, hours: 0, doors: 0, rows: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const setPaid = async (userId: number, paid: boolean) => {
    setSavingId(userId)
    try {
      const res = await fetch('/api/dashboard/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, paid }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Update failed')
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, paid } : m))
      )
      toast.success(paid ? 'Marked as paid canvasser' : 'Removed paid flag')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  const exportCsv = () => {
    const qs = new URLSearchParams({ from, to, export: 'csv' })
    window.location.href = `/api/dashboard/payroll?${qs}`
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
                Payroll
              </h1>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/assignments">
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Assignments
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-8">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Miles (haversine over GPS breadcrumbs), hours (first→last activity),
            and doors (outcome count) per canvasser per day. Flag team members as
            paid so the Walk PWA samples location for payroll — disclosed on entry.
          </p>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Banknote className="h-4 w-4" />
              Paid canvassers
            </h2>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active team members — invite people on{' '}
                <Link href="/team" className="text-primary underline">
                  Team
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2 max-w-xl">
                {members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.displayName || m.email || `User #${m.userId}`}
                      </p>
                      {m.displayName && m.email && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {m.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label
                        htmlFor={`paid-${m.userId}`}
                        className="text-xs text-muted-foreground"
                      >
                        Paid
                      </Label>
                      <Switch
                        id={`paid-${m.userId}`}
                        checked={m.paid}
                        disabled={savingId === m.userId}
                        onCheckedChange={(on) => void setPaid(m.userId, on)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 w-[10.5rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 w-[10.5rem]"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                CSV export
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{totals.miles.toFixed(1)} mi</Badge>
              <Badge variant="secondary">{totals.hours.toFixed(1)} hrs</Badge>
              <Badge variant="outline">{totals.doors} doors</Badge>
              <Badge variant="outline">{totals.rows} day-rows</Badge>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Computing rollup…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
                <p className="text-sm font-medium">No activity in this range</p>
                <p className="text-xs text-muted-foreground">
                  Flag paid canvassers, share a Walk link, and outcomes/GPS will
                  land here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Canvasser</th>
                      <th className="px-3 py-2 font-medium text-right">Miles</th>
                      <th className="px-3 py-2 font-medium text-right">Hours</th>
                      <th className="px-3 py-2 font-medium text-right">Doors</th>
                      <th className="px-3 py-2 font-medium text-right">GPS pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={`${r.canvasserUserId}-${r.workDate}`}
                        className="border-t border-border"
                      >
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {r.workDate}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {r.canvasserName ||
                              r.canvasserEmail ||
                              `#${r.canvasserUserId}`}
                          </span>
                          {r.isPaid && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] h-5"
                            >
                              paid
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.miles.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.hours.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.doors}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {r.breadcrumbCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
