'use client'

/**
 * Volunteer V4 — staff see aggregate relational reach only (no private PII).
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Users } from 'lucide-react'

type Reach = {
  privateContactCount: number
  volunteersWithNetwork: number
  outreachAssigned: number
  outreachLogged: number
  reached: number
  converted: number
}

export function VolunteerReachStaffPanel() {
  const [reach, setReach] = useState<Reach | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/reach')
      const data = await res.json()
      if (res.ok && data.status) setReach(data.reach)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Relational reach
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Friends-and-family networks stay private to each volunteer. Staff see
          counts only — never contact details.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            {
              label: 'Volunteers with a network',
              value: reach?.volunteersWithNetwork ?? 0,
            },
            {
              label: 'Private contacts (total)',
              value: reach?.privateContactCount ?? 0,
            },
            { label: 'Scripts assigned', value: reach?.outreachAssigned ?? 0 },
            { label: 'Outcomes logged', value: reach?.outreachLogged ?? 0 },
            { label: 'Reached / will help', value: reach?.reached ?? 0 },
            { label: 'Converted to volunteers', value: reach?.converted ?? 0 },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <p className="text-lg font-semibold tabular-nums">{m.value}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {m.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
