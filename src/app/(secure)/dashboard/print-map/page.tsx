'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, ArrowLeft, Users, Route } from 'lucide-react'

const PrintWalkMap = dynamic(() => import('@/components/print-walk-map'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-border h-[min(70vh,560px)] min-h-[360px] flex items-center justify-center text-sm text-muted-foreground gap-2 print:hidden">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading map…
    </div>
  ),
})

type MapPerson = {
  id: number
  lat: number
  lng: number
  label: string
  addressLine?: string | null
  party?: string | null
  effectiveParty?: string | null
  ageBucket?: string | null
  canvassStatus?: string | null
  district?: string | null
  phone?: string | null
  sortOrder?: number | null
}

function partyColor(party: string | null | undefined): string {
  const p = (party || '').toLowerCase()
  if (p === 'democrat') return '#2563eb'
  if (p === 'republican') return '#dc2626'
  if (p === 'independent') return '#ca8a04'
  if (p === 'unaffiliated') return '#64748b'
  return '#7c3aed'
}

function partyShort(party: string | null | undefined): string {
  const p = (party || '').toLowerCase()
  if (p === 'democrat') return 'D'
  if (p === 'republican') return 'R'
  if (p === 'independent') return 'I'
  if (p === 'unaffiliated') return 'U'
  return '?'
}

function PrintMapInner() {
  const searchParams = useSearchParams()
  const turfIdParam = searchParams.get('turfId')
  const turfId = turfIdParam ? Number(turfIdParam) : null

  const [people, setPeople] = useState<MapPerson[]>([])
  const [turfLabel, setTurfLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [partyFilter, setPartyFilter] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (turfId && Number.isFinite(turfId)) {
        const res = await fetch(`/api/dashboard/turfs/${turfId}?addresses=1`)
        const data = await res.json()
        if (!res.ok || !data.status) throw new Error(data.message || 'Failed to load turf')
        setTurfLabel(data.turf?.label || `Turf #${turfId}`)
        setPeople(
          (data.addresses || []).map((a: any) => ({
            id: a.voterGeoId,
            lat: a.latitude,
            lng: a.longitude,
            label: a.label,
            addressLine: [a.street, a.city, a.state, a.zip].filter(Boolean).join(', '),
            party: a.party,
            effectiveParty: a.party,
            canvassStatus: a.canvassStatus,
            sortOrder: a.sortOrder,
          }))
        )
      } else {
        setTurfLabel(null)
        const qs = new URLSearchParams()
        if (partyFilter.length) qs.set('party', partyFilter.join(','))
        const res = await fetch(`/api/dashboard/persons?${qs.toString()}`)
        const data = await res.json()
        if (!res.ok || !data.status) throw new Error(data.message || 'Failed to load households')
        setPeople(
          (data.people || []).map((p: any) => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            label: p.label,
            addressLine: p.addressLine,
            party: p.party,
            effectiveParty: p.effectiveParty,
            ageBucket: p.ageBucket,
            canvassStatus: p.canvassStatus,
            district: p.district,
            phone: p.phone,
          }))
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [partyFilter, turfId])

  useEffect(() => {
    void load()
  }, [load])

  const bounds = useMemo(() => {
    if (!people.length) return null
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const p of people) {
      minLat = Math.min(minLat, p.lat)
      maxLat = Math.max(maxLat, p.lat)
      minLng = Math.min(minLng, p.lng)
      maxLng = Math.max(maxLng, p.lng)
    }
    if (maxLat - minLat < 0.002) {
      minLat -= 0.001
      maxLat += 0.001
    }
    if (maxLng - minLng < 0.002) {
      minLng -= 0.001
      maxLng += 0.001
    }
    return { minLat, maxLat, minLng, maxLng }
  }, [people])

  const plot = useMemo(() => {
    if (!bounds) return []
    const w = 900
    const h = 640
    const pad = 36
    const { minLat, maxLat, minLng, maxLng } = bounds
    return people.map((p, i) => {
      const x = pad + ((p.lng - minLng) / (maxLng - minLng || 1)) * (w - pad * 2)
      const y = pad + (1 - (p.lat - minLat) / (maxLat - minLat || 1)) * (h - pad * 2)
      return { ...p, x, y, index: p.sortOrder || i + 1 }
    })
  }, [people, bounds])

  const walkList = useMemo(() => {
    if (turfId) {
      return [...plot].sort((a, b) => (a.sortOrder || a.index) - (b.sortOrder || b.index))
    }
    return [...plot].sort((a, b) => {
      if (Math.abs(b.lat - a.lat) > 0.0003) return b.lat - a.lat
      return a.lng - b.lng
    })
  }, [plot, turfId])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of people) {
      const key = p.effectiveParty || p.party || 'Unknown'
      c[key] = (c[key] || 0) + 1
    }
    return c
  }, [people])

  return (
    <div className="flex-1 p-2 w-full bg-background print:p-0 print:bg-white">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg print:shadow-none print:rounded-none">
        <div className="px-6 py-4 print:px-4 print:py-2 print:border-b print:border-black">
          <div className="flex items-center flex-wrap gap-2">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground print:hidden" />
            <div className="h-4 border-l border-border mx-4 print:hidden" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              {turfId ? <Route className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              {turfLabel
                ? `Walk sheet · ${turfLabel}`
                : 'Print on map · door-knock sheet'}
            </h1>
            <div className="ml-auto flex items-center gap-2 print:hidden">
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            </div>
          </div>
        </div>
        <div className="border-b border-border print:hidden" />

        <div className="p-6 space-y-6 print:p-4">
          {!turfId && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <span className="text-xs text-muted-foreground">Filter for print:</span>
              {['Democrat', 'Republican', 'Independent', 'Unaffiliated'].map((p) => {
                const on = partyFilter.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    className={`px-2 py-1 rounded text-xs border ${
                      on ? 'bg-sky-500/15 border-sky-500/40' : 'border-border text-muted-foreground'
                    }`}
                    onClick={() =>
                      setPartyFilter((prev) =>
                        on ? prev.filter((x) => x !== p) : [...prev, p]
                      )
                    }
                  >
                    {p}
                  </button>
                )
              })}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{' '}
              {turfId ? 'Loading turf walk-list…' : 'Loading households…'}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && !error && (
            <>
              <div className="flex flex-wrap gap-4 text-xs">
                <span>
                  <strong>{people.length}</strong> {turfId ? 'stops' : 'households'}
                </span>
                {Object.entries(counts).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: partyColor(k) }}
                    />
                    {k}: {v}
                  </span>
                ))}
                <span className="text-muted-foreground">
                  Printed {new Date().toLocaleString()}
                </span>
              </div>

              <PrintWalkMap
                title={
                  turfLabel
                    ? `${turfLabel}`
                    : 'Canvass map'
                }
                stops={walkList.map((p) => ({
                  id: p.id,
                  lat: p.lat,
                  lng: p.lng,
                  label: p.label,
                  addressLine: p.addressLine,
                  party: p.party,
                  effectiveParty: p.effectiveParty,
                  index: p.index,
                }))}
              />

              {/* Static SVG retained for print only */}
              <div className="hidden print:block rounded-lg border border-black overflow-hidden bg-white">
                <svg
                  viewBox="0 0 900 640"
                  className="w-full h-auto"
                  role="img"
                  aria-label="Canvass map print"
                >
                  <rect x="0" y="0" width="900" height="640" fill="#f8fafc" />
                  <text x="20" y="24" fontSize="14" fill="#0f172a" fontWeight="600">
                    {turfLabel
                      ? `${turfLabel} — numbers match turf walk order`
                      : 'Canvass map — numbers match walk list'}
                  </text>
                  {plot.map((p) => (
                    <g key={p.id}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={10}
                        fill={partyColor(p.effectiveParty || p.party)}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                      <text
                        x={p.x}
                        y={p.y + 3.5}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill="#fff"
                      >
                        {p.index}
                      </text>
                    </g>
                  ))}
                  <g transform="translate(20,600)">
                    {[
                      ['Democrat', '#2563eb'],
                      ['Republican', '#dc2626'],
                      ['Independent', '#ca8a04'],
                      ['Unaffiliated', '#64748b'],
                    ].map(([label, color], i) => (
                      <g key={label} transform={`translate(${i * 160},0)`}>
                        <circle cx="6" cy="0" r="6" fill={color} />
                        <text x="18" y="4" fontSize="11" fill="#334155">
                          {label}
                        </text>
                      </g>
                    ))}
                  </g>
                </svg>
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-2">
                  {turfId ? 'Walk list (turf sort order)' : 'Walk list (N→S, then W→E)'}
                </h2>
                <div className="overflow-x-auto rounded-lg border border-border print:border-black">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 print:bg-transparent">
                      <tr className="text-left border-b border-border print:border-black">
                        <th className="p-2 w-10">#</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Address</th>
                        <th className="p-2">Lean</th>
                        <th className="p-2">Door</th>
                        <th className="p-2 print:hidden">Phone</th>
                        <th className="p-2 w-28">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walkList.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-border/60 print:border-black/40 align-top"
                        >
                          <td className="p-2 font-semibold">
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                              style={{
                                background: partyColor(p.effectiveParty || p.party),
                              }}
                            >
                              {p.index}
                            </span>
                          </td>
                          <td className="p-2 font-medium">{p.label}</td>
                          <td className="p-2">{p.addressLine || '—'}</td>
                          <td className="p-2">
                            <span className="font-semibold">
                              {partyShort(p.effectiveParty || p.party)}
                            </span>{' '}
                            {p.effectiveParty || p.party || '—'}
                          </td>
                          <td className="p-2 capitalize">
                            {(p.canvassStatus || 'not_contacted').replace(/_/g, ' ')}
                          </td>
                          <td className="p-2 print:hidden">{p.phone || '—'}</td>
                          <td className="p-2">
                            <div className="h-6 border-b border-dashed border-muted-foreground/40 print:border-black/50" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          nav,
          aside,
          [data-sidebar],
          .print\\:hidden {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  )
}

/** Printable canvass map — Suspense for useSearchParams. */
export default function PrintMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading walk sheet…
        </div>
      }
    >
      <PrintMapInner />
    </Suspense>
  )
}
