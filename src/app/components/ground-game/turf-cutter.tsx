'use client'

/**
 * Turf cutter — map + geofence draw → build_turf, list/rename/delete turfs.
 * Extracted from the dashboard Ground Game panels (MiniVAN M1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Check,
  Loader2,
  MapPin,
  Pencil,
  Printer,
  Route,
  Trash2,
  Upload,
  X,
  GitMerge,
  Split,
} from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GeofencePolygon } from '@/lib/geofencing'
import { classifyAddresses, normalizeRing } from '@/lib/geofencing'
import type { TurfStopPin } from '@/components/dashboard-map'

const DashboardMap = dynamic(() => import('@/components/dashboard-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading map…
    </div>
  ),
})

type TurfListItem = {
  id: number
  label: string
  address_count: number
  assigned_to: number | null
}

export function TurfCutter() {
  const [geofences, setGeofences] = useState<GeofencePolygon[]>([])
  const [geofenceDraftVertices, setGeofenceDraftVertices] = useState<
    [number, number][]
  >([])
  const [geofenceDrawMode, setGeofenceDrawMode] = useState<
    null | 'include' | 'exclude'
  >(null)
  const [geofenceAddressRows, setGeofenceAddressRows] = useState<
    { id: string; lng: number; lat: number; label?: string }[]
  >([])
  const [geofenceCsvLoading, setGeofenceCsvLoading] = useState(false)
  const [geofenceLabelDraft, setGeofenceLabelDraft] = useState('Area A')
  const [geofenceSaving, setGeofenceSaving] = useState(false)
  const [geofenceQueryBusy, setGeofenceQueryBusy] = useState(false)
  const [geofenceQueryCount, setGeofenceQueryCount] = useState<number | null>(
    null
  )

  const [turfList, setTurfList] = useState<TurfListItem[]>([])
  const [activeTurfId, setActiveTurfId] = useState<number | null>(null)
  const [activeTurfLabel, setActiveTurfLabel] = useState<string | null>(null)
  const [turfStops, setTurfStops] = useState<TurfStopPin[]>([])
  const [turfLoading, setTurfLoading] = useState(false)
  const [buildLabel, setBuildLabel] = useState('')
  const [buildBusy, setBuildBusy] = useState(false)
  const [renameId, setRenameId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const classified = useMemo(
    () => classifyAddresses(geofenceAddressRows, geofences),
    [geofenceAddressRows, geofences]
  )

  const geofenceStats = useMemo(() => {
    let canvass = 0
    let skip = 0
    let neutral = 0
    for (const a of classified) {
      if (a.status === 'canvass') canvass += 1
      else if (a.status === 'skip') skip += 1
      else neutral += 1
    }
    return { total: classified.length, canvass, skip, neutral }
  }, [classified])

  const handleGeofenceVertex = useCallback((lng: number, lat: number) => {
    setGeofenceDraftVertices((prev) => [...prev, [lng, lat]])
  }, [])

  const geofencingMapProps = useMemo(
    () => ({
      fences: geofences,
      draftVertices: geofenceDraftVertices,
      drawMode: geofenceDrawMode,
      addresses: classified,
      onDrawVertex: handleGeofenceVertex,
    }),
    [
      geofences,
      geofenceDraftVertices,
      geofenceDrawMode,
      classified,
      handleGeofenceVertex,
    ]
  )

  const loadSavedGeofences = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/geofences')
      const data = await res.json()
      if (!res.ok || !data.status) return
      const mapped: GeofencePolygon[] = (data.fences || [])
        .filter((f: any) => f.fence_type === 'polygon' && Array.isArray(f.ring_json))
        .map((f: any) => ({
          id: String(f.id),
          dbId: Number(f.id),
          label: f.label,
          mode: f.purpose === 'exclude' ? 'exclude' : 'include',
          ring: f.ring_json as [number, number][],
        }))
      setGeofences(mapped)
      if (mapped.length) toast.success(`Loaded ${mapped.length} fence(s)`)
    } catch {
      toast.error('Could not load fences')
    }
  }, [])

  const finishGeofencePolygon = async () => {
    if (geofenceDraftVertices.length < 3) {
      toast.error('Need at least 3 corners')
      return
    }
    if (!geofenceDrawMode) return
    const mode = geofenceDrawMode
    const ring = normalizeRing(geofenceDraftVertices)
    const label =
      geofenceLabelDraft.trim() ||
      (mode === 'include'
        ? `Area ${geofences.length + 1}`
        : `Exclude ${geofences.length + 1}`)
    const localId = `local-${Date.now()}`
    setGeofenceSaving(true)
    try {
      setGeofences((prev) => [...prev, { id: localId, mode, ring, label }])
      setGeofenceDraftVertices([])
      setGeofenceDrawMode(null)

      const res = await fetch('/api/dashboard/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, purpose: mode, ring, label }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Save failed')
      }
      const dbId = Number(data.fence?.id || data.id)
      setGeofences((prev) =>
        prev.map((f) =>
          f.id === localId
            ? { ...f, id: String(dbId || localId), dbId: dbId || undefined }
            : f
        )
      )
      setGeofenceLabelDraft(
        `Area ${String.fromCharCode(65 + ((geofences.length + 1) % 26))}`
      )
      toast.success(`Saved fence “${label}”`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setGeofenceSaving(false)
    }
  }

  const queryAddressesInFence = async (fence: GeofencePolygon) => {
    const id = fence.dbId || (/^\d+$/.test(fence.id) ? Number(fence.id) : null)
    if (!id) {
      toast.error('Save the fence before querying')
      return
    }
    setGeofenceQueryBusy(true)
    try {
      const res = await fetch(`/api/dashboard/geofences/${id}?addresses=1`)
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Query failed')
      setGeofenceQueryCount(data.count)
      const rows = (data.addresses || []).map((a: any, i: number) => ({
        id: String(a.voterGeoId ?? a.id ?? i),
        lng: Number(a.longitude ?? a.lng),
        lat: Number(a.latitude ?? a.lat),
        label: a.label || a.street || undefined,
      }))
      if (rows.length) setGeofenceAddressRows(rows)
      toast.success(`${data.count} addresses in fence`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setGeofenceQueryBusy(false)
    }
  }

  const loadTurfList = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/turfs')
      const data = await res.json()
      if (!res.ok || !data.status) return
      setTurfList(
        (data.turfs || []).map((t: any) => ({
          id: t.id,
          label: t.label,
          address_count: t.address_count,
          assigned_to: t.assigned_to,
        }))
      )
    } catch {
      /* ignore */
    }
  }, [])

  const loadTurfStops = useCallback(async (turfId: number) => {
    setTurfLoading(true)
    try {
      const res = await fetch(`/api/dashboard/turfs/${turfId}?addresses=1`)
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed to load turf')
      setActiveTurfId(turfId)
      setActiveTurfLabel(data.turf?.label || null)
      setTurfStops(
        (data.addresses || []).map((a: any) => ({
          voterGeoId: a.voterGeoId,
          sortOrder: a.sortOrder || 0,
          lng: a.longitude,
          lat: a.latitude,
          label: a.label,
          party: a.party,
          canvassStatus: a.canvassStatus,
          personRecordId: a.personRecordId,
        }))
      )
      toast.success(`Loaded “${data.turf?.label}” · ${data.count} stops`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Turf load failed')
    } finally {
      setTurfLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSavedGeofences()
    void loadTurfList()
  }, [loadSavedGeofences, loadTurfList])

  const includeFenceIds = geofences
    .filter((f) => f.mode === 'include')
    .map((f) => f.dbId || (/^\d+$/.test(f.id) ? Number(f.id) : null))
    .filter((n): n is number => n != null && Number.isFinite(n))
  const excludeFenceIds = geofences
    .filter((f) => f.mode === 'exclude')
    .map((f) => f.dbId || (/^\d+$/.test(f.id) ? Number(f.id) : null))
    .filter((n): n is number => n != null && Number.isFinite(n))

  const buildTurfFromFences = async () => {
    const label = buildLabel.trim()
    if (!label) {
      toast.error('Give the turf a label')
      return
    }
    if (!includeFenceIds.length) {
      toast.error('Draw and save at least one include fence first')
      return
    }
    setBuildBusy(true)
    try {
      const res = await fetch('/api/dashboard/turfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          includeFenceIds,
          excludeFenceIds,
          excludeSuppressed: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Build failed')
      toast.success(`Turf “${label}” · ${data.count} doors`)
      setBuildLabel('')
      await loadTurfList()
      if (data.turf?.id) await loadTurfStops(Number(data.turf.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Build failed')
    } finally {
      setBuildBusy(false)
    }
  }

  const renameTurf = async (id: number) => {
    const label = renameValue.trim()
    if (!label) return
    try {
      const res = await fetch(`/api/dashboard/turfs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Rename failed')
      toast.success(`Renamed to “${label}”`)
      setRenameId(null)
      if (activeTurfId === id) setActiveTurfLabel(label)
      await loadTurfList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const deleteTurf = async (id: number, label: string) => {
    if (!confirm(`Delete turf “${label}”? Walk-list and outcomes go with it.`)) return
    try {
      const res = await fetch(`/api/dashboard/turfs/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Delete failed')
      toast.success('Turf deleted')
      if (activeTurfId === id) {
        setActiveTurfId(null)
        setActiveTurfLabel(null)
        setTurfStops([])
      }
      await loadTurfList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[70vh]">
      <div className="relative flex-1 min-h-[420px] rounded-lg border border-border overflow-hidden bg-muted/20">
        <DashboardMap
          layers={{
            political: false,
            districts: true,
            responses: false,
            voters: false,
            geofencing: true,
            turf: true,
          }}
          turfStops={turfStops}
          geofencing={geofencingMapProps}
        />
      </div>

      <div className="w-full lg:w-[360px] shrink-0 space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Geofence cut */}
        <section className="rounded-lg border border-border p-3 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Cut turf (geofence)
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Draw include / exclude zones on the map, Finish to save, then Build
            turf from the saved fences.
          </p>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="geofence-label" className="text-[10px] shrink-0">
              Label
            </Label>
            <Input
              id="geofence-label"
              value={geofenceLabelDraft}
              onChange={(e) => setGeofenceLabelDraft(e.target.value)}
              placeholder="Area A"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={geofenceDrawMode === 'include' ? 'default' : 'outline'}
              className="h-7 text-[10px] px-2"
              onClick={() => {
                setGeofenceDrawMode('include')
                setGeofenceDraftVertices([])
                toast.success('Include zone: click the map, then Finish.')
              }}
            >
              Draw include
            </Button>
            <Button
              size="sm"
              variant={geofenceDrawMode === 'exclude' ? 'destructive' : 'outline'}
              className="h-7 text-[10px] px-2"
              onClick={() => {
                setGeofenceDrawMode('exclude')
                setGeofenceDraftVertices([])
                toast.success('Exclude zone: click the map, then Finish.')
              }}
            >
              Draw exclude
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-[10px] px-2 gap-0.5"
              onClick={() => void finishGeofencePolygon()}
              disabled={
                !geofenceDrawMode ||
                geofenceDraftVertices.length < 3 ||
                geofenceSaving
              }
            >
              {geofenceSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Finish & save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] px-2 gap-0.5"
              onClick={() => {
                setGeofenceDraftVertices([])
                setGeofenceDrawMode(null)
              }}
            >
              <X className="h-3 w-3" /> Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] px-2"
              onClick={() => void loadSavedGeofences()}
            >
              Load saved
            </Button>
          </div>

          {geofences.length > 0 && (
            <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1">
              <p className="font-medium text-[10px]">Fences on map</p>
              {geofences.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-1 text-[10px]"
                >
                  <span className="truncate">
                    {f.label || f.id}
                    {f.mode === 'exclude' ? ' (exclude)' : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 text-[9px] px-1.5 shrink-0"
                    disabled={
                      geofenceQueryBusy ||
                      (!f.dbId && !/^\d+$/.test(f.id))
                    }
                    onClick={() => void queryAddressesInFence(f)}
                  >
                    {geofenceQueryBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Query DB'
                    )}
                  </Button>
                </div>
              ))}
              {geofenceQueryCount != null && (
                <p className="text-[10px] text-cyan-600 dark:text-cyan-400">
                  Last spatial query: {geofenceQueryCount} addresses
                </p>
              )}
            </div>
          )}

          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-dashed border-border text-[11px] cursor-pointer hover:bg-muted/50">
            <Upload className="h-3 w-3" />
            Preview CSV (lat/lng)
            <input
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setGeofenceCsvLoading(true)
                try {
                  const text = await file.text()
                  const lines = text.split(/\r?\n/).filter(Boolean)
                  if (lines.length < 2) {
                    toast.error('CSV needs a header and data rows.')
                    return
                  }
                  const header = lines[0]
                    .split(',')
                    .map((h) => h.trim().replace(/^"|"$/g, ''))
                  const latCol =
                    header.find((h) => /^(lat|latitude)$/i.test(h.trim())) ||
                    header.find((h) => /\blat(itude)?\b/i.test(h)) ||
                    ''
                  const lngCol =
                    header.find((h) =>
                      /^(lng|lon|longitude|long)$/i.test(h.trim())
                    ) ||
                    header.find((h) => /\b(lng|lon|longitude)\b/i.test(h)) ||
                    ''
                  if (!latCol || !lngCol) {
                    toast.error('Need latitude/longitude columns.')
                    return
                  }
                  const labelCol =
                    header.find((h) => /address|street|line1|addr/i.test(h)) ||
                    header[0]
                  const out: {
                    id: string
                    lng: number
                    lat: number
                    label?: string
                  }[] = []
                  for (let i = 1; i < lines.length; i++) {
                    const vals =
                      lines[i]
                        .match(/("([^"]*)")|([^,]+)/g)
                        ?.map((s) =>
                          s?.startsWith('"') ? s.slice(1, -1) : s?.trim() ?? ''
                        ) ?? lines[i].split(',')
                    const row: Record<string, string> = {}
                    header.forEach((h, j) => {
                      row[h] = vals[j] ?? ''
                    })
                    const lat = parseFloat(
                      String(row[latCol] ?? '').replace(/,/g, '')
                    )
                    const lng = parseFloat(
                      String(row[lngCol] ?? '').replace(/,/g, '')
                    )
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
                    out.push({
                      id: `row-${i}`,
                      lat,
                      lng,
                      label: row[labelCol] || undefined,
                    })
                  }
                  setGeofenceAddressRows(out)
                  toast.success(`Loaded ${out.length} preview points`)
                } catch {
                  toast.error('Failed to parse CSV')
                } finally {
                  setGeofenceCsvLoading(false)
                  e.target.value = ''
                }
              }}
            />
          </label>
          {geofenceCsvLoading && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Parsing…
            </div>
          )}
          {geofenceStats.total > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Preview:{' '}
              <span className="text-emerald-600">Canvass {geofenceStats.canvass}</span>
              {' · '}
              <span className="text-red-600">Skip {geofenceStats.skip}</span>
            </p>
          )}

          <div className="pt-2 border-t border-border space-y-2">
            <Label className="text-[10px]">New turf label</Label>
            <Input
              value={buildLabel}
              onChange={(e) => setBuildLabel(e.target.value)}
              placeholder="Precinct 3 — Saturday"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              disabled={buildBusy || !includeFenceIds.length}
              onClick={() => void buildTurfFromFences()}
            >
              {buildBusy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Route className="h-3.5 w-3.5 mr-1.5" />
              )}
              Build turf from fences
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {includeFenceIds.length} include · {excludeFenceIds.length} exclude
              saved fence(s)
            </p>
          </div>
        </section>

        {/* Saved turfs */}
        <section className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Saved turfs</h2>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={turfLoading}
              onClick={() => void loadTurfList()}
            >
              Refresh
            </Button>
          </div>
          {turfList.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              No turfs yet — cut a fence and build one above.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {turfList.map((t) => (
                <li
                  key={t.id}
                  className={`rounded border px-2 py-1.5 space-y-1 ${
                    activeTurfId === t.id
                      ? 'border-teal-500/50 bg-teal-500/10'
                      : 'border-border/60'
                  }`}
                >
                  {renameId === t.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => void renameTurf(t.id)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() => setRenameId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-1">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => void loadTurfStops(t.id)}
                      >
                        <p className="text-xs font-medium truncate">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t.address_count} doors
                          {t.assigned_to
                            ? ` · assigned #${t.assigned_to}`
                            : ' · unassigned'}
                        </p>
                      </button>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="Rename"
                          onClick={() => {
                            setRenameId(t.id)
                            setRenameValue(t.label)
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive"
                          title="Delete"
                          onClick={() => void deleteTurf(t.id, t.label)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 text-[9px] px-1.5"
                      disabled={turfLoading}
                      onClick={() => void loadTurfStops(t.id)}
                    >
                      Load on map
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[9px] px-1.5 gap-0.5"
                      title="Split — rebuild subsets from geofences"
                      onClick={() =>
                        toast.message(
                          'Split: cut new include zones for each half, then Build turf with a new label.'
                        )
                      }
                    >
                      <Split className="h-3 w-3" />
                      Split
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[9px] px-1.5 gap-0.5"
                      title="Merge — build a turf covering both areas"
                      onClick={() =>
                        toast.message(
                          'Merge: load both areas as include fences, then Build turf with a combined label.'
                        )
                      }
                    >
                      <GitMerge className="h-3 w-3" />
                      Merge
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {activeTurfId && (
            <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1.5">
              <p className="text-[10px] font-medium">
                Active: {activeTurfLabel} · {turfStops.length} stops
              </p>
              <div className="flex flex-wrap gap-1">
                <Button asChild size="sm" variant="outline" className="h-7 text-[10px]">
                  <Link href={`/dashboard/print-map?turfId=${activeTurfId}`}>
                    <Printer className="h-3 w-3 mr-1" />
                    Print walk sheet
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary" className="h-7 text-[10px]">
                  <Link href="/assignments">Assign canvasser →</Link>
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
