'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  Users,
  FileText,
  Loader2,
  Globe,
} from 'lucide-react'

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

// Public GeoJSON of US state boundaries (free, no API key required)
const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

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

interface DashboardMapProps {
  className?: string
  /** Layer visibility controlled from parent (right panel) */
  layers?: { political: boolean; responses: boolean; voters: boolean }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a PVI numeric value (-25 to +25) to a red-blue colour */
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

export default function DashboardMap({ className, layers }: DashboardMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [statePoliticalData, setStatePoliticalData] = useState<PoliticalFeature[]>([])
  const [hoveredStateName, setHoveredStateName] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const { resolvedTheme } = useTheme()

  // Derive layer visibility from props (default all on)
  const showPoliticalLayer = layers?.political ?? true
  const showSurveyLayer = layers?.responses ?? true
  const showVoterLayer = layers?.voters ?? true

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  // Survey geo data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/dashboard/geo')
        const data = await res.json()
        if (data.status) setGeoData(data)
      } catch (err) {
        console.error('Failed to fetch geo data:', err)
      }
    }
    fetchData()
  }, [])

  // State-level political data (fetched once)
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await fetch('/api/dashboard/political?zoom=4')
        const data = await res.json()
        if (data.status && data.features?.length > 0) {
          setStatePoliticalData(data.features)
        }
      } catch (err) {
        console.error('Failed to fetch state political data:', err)
      }
    }
    fetchStates()
  }, [])

  // -----------------------------------------------------------------------
  // Map initialisation
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    let cancelled = false

    const initMap = async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      await import('mapbox-gl/dist/mapbox-gl.css')

      if (cancelled || !mapContainer.current) return

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) {
        console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not set')
        setLoading(false)
        return
      }

      mapboxgl.accessToken = token
      const isDark = resolvedTheme === 'dark'

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
        center: [-98.5, 39.8],
        zoom: 3.5,
        pitch: 0,
        bearing: 0,
        projection: 'mercator',
        attributionControl: false,
        fadeDuration: 0,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

      map.on('load', () => {
        if (cancelled) return
        setMapReady(true)
        setLoading(false)

        // ---- US state boundaries from public GeoJSON -----------------------
        map.addSource('us-states', {
          type: 'geojson',
          data: US_STATES_GEOJSON_URL,
        })

        // Survey data choropleth (blue intensity by response count)
        map.addLayer({
          id: 'state-fills',
          type: 'fill',
          source: 'us-states',
          paint: {
            'fill-color': 'rgba(59, 130, 246, 0.03)',
            'fill-opacity': 0.8,
          },
        })

        // Political PVI choropleth (red-blue)
        map.addLayer({
          id: 'state-political-fills',
          type: 'fill',
          source: 'us-states',
          paint: {
            'fill-color': 'rgba(128, 128, 128, 0.1)',
            'fill-opacity': 0.7,
          },
        })

        // State border lines
        map.addLayer({
          id: 'state-borders',
          type: 'line',
          source: 'us-states',
          paint: {
            'line-color': isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)',
            'line-width': 1,
          },
        })

        // Hover highlight ring
        map.addLayer({
          id: 'state-hover',
          type: 'line',
          source: 'us-states',
          filter: ['==', ['get', 'name'], ''],
          paint: { 'line-color': '#3b82f6', 'line-width': 2.5 },
        })

        // ---- Response points (canvass GPS) ---------------------------------
        map.addSource('response-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        map.addLayer({
          id: 'response-heatmap',
          type: 'heatmap',
          source: 'response-points',
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.1, 'rgba(59, 130, 246, 0.2)',
              0.3, 'rgba(59, 130, 246, 0.4)',
              0.5, 'rgba(99, 102, 241, 0.6)',
              0.7, 'rgba(139, 92, 246, 0.7)',
              1, 'rgba(168, 85, 247, 0.85)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 12, 30],
            'heatmap-opacity': 0.8,
          },
        })

        map.addLayer({
          id: 'response-points-circles',
          type: 'circle',
          source: 'response-points',
          minzoom: 8,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8],
            'circle-color': '#6366f1',
            'circle-opacity': 0.7,
            'circle-stroke-width': 1,
            'circle-stroke-color': isDark ? '#1e1b4b' : '#ffffff',
          },
        })

        // Fly to org centre
        setTimeout(() => {
          if (cancelled) return
          const center = geoData?.orgCenter
          map.flyTo({
            center: center ? [center.longitude, center.latitude] : [-77.0369, 38.9072],
            zoom: center?.zoom || 10,
            duration: 2800,
            curve: 1.42,
            easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
          })
        }, 600)
      })

      // ---- Hover interactions -----------------------------------------------
      let hoveredName: string | null = null

      map.on('mousemove', 'state-political-fills', (e: any) => {
        if (e.features && e.features.length > 0) {
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

      // Click to zoom into state
      map.on('click', 'state-political-fills', (e: any) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          if (feature.geometry?.type === 'MultiPolygon' || feature.geometry?.type === 'Polygon') {
            const bounds = new mapboxgl.LngLatBounds()
            const coords = feature.geometry.type === 'Polygon'
              ? [feature.geometry.coordinates]
              : feature.geometry.coordinates
            for (const polygon of coords) {
              for (const ring of polygon) {
                for (const coord of ring) {
                  bounds.extend(coord as [number, number])
                }
              }
            }
            map.fitBounds(bounds, { padding: 60, duration: 1200 })
          }
        }
      })
    }

    initMap()

    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // Update survey data layers
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current || !geoData) return
    const map = mapRef.current

    // State survey choropleth — match on full state name
    const stateEntries = Object.entries(geoData.states)
    const defaultColor = 'rgba(59, 130, 246, 0.03)'
    let fillColor: any = defaultColor

    if (stateEntries.length > 0) {
      const maxR = Math.max(1, ...stateEntries.map(([, s]) => s.responses))
      const expr: any[] = ['match', ['get', 'name']]
      for (const [name, data] of stateEntries) {
        // name is already the full state name from the API
        if (name) {
          const alpha = 0.1 + Math.min(1, data.responses / maxR) * 0.6
          expr.push(name, `rgba(59, 130, 246, ${alpha})`)
        }
      }
      if (expr.length > 2) { expr.push(defaultColor); fillColor = expr }
    }

    try { map.setPaintProperty('state-fills', 'fill-color', fillColor) } catch {}

    // Response points
    if (geoData.points.length > 0) {
      const features = geoData.points.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { surveyId: p.surveyId },
      }))
      const src = map.getSource('response-points')
      if (src) src.setData({ type: 'FeatureCollection', features })
    }

    // Fly to org centre if loaded after map init
    if (geoData.orgCenter) {
      map.flyTo({
        center: [geoData.orgCenter.longitude, geoData.orgCenter.latitude],
        zoom: geoData.orgCenter.zoom || 10,
        duration: 2800,
        curve: 1.42,
        easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
      })
    }
  }, [geoData, mapReady])

  // -----------------------------------------------------------------------
  // Update political PVI choropleth (from stable state data)
  //  — match on full state name from the GeoJSON properties.name
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current || statePoliticalData.length === 0) return
    const map = mapRef.current

    const expr: any[] = ['match', ['get', 'name']]
    for (const f of statePoliticalData) {
      const fullName = ABBREV_TO_STATE_NAME[f.id]
      if (fullName) {
        expr.push(fullName, pviToColor(f.pviNumeric || 0, 0.5))
      }
    }
    if (expr.length > 2) {
      expr.push('rgba(128, 128, 128, 0.05)')
      try {
        map.setPaintProperty('state-political-fills', 'fill-color', expr)
      } catch (e) {
        console.warn('Failed to set political fill color:', e)
      }
    }
  }, [statePoliticalData, mapReady])

  // -----------------------------------------------------------------------
  // Layer visibility toggles
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    try { map.setLayoutProperty('state-fills', 'visibility', showSurveyLayer ? 'visible' : 'none') } catch {}
  }, [showSurveyLayer, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    try {
      map.setLayoutProperty('response-heatmap', 'visibility', showVoterLayer ? 'visible' : 'none')
      map.setLayoutProperty('response-points-circles', 'visibility', showVoterLayer ? 'visible' : 'none')
    } catch {}
  }, [showVoterLayer, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    try { map.setLayoutProperty('state-political-fills', 'visibility', showPoliticalLayer ? 'visible' : 'none') } catch {}
  }, [showPoliticalLayer, mapReady])

  const resetView = useCallback(() => {
    if (!mapRef.current) return
    const center = geoData?.orgCenter
    mapRef.current.flyTo({
      center: center ? [center.longitude, center.latitude] : [-77.0369, 38.9072],
      zoom: center?.zoom || 10,
      duration: 1500,
    })
  }, [geoData])

  // -----------------------------------------------------------------------
  // Tooltip data for hovered state
  // -----------------------------------------------------------------------
  const tooltipData = hoveredStateName
    ? (() => {
        const abbrev = STATE_NAME_TO_ABBREV[hoveredStateName] || ''

        // Survey data (keyed by full state name)
        const surveyState = geoData?.states?.[hoveredStateName]
        const surveyInfo = surveyState
          ? { name: hoveredStateName, ...surveyState }
          : null

        // Political data (keyed by 2-letter abbreviation)
        const politicalInfo = statePoliticalData.find(f => f.id === abbrev) || null

        if (!surveyInfo && !politicalInfo) return null
        return { surveyInfo, politicalInfo }
      })()
    : null

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className={`relative rounded-lg overflow-hidden border border-border ${className || ''}`}>
      <div ref={mapContainer} className="w-full h-full min-h-[400px]" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}

      {/* Reset view button — top right (toggle buttons moved to right panel) */}
      <div className="absolute top-3 right-3 z-10">
        <Button
          size="sm"
          variant="outline"
          className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg h-7 w-7 p-0"
          onClick={resetView}
        >
          <Globe className="h-3 w-3" />
        </Button>
      </div>

      {/* Enriched hover tooltip */}
      {tooltipData && (
        <div className="absolute top-3 left-3 z-10 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[200px] max-w-[280px]">
          <p className="font-semibold text-sm">
            {tooltipData.politicalInfo?.name || tooltipData.surveyInfo?.name || hoveredStateName}
          </p>

          {/* Political info */}
          {tooltipData.politicalInfo && showPoliticalLayer && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">PVI</span>
                <span className={`text-xs font-bold ${
                  (tooltipData.politicalInfo.pviNumeric || 0) > 0 ? 'text-blue-400' :
                  (tooltipData.politicalInfo.pviNumeric || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'
                }`}>
                  {tooltipData.politicalInfo.pvi}
                </span>
              </div>
              {tooltipData.politicalInfo.margin2024 !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">2024 Margin</span>
                  <span className={`text-xs font-medium ${
                    tooltipData.politicalInfo.margin2024 > 0 ? 'text-blue-400' :
                    tooltipData.politicalInfo.margin2024 < 0 ? 'text-red-400' : 'text-muted-foreground'
                  }`}>
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
                  <span className={`text-xs font-medium ${
                    tooltipData.politicalInfo.governorParty === 'D' ? 'text-blue-400' : 'text-red-400'
                  }`}>
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

          {/* Survey info */}
          {tooltipData.surveyInfo && showSurveyLayer && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {tooltipData.surveyInfo.responses} responses
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {tooltipData.surveyInfo.surveys} surveys
              </span>
            </div>
          )}
        </div>
      )}

      {/* Org label — bottom left */}
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

      {/* PVI legend moved to right panel */}
    </div>
  )
}
