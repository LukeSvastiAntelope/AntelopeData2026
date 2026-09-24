'use client'

/**
 * Assignments — turf → canvasser, coverage %, Share walk PWA link (scoped token).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
  Ban,
  Copy,
  ExternalLink,
  Radio,
} from 'lucide-react'
import {
  useCanvassProgress,
  TurfProgressDetails,
} from '@/app/components/ground-game/use-canvass-progress'

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

type WalkTokenMeta = {
  id: number
  turfId: number
  canvasserUserId: number
  expiresAt: string
  revokedAt: string | null
  active: boolean
}

type SharePanel = {
  turfId: number
  url: string
  tokenId: number
  expiresAt: string
}

export default function AssignmentsPage() {
  const { organization } = useAgent()
  const [turfs, setTurfs] = useState<TurfAssignment[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [assignDraft, setAssignDraft] = useState<Record<number, string>>({})
  const [shareBusy, setShareBusy] = useState<number | null>(null)
  const [sharePanel, setSharePanel] = useState<SharePanel | null>(null)
  const [tokenLists, setTokenLists] = useState<Record<number, WalkTokenMeta[]>>({})

  const {
    data: liveProgress,
    live,
    bump,
    byTurfId,
  } = useCanvassProgress({ enabled: true, intervalMs: 5000 })

  // Merge live coverage into the turf list as outcomes sync in
  useEffect(() => {
    if (!liveProgress?.turfs?.length) return
    setTurfs((prev) => {
      if (!prev.length) return prev
      let changed = false
      const next = prev.map((t) => {
        const p = liveProgress.turfs.find((x) => x.turfId === t.id)
        if (!p) return t
        if ((t.contacted_count || 0) === p.contactedCount) return t
        changed = true
        return { ...t, contacted_count: p.contactedCount }
      })
      return changed ? next : prev
    })
  }, [liveProgress])

  const memberLabel = useCallback(
    (userId: number | null) => {
      if (userId == null) return 'Unassigned'
      const m = members.find((x) => Number(x.user_id) === userId)
      if (!m) return `User #${userId}`
      return m.display_name || m.email || `User #${userId}`
    },
    [members]
  )

  const loadTokens = useCallback(async (turfId: number) => {
    try {
      const res = await fetch(`/api/dashboard/walk-tokens?turfId=${turfId}`)
      const data = await res.json()
      if (!res.ok || !data.status) return
      setTokenLists((prev) => ({ ...prev, [turfId]: data.tokens || [] }))
    } catch {
      /* ignore */
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const turfRes = await fetch('/api/dashboard/turfs?coverage=1')
      const turfData = await turfRes.json()
      if (!turfRes.ok || !turfData.status) {
        throw new Error(turfData.message || 'Could not load turfs')
      }
      const list = (turfData.turfs || []).map((t: any) => ({
        id: t.id,
        label: t.label,
        address_count: Number(t.address_count) || 0,
        assigned_to: t.assigned_to != null ? Number(t.assigned_to) : null,
        contacted_count: Number(t.contacted_count) || 0,
      }))
      setTurfs(list)

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

      await Promise.all(list.slice(0, 20).map((t: TurfAssignment) => loadTokens(t.id)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, loadTokens])

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

  const shareToCanvasser = async (turf: TurfAssignment) => {
    if (turf.assigned_to == null) {
      toast.error('Assign a canvasser before sharing a walk link')
      return
    }
    setShareBusy(turf.id)
    try {
      const res = await fetch('/api/dashboard/walk-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turfId: turf.id,
          canvasserUserId: turf.assigned_to,
          expiresInDays: 14,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status || !data.url) {
        throw new Error(data.message || 'Could not create walk link')
      }
      const path = data.path || `/walk/${data.token}`
      const url =
        typeof window !== 'undefined'
          ? `${window.location.origin}${path}`
          : data.url
      setSharePanel({
        turfId: turf.id,
        url,
        tokenId: data.tokenId,
        expiresAt: data.expiresAt,
      })
      void navigator.clipboard?.writeText(url).catch(() => undefined)
      toast.success('Walk link created — copied to clipboard')
      await loadTokens(turf.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setShareBusy(null)
    }
  }

  const revokeToken = async (turfId: number, tokenId: number) => {
    try {
      const res = await fetch(`/api/dashboard/walk-tokens/${tokenId}/revoke`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Revoke failed')
      toast.success('Walk link revoked')
      if (sharePanel?.tokenId === tokenId) setSharePanel(null)
      await loadTokens(turfId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed')
    }
  }

  const qrSrc = (url: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`

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
            Assign a saved turf to a canvasser, then Share a scoped Walk link (or QR).
            No app install — they Add to Home Screen. Coverage and outcomes refresh as
            walkers sync back.
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {summary.assigned}/{summary.total} turfs assigned
            </Badge>
            <Badge variant="outline">
              {summary.contacted}/{summary.doors} doors contacted
            </Badge>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 ${
                live
                  ? 'border-teal-500/40 bg-teal-500/10 text-teal-800 dark:text-teal-200'
                  : 'border-border bg-muted/40'
              }`}
              title={
                liveProgress?.asOf
                  ? `Last poll ${new Date(liveProgress.asOf).toLocaleTimeString()}`
                  : 'Polling canvass sync…'
              }
            >
              <Radio
                className={`h-3 w-3 ${live ? 'text-teal-600 animate-pulse' : ''}`}
              />
              {live ? 'Live' : 'Connecting…'}
              {bump > 0 ? (
                <span className="tabular-nums text-[10px] opacity-80">
                  · +{bump} sync
                </span>
              ) : null}
            </span>
          </div>

          {sharePanel && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-4 space-y-3 max-w-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Share to canvasser</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(sharePanel.expiresAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setSharePanel(null)}
                >
                  Close
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc(sharePanel.url)}
                  alt="Walk QR code"
                  width={180}
                  height={180}
                  className="rounded-md border border-border bg-white"
                />
                <div className="flex-1 w-full space-y-2">
                  <Label className="text-xs">Walk URL</Label>
                  <Input readOnly value={sharePanel.url} className="h-9 text-xs" />
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void navigator.clipboard?.writeText(sharePanel.url)
                        toast.success('Copied')
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={sharePanel.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Open
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        void revokeToken(sharePanel.turfId, sharePanel.tokenId)
                      }
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Revoke
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                const progress = byTurfId(t.id)
                const pct = progress?.coveragePct ?? coveragePct(t)
                const contacted =
                  progress?.contactedCount ?? t.contacted_count ?? 0
                const draft =
                  assignDraft[t.id] ??
                  (t.assigned_to != null ? String(t.assigned_to) : '')
                const activeTokens = (tokenLists[t.id] || []).filter((x) => x.active)
                return (
                  <li
                    key={t.id}
                    className="rounded-lg border border-border p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-sm truncate">{t.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.address_count} doors · {memberLabel(t.assigned_to)}
                          {activeTokens.length
                            ? ` · ${activeTokens.length} active walk link(s)`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-semibold tabular-nums transition-colors">
                          {pct}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          coverage ({contacted}/{t.address_count})
                        </p>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-teal-600/80 transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <TurfProgressDetails progress={progress} />

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
                          disabled={shareBusy === t.id}
                          onClick={() => void shareToCanvasser(t)}
                        >
                          {shareBusy === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Share2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Share to canvasser
                          <QrCode className="h-3.5 w-3.5 ml-1 opacity-60" />
                        </Button>
                      </div>
                    </div>

                    {activeTokens.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {activeTokens.map((tok) => (
                          <Button
                            key={tok.id}
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] text-destructive"
                            onClick={() => void revokeToken(t.id, tok.id)}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Revoke link · expires{' '}
                            {new Date(tok.expiresAt).toLocaleDateString()}
                          </Button>
                        ))}
                      </div>
                    )}
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
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
