'use client'

import { useCallback, useEffect, useState } from 'react'
import { PortalShell } from '@/app/components/portal/portal-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Loader2, MapPinned } from 'lucide-react'

type Shift = {
  id: number
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  locationText: string | null
  turfLabel: string | null
  capacity: number | null
  status: string
  claimCount: number
  myClaimStatus: string | null
}

export default function PortalShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/shifts')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setShifts(data.shifts || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (shiftId: number, action: string) => {
    setBusyId(shiftId)
    try {
      const res = await fetch('/api/portal/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, action }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
      toast.success(
        action === 'check_in'
          ? 'Checked in'
          : action === 'unclaim'
            ? 'Shift released'
            : 'Shift claimed'
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PortalShell title="Shifts">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Claim a shift to show up. Check in when you arrive — reminders come
          through the campaign outbound gate.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shifts…
          </div>
        ) : shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
            No upcoming shifts yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-3">
            {shifts.map((s) => {
              const mine = s.myClaimStatus
              const full = s.status === 'full' && !mine
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">
                        {s.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(s.startsAt).toLocaleString()}
                        {s.locationText ? ` · ${s.locationText}` : ''}
                      </p>
                      {s.turfLabel && (
                        <p className="text-[11px] text-teal-800 mt-1 flex items-center gap-1">
                          <MapPinned className="h-3 w-3" />
                          Turf: {s.turfLabel}
                        </p>
                      )}
                    </div>
                    <Badge variant={mine ? 'default' : 'outline'}>
                      {mine || s.status}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-zinc-600">{s.description}</p>
                  )}
                  <p className="text-[11px] text-zinc-400">
                    {s.claimCount}
                    {s.capacity != null ? ` / ${s.capacity}` : ''} claimed
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {!mine && (
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={full || busyId === s.id}
                        onClick={() => void act(s.id, 'claim')}
                      >
                        {busyId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : full ? (
                          'Full'
                        ) : (
                          'Claim'
                        )}
                      </Button>
                    )}
                    {mine === 'claimed' && (
                      <>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={busyId === s.id}
                          onClick={() => void act(s.id, 'check_in')}
                        >
                          Check in
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busyId === s.id}
                          onClick={() => void act(s.id, 'unclaim')}
                        >
                          Release
                        </Button>
                      </>
                    )}
                    {mine === 'checked_in' && (
                      <span className="text-xs text-teal-800 font-medium self-center">
                        You&apos;re checked in
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </PortalShell>
  )
}
