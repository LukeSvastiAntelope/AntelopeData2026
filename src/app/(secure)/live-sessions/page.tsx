'use client'

/**
 * Live L7 — host dashboard: list, filter, review past sessions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import {
  Loader2,
  Plus,
  Radio,
  ExternalLink,
  MonitorPlay,
  Users,
} from 'lucide-react'

type SessionRow = {
  id: number
  code: string
  title: string
  hostName: string | null
  eventType: string
  identifyMode: string
  status: string
  scheduledAt: string | null
  updatedAt: string
  startedAt: string | null
  endedAt: string | null
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'draft', label: 'Draft' },
  { id: 'ended', label: 'Past' },
] as const

export default function LiveSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/live/sessions')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setSessions(data.sessions || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return sessions
    return sessions.filter((s) => s.status === filter)
  }, [sessions, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sessions.length }
    for (const s of sessions) c[s.status] = (c[s.status] || 0) + 1
    return c
  }, [sessions])

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">
                Live
              </h1>
            </div>
            <Button size="sm" asChild>
              <Link href="/live-sessions/new">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New session
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Create expert briefs, town halls, or deliberations. Build an intake
            form and question deck, share a join link/QR, watch the room on the
            screen view, then mine attributed audience intelligence.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filter === f.id ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {counts[f.id === 'all' ? 'all' : f.id] || 0}
                </span>
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sessions…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center space-y-3">
              <Radio className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">
                {filter === 'all' ? 'No sessions yet' : `No ${filter} sessions`}
              </p>
              <p className="text-xs text-muted-foreground">
                Start with an intake form and a question deck, then go live.
              </p>
              <Button size="sm" asChild>
                <Link href="/live-sessions/new">Create session</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <Link
                    href={`/live-sessions/${s.id}`}
                    className="min-w-0 flex-1 hover:opacity-90"
                  >
                    <p className="font-medium text-sm truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.code} · {s.eventType.replace(/_/g, ' ')} ·{' '}
                      {s.identifyMode.replace(/_/g, ' ')}
                      {s.scheduledAt
                        ? ` · scheduled ${new Date(s.scheduledAt).toLocaleString()}`
                        : ''}
                      {s.hostName ? ` · ${s.hostName}` : ''}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant={
                        s.status === 'live'
                          ? 'default'
                          : s.status === 'ended'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {s.status}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-8" asChild>
                      <a
                        href={`/live/${s.code}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Join link"
                      >
                        <Users className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" asChild>
                      <a
                        href={`/live/${s.code}/screen`}
                        target="_blank"
                        rel="noreferrer"
                        title="Screen"
                      >
                        <MonitorPlay className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" asChild>
                      <Link href={`/live-sessions/${s.id}`}>
                        Open
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
