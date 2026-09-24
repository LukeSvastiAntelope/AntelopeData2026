'use client'

/**
 * Assignments — turf → canvasser (org members), coverage %, Share stub (PWA in M2).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { useAgent } from '@/app/context/AgentContext'
import {
  Loader2,
  MapPin,
  QrCode,
  Share2,
  UserMinus,
  Users,
} from 'lucide-react'

type TurfAssignment = {
  id: number
  label: string
  address_count: number
  assigned_to: number | null
  contacted_count?: number
}

type OrgMember = {
  user_id: number
  email?: string
  display_name?: string | null
  role?: string
  status?: string
}

export default function AssignmentsPage() {
  const { organization } = useAgent()
  const [turfs, setTurfs] = useState<TurfAssignment[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [assignDraft, setAssignDraft] = useState<Record<number, string>>({})

  const memberLabel = useCallback(
    (userId: number | null) => {
      if (userId == null) return 'Unassigned'
      const m = members.find((x) => Number(x.user_id) === userId)
      if (!m) return `User #${userId}`
      return m.display_name || m.email || `User #${userId}`
    },
    [members]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const turfRes = await fetch('/api/dashboard/turfs?coverage=1')
      const turfData = await turfRes.json()
      if (!turfRes.ok || !turfData.status) {
        throw new Error(turfData.message || 'Could not load turfs')
      }
      setTurfs(
        (turfData.turfs || []).map((t: any) => ({
          id: t.id,
          label: t.label,
          address_count: Number(t.address_count) || 0,
          assigned_to: t.assigned_to != null ? Number(t.assigned_to) : null,
          contacted_count: Number(t.contacted_count) || 0,
        }))
      )

      const orgId = organization?.id || turfData.organizationId
      if (orgId) {
        const orgRes = await fetch(`/api/organizations/${orgId}`)
        const orgData = await orgRes.json()
        if (orgRes.ok && orgData.status) {
          setMembers(
            (orgData.members || [])
              .filter((m: any) => m.status === 'active' || !m.status)
              .map((m: any) => ({
                user_id: Number(m.user_id),
                email: m.email,
                display_name: m.display_name,
                role: m.role,
                status: m.status,
              }))
          )
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [organization?.id])

  useEffect(() => {
    void load()
  }, [load])

  const coveragePct = (t: TurfAssignment) => {
    if (!t.address_count) return 0
    return Math.min(
      100,
      Math.round(((t.contacted_count || 0) / t.address_count) * 100)
    )
  }

  const summary = useMemo(() => {
    const assigned = turfs.filter((t) => t.assigned_to != null).length
    const doors = turfs.reduce((s, t) => s + t.address_count, 0)
    const contacted = turfs.reduce((s, t) => s + (t.contacted_count || 0), 0)
    return { assigned, total: turfs.length, doors, contacted }
  }, [turfs])

  const patchAssign = async (turfId: number, assignedTo: number | null) => {
    setBusyId(turfId)
    try {
      const res = await fetch(`/api/dashboard/turfs/${turfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          assignedTo == null ? { unassign: true } : { assignedTo }
        ),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Assign failed')
      setTurfs((prev) =>
        prev.map((t) =>
          t.id === turfId
            ? {
                ...t,
                assigned_to:
                  data.turf?.assigned_to != null
                    ? Number(data.turf.assigned_to)
                    : null,
              }
            : t
        )
      )
      toast.success(
        assignedTo == null
          ? 'Unassigned'
          : `Assigned to ${memberLabel(assignedTo)}`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setBusyId(null)
    }
  }

  const shareStub = (turf: TurfAssignment) => {
    if (turf.assigned_to == null) {
      toast.error('Assign a canvasser before sharing a walk link')
      return
    }
    // Phase 2: scoped PWA link + QR. M1 exposes the action surface only.
    const stubPath = `/walk/${turf.id}`
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${stubPath}`
        : stubPath
    void navigator.clipboard?.writeText(url).catch(() => undefined)
    toast.message('Share to canvasser', {
      description:
        'Walk PWA link/QR ships in MiniVAN M2. Stub path copied for now — canvasser opens it from Assignments after Phase 2.',
    })
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
                Assignments
              </h1>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/turf">
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Cut turf
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Assign a saved turf to a canvasser from your team, reassign as needed,
            and watch coverage climb as door outcomes land. Share opens the phone
            walk link (PWA) — Phase 2.
          </p>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {summary.assigned}/{summary.total} turfs assigned
            </Badge>
            <Badge variant="outline">
              {summary.contacted}/{summary.doors} doors contacted
            </Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assignments…
            </div>
          ) : turfs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center space-y-3">
              <Users className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">No turfs to assign yet</p>
              <p className="text-xs text-muted-foreground">
                Cut a geofence and build a turf first.
              </p>
              <Button asChild size="sm">
                <Link href="/turf">Go to Turf</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {turfs.map((t) => {
                const pct = coveragePct(t)
                const draft =
                  assignDraft[t.id] ??
                  (t.assigned_to != null ? String(t.assigned_to) : '')
                return (
                  <li
                    key={t.id}
                    className="rounded-lg border border-border p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-sm truncate">{t.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.address_count} doors ·{' '}
                          {memberLabel(t.assigned_to)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-semibold tabular-nums">{pct}%</p>
                        <p className="text-[10px] text-muted-foreground">
                          coverage ({t.contacted_count || 0}/{t.address_count})
                        </p>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-teal-600/80 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <Label className="text-xs">Canvasser</Label>
                        <Select
                          value={draft || 'unassigned'}
                          onValueChange={(v) =>
                            setAssignDraft((prev) => ({
                              ...prev,
                              [t.id]: v === 'unassigned' ? '' : v,
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select canvasser" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {members.map((m) => (
                              <SelectItem
                                key={m.user_id}
                                value={String(m.user_id)}
                              >
                                {m.display_name || m.email || `User #${m.user_id}`}
                                {m.role ? ` · ${m.role}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          disabled={busyId === t.id}
                          onClick={() => {
                            const next =
                              draft === '' || draft === 'unassigned'
                                ? null
                                : Number(draft)
                            void patchAssign(t.id, next)
                          }}
                        >
                          {busyId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Save assignment'
                          )}
                        </Button>
                        {t.assigned_to != null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === t.id}
                            onClick={() => void patchAssign(t.id, null)}
                          >
                            <UserMinus className="h-3.5 w-3.5 mr-1" />
                            Unassign
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => shareStub(t)}
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1" />
                          Share to canvasser
                          <QrCode className="h-3.5 w-3.5 ml-1 opacity-60" />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {members.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">
              No team members loaded — invite people on{' '}
              <Link href="/team" className="text-primary underline">
                Team
              </Link>{' '}
              or track volunteers on{' '}
              <Link href="/volunteer-staff" className="text-primary underline">
                Volunteer/Staff
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
