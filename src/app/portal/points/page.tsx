'use client'

/**
 * Volunteer V5 — tasteful points, ladder, teams, leaderboard, shoutouts.
 */

import { useCallback, useEffect, useState } from 'react'
import { PortalShell } from '@/app/components/portal/portal-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Loader2, Trophy, Users } from 'lucide-react'

type BoardRow = {
  userId: number
  displayName: string | null
  email: string | null
  points: number
}

type Team = {
  id: number
  name: string
  description: string | null
  memberCount: number
  myMembership?: boolean
}

type Shoutout = {
  id: number
  message: string
  fromName?: string | null
  createdAt: string
}

const LADDER_LABEL: Record<string, string> = {
  recruited: 'Recruited',
  active: 'Active',
  sustained: 'Sustained',
}

export default function PortalPointsPage() {
  const [points, setPoints] = useState(0)
  const [ladder, setLadder] = useState('recruited')
  const [myRank, setMyRank] = useState<number | null>(null)
  const [board, setBoard] = useState<BoardRow[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [shoutouts, setShoutouts] = useState<Shoutout[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/points')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setPoints(data.points || 0)
      setLadder(data.ladder || 'recruited')
      setMyRank(data.myRank)
      setBoard(data.leaderboard || [])
      setTeams(data.teams || [])
      setShoutouts(data.shoutouts || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const joinTeam = async (teamId: number) => {
    setBusy(true)
    try {
      const res = await fetch('/api/portal/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join_team', teamId }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Joined team')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PortalShell title="Points">
      <div className="space-y-5">
        <p className="text-sm text-zinc-600 leading-relaxed">
          Points for real work — shifts, tasks, friends you reach. No flash, no
          voter scores.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Your total
                </p>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900">
                  {points}
                </p>
                {myRank != null && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    #{myRank} this month
                  </p>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                {LADDER_LABEL[ladder] || ladder}
              </Badge>
            </section>

            {shoutouts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Shoutouts
                </h2>
                <ul className="space-y-2">
                  {shoutouts.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm text-zinc-800"
                    >
                      <p className="leading-relaxed">&ldquo;{s.message}&rdquo;</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        from {s.fromName || 'staff'}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />
                Leaderboard
              </h2>
              {board.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No points yet this month — check in to a shift to start.
                </p>
              ) : (
                <ol className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
                  {board.map((row, i) => (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between px-3 py-2.5 text-sm"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-zinc-400 w-4 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium text-zinc-900">
                          {row.displayName ||
                            row.email?.split('@')[0] ||
                            `Volunteer ${row.userId}`}
                        </span>
                      </span>
                      <span className="tabular-nums text-zinc-600">
                        {row.points}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Teams
              </h2>
              {teams.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No teams yet — staff can create one from the roster.
                </p>
              ) : (
                <ul className="space-y-2">
                  {teams.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">
                          {t.name}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                          {t.description ? ` · ${t.description}` : ''}
                        </p>
                      </div>
                      {t.myMembership ? (
                        <Badge>Joined</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0"
                          disabled={busy}
                          onClick={() => void joinTeam(t.id)}
                        >
                          Join
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PortalShell>
  )
}
