'use client'

/**
 * Volunteer V6 — staff strength dashboard + retention metric.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import {
  Loader2,
  Users,
  CalendarDays,
  TrendingUp,
  Trophy,
  ClipboardList,
  HeartHandshake,
} from 'lucide-react'

type Summary = {
  activeVolunteers: number
  pendingVolunteers: number
  totalVolunteers: number
  shifts: {
    upcoming: number
    covered: number
    underfilled: number
    claimedSlots: number
    totalSlots: number
    coveragePct: number
  }
  retention: {
    active7d: number
    active30d: number
    active60d: number
    sustained: number
    totalVolunteers: number
    retentionRate30d: number
  }
  leaderboard: Array<{
    userId: number
    displayName: string | null
    email: string | null
    points: number
  }>
  reach: {
    reached: number
    converted: number
    volunteersWithNetwork: number
  }
}

export default function VolunteersDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/summary')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setSummary(data.summary)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">
                Volunteers
              </h1>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href="/volunteer-staff">
                <ClipboardList className="h-3.5 w-3.5 mr-1" />
                Roster
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Volunteer strength at a glance. Retention — active-through-time —
            is the number that should go up because of Antelope.
          </p>

          {loading || !summary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading dashboard…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric
                  icon={Users}
                  label="Active volunteers"
                  value={summary.activeVolunteers}
                  hint={
                    summary.pendingVolunteers
                      ? `${summary.pendingVolunteers} pending`
                      : 'Roster'
                  }
                />
                <Metric
                  icon={CalendarDays}
                  label="Shift coverage"
                  value={`${summary.shifts.coveragePct}%`}
                  hint={`${summary.shifts.claimedSlots}/${summary.shifts.totalSlots} slots · ${summary.shifts.underfilled} underfilled`}
                />
                <Metric
                  icon={TrendingUp}
                  label="Retention (30d)"
                  value={`${summary.retention.retentionRate30d}%`}
                  hint={`${summary.retention.active30d} active · ${summary.retention.sustained} sustained`}
                  emphasize
                />
                <Metric
                  icon={HeartHandshake}
                  label="Relational reach"
                  value={summary.reach.reached}
                  hint={`${summary.reach.converted} converted · ${summary.reach.volunteersWithNetwork} with networks`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-md border border-border p-4 space-y-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Active through time
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Distinct volunteers with meaningful actions (check-in, task,
                    outreach, convert) in each window.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '7 days', value: summary.retention.active7d },
                      { label: '30 days', value: summary.retention.active30d },
                      { label: '60 days', value: summary.retention.active60d },
                    ].map((b) => (
                      <div
                        key={b.label}
                        className="rounded-md bg-muted/40 px-3 py-2 text-center"
                      >
                        <p className="text-xl font-semibold tabular-nums">
                          {b.value}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {b.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-md border border-border p-4 space-y-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Leaderboard (30d)
                  </h2>
                  {summary.leaderboard.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No points yet this month.
                    </p>
                  ) : (
                    <ol className="space-y-1.5">
                      {summary.leaderboard.map((r, i) => (
                        <li
                          key={r.userId}
                          className="flex justify-between text-sm gap-2"
                        >
                          <span className="truncate">
                            <span className="text-muted-foreground mr-2">
                              {i + 1}.
                            </span>
                            {r.displayName || r.email || r.userId}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {r.points}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {summary.shifts.upcoming} upcoming shifts
                </Badge>
                <Badge variant="outline">
                  {summary.shifts.covered} adequately covered
                </Badge>
                <Badge variant="outline">
                  {summary.retention.sustained} sustained volunteers
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={
        emphasize
          ? 'rounded-md border border-teal-200 bg-teal-50/40 px-3 py-3'
          : 'rounded-md border border-border bg-muted/20 px-3 py-3'
      }
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {hint}
        </p>
      )}
    </div>
  )
}
