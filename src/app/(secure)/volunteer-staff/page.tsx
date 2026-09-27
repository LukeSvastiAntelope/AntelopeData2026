'use client'

/**
 * Volunteer V2 — staff roster + invite + host intake schema.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import {
  ClipboardList,
  Mail,
  Copy,
  Loader2,
  Users,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react'
import { VolunteerShiftsStaffPanel } from '@/app/components/portal/volunteer-shifts-staff-panel'
import { VolunteerReachStaffPanel } from '@/app/components/portal/volunteer-reach-staff-panel'
import { VolunteerGamificationStaffPanel } from '@/app/components/portal/volunteer-gamification-staff-panel'

type RosterRow = {
  membershipId: number
  userId: number
  personRecordId: number | null
  email: string | null
  displayName: string | null
  role: string
  status: string
  source: string | null
  intake: Record<string, unknown> | null
  invitedAt: string | null
  acceptedAt: string | null
  phone: string | null
}

type IntakeField = {
  id: string
  label: string
  type: string
  required?: boolean
  options?: string[]
}

type IntakeSchema = {
  headline?: string
  body?: string
  consentPrompt?: string
  fields: IntakeField[]
}

export default function VolunteerStaffPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastJoinPath, setLastJoinPath] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [volunteers, setVolunteers] = useState<RosterRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [publicJoinPath, setPublicJoinPath] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all')
  const [selected, setSelected] = useState<{
    profile: any
    history: any[]
  } | null>(null)
  const [drawerBusy, setDrawerBusy] = useState(false)

  const [schema, setSchema] = useState<IntakeSchema | null>(null)
  const [signupEnabled, setSignupEnabled] = useState(true)
  const [schemaBusy, setSchemaBusy] = useState(false)

  const loadRoster = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/volunteers')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setVolunteers(data.volunteers || [])
      setCounts(data.counts || {})
      setPublicJoinPath(data.publicJoinPath || null)
      setOrgName(data.organizationName || null)
      setSchema(data.intakeSchema || null)
      setSignupEnabled(Boolean(data.signupEnabled))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoster()
  }, [loadRoster])

  const invite = async () => {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Invite failed')
      setLastJoinPath(data.joinPath)
      toast.success('Invite sent')
      setEmail('')
      setDisplayName('')
      await loadRoster()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  const copyPath = (path: string | null) => {
    if (!path || typeof window === 'undefined') return
    const url = path.startsWith('http')
      ? path
      : `${window.location.origin}${path}`
    void navigator.clipboard?.writeText(url)
    toast.success('Link copied')
  }

  const openVolunteer = async (userId: number) => {
    setDrawerBusy(true)
    try {
      const res = await fetch(`/api/dashboard/volunteers/${userId}`)
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      setSelected({ profile: data.profile, history: data.history || [] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setDrawerBusy(false)
    }
  }

  const saveSchema = async () => {
    if (!schema) return
    setSchemaBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/intake-schema', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeSchema: schema, signupEnabled }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Save failed')
      setSchema(data.intakeSchema)
      toast.success('Intake form saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSchemaBusy(false)
    }
  }

  const filtered = volunteers.filter((v) => {
    if (filter === 'all') return true
    return v.status === filter
  })

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Volunteers
              </h1>
            </div>
            <div className="flex gap-1.5 items-center">
              <Button size="sm" variant="outline" asChild className="h-8">
                <Link href="/volunteers">Dashboard</Link>
              </Button>
              {publicJoinPath && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyPath(publicJoinPath)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy public join link
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={publicJoinPath} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-8 max-w-5xl">
          <p className="text-sm text-muted-foreground">
            {orgName
              ? `Roster for ${orgName}. `
              : ''}
            Anyone can join from the public link; staff invites still work.
            Volunteers land in the phone portal via magic link.
          </p>

          {/* Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total', value: counts.total || 0 },
              { label: 'Active', value: counts.active || 0 },
              { label: 'Public signup', value: counts.publicSignup || 0 },
              { label: 'Staff invite', value: counts.staffInvite || 0 },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="text-sm font-semibold tabular-nums mt-0.5">
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <VolunteerShiftsStaffPanel />

          <div className="border-t border-border pt-6">
            <VolunteerReachStaffPanel />
          </div>

          <div className="border-t border-border pt-6">
            <VolunteerGamificationStaffPanel
              volunteers={volunteers.map((v) => ({
                userId: v.userId,
                displayName: v.displayName,
                email: v.email,
              }))}
            />
          </div>

          {/* Invite */}
          <section className="rounded-lg border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Invite by magic link
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vol-email">Email</Label>
                <Input
                  id="vol-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="volunteer@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vol-name">Name (optional)</Label>
                <Input
                  id="vol-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jordan Lee"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void invite()}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Mail className="h-3.5 w-3.5 mr-1" />
                )}
                Send invite
              </Button>
              {lastJoinPath && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyPath(lastJoinPath)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy last link
                </Button>
              )}
            </div>
          </section>

          {/* Roster */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Roster
              </h2>
              <div className="flex gap-1">
                {(['all', 'active', 'pending'] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading roster…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No volunteers yet — share the public join link or send an invite.
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((v) => (
                  <li
                    key={v.membershipId}
                    className="rounded-lg border border-border p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1 hover:opacity-90"
                      onClick={() => void openVolunteer(v.userId)}
                    >
                      <p className="text-sm font-medium truncate">
                        {v.displayName || v.email || `User #${v.userId}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.email || '—'}
                        {v.phone ? ` · ${v.phone}` : ''}
                        {v.source ? ` · ${v.source.replace(/_/g, ' ')}` : ''}
                        {v.acceptedAt
                          ? ` · joined ${new Date(v.acceptedAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          v.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {v.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={drawerBusy}
                        onClick={() => void openVolunteer(v.userId)}
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Intake schema */}
          {schema && (
            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Public intake form</h2>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={signupEnabled}
                    onChange={(e) => setSignupEnabled(e.target.checked)}
                  />
                  Signup enabled
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Headline</Label>
                  <Input
                    value={schema.headline || ''}
                    onChange={(e) =>
                      setSchema({ ...schema, headline: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Supporting copy</Label>
                  <Textarea
                    rows={2}
                    value={schema.body || ''}
                    onChange={(e) =>
                      setSchema({ ...schema, body: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Consent prompt</Label>
                  <Textarea
                    rows={2}
                    value={schema.consentPrompt || ''}
                    onChange={(e) =>
                      setSchema({ ...schema, consentPrompt: e.target.value })
                    }
                  />
                </div>
              </div>

              <ul className="space-y-2">
                {schema.fields.map((f, idx) => (
                  <li
                    key={`${f.id}-${idx}`}
                    className="flex flex-wrap gap-2 items-center rounded-md border border-border px-3 py-2"
                  >
                    <Input
                      className="h-8 w-[140px] text-xs"
                      value={f.label}
                      onChange={(e) => {
                        const fields = [...schema.fields]
                        fields[idx] = { ...f, label: e.target.value }
                        setSchema({ ...schema, fields })
                      }}
                    />
                    <select
                      className="h-8 rounded-md border border-border bg-background text-xs px-2"
                      value={f.type}
                      onChange={(e) => {
                        const fields = [...schema.fields]
                        fields[idx] = { ...f, type: e.target.value }
                        setSchema({ ...schema, fields })
                      }}
                    >
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                      <option value="tel">Phone</option>
                      <option value="select">Select</option>
                      <option value="number">Number</option>
                    </select>
                    <label className="text-[11px] flex items-center gap-1 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(f.required)}
                        onChange={(e) => {
                          const fields = [...schema.fields]
                          fields[idx] = { ...f, required: e.target.checked }
                          setSchema({ ...schema, fields })
                        }}
                      />
                      Required
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 ml-auto"
                      onClick={() => {
                        setSchema({
                          ...schema,
                          fields: schema.fields.filter((_, i) => i !== idx),
                        })
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setSchema({
                      ...schema,
                      fields: [
                        ...schema.fields,
                        {
                          id: `field_${Date.now().toString(36)}`,
                          label: 'New field',
                          type: 'text',
                          required: false,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add field
                </Button>
                <Button
                  size="sm"
                  disabled={schemaBusy}
                  onClick={() => void saveSchema()}
                >
                  {schemaBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  Save intake form
                </Button>
              </div>
              {publicJoinPath && (
                <p className="text-[11px] text-muted-foreground">
                  Public page:{' '}
                  <Link href={publicJoinPath} className="underline">
                    {publicJoinPath}
                  </Link>
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Profile drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <button
            type="button"
            className="flex-1"
            aria-label="Close"
            onClick={() => setSelected(null)}
          />
          <aside className="w-full max-w-md h-full bg-card border-l border-border shadow-xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">
                  {selected.profile.displayName || selected.profile.email}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {(selected.profile.source || '—').replace(/_/g, ' ')} ·{' '}
                  {selected.profile.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
            </div>
            <dl className="text-xs space-y-1 text-muted-foreground">
              <div>Email: {selected.profile.email || '—'}</div>
              <div>Phone: {selected.profile.phone || '—'}</div>
              {selected.profile.acceptedAt && (
                <div>
                  Joined:{' '}
                  {new Date(selected.profile.acceptedAt).toLocaleString()}
                </div>
              )}
            </dl>
            {selected.profile.intake && (
              <div className="rounded-md border border-border p-3 space-y-1">
                <p className="text-xs font-medium">Intake</p>
                {Object.entries(selected.profile.intake).map(([k, v]) => (
                  <p key={k} className="text-[11px] text-muted-foreground">
                    {k}: {String(v ?? '')}
                  </p>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium">360° engagement</p>
              {selected.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events yet.</p>
              ) : (
                <ol className="space-y-2">
                  {selected.history.map((ev: any, i: number) => (
                    <li
                      key={`${ev.ts}-${i}`}
                      className="rounded-md border border-border px-3 py-2"
                    >
                      <p className="text-xs">{ev.summary}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(ev.ts).toLocaleString()} · {ev.source}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
