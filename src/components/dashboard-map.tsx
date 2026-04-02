'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Users, FileText, Loader2, Globe } from 'lucide-react'
import { PartyIcon, partyColor } from '@/components/party-icons'
import type { GeofencePolygon, CanvassAddress } from '@/lib/geofencing'
import { normalizeRing } from '@/lib/geofencing'

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

// Approximate US state centroids [lng, lat] for plotting news events
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [-86.9, 32.3], AK: [-153.5, 64.2], AZ: [-111.6, 34.2], AR: [-92.4, 34.9],
  CA: [-119.4, 36.8], CO: [-105.3, 38.9], CT: [-72.8, 41.6], DE: [-75.5, 38.9],
  DC: [-77.0, 38.9], FL: [-81.5, 27.7], GA: [-83.6, 32.2], HI: [-155.6, 19.7],
  ID: [-114.4, 44.4], IL: [-89.6, 40.0], IN: [-86.1, 40.3], IA: [-93.6, 41.9],
  KS: [-98.4, 38.5], KY: [-84.3, 37.7], LA: [-91.9, 31.2], ME: [-69.4, 45.4],
  MD: [-76.6, 38.9], MA: [-71.4, 42.1], MI: [-84.5, 43.3], MN: [-94.3, 46.0],
  MS: [-89.6, 32.7], MO: [-91.8, 37.9], MT: [-110.4, 47.0], NE: [-99.5, 41.1],
  NV: [-116.4, 39.3], NH: [-71.6, 43.2], NJ: [-74.6, 40.2], NM: [-105.3, 34.4],
  NY: [-75.5, 43.0], NC: [-79.0, 35.5], ND: [-99.5, 47.5], OH: [-82.8, 40.4],
  OK: [-97.5, 35.6], OR: [-120.6, 43.9], PA: [-77.2, 41.0], RI: [-71.6, 41.6],
  SC: [-81.2, 33.9], SD: [-99.5, 44.4], TN: [-86.6, 35.8], TX: [-99.3, 31.4],
  UT: [-111.6, 39.3], VT: [-72.6, 44.1], VA: [-78.4, 37.5], WA: [-120.7, 47.4],
  WV: [-80.5, 38.6], WI: [-89.6, 44.3], WY: [-107.6, 43.0],
}

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
  orgCenter?: {
    latitude: number; longitude: number; zoom: number; name: string
    officeType?: string | null; state?: string | null; districtCode?: string | null
    candidateName?: string | null; party?: string | null
  } | null
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
  demographics?: {
    totalPopulation?: number | null
    medianHouseholdIncome?: number | null
    bachelorsOrHigherPct?: number | null
    medianAge?: number | null
    sourceYear?: number | null
  } | null
}

export type CustomLayerStyle = 'color' | 'saturation' | 'heatmap'
export type CustomLayerGeoType = 'state' | 'district'
export interface CustomLayerData {
  type: CustomLayerGeoType
  values: Record<string, number>
  columnName: string
  style: CustomLayerStyle
  minVal?: number
  maxVal?: number
  aiSummary?: string
}

export interface GeofencingMapProps {
  fences: GeofencePolygon[]
  draftVertices: [number, number][]
  drawMode: null | 'include' | 'exclude'
  addresses: CanvassAddress[]
  onDrawVertex?: (lng: number, lat: number) => void
}

interface DashboardMapProps {
  layers?: { political: boolean; districts: boolean; responses: boolean; voters: boolean; fundraising?: boolean; customizable?: boolean; geofencing?: boolean }
  customLayerData?: CustomLayerData | null
  geofencing?: GeofencingMapProps | null
  onDistrictSelect?: (district: { districtCode: string; state: string; districtNumber: number }) => void
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

function valueToColor(style: CustomLayerStyle, normalized: number): string {
  const n = Math.max(0, Math.min(1, normalized))
  if (style === 'saturation') {
    const alpha = 0.25 + n * 0.7
    return `rgba(99, 102, 241, ${alpha})`
  }
  if (style === 'heatmap') {
    if (n <= 0.25) {
      const t = n / 0.25
      const r = Math.round(34 + t * (6 - 34))
      const g = Math.round(197 + t * (182 - 197))
      const b = Math.round(247 + t * (233 - 247))
      return `rgba(${r},${g},${b},0.75)`
    }
    if (n <= 0.5) {
      const t = (n - 0.25) / 0.25
      const r = Math.round(6 + t * (255 - 6))
      const g = Math.round(182 + t * (230 - 182))
      const b = Math.round(233 + t * (26 - 233))
      return `rgba(${r},${g},${b},0.75)`
    }
    if (n <= 0.75) {
      const t = (n - 0.5) / 0.25
      const r = 255
      const g = Math.round(230 - t * (230 - 211))
      const b = Math.round(26 + t * (47 - 26))
      return `rgba(${r},${g},${b},0.75)`
    }
    const t = (n - 0.75) / 0.25
    const r = 255
    const g = Math.round(211 - t * (211 - 94))
    const b = Math.round(47 + t * (60 - 47))
    return `rgba(${r},${g},${b},0.85)`
  }
  const r = Math.round(59 + n * (239 - 59))
  const g = Math.round(130 - n * 130)
  const b = Math.round(246 - n * (82 - 246))
  return `rgba(${r},${g},${b},0.65)`
}

export default function DashboardMap({ layers, customLayerData, geofencing, onDistrictSelect }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [statePoliticalData, setStatePoliticalData] = useState<PoliticalFeature[]>([])
  const [districtPoliticalData, setDistrictPoliticalData] = useState<DistrictFeature[]>([])
  const districtDataFetchedForKey = useRef<string | null>(null)
  const [campaignNewsScopes, setCampaignNewsScopes] = useState<{ states: string[]; districts: string[] }>({ states: [], districts: [] })
  const [campaignNewsSummary, setCampaignNewsSummary] = useState<{
    unreadCount: number
    items: Array<{
      title: string
      source: string
      url: string
      publishedAt: string | null
      state?: string | null
      districtCode?: string | null
    }>
  } | null>(null)
  const [newsEventPopup, setNewsEventPopup] = useState<{
    lngLat: [number, number]
    title: string
    source: string
    url: string
    publishedAt: string | null
    state: string | null
    districtCode: string | null
  } | null>(null)
  const [showCampaignNewsNotice, setShowCampaignNewsNotice] = useState(true)
  const [hoveredStateName, setHoveredStateName] = useState<string | null>(null)
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictFeature | null>(null)
  const { resolvedTheme } = useTheme()

  const showPoliticalLayer = layers?.political ?? true
  const showDistrictsLayer = layers?.districts ?? false
  const showSurveyLayer = layers?.responses ?? true
  const showVoterLayer = layers?.voters ?? true
  const showFundraisingLayer = layers?.fundraising ?? false
  const showCustomizableLayer = layers?.customizable ?? false
  const showGeofencingLayer = layers?.geofencing ?? false

  const [fundraisingOverlays, setFundraisingOverlays] = useState<any[]>([])
  const geofenceVertexRef = useRef<((lng: number, lat: number) => void) | undefined>(undefined)
  geofenceVertexRef.current = geofencing?.onDrawVertex

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

  useEffect(() => {
    fetch('/api/campaign/news/summary')
      .then(r => r.json())
      .then(d => {
        if (!d?.status) return
        setCampaignNewsScopes({
          states: d?.scopes?.states || [],
          districts: d?.scopes?.districts || [],
        })
        setCampaignNewsSummary({
          unreadCount: d?.unreadCount || 0,
          items: Array.isArray(d?.items) ? d.items : [],
        })
      })
      .catch((e) => console.error('Failed to fetch campaign news scopes:', e))
  }, [])

  useEffect(() => {
    if (!showFundraisingLayer) return
    fetch('/api/dashboard/fundraising/overlays')
      .then(r => r.json())
      .then(d => { if (d?.status) setFundraisingOverlays(Array.isArray(d.overlays) ? d.overlays : []) })
      .catch(() => setFundraisingOverlays([]))
  }, [showFundraisingLayer])

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
        map.addLayer({
          id: 'news-state-highlight', type: 'line', source: 'us-states',
          layout: { visibility: 'none' },
          filter: ['in', ['get', 'name'], ['literal', []]],
          paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 2] },
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
        map.addLayer({
          id: 'news-district-highlight', type: 'line', source: 'us-districts',
          layout: { visibility: 'none' },
          filter: ['in', ['get', 'district_code'], ['literal', []]],
          paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 2] },
        })

        // ---- "My district" / "My state" highlight layers ----
        // These are always-on when a district/state matches the org's race
        map.addLayer({
          id: 'my-district-border', type: 'line', source: 'us-districts',
          layout: { visibility: 'none' },
          filter: ['==', ['get', 'district_code'], ''],
          paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [3, 2] },
        })
        map.addLayer({
          id: 'my-state-border', type: 'line', source: 'us-states',
          layout: { visibility: 'none' },
          filter: ['==', ['get', 'name'], ''],
          paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [3, 2] },
        })

        // ---- Custom overlay (uploaded data: color / saturation / heatmap) ----
        map.addLayer({
          id: 'custom-state-fills', type: 'fill', source: 'us-states',
          layout: { visibility: 'none' },
          paint: { 'fill-color': 'rgba(128, 128, 128, 0.1)', 'fill-opacity': 0.7 },
        })
        map.addLayer({
          id: 'custom-district-fills', type: 'fill', source: 'us-districts',
          layout: { visibility: 'none' },
          paint: { 'fill-color': 'rgba(128, 128, 128, 0.1)', 'fill-opacity': 0.65 },
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

        // ---- News event points (from news chat / campaign news with location + date) ----
        map.addSource('news-event-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'news-event-points-circles', type: 'circle', source: 'news-event-points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 6, 12, 10, 18],
            'circle-color': '#f59e0b',
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': isDark ? '#1c1917' : '#fff',
          },
        })
        map.addLayer({
          id: 'news-event-points-symbols', type: 'symbol', source: 'news-event-points',
          minzoom: 5,
          layout: {
            'text-field': ['get', 'dateShort'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 0.8],
          },
          paint: {
            'text-color': isDark ? '#fef3c7' : '#78350f',
            'text-halo-color': isDark ? '#1c1917' : '#fff',
            'text-halo-width': 1.5,
          },
        })

        // ---- Geofencing (canvass zones) + address pins ----
        map.addSource('geofence-polygons', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'geofence-fills',
          type: 'fill',
          source: 'geofence-polygons',
          filter: ['==', ['get', 'mode'], 'include'],
          layout: { visibility: 'none' },
          paint: {
            'fill-color': 'rgba(34, 197, 94, 0.25)',
            'fill-outline-color': 'rgba(22, 163, 74, 0.9)',
          },
        })
        map.addLayer({
          id: 'geofence-fills-exclude',
          type: 'fill',
          source: 'geofence-polygons',
          filter: ['==', ['get', 'mode'], 'exclude'],
          layout: { visibility: 'none' },
          paint: {
            'fill-color': 'rgba(239, 68, 68, 0.22)',
            'fill-outline-color': 'rgba(220, 38, 38, 0.95)',
          },
        })
        map.addLayer({
          id: 'geofence-lines',
          type: 'line',
          source: 'geofence-polygons',
          layout: { visibility: 'none' },
          paint: {
            'line-color': ['match', ['get', 'mode'], 'include', '#16a34a', 'exclude', '#dc2626', '#64748b'],
            'line-width': 2,
          },
        })
        map.addSource('geofence-draft-line', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'geofence-draft-line-layer',
          type: 'line',
          source: 'geofence-draft-line',
          layout: { visibility: 'none' },
          paint: {
            'line-color': '#0ea5e9',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        })
        map.addSource('geofence-draft-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'geofence-draft-points-layer',
          type: 'circle',
          source: 'geofence-draft-points',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 5,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 2,
            'circle-stroke-color': isDark ? '#0f172a' : '#fff',
          },
        })
        map.addSource('canvass-address-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'canvass-address-circles',
          type: 'circle',
          source: 'canvass-address-points',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6],
            'circle-color': [
              'match',
              ['get', 'status'],
              'canvass',
              '#22c55e',
              'skip',
              '#ef4444',
              '#94a3b8',
            ],
            'circle-opacity': 0.92,
            'circle-stroke-width': 1,
            'circle-stroke-color': isDark ? '#0f172a' : '#fff',
          },
        })

        // Initial fly handled by the geoData effect (uses orgCenter when available)
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
          const props = e.features[0].properties
          const code = props?.district_code || ''
          if (code !== hoveredDistrictCode) {
            hoveredDistrictCode = code
            map.setFilter('district-hover', ['==', ['get', 'district_code'], code])
            map.getCanvas().style.cursor = 'pointer'
            const stateAbbrev = props?.state || ''
            const distNum = props?.district_number || 0
            setHoveredDistrict({ id: code, state: stateAbbrev, districtNumber: distNum })
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
          const props = feature.properties || {}
          const districtCode = props?.district_code || ''
          const stateAbbrev = props?.state || ''
          const districtNumber = props?.district_number || 0
          if (districtCode && onDistrictSelect) {
            onDistrictSelect({ districtCode, state: stateAbbrev, districtNumber })
          }
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

      // ---- News event point click: show popup with title, date, location ----
      map.on('click', 'news-event-points-circles', (e: any) => {
        if (e.features?.length && e.lngLat) {
          const f = e.features[0]
          const p = f.properties || {}
          setNewsEventPopup({
            lngLat: [e.lngLat.lng, e.lngLat.lat],
            title: p.title || 'News',
            source: p.source || '',
            url: p.url || '',
            publishedAt: p.publishedAt || null,
            state: p.state || null,
            districtCode: p.districtCode || null,
          })
        }
      })
      map.on('mouseenter', 'news-event-points-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'news-event-points-circles', () => { map.getCanvas().style.cursor = '' })
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
  // Update news event points (from campaign news with state + date)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const items = campaignNewsSummary?.items?.filter((i) => i.state) || []
    if (items.length === 0) {
      try {
        const src = map.getSource('news-event-points')
        if (src) (src as any).setData({ type: 'FeatureCollection', features: [] })
      } catch {}
      return
    }
    const stateCount: Record<string, number> = {}
    const features = items.map((item) => {
      const state = (item.state || '').toUpperCase()
      const centroid = STATE_CENTROIDS[state]
      if (!centroid) return null
      const idx = stateCount[state] = (stateCount[state] || 0) + 1
      const jitter = (idx - 1) * 0.15
      const [lng, lat] = [centroid[0] + jitter * 0.5, centroid[1] + jitter * 0.3]
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null
      const dateShort = publishedAt
        ? publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: publishedAt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
        : ''
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: {
          title: item.title,
          source: item.source || '',
          url: item.url || '',
          publishedAt: item.publishedAt || null,
          state: item.state || null,
          districtCode: item.districtCode || null,
          dateShort,
        },
      }
    }).filter(Boolean)
    try {
      const src = map.getSource('news-event-points')
      if (src) (src as any).setData({ type: 'FeatureCollection', features })
    } catch (e) {
      console.warn('Failed to set news event points:', e)
    }
  }, [status, campaignNewsSummary])

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

    // Fly to org center (campaign HQ) or default to DC area
    const target = geoData.orgCenter
      ? { center: [geoData.orgCenter.longitude, geoData.orgCenter.latitude] as [number, number], zoom: geoData.orgCenter.zoom || 10 }
      : { center: [-77.0369, 38.9072] as [number, number], zoom: 10 }
    map.flyTo({
      ...target, duration: 2800, curve: 1.42,
      easing: (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
    })
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
  // Fetch district political data when districts layer is enabled.
  // Uses org state if available to keep payload bounded for campaign workflows.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!showDistrictsLayer) return

    const stateFilter = geoData?.orgCenter?.state?.trim().toUpperCase() || ''
    const fetchKey = stateFilter || 'ALL'
    if (districtDataFetchedForKey.current === fetchKey) return

    districtDataFetchedForKey.current = fetchKey
    const params = new URLSearchParams({ zoom: '6' })
    if (stateFilter) params.set('state', stateFilter)

    fetch(`/api/dashboard/political?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (d.status) setDistrictPoliticalData(d.features || [])
      })
      .catch(e => console.error('Failed to fetch district political data:', e))
  }, [showDistrictsLayer, geoData?.orgCenter?.state])

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
    const map = mapRef.current
    const stateNames = campaignNewsScopes.states
      .map((abbrev) => ABBREV_TO_STATE_NAME[abbrev])
      .filter(Boolean)
    const districts = campaignNewsScopes.districts || []
    try {
      map.setFilter('news-state-highlight', ['in', ['get', 'name'], ['literal', stateNames]])
      map.setLayoutProperty('news-state-highlight', 'visibility', stateNames.length ? 'visible' : 'none')
    } catch {}
    try {
      map.setFilter('news-district-highlight', ['in', ['get', 'district_code'], ['literal', districts]])
      map.setLayoutProperty('news-district-highlight', 'visibility', districts.length ? 'visible' : 'none')
    } catch {}
  }, [status, campaignNewsScopes])

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

  // -----------------------------------------------------------------------
  // Custom overlay (uploaded data): color / saturation / heatmap by state or district
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const showCustom = showCustomizableLayer && customLayerData && Object.keys(customLayerData.values).length > 0
    const minVal = customLayerData?.minVal ?? 0
    const maxVal = customLayerData?.maxVal ?? 1
    const range = Math.max(1e-9, maxVal - minVal)
    const style = customLayerData?.style ?? 'color'

    const buildExpr = (geoProperty: 'name' | 'district_code') => {
      const keys = Object.keys(customLayerData!.values)
      const expr: any[] = ['match', ['get', geoProperty]]
      for (const key of keys) {
        const v = customLayerData!.values[key]
        const normalized = (v - minVal) / range
        expr.push(key, valueToColor(style, normalized))
      }
      expr.push('rgba(128, 128, 128, 0.08)')
      return expr
    }

    try {
      if (showCustom && customLayerData!.type === 'state') {
        map.setPaintProperty('custom-state-fills', 'fill-color', buildExpr('name'))
        map.setLayoutProperty('custom-state-fills', 'visibility', 'visible')
      } else {
        map.setLayoutProperty('custom-state-fills', 'visibility', 'none')
      }
    } catch (e) {
      console.warn('Custom state fills:', e)
    }

    try {
      if (showCustom && customLayerData!.type === 'district') {
        map.setPaintProperty('custom-district-fills', 'fill-color', buildExpr('district_code'))
        map.setLayoutProperty('custom-district-fills', 'visibility', 'visible')
      } else {
        map.setLayoutProperty('custom-district-fills', 'visibility', 'none')
      }
    } catch (e) {
      console.warn('Custom district fills:', e)
    }
  }, [status, showCustomizableLayer, customLayerData])

  // -----------------------------------------------------------------------
  // Geofencing: polygons, draft vertices, canvass address pins
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const fences = geofencing?.fences ?? []
    const features = fences.map((f) => ({
      type: 'Feature' as const,
      properties: { mode: f.mode, id: f.id },
      geometry: { type: 'Polygon' as const, coordinates: [normalizeRing(f.ring)] },
    }))
    try {
      const src = map.getSource('geofence-polygons')
      if (src) (src as any).setData({ type: 'FeatureCollection', features })
    } catch (e) {
      console.warn('geofence-polygons setData:', e)
    }
  }, [status, geofencing?.fences])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const draft = geofencing?.draftVertices ?? []
    const lineFeatures =
      draft.length >= 2
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: draft },
            },
          ]
        : []
    const pointFeatures = draft.map((coord, i) => ({
      type: 'Feature' as const,
      properties: { i },
      geometry: { type: 'Point' as const, coordinates: coord },
    }))
    try {
      const lineSrc = map.getSource('geofence-draft-line')
      if (lineSrc) (lineSrc as any).setData({ type: 'FeatureCollection', features: lineFeatures })
      const ptSrc = map.getSource('geofence-draft-points')
      if (ptSrc) (ptSrc as any).setData({ type: 'FeatureCollection', features: pointFeatures })
    } catch (e) {
      console.warn('geofence draft setData:', e)
    }
  }, [status, geofencing?.draftVertices])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const rows = geofencing?.addresses ?? []
    const features = rows.map((a) => ({
      type: 'Feature' as const,
      properties: { id: a.id, status: a.status, label: a.label || '' },
      geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] },
    }))
    try {
      const src = map.getSource('canvass-address-points')
      if (src) (src as any).setData({ type: 'FeatureCollection', features })
    } catch (e) {
      console.warn('canvass-address-points setData:', e)
    }
  }, [status, geofencing?.addresses])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const show = showGeofencingLayer
    const hasDraft = (geofencing?.draftVertices?.length ?? 0) > 0
    const hasFences = (geofencing?.fences?.length ?? 0) > 0
    const hasAddr = (geofencing?.addresses?.length ?? 0) > 0
    const vis = show ? 'visible' : 'none'
    const draftVis = show && hasDraft ? 'visible' : 'none'
    const addrVis = show && hasAddr ? 'visible' : 'none'
    try {
      map.setLayoutProperty('geofence-fills', 'visibility', show && hasFences ? 'visible' : 'none')
      map.setLayoutProperty('geofence-fills-exclude', 'visibility', show && hasFences ? 'visible' : 'none')
      map.setLayoutProperty('geofence-lines', 'visibility', show && hasFences ? 'visible' : 'none')
      map.setLayoutProperty('geofence-draft-line-layer', 'visibility', draftVis)
      map.setLayoutProperty('geofence-draft-points-layer', 'visibility', draftVis)
      map.setLayoutProperty('canvass-address-circles', 'visibility', addrVis)
    } catch (e) {
      console.warn('geofence visibility:', e)
    }
  }, [status, showGeofencingLayer, geofencing?.fences, geofencing?.draftVertices, geofencing?.addresses])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return
    const map = mapRef.current
    const mode = geofencing?.drawMode
    if (!mode || !geofencing?.onDrawVertex) {
      try {
        map.getCanvas().style.cursor = ''
      } catch {}
      return
    }
    const handler = (e: any) => {
      geofenceVertexRef.current?.(e.lngLat.lng, e.lngLat.lat)
    }
    map.on('click', handler)
    try {
      map.getCanvas().style.cursor = 'crosshair'
    } catch {}
    return () => {
      try {
        map.off('click', handler)
        map.getCanvas().style.cursor = ''
      } catch {}
    }
  }, [status, geofencing?.drawMode, geofencing?.onDrawVertex])

  // -----------------------------------------------------------------------
  // "My district" / "My state" highlight based on org campaign context
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !geoData?.orgCenter) return
    const map = mapRef.current
    const { officeType, districtCode, state: orgState } = geoData.orgCenter

    // Highlight the org's district if it's a district-level race
    if (districtCode && ['federal_house', 'state_senate', 'state_house', 'city_council', 'county'].includes(officeType || '')) {
      try {
        map.setFilter('my-district-border', ['==', ['get', 'district_code'], districtCode])
        map.setLayoutProperty('my-district-border', 'visibility', showDistrictsLayer ? 'visible' : 'none')
      } catch {}
    }

    // Highlight the org's state for statewide races
    if (orgState && ['federal_senate', 'governor'].includes(officeType || '')) {
      const stateName = ABBREV_TO_STATE_NAME[orgState]
      if (stateName) {
        try {
          map.setFilter('my-state-border', ['==', ['get', 'name'], stateName])
          map.setLayoutProperty('my-state-border', 'visibility', 'visible')
        } catch {}
      }
    }
  }, [geoData, status, showDistrictsLayer])

  const resetView = useCallback(() => {
    if (!mapRef.current) return
    const center = geoData?.orgCenter
    mapRef.current.flyTo({
      center: center ? [center.longitude, center.latitude] : [-77.0369, 38.9072],
      zoom: center?.zoom || 10, duration: 1500,
    })
  }, [geoData])

  const markCampaignNewsSeen = useCallback(async () => {
    try {
      await fetch('/api/campaign/news/mark-seen', { method: 'POST' })
      setCampaignNewsSummary((prev) => (prev ? { ...prev, unreadCount: 0 } : prev))
      setShowCampaignNewsNotice(false)
    } catch (e) {
      console.error('Failed to mark campaign news as seen:', e)
    }
  }, [])

  const getNewsFreshnessLabel = useCallback(() => {
    if (!campaignNewsSummary?.items?.length) return 'updated recently'
    const timestamps = campaignNewsSummary.items
      .map((i) => (i.publishedAt ? new Date(i.publishedAt).getTime() : 0))
      .filter((t) => t > 0)
    if (!timestamps.length) return 'updated recently'
    const newest = Math.max(...timestamps)
    const diffMinutes = Math.max(1, Math.floor((Date.now() - newest) / 60000))
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }, [campaignNewsSummary])

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

      {showFundraisingLayer && fundraisingOverlays.length > 0 && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 11 }} className="max-w-[360px]">
          <div className="rounded-lg border border-border/50 bg-background/90 backdrop-blur-md shadow-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fundraising insights
            </p>
            <div className="mt-2 space-y-2">
              {fundraisingOverlays.filter((o:any)=>o.status==='enabled').slice(0, 2).map((o: any) => (
                <div key={o.id} className="text-xs">
                  <div className="font-medium text-foreground truncate" title={o.report?.title || 'Report'}>
                    {o.report?.title || 'Report'}
                  </div>
                  {Array.isArray(o.enabledMetrics) && o.enabledMetrics.length > 0 ? (
                    <div className="text-muted-foreground">
                      Showing: {o.enabledMetrics.join(', ')}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      {o.report?.summary ? String(o.report.summary).slice(0, 160) : 'No summary yet.'}
                    </div>
                  )}
                </div>
              ))}
              {fundraisingOverlays.filter((o:any)=>o.status==='enabled').length > 2 && (
                <div className="text-[11px] text-muted-foreground">
                  +{fundraisingOverlays.filter((o:any)=>o.status==='enabled').length - 2} more pinned
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* News event popup (click a news marker on the map) */}
      {newsEventPopup && (
        <div
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 12 }}
          className="max-w-[320px] rounded-lg border border-amber-300/50 bg-background/95 backdrop-blur-md shadow-lg p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                {newsEventPopup.state}
                {newsEventPopup.districtCode ? ` · ${newsEventPopup.districtCode}` : ''}
              </p>
              <p className="text-sm font-medium leading-tight line-clamp-2" title={newsEventPopup.title}>
                {newsEventPopup.title}
              </p>
              {newsEventPopup.publishedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(newsEventPopup.publishedAt).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {newsEventPopup.url && (
                  <a
                    href={newsEventPopup.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Open article
                  </a>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => setNewsEventPopup(null)}
              aria-label="Close"
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {showCampaignNewsNotice && (campaignNewsSummary?.unreadCount || 0) > 0 && (
        <div
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}
          className="max-w-[280px] rounded-md border border-amber-300/40 bg-amber-500/10 px-2 py-1.5 backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-amber-300 leading-tight">
                {campaignNewsSummary?.unreadCount} campaign update{campaignNewsSummary?.unreadCount === 1 ? '' : 's'} ({getNewsFreshnessLabel()})
              </p>
              {campaignNewsSummary?.items?.[0] && (
                <a
                  href={campaignNewsSummary.items[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-0.5 text-[10px] text-foreground/90 truncate hover:underline"
                  title={campaignNewsSummary.items[0].title}
                >
                  {campaignNewsSummary.items[0].title}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px]"
                onClick={markCampaignNewsSeen}
              >
                Read
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-[10px]"
                onClick={() => setShowCampaignNewsNotice(false)}
              >
                x
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* District tooltip (takes priority when hovering a district) */}
      {districtTooltipData && !tooltipData && (() => {
        const d = districtTooltipData as DistrictFeature
        const districtLean = (d.pviNumeric || 0) < 0 ? 'R'
          : (d.pviNumeric || 0) > 0 ? 'D'
          : (d.margin2024 || 0) < 0 ? 'R'
          : (d.margin2024 || 0) > 0 ? 'D'
          : d.incumbentParty === 'R' || d.incumbentParty === 'D' ? d.incumbentParty
          : null
        return (
          <div
            style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
            className="pointer-events-none select-none bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[200px] max-w-[280px]"
          >
            <div className="flex items-center gap-2">
              {districtLean && <PartyIcon party={districtLean} size={14} className={partyColor(districtLean)} />}
              <p className="font-semibold text-sm">
                {d.id}{d.districtNumber === 0 && ' (At-Large)'}
              </p>
            </div>
            {d.incumbentName && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Incumbent</span>
                <span className={`text-xs font-medium flex items-center gap-1 ${d.incumbentParty === 'D' ? 'text-blue-400' : d.incumbentParty === 'R' ? 'text-red-400' : 'text-muted-foreground'}`}>
                  <PartyIcon party={d.incumbentParty || null} size={10} className={partyColor(d.incumbentParty)} />
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
                <span className="flex items-center gap-1 text-blue-400"><PartyIcon party="D" size={9} className="text-blue-400" />${(d.donations.dem / 1000).toFixed(0)}k</span>
                <span className="flex items-center gap-1 text-red-400"><PartyIcon party="R" size={9} className="text-red-400" />${(d.donations.rep / 1000).toFixed(0)}k</span>
              </div>
            )}
            {d.demographics && (
              <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                {d.demographics.totalPopulation !== null && d.demographics.totalPopulation !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Population</span>
                    <span className="text-xs font-medium">{d.demographics.totalPopulation.toLocaleString()}</span>
                  </div>
                )}
                {d.demographics.medianHouseholdIncome !== null && d.demographics.medianHouseholdIncome !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Median Income</span>
                    <span className="text-xs font-medium">${Math.round(d.demographics.medianHouseholdIncome).toLocaleString()}</span>
                  </div>
                )}
                {d.demographics.medianAge !== null && d.demographics.medianAge !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Median Age</span>
                    <span className="text-xs font-medium">{d.demographics.medianAge.toFixed(1)}</span>
                  </div>
                )}
                {d.demographics.bachelorsOrHigherPct !== null && d.demographics.bachelorsOrHigherPct !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Bachelor's+</span>
                    <span className="text-xs font-medium">{d.demographics.bachelorsOrHigherPct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* State tooltip */}
      {tooltipData && (() => {
        const pi = tooltipData.politicalInfo
        const stateLean = pi
          ? (pi.pviNumeric || 0) < 0 ? 'R'
            : (pi.pviNumeric || 0) > 0 ? 'D'
            : (pi.margin2024 || 0) < 0 ? 'R'
            : (pi.margin2024 || 0) > 0 ? 'D'
            : pi.governorParty === 'R' || pi.governorParty === 'D' ? pi.governorParty
            : null
          : null
        return (
          <div
            style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
            className="pointer-events-none select-none bg-background/90 backdrop-blur-md rounded-lg border border-border/50 p-3 shadow-lg min-w-[200px] max-w-[280px]"
          >
            <div className="flex items-center gap-2">
              {stateLean && <PartyIcon party={stateLean} size={14} className={partyColor(stateLean)} />}
              <p className="font-semibold text-sm">
                {tooltipData.politicalInfo?.name || tooltipData.surveyInfo?.name || hoveredStateName}
              </p>
            </div>
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
                    <span className={`text-xs font-medium flex items-center gap-1 ${tooltipData.politicalInfo.governorParty === 'D' ? 'text-blue-400' : 'text-red-400'}`}>
                      <PartyIcon party={tooltipData.politicalInfo.governorParty} size={10} className={partyColor(tooltipData.politicalInfo.governorParty)} />
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
        )
      })()}

      {geoData?.orgCenter && (
        <div className="absolute bottom-3 left-3 z-10">
          <div className="bg-background/80 backdrop-blur-md rounded-lg border border-border/50 px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              {(geoData.orgCenter.party === 'R' || geoData.orgCenter.party === 'D') ? (
                <PartyIcon party={geoData.orgCenter.party} size={16} className={partyColor(geoData.orgCenter.party)} />
              ) : (
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
              <span className="text-xs font-medium">{geoData.orgCenter.candidateName || geoData.orgCenter.name}</span>
            </div>
            {(geoData.orgCenter.districtCode || geoData.orgCenter.state) && (
              <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">
                {[geoData.orgCenter.districtCode || geoData.orgCenter.state, geoData.orgCenter.party === 'R' ? 'Republican' : geoData.orgCenter.party === 'D' ? 'Democrat' : geoData.orgCenter.party].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
