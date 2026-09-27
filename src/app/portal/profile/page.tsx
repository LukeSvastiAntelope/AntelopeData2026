'use client'

import { useEffect, useState } from 'react'
import { PortalShell } from '@/app/components/portal/portal-shell'

type Profile = {
  displayName: string | null
  email: string | null
  phone: string | null
  organizationName: string | null
  source: string | null
  status: string
  intake: Record<string, unknown> | null
  acceptedAt: string | null
}

type HistoryItem = {
  ts: string
  source: string
  type: string
  summary: string
}

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/portal/profile')
        const data = await res.json()
        if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
        if (cancelled) return
        setProfile(data.profile)
        setHistory(data.history || [])
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PortalShell title="Profile">
      {loading ? (
        <p className="text-sm text-zinc-500">Loading your profile…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : profile ? (
        <div className="space-y-5">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
            <h2 className="text-lg font-semibold">
              {profile.displayName || 'Volunteer'}
            </h2>
            <p className="text-sm text-zinc-600">{profile.organizationName}</p>
            <dl className="grid grid-cols-1 gap-1.5 text-xs text-zinc-600 pt-1">
              <div>
                <span className="text-zinc-400">Email · </span>
                {profile.email || '—'}
              </div>
              <div>
                <span className="text-zinc-400">Phone · </span>
                {profile.phone || '—'}
              </div>
              <div>
                <span className="text-zinc-400">Source · </span>
                {(profile.source || '—').replace(/_/g, ' ')}
              </div>
              <div>
                <span className="text-zinc-400">Status · </span>
                {profile.status}
              </div>
              {profile.acceptedAt && (
                <div>
                  <span className="text-zinc-400">Joined · </span>
                  {new Date(profile.acceptedAt).toLocaleString()}
                </div>
              )}
            </dl>
            {profile.intake && Object.keys(profile.intake).length > 0 && (
              <div className="pt-2 border-t border-zinc-100 space-y-1">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                  Intake
                </p>
                {Object.entries(profile.intake).map(([k, v]) => (
                  <p key={k} className="text-xs text-zinc-600">
                    <span className="text-zinc-400">{k}: </span>
                    {String(v ?? '')}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Engagement history</h3>
            <p className="text-xs text-zinc-500">
              Projected from your campaign record and events — map, not verdict.
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
                No events yet — shifts and tasks will show up here.
              </p>
            ) : (
              <ol className="space-y-2">
                {history.map((ev, i) => (
                  <li
                    key={`${ev.ts}-${ev.type}-${i}`}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                  >
                    <p className="text-sm text-zinc-900">{ev.summary}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {new Date(ev.ts).toLocaleString()} · {ev.source} ·{' '}
                      {ev.type}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </PortalShell>
  )
}
