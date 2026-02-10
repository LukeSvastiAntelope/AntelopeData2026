'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { 
  MapPin, 
  Users, 
  FileText, 
  Vote,
  Loader2,
  Globe,
} from 'lucide-react'

// State FIPS codes for Mapbox boundaries tileset
const STATE_FIPS: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
  'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12', 'GA': '13', 'HI': '15',
  'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21',
  'LA': '22', 'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27',
  'MS': '28', 'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
  'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46',
  'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53',
  'WV': '54', 'WI': '55', 'WY': '56',
}

// Full state name to abbreviation
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

interface GeoData {
  states: Record<string, { responses: number; surveys: number }>
  districts: Record<string, { responses: number; parties?: Record<string, number> }>
  points: { lat: number; lng: number; surveyId: number }[]
  totalResponses: number
  totalSurveys: number
  orgCenter?: { latitude: number; longitude: number; zoom: number; name: string } | null
}

interface DashboardMapProps {
  className?: string
}

export default function DashboardMap({ className }: DashboardMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [showSurveyLayer, setShowSurveyLayer] = useState(true)
  const [showVoterLayer, setShowVoterLayer] = useState(true)
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const { resolvedTheme } = useTheme()

  // Fetch geo data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/dashboard/geo')
        const data = await res.json()
        if (data.status) {
          setGeoData(data)
        }
      } catch (err) {
        console.error('Failed to fetch geo data:', err)
      }
    }
    fetchData()
  }, [])

  // Initialize Mapbox
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
        center: [-98.5, 39.8], // Center of US
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

        // Add US states source (GeoJSON from Mapbox)
        map.addSource('us-states', {
          type: 'vector',
          url: 'mapbox://mapbox.boundaries-adm1-v4',
        })

        // State fill layer (choropleth)
        map.addLayer({
          id: 'state-fills',
          type: 'fill',
          source: 'us-states',
          'source-layer': 'boundaries_admin_1',
          filter: ['==', ['get', 'iso_3166_1'], 'US'],
          paint: {
            'fill-color': 'rgba(59, 130, 246, 0.05)',
            'fill-opacity': 0.8,
          },
        })

        // State border layer
        map.addLayer({
          id: 'state-borders',
          type: 'line',
          source: 'us-states',
          'source-layer': 'boundaries_admin_1',
          filter: ['==', ['get', 'iso_3166_1'], 'US'],
          paint: {
            'line-color': isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
            'line-width': 0.8,
          },
        })

        // State hover highlight layer
        map.addLayer({
          id: 'state-hover',
          type: 'line',
          source: 'us-states',
          'source-layer': 'boundaries_admin_1',
          filter: ['==', ['get', 'iso_3166_1_alpha2'], ''],
          paint: {
            'line-color': '#3b82f6',
            'line-width': 2,
          },
        })

        // Points source for canvass GPS data
        map.addSource('response-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Heatmap layer for response density
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

        // Point circles (visible at higher zoom)
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

        // Fly to org center after a brief pause
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

      // Hover interactions
      let hoveredId: string | null = null

      map.on('mousemove', 'state-fills', (e: any) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          const stateCode = feature.properties?.iso_3166_1_alpha2 || ''
          if (stateCode !== hoveredId) {
            hoveredId = stateCode
            map.setFilter('state-hover', ['==', ['get', 'iso_3166_1_alpha2'], stateCode])
            map.getCanvas().style.cursor = 'pointer'
            setHoveredState(stateCode)
          }
        }
      })

      map.on('mouseleave', 'state-fills', () => {
        hoveredId = null
        map.setFilter('state-hover', ['==', ['get', 'iso_3166_1_alpha2'], ''])
        map.getCanvas().style.cursor = ''
        setHoveredState(null)
      })

      // Click to zoom
      map.on('click', 'state-fills', (e: any) => {
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
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update map data when geoData changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !geoData) return

    const map = mapRef.current

    // Build state color expression based on response data
    const stateEntries = Object.entries(geoData.states)
    const defaultColor = 'rgba(59, 130, 246, 0.03)'

    let fillColor: any = defaultColor

    if (stateEntries.length > 0) {
      const maxResponses = Math.max(1, ...stateEntries.map(([, s]) => s.responses))
      const stateColorExpr: any[] = ['match', ['get', 'iso_3166_1_alpha2']]

      for (const [stateName, data] of stateEntries) {
        const abbrev = STATE_NAME_TO_ABBREV[stateName] || stateName
        if (abbrev.length === 2) {
          const intensity = Math.min(1, data.responses / maxResponses)
          const alpha = 0.1 + intensity * 0.6
          stateColorExpr.push(`US-${abbrev}`, `rgba(59, 130, 246, ${alpha})`)
        }
      }

      // Only use match expression if we added at least one state pair
      if (stateColorExpr.length > 2) {
        stateColorExpr.push(defaultColor) // fallback
        fillColor = stateColorExpr
      }
    }

    try {
      map.setPaintProperty('state-fills', 'fill-color', fillColor)
    } catch {
      // Layer might not be ready yet
    }

    // Update response points
    if (geoData.points.length > 0) {
      const features = geoData.points.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { surveyId: p.surveyId },
      }))

      const source = map.getSource('response-points')
      if (source) {
        source.setData({ type: 'FeatureCollection', features })
      }
    }

    // If no fly-to happened yet (data loaded after map), fly now
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

  // Toggle layer visibility
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    try {
      map.setLayoutProperty('state-fills', 'visibility', showSurveyLayer ? 'visible' : 'none')
      map.setLayoutProperty('state-borders', 'visibility', showSurveyLayer ? 'visible' : 'none')
    } catch { /* layers may not exist yet */ }
  }, [showSurveyLayer, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    try {
      map.setLayoutProperty('response-heatmap', 'visibility', showVoterLayer ? 'visible' : 'none')
      map.setLayoutProperty('response-points-circles', 'visibility', showVoterLayer ? 'visible' : 'none')
    } catch { /* layers may not exist yet */ }
  }, [showVoterLayer, mapReady])

  const resetView = useCallback(() => {
    if (!mapRef.current) return
    const center = geoData?.orgCenter
    mapRef.current.flyTo({
      center: center ? [center.longitude, center.latitude] : [-77.0369, 38.9072],
      zoom: center?.zoom || 10,
      duration: 1500,
    })
  }, [geoData])

  // Get hovered state info
  const hoveredStateData = hoveredState
    ? (() => {
        // Try full state code (e.g. US-NJ)
        const abbrev = hoveredState.replace('US-', '')
        // Find by abbreviation or full name
        for (const [name, data] of Object.entries(geoData?.states || {})) {
          const stateAbbrev = STATE_NAME_TO_ABBREV[name] || name
          if (stateAbbrev === abbrev) return { name, ...data }
        }
        return null
      })()
    : null

  return (
    <div className={`relative rounded-lg overflow-hidden border border-border ${className || ''}`}>
      {/* Map container */}
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

      {/* Layer controls - top right */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className="bg-background/80 backdrop-blur-md rounded-lg border border-border/50 p-2 shadow-lg">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setShowSurveyLayer(!showSurveyLayer)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showSurveyLayer
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Responses
            </button>
            <button
              onClick={() => setShowVoterLayer(!showVoterLayer)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showVoterLayer
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Vote className="h-3.5 w-3.5" />
              Voters
            </button>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg h-8"
          onClick={resetView}
        >
          <Globe className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Hover tooltip */}
      {hoveredStateData && (
        <div className="absolute top-3 left-3 z-10 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[160px]">
          <p className="font-semibold text-sm">{hoveredStateData.name}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {hoveredStateData.responses} responses
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {hoveredStateData.surveys} surveys
            </span>
          </div>
        </div>
      )}

      {/* Minimal org label - bottom left */}
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
