'use client'

/**
 * Volunteer V6 — portal home: next shift, tasks, relational queue, points.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { PortalShell } from '@/app/components/portal/portal-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import {
  Loader2,
  CalendarDays,
  CheckSquare,
  Users,
  Trophy,
} from 'lucide-react'

type Home = {
  nextShift: {
    id: number
    title: string
    startsAt: string
    locationText: string | null
    myClaimStatus: string | null
  } | null
  openShifts: Array<{ id: number; title: string; startsAt: string }>
  tasks: Array<{
    id: number
    title: string
    dueAt: string | null
    myClaimStatus: string | null
  }>
  relationalQueue: Array<{
    id: number
    contactName?: string
    status: string
  }>
  points: number
  ladder: string
  shoutouts: Array<{ id: number; message: string; fromName?: string | null }>
}

const LADDER: Record<string, string> = {
  recruited: 'Recruited',
  active: 'Active',
  sustained: 'Sustained',
}

export default function PortalHomePage() {
  const { data } = useSession()
  const name = data?.user?.name || data?.user?.email || 'Volunteer'
  const [home, setHome] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/home')
      const json = await res.json()
      if (!res.ok || !json.status) throw new Error(json.message || 'Failed')
      setHome(json.home)
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
    <PortalShell title="Home">
      <div className="space-y-5">
        <section className="space-y-1">
          <p className="text-sm text-zinc-500">Welcome back</p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {name}
          </h2>
          {home && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="outline">{LADDER[home.ladder] || home.ladder}</Badge>
              <span className="text-xs text-zinc-500 tabular-nums">
                {home.points} pts
              </span>
            </div>
          )}
        </section>

        {loading || !home ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your queue…
          </div>
        ) : (
          <>
            {home.shoutouts[0] && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-sm text-zinc-800">
                <p className="leading-relaxed">
                  &ldquo;{home.shoutouts[0].message}&rdquo;
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Shoutout from {home.shoutouts[0].fromName || 'staff'}
                </p>
              </div>
            )}

            <HomeBlock
              icon={CalendarDays}
              title="Next shift"
              href="/portal/shifts"
              empty={!home.nextShift && home.openShifts.length === 0}
              emptyText="No upcoming shifts yet."
            >
              {home.nextShift ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {home.nextShift.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(home.nextShift.startsAt).toLocaleString()}
                    {home.nextShift.locationText
                      ? ` · ${home.nextShift.locationText}`
                      : ''}
                  </p>
                  <Badge className="mt-1">
                    {home.nextShift.myClaimStatus || 'claimed'}
                  </Badge>
                </div>
              ) : (
                <ul className="space-y-2">
                  {home.openShifts.map((s) => (
                    <li key={s.id} className="text-sm">
                      <span className="font-medium">{s.title}</span>
                      <span className="text-xs text-zinc-500 block">
                        {new Date(s.startsAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                  <Button asChild size="sm" className="h-8 mt-1">
                    <Link href="/portal/shifts">Claim a shift</Link>
                  </Button>
                </ul>
              )}
            </HomeBlock>

            <HomeBlock
              icon={CheckSquare}
              title="My tasks"
              href="/portal/tasks"
              empty={home.tasks.length === 0}
              emptyText="No open tasks."
            >
              <ul className="space-y-1.5">
                {home.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate font-medium">{t.title}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {t.myClaimStatus || 'open'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </HomeBlock>

            <HomeBlock
              icon={Users}
              title="Relational queue"
              href="/portal/contacts"
              empty={home.relationalQueue.length === 0}
              emptyText="Add friends & family to start reaching out."
            >
              <ul className="space-y-1.5">
                {home.relationalQueue.map((o) => (
                  <li key={o.id} className="text-sm flex justify-between gap-2">
                    <span className="truncate">
                      {o.contactName || `Outreach #${o.id}`}
                    </span>
                    <span className="text-[11px] text-zinc-500">{o.status}</span>
                  </li>
                ))}
              </ul>
            </HomeBlock>

            <HomeBlock
              icon={Trophy}
              title="My points"
              href="/portal/points"
              empty={false}
            >
              <p className="text-2xl font-semibold tabular-nums">{home.points}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Ladder: {LADDER[home.ladder] || home.ladder}
              </p>
            </HomeBlock>
          </>
        )}
      </div>
    </PortalShell>
  )
}

function HomeBlock({
  icon: Icon,
  title,
  href,
  children,
  empty,
  emptyText,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  href: string
  children: React.ReactNode
  empty: boolean
  emptyText?: string
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-zinc-900">
          <Icon className="h-4 w-4 text-teal-800" />
          {title}
        </h3>
        <Link href={href} className="text-[11px] text-teal-800 font-medium">
          View
        </Link>
      </div>
      {empty ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  )
}
