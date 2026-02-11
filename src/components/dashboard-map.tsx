'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Users, FileText, Loader2, Globe } from 'lucide-react'

// ---------------------------------------------------------------------------
// State name <-> abbreviation lookups
// ---------------------------------------------------------------------------

const STATE_NAME_TO_ABBREV: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
}

const ABBREV_TO_STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBREV).map(([name, abbrev]) => [abbrev, name])
)

const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeoData {
  states: Record<string, { responses: number; surveys: number }>
  districts: Record<string, { responses: number; parties?: Record<string, number> }>
  points: { lat: number; lng: number; surveyId: number }[]
  totalResponses: number
  totalSurveys: number
  orgCenter?: { latitude: number; longitude: number; zoom: number; name: string } | null
}

interface PoliticalFeature {
  id: string
  name?: string
  state?: string
  pvi?: string
  pviNumeric?: number
  electoralVotes?: number
  margin2024?: number
  governorParty?: string
  senateSeats?: string
  incumbentName?: string
  incumbentParty?: string
  donations?: { dem: number; rep: number; other?: number }
  swing?: number
}

interface DistrictFeature {
  id: string
  state: string
  districtNumber: number
  pvi?: string
  pviNumeric?: number
  incumbentName?: string
  incumbentParty?: string
  margin2024?: number
  donations?: { dem: number; rep: number; other?: number }
}

interface DashboardMapProps {
  layers?: { political: boolean; districts: boolean; responses: boolean; voters: boolean }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pviToColor(pvi: number, alpha: number = 0.6): string {
  const clamped = Math.max(-30, Math.min(30, pvi))
  const t = (clamped + 30) / 60
  const r = Math.round(220 - t * 180)
  const b = Math.round(40 + t * 180)
  const g = Math.round(60 + (1 - Math.abs(t - 0.5) * 2) * 40)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardMap({ layers }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [statePoliticalData, setStatePoliticalData] = useState<PoliticalFeature[]>([])
  const [districtPoliticalData, setDistrictPoliticalData] = useState<DistrictFeature[]>([])
  const districtDataFetched = useRef(false)
  const [hoveredStateName, setHoveredStateName] = useState<string | null>(null)
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictFeature | null>(null)
  const { resolvedTheme } = useTheme()

  const showPoliticalLayer = layers?.political ?? true
  const showDistrictsLayer = layers?.districts ?? false
  const showSurveyLayer = layers?.responses ?? true
  const showVoterLayer = layers?.voters ?? true

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/dashboard/geo')
      .then(r => r.json())
      .then(d => { if (d.status) setGeoData(d) })
      .catch(e => console.error('Failed to fetch geo data:', e))
  }, [])

  useEffect(() => {
    fetch('/api/dashboard/political?zoom=4')
      .then(r => r.json())
      .then(d => { if (d.status && d.features?.length) setStatePoliticalData(d.features) })
      .catch(e => console.error('Failed to fetch political data:', e))
  }, [])

  // -----------------------------------------------------------------------
  // Map init — single effect, mirrors the working test-map page exactly
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let mapInstance: any = null

    const init = async () => {
      // 1. Load CSS from CDN and WAIT for it (critical for canvas sizing)
      if (!document.getElementById('maplibre-gl-css')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = MAPLIBRE_CSS_URL
        link.id = 'maplibre-gl-css'
        document.head.appendChild(link)
        await new Promise<void>(resolve => {
          link.onload = () => resolve()
          link.onerror = () => resolve()
          setTimeout(resolve, 3000)
        })
      }

      if (cancelled || !containerRef.current) return

      // 2. Import MapLibre
      const maplibregl = (await import('maplibre-gl')).default

      if (cancelled || !containerRef.current) return

      // 3. Create map
      const isDark = resolvedTheme === 'dark'
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: isDark
          ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
          : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-98.5, 39.8],
        zoom: 3.5,
        attributionControl: false,
      })

      mapInstance = map
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

      map.on('error', (e: any) => {
        console.error('[DashboardMap] error:', e?.error || e)
        if (!cancelled && status === 'loading') {
          setErrorMsg(e?.error?.message || 'Map failed to load')
          setStatus('error')
        }
      })

      map.on('load', () => {
        if (cancelled) return
        map.resize()
        setStatus('ready')

        // ---- State boundaries ----
        map.addSource('us-states', { type: 'geojson', data: US_STATES_GEOJSON_URL })

        map.addLayer({
          id: 'state-fills', type: 'fill', source: 'us-states',
          paint: { 'fill-color': 'rgba(59, 130, 246, 0.03)', 'fill-opacity': 0.8 },
        })
        map.addLayer({
          id: 'state-political-fills', type: 'fill', source: 'us-states',
          paint: { 'fill-color': 'rgba(128, 128, 128, 0.1)', 'fill-opacity': 0.7 },
        })
        map.addLayer({
          id: 'state-borders', type: 'line', source: 'us-states',
          paint: {
            'line-color': isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)',
            'line-width': 1,
          },
        })
        map.addLayer({
          id: 'state-hover', type: 'line', source: 'us-states',
          filter: ['==', ['get', 'name'], ''],
          paint: { 'line-color': '#3b82f6', 'line-width': 2.5 },
        })

        // ---- Congressional district boundaries (119th Congress) ----
        map.addSource('us-districts', {
          type: 'geojson',
          data: '/data/cd-119.geojson',
        })
        map.addLayer({
          id: 'district-fills', type: 'fill', source: 'us-districts',
          layout: { visibility: 'none' },
          paint: { 'fill-color': 'rgba(128, 128, 128, 0.1)', 'fill-opacity': 0.65 },
        })
        map.addLayer({
          id: 'district-borders', type: 'line', source: 'us-districts',
          layout: { visibility: 'none' },
          paint: {
            'line-color': isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
            'line-width': 0.8,
          },
        })
        map.addLayer({
          id: 'district-hover', type: 'line', source: 'us-districts',
          layout: { visibility: 'none' },
          filter: ['==', ['get', 'district_code'], ''],
          paint: { 'line-color': '#f97316', 'line-width': 2.5 },
        })

        // ---- Response points ----
        map.addSource('response-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'response-heatmap', type: 'heatmap', source: 'response-points',
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)', 0.1, 'rgba(59,130,246,0.2)',
              0.3, 'rgba(59,130,246,0.4)', 0.5, 'rgba(99,102,241,0.6)',
              0.7, 'rgba(139,92,246,0.7)', 1, 'rgba(168,85,247,0.85)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 12, 30],
            'heatmap-opacity': 0.8,
          },
        })
        map.addLayer({
          id: 'response-points-circles', type: 'circle', source: 'response-points',
          minzoom: 8,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8],
            'circle-color': '#6366f1', 'circle-opacity': 0.7,
            'circle-stroke-width': 1,
            'circle-stroke-color': isDark ? '#1e1b4b' : '#fff',
          },
        })

        // Fly to centre
        setTimeout(() => {
          if (cancelled) return
          map.flyTo({
            center: [-77.0369, 38.9072],
            zoom: 10, duration: 2800, curve: 1.42,
            easing: (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
          })
        }, 600)
      })

      // ---- Hover interactions ----
      let hoveredName: string | null = null
      map.on('mousemove', 'state-political-fills', (e: any) => {
        if (e.features?.length) {
          const name = e.features[0].properties?.name || ''
          if (name !== hoveredName) {
            hoveredName = name
            map.setFilter('state-hover', ['==', ['get', 'name'], name])
            map.getCanvas().style.cursor = 'pointer'
            setHoveredStateName(name)
          }
        }
      })
      map.on('mouseleave', 'state-political-fills', () => {
        hoveredName = null
        map.setFilter('state-hover', ['==', ['get', 'name'], ''])
        map.getCanvas().style.cursor = ''
        setHoveredStateName(null)
      })
      map.on('click', 'state-political-fills', (e: any) => {
        if (e.features?.length) {
          const feature = e.features[0]
          if (feature.geometry?.type === 'MultiPolygon' || feature.geometry?.type === 'Polygon') {
            const bounds = new maplibregl.LngLatBounds()
            const coords = feature.geometry.type === 'Polygon'
              ? [feature.geometry.coordinates] : feature.geometry.coordinates
            for (const polygon of coords)
              for (const ring of polygon)
                for (const coord of ring)
                  bounds.extend(coord as [number, number])
            map.fitBounds(bounds, { padding: 60, duration: 1200 })
          }
        }
      })

      // ---- District hover interactions ----
      let hoveredDistrictCode: string | null = null
      map.on('mousemove', 'district-fills', (e: any) => {
        if (e.features?.length) {
          const code = e.features[0].properties?.district_code || ''
          if (code !== hoveredDistrictCode) {
            hoveredDistrictCode = code
            map.setFilter('district-hover', ['==', ['get', 'district_code'], code])
            map.getCanvas().style.cursor = 'pointer'
            setHoveredDistrict(prev => {
              // Dispatch the district code; the tooltip will look up full data from state
              return { id: code, state: e.features[0].properties?.state || '', districtNumber: e.features[0].properties?.district_number || 0 }
            })
          }
        }
      })
      map.on('mouseleave', 'district-fills', () => {
        hoveredDistrictCode = null
        map.setFilter('district-hover', ['==', ['get', 'district_code'], ''])
        map.getCanvas().style.cursor = ''
        setHoveredDistrict(null)
      })
      map.on('click', 'district-fills', (e: any) => {
        if (e.features?.length) {
          const feature = e.features[0]
          if (feature.geometry?.type === 'MultiPolygon' || feature.geometry?.type === 'Polygon') {
            const bounds = new maplibregl.LngLatBounds()
            const coords = feature.geometry.type === 'Polygon'
              ? [feature.geometry.coordinates] : feature.geometry.coordinates
            for (const polygon of coords)
              for (const ring of polygon)
                for (const coord of ring)
                  bounds.extend(coord as [number, number])
            map.fitBounds(bounds, { padding: 60, duration: 1200 })
          }
        }
      })
    }

    const timeout = setTimeout(() => {
      // Only show error if this mount is still active AND map hasn't loaded
      if (!cancelled && !mapRef.current) {
        setErrorMsg('Map is taking too long to load. Please refresh.')
        setStatus('error')
      }
    }, 20000)

    init().catch(err => {
      if (!cancelled) {
        setErrorMsg(err?.message || 'Map initialization failed.')
        setStatus('error')
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (mapInstance) { mapInstance.remove(); mapInstance = null }
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // Update survey data
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !geoData) return
    const map = mapRef.current

    const stateEntries = Object.entries(geoData.states)
    let fillColor: any = 'rgba(59, 130, 246, 0.03)'
    if (stateEntries.length > 0) {
      const maxR = Math.max(1, ...stateEntries.map(([, s]) => s.responses))
      const expr: any[] = ['match', ['get', 'name']]
      for (const [name, data] of stateEntries) {
        if (name) {
          const alpha = 0.1 + Math.min(1, data.responses / maxR) * 0.6
          expr.push(name, `rgba(59, 130, 246, ${alpha})`)
        }
      }
      if (expr.length > 2) { expr.push('rgba(59, 130, 246, 0.03)'); fillColor = expr }
    }
    try { map.setPaintProperty('state-fills', 'fill-color', fillColor) } catch {}

    if (geoData.points.length > 0) {
      const features = geoData.points.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { surveyId: p.surveyId },
      }))
      const src = map.getSource('response-points')
      if (src) src.setData({ type: 'FeatureCollection', features })
    }

    if (geoData.orgCenter) {
      map.flyTo({
        center: [geoData.orgCenter.longitude, geoData.orgCenter.latitude],
        zoom: geoData.orgCenter.zoom || 10, duration: 2800, curve: 1.42,
        easing: (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
      })
    }
  }, [geoData, status])

  // Update PVI choropleth
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !statePoliticalData.length) return
    const map = mapRef.current
    const expr: any[] = ['match', ['get', 'name']]
    for (const f of statePoliticalData) {
      const fullName = ABBREV_TO_STATE_NAME[f.id]
      if (fullName) expr.push(fullName, pviToColor(f.pviNumeric || 0, 0.5))
    }
    if (expr.length > 2) {
      expr.push('rgba(128, 128, 128, 0.05)')
      try { map.setPaintProperty('state-political-fills', 'fill-color', expr) } catch {}
    }
  }, [statePoliticalData, status])

  // -----------------------------------------------------------------------
  // Fetch district political data (once, when layer is first enabled)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!showDistrictsLayer || districtDataFetched.current) return
    districtDataFetched.current = true
    fetch('/api/dashboard/political?zoom=6')
      .then(r => r.json())
      .then(d => {
        if (d.status && d.features?.length) setDistrictPoliticalData(d.features)
      })
      .catch(e => console.error('Failed to fetch district political data:', e))
  }, [showDistrictsLayer])

  // Color district fills by PVI
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !districtPoliticalData.length) return
    const map = mapRef.current
    const expr: any[] = ['match', ['get', 'district_code']]
    for (const d of districtPoliticalData) {
      expr.push(d.id, pviToColor(d.pviNumeric || 0, 0.55))
    }
    if (expr.length > 2) {
      expr.push('rgba(128, 128, 128, 0.08)')
      try { map.setPaintProperty('district-fills', 'fill-color', expr) } catch {}
    }
  }, [districtPoliticalData, status])

  // -----------------------------------------------------------------------
  // Layer visibility
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    try { mapRef.current.setLayoutProperty('state-fills', 'visibility', showSurveyLayer ? 'visible' : 'none') } catch {}
  }, [showSurveyLayer, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    try {
      mapRef.current.setLayoutProperty('response-heatmap', 'visibility', showVoterLayer ? 'visible' : 'none')
      mapRef.current.setLayoutProperty('response-points-circles', 'visibility', showVoterLayer ? 'visible' : 'none')
    } catch {}
  }, [showVoterLayer, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    try { mapRef.current.setLayoutProperty('state-political-fills', 'visibility', showPoliticalLayer ? 'visible' : 'none') } catch {}
  }, [showPoliticalLayer, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const vis = showDistrictsLayer ? 'visible' : 'none'
    try {
      mapRef.current.setLayoutProperty('district-fills', 'visibility', vis)
      mapRef.current.setLayoutProperty('district-borders', 'visibility', vis)
      mapRef.current.setLayoutProperty('district-hover', 'visibility', vis)
    } catch {}
  }, [showDistrictsLayer, status])

  const resetView = useCallback(() => {
    if (!mapRef.current) return
    const center = geoData?.orgCenter
    mapRef.current.flyTo({
      center: center ? [center.longitude, center.latitude] : [-77.0369, 38.9072],
      zoom: center?.zoom || 10, duration: 1500,
    })
  }, [geoData])

  // -----------------------------------------------------------------------
  // Tooltip — supports both state and district hover
  // -----------------------------------------------------------------------
  const districtTooltipData = hoveredDistrict && showDistrictsLayer
    ? districtPoliticalData.find(d => d.id === hoveredDistrict.id) || hoveredDistrict
    : null

  const tooltipData = hoveredStateName
    ? (() => {
        const abbrev = STATE_NAME_TO_ABBREV[hoveredStateName] || ''
        const surveyState = geoData?.states?.[hoveredStateName]
        const surveyInfo = surveyState ? { name: hoveredStateName, ...surveyState } : null
        const politicalInfo = statePoliticalData.find(f => f.id === abbrev) || null
        if (!surveyInfo && !politicalInfo) return null
        return { surveyInfo, politicalInfo }
      })()
    : null

  // -----------------------------------------------------------------------
  // Render — use inline styles for the container, exactly like test-map
  // -----------------------------------------------------------------------
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
          className="bg-background/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
          className="bg-background/80 backdrop-blur-sm p-4"
        >
          <p className="text-sm text-destructive text-center max-w-md">{errorMsg}</p>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 80, right: 12, zIndex: 10 }}>
        <Button size="sm" variant="outline"
          className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg h-7 w-7 p-0"
          onClick={resetView}
        >
          <Globe className="h-3 w-3" />
        </Button>
      </div>

      {/* District tooltip (takes priority when hovering a district) */}
      {districtTooltipData && !tooltipData && (() => {
        const d = districtTooltipData as DistrictFeature
        return (
          <div
            style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
            className="pointer-events-none select-none bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[200px] max-w-[280px]"
          >
            <p className="font-semibold text-sm">
              {d.id}{d.districtNumber === 0 && ' (At-Large)'}
            </p>
            {d.incumbentName && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Incumbent</span>
                <span className={`text-xs font-medium ${d.incumbentParty === 'D' ? 'text-blue-400' : d.incumbentParty === 'R' ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {d.incumbentName} ({d.incumbentParty})
                </span>
              </div>
            )}
            {d.pvi && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">PVI</span>
                <span className={`text-xs font-bold ${(d.pviNumeric || 0) > 0 ? 'text-blue-400' : (d.pviNumeric || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {d.pvi}
                </span>
              </div>
            )}
            {d.margin2024 !== undefined && d.margin2024 !== 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">2024 Margin</span>
                <span className={`text-xs font-medium ${(d.margin2024 || 0) > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {(d.margin2024 || 0) > 0 ? 'D' : 'R'}+{Math.abs(d.margin2024 || 0).toFixed(1)}
                </span>
              </div>
            )}
            {d.donations && (
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                <span className="text-blue-400">${(d.donations.dem / 1000).toFixed(0)}k Dem</span>
                <span className="text-red-400">${(d.donations.rep / 1000).toFixed(0)}k Rep</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* State tooltip */}
      {tooltipData && (
        <div
          style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
          className="pointer-events-none select-none bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[200px] max-w-[280px]"
        >
          <p className="font-semibold text-sm">
            {tooltipData.politicalInfo?.name || tooltipData.surveyInfo?.name || hoveredStateName}
          </p>
          {tooltipData.politicalInfo && showPoliticalLayer && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">PVI</span>
                <span className={`text-xs font-bold ${(tooltipData.politicalInfo.pviNumeric || 0) > 0 ? 'text-blue-400' : (tooltipData.politicalInfo.pviNumeric || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {tooltipData.politicalInfo.pvi}
                </span>
              </div>
              {tooltipData.politicalInfo.margin2024 !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">2024 Margin</span>
                  <span className={`text-xs font-medium ${tooltipData.politicalInfo.margin2024 > 0 ? 'text-blue-400' : tooltipData.politicalInfo.margin2024 < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {tooltipData.politicalInfo.margin2024 > 0 ? 'D' : 'R'}+{Math.abs(tooltipData.politicalInfo.margin2024).toFixed(1)}
                  </span>
                </div>
              )}
              {tooltipData.politicalInfo.electoralVotes && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Electoral Votes</span>
                  <span className="text-xs font-medium">{tooltipData.politicalInfo.electoralVotes}</span>
                </div>
              )}
              {tooltipData.politicalInfo.governorParty && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Governor</span>
                  <span className={`text-xs font-medium ${tooltipData.politicalInfo.governorParty === 'D' ? 'text-blue-400' : 'text-red-400'}`}>
                    {tooltipData.politicalInfo.governorParty === 'D' ? 'Democrat' : 'Republican'}
                  </span>
                </div>
              )}
              {tooltipData.politicalInfo.senateSeats && tooltipData.politicalInfo.senateSeats !== '-' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Senate</span>
                  <span className="text-xs font-medium">{tooltipData.politicalInfo.senateSeats}</span>
                </div>
              )}
            </div>
          )}
          {tooltipData.surveyInfo && showSurveyLayer && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{tooltipData.surveyInfo.responses} responses</span>
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{tooltipData.surveyInfo.surveys} surveys</span>
            </div>
          )}
        </div>
      )}

      {geoData?.orgCenter && (
        <div className="absolute bottom-3 left-3 z-10">
          <div className="bg-background/80 backdrop-blur-md rounded-lg border border-border/50 px-3 py-2 shadow-lg">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium">{geoData.orgCenter.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
