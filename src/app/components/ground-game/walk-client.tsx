'use client'

/**
 * MiniVAN Walk — phone-first canvasser PWA UI (offline-capable).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyLocalDoorStatus,
  enqueueBreadcrumb,
  enqueueOutcome,
  flushWalkQueue,
  haversineMeters,
  listGpsQueue,
  listQueue,
  loadWalkSnapshot,
  newClientEventId,
  saveWalkSnapshot,
  type WalkSnapshot,
} from '@/app/utils/walk/offline-store'
import { Loader2, MapPin, RefreshCw, Wifi, WifiOff, Check } from 'lucide-react'

type Props = { token: string }

const GPS_CONSENT_KEY = (token: string) => `walk-gps-consent:${token}`

export function WalkClient({ token }: Props) {
  const [snap, setSnap] = useState<WalkSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'list' | 'map'>('list')
  const [gpsConsent, setGpsConsent] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [gpsActive, setGpsActive] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)
  const lastGps = useRef<{ lat: number; lng: number; t: number } | null>(null)
  const watchId = useRef<number | null>(null)

  const refreshPending = useCallback(async () => {
    const [q, g] = await Promise.all([listQueue(token), listGpsQueue(token)])
    const n =
      q.filter((e) => e.syncState === 'pending' || e.syncState === 'error').length +
      g.filter((e) => e.syncState === 'pending' || e.syncState === 'error').length
    setPending(n)
  }, [token])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return
    setSyncing(true)
    try {
      await flushWalkQueue(token)
      await refreshPending()
    } finally {
      setSyncing(false)
    }
  }, [token, refreshPending])

  const pullNetwork = useCallback(async () => {
    const res = await fetch(`/api/public/walk/${encodeURIComponent(token)}`)
    const data = await res.json()
    if (!res.ok || !data.status) {
      throw new Error(data.message || 'Could not load walk')
    }
    const next: WalkSnapshot = {
      token,
      fetchedAt: new Date().toISOString(),
      expiresAt: data.expiresAt,
      turf: data.turf,
      canvasser: {
        name: data.canvasser?.name ?? null,
        paidTracking: Boolean(data.canvasser?.paidTracking || data.gps?.enabled),
      },
      gps: data.gps || { enabled: false },
      outcomes: data.outcomes || [],
      doors: (data.doors || []).map((d: any) => ({
        voterGeoId: d.voterGeoId,
        sortOrder: d.sortOrder || 0,
        lat: Number(d.lat),
        lng: Number(d.lng),
        label: d.label || d.street || `#${d.voterGeoId}`,
        street: d.street,
        city: d.city,
        zip: d.zip,
        party: d.party,
        fieldStatus: d.fieldStatus || null,
        notes: d.notes || null,
      })),
    }
    await saveWalkSnapshot(next)
    setSnap(next)
    return next
  }, [token])

  useEffect(() => {
    try {
      const v = localStorage.getItem(GPS_CONSENT_KEY(token))
      if (v === 'yes' || v === 'no') setGpsConsent(v)
    } catch {
      /* ignore */
    }
  }, [token])

  // Battery-light GPS sampling for paid canvassers who consented
  useEffect(() => {
    const enabled = Boolean(snap?.gps?.enabled)
    if (!enabled || gpsConsent !== 'yes') {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      setGpsActive(false)
      return
    }
    if (!navigator.geolocation) return

    const minIntervalMs = (snap?.gps?.minIntervalSec ?? 45) * 1000
    const minDistanceM = snap?.gps?.minDistanceM ?? 40

    const onPos = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      const now = Date.now()
      const prev = lastGps.current
      if (prev) {
        const dt = now - prev.t
        const dist = haversineMeters(prev.lat, prev.lng, lat, lng)
        if (dt < minIntervalMs && dist < minDistanceM) return
      }
      lastGps.current = { lat, lng, t: now }
      void enqueueBreadcrumb(token, {
        clientEventId: newClientEventId(),
        latitude: lat,
        longitude: lng,
        accuracyM: pos.coords.accuracy ?? null,
        recordedAt: new Date(pos.timestamp || now).toISOString(),
      }).then(() => refreshPending())
    }

    watchId.current = navigator.geolocation.watchPosition(onPos, undefined, {
      enableHighAccuracy: false,
      maximumAge: 30_000,
      timeout: 20_000,
    })
    setGpsActive(true)

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      setGpsActive(false)
    }
  }, [snap?.gps, gpsConsent, token, refreshPending])

  const acceptGps = (yes: boolean) => {
    const v = yes ? 'yes' : 'no'
    setGpsConsent(v)
    try {
      localStorage.setItem(GPS_CONSENT_KEY(token), v)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const cached = await loadWalkSnapshot(token)
        if (cached && !cancelled) setSnap(cached)
        if (navigator.onLine) {
          try {
            await pullNetwork()
          } catch (e) {
            if (!cached) throw e
            if (!cancelled) {
              setError(
                e instanceof Error
                  ? `${e.message} — showing cached turf`
                  : 'Offline cache'
              )
            }
          }
        } else if (!cached) {
          throw new Error('Offline and no cached turf for this link')
        }
        await refreshPending()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Load failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, pullNetwork, refreshPending])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void syncNow()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [syncNow])

  // Register service worker for this walk shell
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker
      .register('/sw-walk.js', { scope: '/walk/' })
      .catch(() => undefined)
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'walk-sync') void syncNow()
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [syncNow])

  // Background Sync tag when available
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
    void navigator.serviceWorker.ready.then((reg) => {
      // @ts-expect-error SyncManager typings
      return reg.sync?.register?.('walk-sync')
    }).catch(() => undefined)
  }, [pending])

  const doors = useMemo(() => {
    const list = snap?.doors || []
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [snap])

  const active = doors.find((d) => d.voterGeoId === activeId) || null

  const record = async (status: string) => {
    if (!active || !snap) return
    setBusy(true)
    try {
      const clientEventId = newClientEventId()
      const recordedAt = new Date().toISOString()
      await enqueueOutcome(token, {
        clientEventId,
        voterGeoId: active.voterGeoId,
        status,
        notes: note.trim() || null,
        recordedAt,
      })
      await applyLocalDoorStatus(token, active.voterGeoId, status, note.trim() || null)
      const next = await loadWalkSnapshot(token)
      if (next) setSnap(next)
      setNote('')
      await refreshPending()
      if (navigator.onLine) await syncNow()
      // Advance to next not-contacted door
      const remaining = (next?.doors || doors).filter(
        (d) =>
          d.voterGeoId !== active.voterGeoId &&
          (!d.fieldStatus || d.fieldStatus === 'not_contacted')
      )
      setActiveId(remaining[0]?.voterGeoId ?? null)
    } finally {
      setBusy(false)
    }
  }

  // Lightweight map (maplibre) when Map tab open
  useEffect(() => {
    if (tab !== 'map' || !mapRef.current || !doors.length) return
    let cancelled = false
    ;(async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !mapRef.current) return
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
      }
      const lngs = doors.map((d) => d.lng).filter(Number.isFinite)
      const lats = doors.map((d) => d.lat).filter(Number.isFinite)
      const center: [number, number] = [
        lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -74.0,
        lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 40.7,
      ]
      const map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center,
        zoom: 14,
      })
      mapInst.current = map
      map.on('load', () => {
        for (const d of doors) {
          if (!Number.isFinite(d.lng) || !Number.isFinite(d.lat)) continue
          const el = document.createElement('button')
          el.type = 'button'
          el.className =
            'h-7 w-7 rounded-full text-[10px] font-bold border-2 border-white shadow ' +
            (d.fieldStatus && d.fieldStatus !== 'not_contacted'
              ? 'bg-emerald-600 text-white'
              : 'bg-teal-600 text-white')
          el.textContent = String(d.sortOrder || '')
          el.onclick = () => {
            setActiveId(d.voterGeoId)
            setTab('list')
          }
          new maplibregl.Marker({ element: el })
            .setLngLat([d.lng, d.lat])
            .addTo(map)
        }
      })
    })()
    return () => {
      cancelled = true
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
      }
    }
  }, [tab, doors])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center gap-2 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your turf…
      </div>
    )
  }

  if (!snap) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-center">
        <div className="space-y-2 max-w-sm">
          <p className="font-semibold text-zinc-900">Walk link unavailable</p>
          <p className="text-sm text-zinc-600">{error || 'Expired or revoked'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-50 text-zinc-900">
      {snap.gps?.enabled && gpsConsent === 'unknown' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 space-y-4 shadow-xl">
            <p className="text-sm font-semibold">Location for payroll</p>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {snap.gps.disclosure ||
                'This campaign flagged you as a paid canvasser. GPS will be sampled (battery-light) for miles and hours. Location is separate from voter records.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="h-12 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                onClick={() => acceptGps(true)}
              >
                Allow GPS for payroll
              </button>
              <button
                type="button"
                className="h-11 rounded-xl border border-zinc-200 text-sm font-medium"
                onClick={() => acceptGps(false)}
              >
                Continue without GPS
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur px-4 py-3 safe-pt">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              Antelope Walk
            </p>
            <h1 className="text-base font-semibold truncate">{snap.turf.label}</h1>
            <p className="text-xs text-zinc-500">
              {doors.length} doors
              {snap.canvasser.name ? ` · ${snap.canvasser.name}` : ''}
              {gpsActive ? ' · GPS on' : ''}
            </p>
          </div>
          <div className="shrink-0 text-right space-y-1">
            <div
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                online
                  ? pending
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                  : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {online ? (
                pending ? (
                  <>
                    <RefreshCw
                      className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`}
                    />
                    {pending} pending
                  </>
                ) : (
                  <>
                    <Wifi className="h-3 w-3" />
                    Synced
                  </>
                )
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Offline
                </>
              )}
            </div>
            {online && pending > 0 && (
              <button
                type="button"
                className="block w-full text-[10px] text-teal-700 underline"
                onClick={() => void syncNow()}
                disabled={syncing}
              >
                Sync now
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-2 text-[11px] text-amber-700">{error}</p>
        )}
        <div className="mt-3 flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-100">
          <button
            type="button"
            className={`flex-1 h-8 text-xs font-medium rounded-md ${
              tab === 'list' ? 'bg-white shadow-sm' : ''
            }`}
            onClick={() => setTab('list')}
          >
            Door list
          </button>
          <button
            type="button"
            className={`flex-1 h-8 text-xs font-medium rounded-md ${
              tab === 'map' ? 'bg-white shadow-sm' : ''
            }`}
            onClick={() => setTab('map')}
          >
            Map
          </button>
        </div>
      </header>

      {tab === 'map' ? (
        <div ref={mapRef} className="flex-1 min-h-[50vh] w-full" />
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-200 pb-40">
          {doors.map((d) => {
            const done = d.fieldStatus && d.fieldStatus !== 'not_contacted'
            return (
              <li key={d.voterGeoId}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(d.voterGeoId)
                    setNote(d.notes || '')
                  }}
                  className={`w-full text-left px-4 py-3 flex gap-3 items-start ${
                    activeId === d.voterGeoId ? 'bg-teal-50' : 'bg-white'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-200 text-zinc-700'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : d.sortOrder}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">
                      {d.label}
                    </span>
                    <span className="block text-xs text-zinc-500 truncate">
                      {[d.street, d.city, d.zip].filter(Boolean).join(', ') ||
                        `${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}`}
                    </span>
                    {done && (
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-emerald-700">
                        {d.fieldStatus}
                      </span>
                    )}
                  </span>
                  <MapPin className="h-4 w-4 text-zinc-400 shrink-0 mt-1" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Outcome sheet */}
      {active && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white shadow-2xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                #{active.sortOrder} · {active.label}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {active.fieldStatus && active.fieldStatus !== 'not_contacted'
                  ? `Last: ${active.fieldStatus}`
                  : 'Tap an outcome'}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-zinc-500 px-2 py-1"
              onClick={() => setActiveId(null)}
            >
              Close
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            {(snap.outcomes.length
              ? snap.outcomes
              : [
                  { status: 'not_home', label: 'Not home' },
                  { status: 'refused', label: 'Refused' },
                  { status: 'supporter', label: 'Supporter' },
                  { status: 'undecided', label: 'Undecided' },
                  { status: 'lean_support', label: 'Follow-up' },
                ]
            ).map((o) => (
              <button
                key={o.status}
                type="button"
                disabled={busy}
                onClick={() => void record(o.status)}
                className="h-12 rounded-xl text-sm font-semibold bg-zinc-900 text-white active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  o.label
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
