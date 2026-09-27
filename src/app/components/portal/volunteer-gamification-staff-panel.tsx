'use client'

/**
 * Volunteer V5 — staff teams, shoutouts, tasteful leaderboard.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Loader2, Trophy, Megaphone } from 'lucide-react'

type BoardRow = {
  userId: number
  displayName: string | null
  email: string | null
  points: number
  ladder?: string
}

type Team = { id: number; name: string; memberCount: number }
type TeamBoard = { teamId: number; name: string; points: number; members: number }

export function VolunteerGamificationStaffPanel({
  volunteers,
}: {
  volunteers: Array<{ userId: number; displayName: string | null; email: string | null }>
}) {
  const [board, setBoard] = useState<BoardRow[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamBoard, setTeamBoard] = useState<TeamBoard[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [shoutTo, setShoutTo] = useState('')
  const [shoutMsg, setShoutMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/gamification')
      const data = await res.json()
      if (res.ok && data.status) {
        setBoard(data.leaderboard || [])
        setTeams(data.teams || [])
        setTeamBoard(data.teamBoard || [])
      }
    } catch {
      toast.error('Failed to load gamification')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createTeam = async () => {
    if (!teamName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_team', name: teamName.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Team created')
      setTeamName('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const shout = async () => {
    if (!shoutTo || !shoutMsg.trim()) {
      toast.error('Pick a volunteer and write a short shoutout')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'shoutout',
          toUserId: Number(shoutTo),
          message: shoutMsg.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success('Shoutout sent')
      setShoutMsg('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Points &amp; teams
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Light motivation — points for real actions, optional teams, shoutouts.
          Ladder: recruited → active → sustained.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Leaderboard (30d)
            </p>
            {board.length === 0 ? (
              <p className="text-sm text-muted-foreground">No points yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {board.slice(0, 10).map((r, i) => (
                  <li
                    key={r.userId}
                    className="flex items-center justify-between text-sm gap-2"
                  >
                    <span className="truncate">
                      <span className="text-muted-foreground mr-2">{i + 1}.</span>
                      {r.displayName || r.email || r.userId}
                      {r.ladder && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {r.ladder}
                        </Badge>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.points}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Create team
              </p>
              <div className="flex gap-2">
                <Input
                  className="h-8"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void createTeam()}
                >
                  Add
                </Button>
              </div>
              {teams.length > 0 && (
                <ul className="text-sm space-y-1">
                  {teams.map((t) => (
                    <li key={t.id} className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {t.memberCount} members
                        {teamBoard.find((b) => b.teamId === t.id)
                          ? ` · ${teamBoard.find((b) => b.teamId === t.id)!.points} pts`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Megaphone className="h-3.5 w-3.5" />
                Shoutout
              </p>
              <div>
                <Label className="text-xs">Volunteer</Label>
                <select
                  className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={shoutTo}
                  onChange={(e) => setShoutTo(e.target.value)}
                >
                  <option value="">Select…</option>
                  {volunteers.map((v) => (
                    <option key={v.userId} value={v.userId}>
                      {v.displayName || v.email || v.userId}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                className="h-8"
                placeholder="Short thank-you (≤280 chars)"
                value={shoutMsg}
                onChange={(e) => setShoutMsg(e.target.value)}
                maxLength={280}
              />
              <Button
                size="sm"
                className="h-8"
                disabled={busy}
                onClick={() => void shout()}
              >
                Post shoutout
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
