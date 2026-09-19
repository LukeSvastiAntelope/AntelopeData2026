'use client'

/**
 * Interactive walk-sheet map (MapLibre) for /dashboard/print-map.
 * Pan / zoom / street basemap; numbered party-colored stops.
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Minus, Plus, Maximize2 } from 'lucide-react'

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'

export type WalkMapStop = {
  id: number
  lat: number
  lng: number
  label: string
  addressLine?: string | null
  party?: string | null
  effectiveParty?: string | null
  index: number
}

function partyColor(party: string | null | undefined): string {
  const p = (party || '').toLowerCase()
  if (p === 'democrat') return '#2563eb'
  if (p === 'republican') return '#dc2626'
  if (p === 'independent') return '#ca8a04'
  if (p === 'unaffiliated') return '#64748b'
  return '#7c3aed'
}

type Props = {
  stops: WalkMapStop[]
  title?: string
}

export default function PrintWalkMap({ stops, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let mapInstance: any = null

    const init = async () => {
      if (!document.getElementById('maplibre-gl-css')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = MAPLIBRE_CSS_URL
        link.id = 'maplibre-gl-css'
        document.head.appendChild(link)
        await new Promise<void>((resolve) => {
          link.onload = () => resolve()
          link.onerror = () => resolve()
          setTimeout(resolve, 3000)
        })
      }
      if (cancelled || !containerRef.current) return

      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !containerRef.current) return

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-98.5, 39.8],
        zoom: 3.5,
        attributionControl: { compact: true },
      })

      mapInstance = map
      mapRef.current = map
      // Built-in zoom +/− (also mirrored by custom buttons for clarity)
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left')

      map.on('error', (e: any) => {
        console.error('[PrintWalkMap]', e?.error || e)
        if (!cancelled) setError(e?.error?.message || 'Map failed to load')
      })

      map.on('load', () => {
        if (cancelled) return
        map.resize()

        map.addSource('walk-stops', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        map.addLayer({
          id: 'walk-stops-circles',
          type: 'circle',
          source: 'walk-stops',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 12, 17, 16],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.95,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })

        map.addLayer({
          id: 'walk-stops-labels',
          type: 'symbol',
          source: 'walk-stops',
          layout: {
            'text-field': ['to-string', ['get', 'index']],
            'text-size': 11,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(15,23,42,0.35)',
            'text-halo-width': 1,
          },
        })

        map.on('click', 'walk-stops-circles', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          const coords = f.geometry.coordinates.slice()
          const props = f.properties || {}
          new maplibregl.Popup({ offset: 12, closeButton: true })
            .setLngLat(coords)
            .setHTML(
              `<div style="font:12px/1.4 system-ui,sans-serif;max-width:220px">
                <strong>#${props.index}</strong> · ${props.label || 'Stop'}<br/>
                <span style="color:#64748b">${props.address || ''}</span><br/>
                <span>${props.party || 'Unknown lean'}</span>
              </div>`
            )
            .addTo(map)
        })
        map.on('mouseenter', 'walk-stops-circles', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'walk-stops-circles', () => {
          map.getCanvas().style.cursor = ''
        })

        setReady(true)
      })
    }

    init().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Map init failed')
    })

    return () => {
      cancelled = true
      if (mapInstance) {
        mapInstance.remove()
        mapInstance = null
      }
      mapRef.current = null
    }
  }, [])

  // Push stops + fit bounds when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    const features = stops
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          index: s.index,
          label: s.label,
          address: s.addressLine || '',
          party: s.effectiveParty || s.party || 'Unknown',
          color: partyColor(s.effectiveParty || s.party),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      }))

    const src = map.getSource('walk-stops')
    if (src) {
      src.setData({ type: 'FeatureCollection', features })
    }

    if (features.length === 0) return

    import('maplibre-gl').then((mod) => {
      const maplibregl = mod.default
      const bounds = new maplibregl.LngLatBounds()
      for (const f of features) {
        bounds.extend(f.geometry.coordinates as [number, number])
      }
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 16,
        duration: 600,
      })
    })
  }, [ready, stops])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: 200 })
  }

  const fitAll = () => {
    const map = mapRef.current
    if (!map || !stops.length) return
    import('maplibre-gl').then((mod) => {
      const maplibregl = mod.default
      const bounds = new maplibregl.LngLatBounds()
      for (const s of stops) {
        if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
          bounds.extend([s.lng, s.lat])
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 400 })
      }
    })
  }

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-slate-100 print:hidden">
      <div className="absolute top-2 left-2 z-10 max-w-[70%] rounded-md bg-background/90 backdrop-blur px-2 py-1.5 shadow text-[11px] text-foreground border border-border/60">
        <p className="font-medium truncate">
          {title || 'Canvass map'} — drag to pan · scroll to zoom
        </p>
        <p className="text-muted-foreground text-[10px]">
          Numbers match the walk list below · click a pin for details
        </p>
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 print:hidden">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow"
          onClick={() => zoomBy(1)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow"
          onClick={() => zoomBy(-1)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow"
          onClick={fitAll}
          title="Fit all stops"
          aria-label="Fit all stops"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-3 rounded-md bg-background/90 backdrop-blur px-2 py-1 text-[10px] border border-border/60 shadow">
        {[
          ['Democrat', '#2563eb'],
          ['Republican', '#dc2626'],
          ['Independent', '#ca8a04'],
          ['Unaffiliated', '#64748b'],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {!ready && !error && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-100/80 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading street map…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-100 text-sm text-destructive p-4 text-center">
          {error}
        </div>
      )}

      <div ref={containerRef} className="w-full h-[min(70vh,560px)] min-h-[360px]" />
    </div>
  )
}
