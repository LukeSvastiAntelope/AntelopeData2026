'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSidebar } from "@/components/ui/sidebar"
import { PanelLeft, Landmark, MapPin, Vote, Grid3x3, ChevronDown, ChevronRight, HandCoins, Bot, Plus, Play, Trash2, Loader2, Newspaper, Building2, Globe, Palette, Upload, Sparkles, Fence, Check, X, MessageSquare, Users, Printer, Route, Crosshair, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  buildChoroplethFromRows,
  buildPinsFromRows,
  detectLatLngColumns,
  filterUploadedRows,
  type MapAssistantModelResult,
} from '@/lib/custom-map-assistant'
import { toast } from '@/components/ui/sonner'
import type { GeofencePolygon } from '@/lib/geofencing'
import { classifyAddresses, normalizeRing } from '@/lib/geofencing'

type AutomationType = 'news_scraper' | 'company_scraper' | 'bbc_commodity_bot'

interface AutomationConfig {
  state?: string
  district?: string
  region?: string
  min_employees?: number
  keywords?: string
}

interface Automation {
  id: number
  type: AutomationType
  name: string
  config: AutomationConfig
  enabled: boolean
  last_run_at: string | null
  created_at: string | null
}

interface DistrictIntelResponse {
  district: {
    districtCode: string
    state: string
    districtNumber: number
    pvi: string | null
    margin2024: number
    incumbentName: string | null
    incumbentParty: string | null
    demographics: {
      totalPopulation: number | null
      medianHouseholdIncome: number | null
      bachelorsOrHigherPct: number | null
      medianAge: number | null
    }
  }
  external: {
    censusStatus: string
    fecStatus: string
    openStatesStatus: string
    ballotpediaStatus: string
    mitElectionLabStatus: string
  }
  intelligence: {
    narrative: string
    recommendedNextSteps: string[]
  }
}

interface DistrictDeepReport {
  title: string
  executiveSummary: string
  strategicAngles?: string[]
  riskFlags?: string[]
  messageTestingIdeas?: string[]
  caveats?: string[]
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

const ABBREV_TO_STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

const DashboardMap = dynamic(() => import('@/components/dashboard-map'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="bg-muted/30"
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="text-sm">Loading map...</p>
      </div>
    </div>
  ),
})

function pviToColor(pvi: number, alpha = 0.6): string {
  const clamped = Math.max(-30, Math.min(30, pvi))
  const t = (clamped + 30) / 60
  const r = Math.round(220 - t * 180)
  const b = Math.round(40 + t * 180)
  const g = Math.round(60 + (1 - Math.abs(t - 0.5) * 2) * 40)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  )
}

const toggleBtnClass =
  'flex items-center justify-center h-7 w-7 rounded-md bg-background/80 backdrop-blur-md border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer'

const AUTOMATION_TYPES: { value: AutomationType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'news_scraper', label: 'News by district', icon: <Newspaper className="h-4 w-4" />, description: 'Search for news articles in a state/district (e.g. NJ District 5)' },
  { value: 'company_scraper', label: 'Companies by region', icon: <Building2 className="h-4 w-4" />, description: 'Find large companies by region and min employees (e.g. Central Jersey, 50+)' },
  { value: 'bbc_commodity_bot', label: 'BBC commodity news', icon: <Globe className="h-4 w-4" />, description: 'Monitor BBC for news on commodity shocks or other topics' },
]

export default function DashboardPage() {
  const { toggleSidebar } = useSidebar()
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [layers, setLayers] = useState({
    political: true,
    districts: true,
    responses: true,
    voters: true,
    fundraising: false,
    customizable: false,
    geofencing: false,
    persons: false,
    turf: false,
  })
  const [personPins, setPersonPins] = useState<
    {
      id: number
      lng: number
      lat: number
      label: string
      effectiveParty?: string | null
      party?: string | null
      ageBucket?: string | null
      canvassStatus?: string | null
      district?: string | null
      addressLine?: string | null
      voterStatus?: string | null
      matchConfidence?: number
      canvassNotes?: string | null
      tier?: string | null
      confidence?: number | null
      propensity?: number | null
      signal?: 'estimated' | 'confirmed' | null
    }[]
  >([])
  const [turfList, setTurfList] = useState<
    { id: number; label: string; address_count: number; assigned_to: number | null }[]
  >([])
  const [activeTurfId, setActiveTurfId] = useState<number | null>(null)
  const [activeTurfLabel, setActiveTurfLabel] = useState<string | null>(null)
  const [turfStops, setTurfStops] = useState<
    {
      voterGeoId: number
      sortOrder: number
      lng: number
      lat: number
      label: string
      party?: string | null
      canvassStatus?: string | null
      personRecordId?: number | null
    }[]
  >([])
  const [turfLoading, setTurfLoading] = useState(false)
  const [selectedTurfStopId, setSelectedTurfStopId] = useState<number | null>(null)
  const [propensitySummary, setPropensitySummary] = useState<{
    hot: number
    warm: number
    cold: number
    total: number
    avgPropensity: number | null
    avgConfidence: number | null
    decayK: number
    estimated?: number
    confirmed?: number
  } | null>(null)
  const [propensityLoading, setPropensityLoading] = useState(false)
  const [propensityRefreshing, setPropensityRefreshing] = useState(false)
  const [personFilters, setPersonFilters] = useState({
    party: [] as string[],
    ageBucket: [] as string[],
    voterStatus: [] as string[],
    /** P3 tier chips */
    tier: [] as string[],
    /** Area A / geofence labels */
    includeArea: [] as string[],
    excludeSuppressed: false,
  })
  const [personHeatmap, setPersonHeatmap] = useState(false)
  const [personColorMode, setPersonColorMode] = useState<'party' | 'tier'>('tier')
  const [whoToWork, setWhoToWork] = useState<
    {
      person_record_id: number
      label?: string
      party?: string | null
      tier: string
      propensity: number
      confidence: number
      signal?: string
      latitude?: number | null
      longitude?: number | null
    }[]
  >([])
  const [personLoading, setPersonLoading] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [confirmParty, setConfirmParty] = useState('Democrat')
  const [confirmStatus, setConfirmStatus] = useState('confirmed')
  const [confirmNotes, setConfirmNotes] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [geofences, setGeofences] = useState<GeofencePolygon[]>([])
  const [geofenceDraftVertices, setGeofenceDraftVertices] = useState<[number, number][]>([])
  const [geofenceDrawMode, setGeofenceDrawMode] = useState<null | 'include' | 'exclude'>(null)
  const [geofenceAddressRows, setGeofenceAddressRows] = useState<{ id: string; lng: number; lat: number; label?: string }[]>([])
  const [geofenceCsvLoading, setGeofenceCsvLoading] = useState(false)
  const [geofenceLabelDraft, setGeofenceLabelDraft] = useState('Area A')
  const [geofenceSaving, setGeofenceSaving] = useState(false)
  const [geofenceQueryBusy, setGeofenceQueryBusy] = useState(false)
  const [geofenceQueryCount, setGeofenceQueryCount] = useState<number | null>(null)
  const [customLayerData, setCustomLayerData] = useState<CustomLayerData | null>(null)
  const [customFileRows, setCustomFileRows] = useState<Record<string, string>[] | null>(null)
  const [customFileColumns, setCustomFileColumns] = useState<string[]>([])
  const [customSelectedColumn, setCustomSelectedColumn] = useState<string>('')
  const [customSelectedStyle, setCustomSelectedStyle] = useState<CustomLayerStyle>('color')
  const [customGeoType, setCustomGeoType] = useState<CustomLayerGeoType>('state')
  const [customGeoColumn, setCustomGeoColumn] = useState<string>('')
  const [customUploadLoading, setCustomUploadLoading] = useState(false)
  const [customAiAnalyzing, setCustomAiAnalyzing] = useState(false)
  const [customAiSummary, setCustomAiSummary] = useState<string | null>(null)
  const [customMapPins, setCustomMapPins] = useState<{ lng: number; lat: number; label: string }[]>([])
  const [mapAssistantOpen, setMapAssistantOpen] = useState(false)
  const [mapAssistantInput, setMapAssistantInput] = useState('')
  const [mapAssistantLoading, setMapAssistantLoading] = useState(false)
  const [mapAssistantMessages, setMapAssistantMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [automationsLoading, setAutomationsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<AutomationType>('news_scraper')
  const [createName, setCreateName] = useState('')
  const [createConfig, setCreateConfig] = useState<AutomationConfig>({ state: 'NJ', district: '5', region: 'Central Jersey', min_employees: 50, keywords: 'commodity shocks' })
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<{ districtCode: string; state: string; districtNumber: number } | null>(null)
  const [districtIntel, setDistrictIntel] = useState<DistrictIntelResponse | null>(null)
  const [districtIntelLoading, setDistrictIntelLoading] = useState(false)
  const [districtDeepReport, setDistrictDeepReport] = useState<DistrictDeepReport | null>(null)
  const [districtDeepLoading, setDistrictDeepLoading] = useState(false)
  const [districtDeepConversationId, setDistrictDeepConversationId] = useState<string | null>(null)

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations')
      const data = await res.json()
      if (data?.automations) setAutomations(data.automations)
    } catch {
      toast.error('Failed to load automations')
    } finally {
      setAutomationsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAutomations()
  }, [fetchAutomations])

  const canvassClassifiedAddresses = useMemo(
    () => classifyAddresses(geofenceAddressRows, geofences),
    [geofenceAddressRows, geofences]
  )

  const geofenceStats = useMemo(() => {
    const rows = canvassClassifiedAddresses
    const canvass = rows.filter((r) => r.status === 'canvass').length
    const skip = rows.filter((r) => r.status === 'skip').length
    const neutral = rows.filter((r) => r.status === 'neutral').length
    return { canvass, skip, neutral, total: rows.length }
  }, [canvassClassifiedAddresses])

  const handleGeofenceVertex = useCallback((lng: number, lat: number) => {
    setGeofenceDraftVertices((prev) => [...prev, [lng, lat]])
  }, [])

  const geofencingMapProps = useMemo(
    () => ({
      fences: geofences,
      draftVertices: geofenceDraftVertices,
      drawMode: geofenceDrawMode,
      addresses: canvassClassifiedAddresses,
      onDrawVertex: handleGeofenceVertex,
    }),
    [geofences, geofenceDraftVertices, geofenceDrawMode, canvassClassifiedAddresses, handleGeofenceVertex]
  )

  const finishGeofencePolygon = async () => {
    if (geofenceDraftVertices.length < 3) {
      toast.error('Add at least three clicks on the map to close a zone.')
      return
    }
    if (!geofenceDrawMode) return
    const mode = geofenceDrawMode
    const ring = normalizeRing(geofenceDraftVertices)
    const label =
      geofenceLabelDraft.trim() ||
      (mode === 'include' ? `Area ${geofences.length + 1}` : `Exclude ${geofences.length + 1}`)

    setGeofenceSaving(true)
    try {
      // Client preview immediately (G1.4)
      const localId = crypto.randomUUID()
      setGeofences((prev) => [...prev, { id: localId, mode, ring, label }])
      setGeofenceDraftVertices([])
      setGeofenceDrawMode(null)

      // Authoritative save → MySQL spatial geom
      const res = await fetch('/api/dashboard/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          fenceType: 'polygon',
          purpose: mode === 'exclude' ? 'exclude' : 'include',
          ring,
          color: mode === 'exclude' ? '#ef4444' : '#22c55e',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Could not save fence')

      setGeofences((prev) =>
        prev.map((f) =>
          f.id === localId
            ? { ...f, dbId: data.fence.id, label: data.fence.label, id: String(data.fence.id) }
            : f
        )
      )
      setGeofenceLabelDraft(`Area ${String.fromCharCode(65 + (geofences.length % 26))}`)
      toast.success(`Saved “${data.fence.label}” — spatial query ready`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fence save failed')
    } finally {
      setGeofenceSaving(false)
    }
  }

  const loadSavedGeofences = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/geofences')
      const data = await res.json()
      if (!res.ok || !data.status) return
      const mapped: GeofencePolygon[] = (data.fences || [])
        .filter((f: any) => f.fence_type === 'polygon' && Array.isArray(f.ring_json))
        .map((f: any) => ({
          id: String(f.id),
          dbId: f.id,
          label: f.label,
          mode: f.purpose === 'exclude' ? 'exclude' : 'include',
          ring: f.ring_json as [number, number][],
        }))
      setGeofences(mapped)
      if (mapped.length) toast.success(`${mapped.length} saved fences loaded`)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (layers.geofencing) {
      void loadSavedGeofences()
    }
  }, [layers.geofencing, loadSavedGeofences])

  const queryAddressesInFence = async (fence: GeofencePolygon) => {
    if (!fence.dbId && !/^\d+$/.test(fence.id)) {
      toast.error('Save the fence first, then query addresses')
      return
    }
    const id = fence.dbId || Number(fence.id)
    setGeofenceQueryBusy(true)
    try {
      const res = await fetch(`/api/dashboard/geofences/${id}?addresses=1`)
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Query failed')
      setGeofenceQueryCount(data.count)
      const rows = (data.addresses || []).map((a: any) => ({
        id: String(a.id),
        lng: a.longitude,
        lat: a.latitude,
        label: a.label,
      }))
      if (rows.length) setGeofenceAddressRows(rows)
      toast.success(
        `“${fence.label || fence.id}”: ${data.count} addresses (MySQL ST_Contains)`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Spatial query failed')
    } finally {
      setGeofenceQueryBusy(false)
    }
  }

  const cancelGeofenceDraft = () => {
    setGeofenceDraftVertices([])
    setGeofenceDrawMode(null)
  }

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const loadPersons = useCallback(async (opts?: { silent?: boolean }) => {
    setPersonLoading(true)
    try {
      const qs = new URLSearchParams()
      if (personFilters.party.length) qs.set('party', personFilters.party.join(','))
      if (personFilters.ageBucket.length) qs.set('ageBucket', personFilters.ageBucket.join(','))
      if (personFilters.voterStatus.length) qs.set('voterStatus', personFilters.voterStatus.join(','))
      if (personFilters.tier.length) qs.set('tier', personFilters.tier.join(','))
      if (personFilters.includeArea.length) qs.set('includeArea', personFilters.includeArea.join(','))
      if (personFilters.excludeSuppressed) qs.set('excludeSuppressed', '1')
      const res = await fetch(`/api/dashboard/persons?${qs.toString()}`)
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Failed to load households')
      const pins = (data.people || []).map((p: any) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        label: p.label,
        effectiveParty: p.effectiveParty,
        party: p.party,
        ageBucket: p.ageBucket,
        canvassStatus: p.canvassStatus,
        district: p.district,
        addressLine: p.addressLine,
        voterStatus: p.voterStatus,
        matchConfidence: p.matchConfidence,
        canvassNotes: p.canvassNotes,
        tier: p.propensity?.tier ?? null,
        confidence: p.propensity?.confidence ?? null,
        propensity: p.propensity?.blended ?? null,
        signal: p.propensity?.signal ?? null,
      }))
      setPersonPins(pins)
      setLayers((prev) => ({ ...prev, persons: true }))
      if (!opts?.silent) toast.success(`${pins.length} households on map`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load households')
    } finally {
      setPersonLoading(false)
    }
  }, [personFilters])

  useEffect(() => {
    if (layers.persons) void loadPersons({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    personFilters.party.join(','),
    personFilters.ageBucket.join(','),
    personFilters.voterStatus.join(','),
    personFilters.tier.join(','),
    personFilters.includeArea.join(','),
    personFilters.excludeSuppressed,
  ])

  const selectedPerson = useMemo(
    () => personPins.find((p) => p.id === selectedPersonId) || null,
    [personPins, selectedPersonId]
  )

  const uploadPersonCsv = async (file: File) => {
    setPersonLoading(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV needs a header and at least one row')
      const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      const rows: Record<string, string>[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals =
          lines[i]
            .match(/("([^"]*)")|([^,]+)/g)
            ?.map((s) => (s?.startsWith('"') ? s.slice(1, -1) : s?.trim() ?? '')) ??
          lines[i].split(',')
        const row: Record<string, string> = {}
        header.forEach((h, j) => {
          row[h] = vals[j] ?? ''
        })
        rows.push(row)
      }
      const res = await fetch('/api/dashboard/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Upload failed')
      await loadPersons({ silent: true })
      toast.success(`Mapped ${data.upserted} households (${data.count} total)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Household upload failed')
    } finally {
      setPersonLoading(false)
    }
  }

  const confirmPersonAtDoor = async (partyOverride?: string, statusOverride?: string) => {
    if (!selectedPersonId) return
    const party = partyOverride || confirmParty
    const status = statusOverride || confirmStatus
    const confirmedId = selectedPersonId
    setConfirmBusy(true)
    try {
      const res = await fetch(`/api/dashboard/persons/${confirmedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          party,
          notes: confirmNotes,
          applyPartyToRecord: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Confirm failed')
      setConfirmParty(party)
      setConfirmStatus(status)

      // Keep the dot on the map: update in place and don't let party filters hide it
      const updated = data.person
      setPersonPins((prev) => {
        const next = prev.map((p) =>
          p.id === confirmedId
            ? {
                ...p,
                party: updated?.party ?? party,
                effectiveParty: updated?.effectiveParty ?? party,
                canvassStatus: updated?.canvassStatus ?? status,
                canvassNotes: updated?.canvassNotes ?? confirmNotes,
              }
            : p
        )
        // If a party filter had removed it from the last fetch, put it back
        if (!next.some((p) => p.id === confirmedId) && updated?.lat != null && updated?.lng != null) {
          next.push({
            id: confirmedId,
            lng: updated.lng,
            lat: updated.lat,
            label: updated.label || 'Household',
            effectiveParty: updated.effectiveParty ?? party,
            party: updated.party ?? party,
            ageBucket: updated.ageBucket,
            canvassStatus: updated.canvassStatus ?? status,
            district: updated.district,
            addressLine: updated.addressLine,
            voterStatus: updated.voterStatus,
            matchConfidence: updated.matchConfidence,
            canvassNotes: updated.canvassNotes,
          })
        }
        return next
      })
      setPersonFilters((prev) => {
        if (!prev.party.length) return prev
        if (prev.party.includes(party)) return prev
        // Expanding filter keeps the recolored dot visible after confirm
        return { ...prev, party: [...prev.party, party] }
      })

      toast.success(`Door confirm: ${party} — pin stays on map`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Confirm failed')
    } finally {
      setConfirmBusy(false)
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

  const loadPropensity = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPropensityLoading(true)
    try {
      const qs = new URLSearchParams({ whoNext: '1', limit: '25' })
      if (personFilters.tier.length) qs.set('tier', personFilters.tier.join(','))
      if (personFilters.includeArea.length) qs.set('includeArea', personFilters.includeArea.join(','))
      if (personFilters.excludeSuppressed) qs.set('excludeSuppressed', '1')
      const res = await fetch(`/api/dashboard/propensity?${qs}`)
      const data = await res.json()
      if (!res.ok || !data.status) return
      setPropensitySummary(data.summary || null)
      setWhoToWork(data.whoToWork || [])
    } catch {
      /* ignore */
    } finally {
      if (!opts?.silent) setPropensityLoading(false)
    }
  }, [personFilters.tier, personFilters.includeArea, personFilters.excludeSuppressed])

  const refreshPropensity = useCallback(async () => {
    setPropensityRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/propensity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Refresh failed')
      setPropensitySummary(data.summary || null)
      toast.success(`Propensity refreshed · ${data.refreshed ?? 0} voters`)
      await loadPropensity({ silent: true })
      if (layers.persons) await loadPersons({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Propensity refresh failed')
    } finally {
      setPropensityRefreshing(false)
    }
  }, [loadPropensity, loadPersons, layers.persons])

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
      setLayers((prev) => ({ ...prev, turf: true }))
      toast.success(`Loaded “${data.turf?.label}” · ${data.count} stops`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Turf load failed')
    } finally {
      setTurfLoading(false)
    }
  }, [])

  useEffect(() => {
    if (layers.turf) void loadTurfList()
  }, [layers.turf, loadTurfList])

  useEffect(() => {
    void loadPropensity({ silent: true })
  }, [loadPropensity])

  const assignActiveTurfToMe = async () => {
    if (!activeTurfId) return
    try {
      const res = await fetch(`/api/dashboard/turfs/${activeTurfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignToSelf: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Assign failed')
      setTurfList((prev) =>
        prev.map((t) =>
          t.id === activeTurfId ? { ...t, assigned_to: data.turf?.assigned_to ?? t.assigned_to } : t
        )
      )
      toast.success(`Assigned “${data.turf?.label || 'turf'}” to you`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed')
    }
  }

  const confirmTurfStopAtDoor = async (partyOverride?: string, statusOverride?: string) => {
    if (!activeTurfId || selectedTurfStopId == null) return
    const party = partyOverride || confirmParty
    const status = statusOverride || confirmStatus
    const stopId = selectedTurfStopId
    setConfirmBusy(true)
    try {
      const res = await fetch(`/api/dashboard/turfs/${activeTurfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterGeoId: stopId,
          status,
          party,
          notes: confirmNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Stop update failed')
      setTurfStops((prev) =>
        prev.map((s) =>
          s.voterGeoId === stopId
            ? {
                ...s,
                party: data.address?.party ?? party,
                canvassStatus: data.address?.canvassStatus ?? status,
              }
            : s
        )
      )
      toast.success(`Stop recorded: ${status}${party ? ` · ${party}` : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stop record failed')
    } finally {
      setConfirmBusy(false)
    }
  }

  const selectedTurfStop = useMemo(
    () => turfStops.find((s) => s.voterGeoId === selectedTurfStopId) || null,
    [turfStops, selectedTurfStopId]
  )

  const handleCreateSubmit = async () => {
    const name = createName.trim() || getDefaultName(createType, createConfig)
    const config = getConfigForType(createType, createConfig)
    if (!config) {
      toast.error('Please fill in the required fields for this automation type.')
      return
    }
    setCreateSubmitting(true)
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: createType, name, config }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create automation')
        return
      }
      toast.success('Automation created.')
      setCreateOpen(false)
      resetCreateForm()
      fetchAutomations()
    } catch {
      toast.error('Failed to create automation')
    } finally {
      setCreateSubmitting(false)
    }
  }

  function getDefaultName(type: AutomationType, config: AutomationConfig): string {
    if (type === 'news_scraper') return `News ${config.state || '?'} District ${config.district || '?'}`
    if (type === 'company_scraper') return `Companies ${config.min_employees ?? 50}+ in ${config.region || 'region'}`
    if (type === 'bbc_commodity_bot') return `BBC: ${config.keywords || 'commodity shocks'}`
    return 'New automation'
  }

  function getConfigForType(type: AutomationType, config: AutomationConfig): AutomationConfig | null {
    if (type === 'news_scraper') {
      if (!config.state?.trim()) return null
      return { state: config.state.trim(), district: config.district?.trim() || undefined }
    }
    if (type === 'company_scraper') {
      if (!config.region?.trim()) return null
      return { region: config.region.trim(), min_employees: config.min_employees ?? 50 }
    }
    if (type === 'bbc_commodity_bot') {
      return { keywords: (config.keywords?.trim() || 'commodity shocks') }
    }
    return null
  }

  function resetCreateForm() {
    setCreateName('')
    setCreateType('news_scraper')
    setCreateConfig({ state: 'NJ', district: '5', region: 'Central Jersey', min_employees: 50, keywords: 'commodity shocks' })
  }

  const handleRun = async (id: number) => {
    setRunningId(id)
    try {
      const res = await fetch(`/api/automations/${id}/run`, { method: 'POST' })
      const data = await res.json()
      if (data?.status) {
        toast.success(data.message || 'Run queued.')
        fetchAutomations()
      } else {
        toast.error(data?.error || 'Run failed')
      }
    } catch {
      toast.error('Run failed')
    } finally {
      setRunningId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this automation?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data?.status) {
        toast.success('Automation deleted.')
        setAutomations(prev => prev.filter(a => a.id !== id))
      } else {
        toast.error(data?.error || 'Delete failed')
      }
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const loadDistrictIntel = useCallback(async (districtCode: string) => {
    setDistrictIntelLoading(true)
    setDistrictDeepReport(null)
    setDistrictDeepConversationId(null)
    try {
      const res = await fetch(`/api/dashboard/district-intel?districtCode=${encodeURIComponent(districtCode)}`)
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Failed to load district intelligence')
        return
      }
      setDistrictIntel(data)
    } catch {
      toast.error('Failed to load district intelligence')
    } finally {
      setDistrictIntelLoading(false)
    }
  }, [])

  const generateDeepDistrictReport = useCallback(async () => {
    if (!selectedDistrict) return
    setDistrictDeepLoading(true)
    setDistrictDeepConversationId(null)
    try {
      const res = await fetch('/api/dashboard/district-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          districtCode: selectedDistrict.districtCode,
          state: selectedDistrict.state,
          districtNumber: selectedDistrict.districtNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Failed to generate deep report')
        return
      }
      if (data?.report) {
        setDistrictDeepReport(data.report)
        if (data.conversationId) {
          setDistrictDeepConversationId(data.conversationId)
          toast.success('Deep report generated — opening cited sources in general/news…')
          // Take the user straight to the cited report rather than requiring
          // a second click on "View full cited report" — this is the whole
          // point of "generate deeper report": find news from Antelope's
          // verified data + web search, cited, in the general/news section.
          setTimeout(() => {
            window.location.href = `/cohort-chat?openConversation=${encodeURIComponent(data.conversationId)}`
          }, 700)
        } else {
          toast.success('Deep report generated.')
        }
      }
    } catch {
      toast.error('Failed to generate deep report')
    } finally {
      setDistrictDeepLoading(false)
    }
  }, [selectedDistrict])

  useEffect(() => {
    if (!customFileRows?.length) setCustomMapPins([])
  }, [customFileRows])

  const sendMapAssistantMessage = useCallback(async () => {
    const text = mapAssistantInput.trim()
    if (!text) return
    const hasData = !!(customFileRows && customFileRows.length > 0)
    setMapAssistantLoading(true)
    setMapAssistantMessages((prev) => [...prev, { role: 'user', content: text }])
    setMapAssistantInput('')
    try {
      const latLng = hasData ? detectLatLngColumns(customFileColumns) : null
      const res = await fetch('/api/dashboard/custom-map/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          hasUploadedData: hasData,
          columns: hasData ? customFileColumns : [],
          rowsSample: hasData && customFileRows ? customFileRows.slice(0, 25) : [],
          rowCount: hasData && customFileRows ? customFileRows.length : 0,
          context: hasData
            ? {
                geoColumn: customGeoColumn,
                geoType: customGeoType,
                valueColumn: customSelectedColumn,
                style: customSelectedStyle,
                latLngSummary: latLng ? `${latLng.lat} / ${latLng.lng}` : 'none',
              }
            : {},
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.result) {
        toast.error(data?.error || 'Assistant failed')
        setMapAssistantMessages((prev) => [...prev, { role: 'assistant', content: 'Request failed. Try again.' }])
        return
      }
      const r = data.result as MapAssistantModelResult
      setMapAssistantMessages((prev) => [...prev, { role: 'assistant', content: r.reply }])

      if (!hasData || !customFileRows) {
        return
      }

      const filtered = filterUploadedRows(customFileRows, r.filterKeywords, r.districtText)
      if (filtered.length === 0) {
        toast.success('No rows match — try broader wording or check column names.')
      }
      if (r.showPins) {
        if (latLng) {
          const labelCol =
            r.pinLabelColumn && customFileColumns.includes(r.pinLabelColumn)
              ? r.pinLabelColumn
              : customFileColumns.find((c) => /name|title|school|facility|label|hospital/i.test(c)) ?? null
          setCustomMapPins(buildPinsFromRows(filtered, latLng.lat, latLng.lng, labelCol))
        } else {
          setCustomMapPins([])
          toast.success('Add latitude & longitude columns to your CSV to plot pins.')
        }
      } else {
        setCustomMapPins([])
      }
      if (r.applyChoropleth && filtered.length > 0) {
        const vc =
          r.valueColumn && customFileColumns.includes(r.valueColumn) ? r.valueColumn : customSelectedColumn
        const st = r.style ?? customSelectedStyle
        const gt = r.geoType ?? customGeoType
        const chor = buildChoroplethFromRows(filtered, customGeoColumn, vc, gt, st, ABBREV_TO_STATE_NAME)
        if (chor) {
          setCustomLayerData({
            ...chor,
            aiSummary: `Assistant · ${filtered.length}/${customFileRows.length} rows`,
          })
          setCustomSelectedColumn(vc)
          if (r.style) setCustomSelectedStyle(st)
          if (r.geoType) setCustomGeoType(gt)
        }
      }
      setLayers((prev) => ({ ...prev, customizable: true }))
      toast.success('Map updated')
    } catch {
      toast.error('Assistant request failed')
      setMapAssistantMessages((prev) => [...prev, { role: 'assistant', content: 'Network error.' }])
    } finally {
      setMapAssistantLoading(false)
    }
  }, [
    mapAssistantInput,
    customFileRows,
    customFileColumns,
    customGeoColumn,
    customGeoType,
    customSelectedColumn,
    customSelectedStyle,
  ])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%', position: 'relative' }}>
        <DashboardMap
          layers={layers}
          customLayerData={layers.customizable ? customLayerData : null}
          customMapPins={customMapPins}
          personPins={layers.persons ? personPins : null}
          personHeatmap={personHeatmap}
          personColorMode={personColorMode}
          turfStops={layers.turf ? turfStops : null}
          geofencing={geofencingMapProps}
          onDistrictSelect={(district) => {
            setSelectedDistrict(district)
            loadDistrictIntel(district.districtCode)
          }}
          onPersonSelect={(person) => {
            setSelectedPersonId(person.id)
            setSelectedTurfStopId(null)
            if (person.effectiveParty) setConfirmParty(person.effectiveParty)
            setConfirmStatus('confirmed')
            setRightPanelOpen(true)
          }}
          onTurfStopSelect={(stop) => {
            setSelectedTurfStopId(stop.voterGeoId)
            setSelectedPersonId(null)
            if (stop.party) setConfirmParty(stop.party)
            setConfirmStatus('confirmed')
            setRightPanelOpen(true)
          }}
        />
        {selectedTurfStop && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 20,
              transform: 'translateX(-50%)',
              zIndex: 30,
              width: 'min(420px, calc(100% - 24px))',
            }}
            className="rounded-xl border border-teal-500/30 bg-background/95 backdrop-blur-md shadow-2xl p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  #{selectedTurfStop.sortOrder} · {selectedTurfStop.label}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {activeTurfLabel || 'Turf'} · {selectedTurfStop.canvassStatus || 'not_contacted'} ·{' '}
                  <span className="font-medium text-foreground">
                    {selectedTurfStop.party || 'unknown lean'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setSelectedTurfStopId(null)}
                aria-label="Close turf stop"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Field stop — append-only contact log + current-status rollup. DNC request
              suppresses this voter everywhere.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { party: 'Democrat', className: 'bg-blue-600 hover:bg-blue-700 text-white' },
                  { party: 'Republican', className: 'bg-red-600 hover:bg-red-700 text-white' },
                  { party: 'Independent', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
                  { party: 'Unaffiliated', className: 'bg-slate-600 hover:bg-slate-700 text-white' },
                ] as const
              ).map(({ party, className }) => (
                <Button
                  key={party}
                  type="button"
                  size="sm"
                  disabled={confirmBusy}
                  className={`h-10 text-xs font-semibold ${className}`}
                  onClick={() => void confirmTurfStopAtDoor(party, 'supporter')}
                >
                  {confirmBusy && confirmParty === party ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {party}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['lean_support', 'Lean support'],
                  ['undecided', 'Undecided'],
                  ['lean_against', 'Lean against'],
                  ['not_home', 'Not home'],
                  ['moved', 'Moved'],
                  ['wrong_address', 'Wrong address'],
                  ['refused', 'Refused'],
                  ['dnc_request', 'DNC'],
                ] as const
              ).map(([status, label]) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={status === 'dnc_request' ? 'destructive' : 'outline'}
                  disabled={confirmBusy}
                  className="h-7 text-[10px]"
                  onClick={() => void confirmTurfStopAtDoor(confirmParty, status)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {selectedPerson && !selectedTurfStop && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 20,
              transform: 'translateX(-50%)',
              zIndex: 30,
              width: 'min(420px, calc(100% - 24px))',
            }}
            className="rounded-xl border border-border bg-background/95 backdrop-blur-md shadow-2xl p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedPerson.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {selectedPerson.addressLine || 'Household'} · lean{' '}
                  <span className="font-medium text-foreground">
                    {selectedPerson.effectiveParty || selectedPerson.party || 'unknown'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setSelectedPersonId(null)}
                aria-label="Close door confirm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              At the door — tap the confirmed lean. Dot color updates immediately.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { party: 'Democrat', className: 'bg-blue-600 hover:bg-blue-700 text-white' },
                  { party: 'Republican', className: 'bg-red-600 hover:bg-red-700 text-white' },
                  { party: 'Independent', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
                  { party: 'Unaffiliated', className: 'bg-slate-600 hover:bg-slate-700 text-white' },
                ] as const
              ).map(({ party, className }) => (
                <Button
                  key={party}
                  type="button"
                  size="sm"
                  disabled={confirmBusy}
                  className={`h-10 text-xs font-semibold ${className}`}
                  onClick={() => void confirmPersonAtDoor(party, 'confirmed')}
                >
                  {confirmBusy && confirmParty === party ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {party}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['not_home', 'Not home'],
                  ['refused', 'Refused'],
                  ['moved', 'Moved'],
                  ['wrong_address', 'Wrong address'],
                ] as const
              ).map(([status, label]) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={confirmBusy}
                  className="h-7 text-[10px]"
                  onClick={() => void confirmPersonAtDoor(confirmParty, status)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}>
          <button onClick={toggleSidebar} className={toggleBtnClass} title="Toggle sidebar">
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 20 }}>
          <button
            onClick={() => setRightPanelOpen(prev => !prev)}
            className={toggleBtnClass}
            title={rightPanelOpen ? 'Collapse layers panel' : 'Expand layers panel'}
          >
            <PanelLeft className="h-3.5 w-3.5" style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
      </div>

      <div
        style={{
          width: rightPanelOpen ? '13rem' : 0,
          flexShrink: 0,
          height: '100%',
          overflow: 'hidden',
          transition: 'width 200ms ease-in-out',
        }}
        className="bg-background border-l border-border/40"
      >
        <div style={{ width: '13rem', height: '100%', overflowY: 'auto' }} className="px-2 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-2">
            Map Layers
          </p>
          <div className="space-y-4 px-1">
            <Section title="Layers">
              <div className="space-y-1">
                <LayerToggle icon={<Landmark className="h-3 w-3" />} label="Political" active={layers.political} colorClass="text-red-400" activeBg="bg-red-500/10 border-red-500/20" onClick={() => toggleLayer('political')} />
                <LayerToggle icon={<Grid3x3 className="h-3 w-3" />} label="Districts" active={layers.districts} colorClass="text-orange-400" activeBg="bg-orange-500/10 border-orange-500/20" onClick={() => toggleLayer('districts')} />
                <LayerToggle icon={<MapPin className="h-3 w-3" />} label="Responses" active={layers.responses} colorClass="text-blue-400" activeBg="bg-blue-500/10 border-blue-500/20" onClick={() => toggleLayer('responses')} />
                <LayerToggle icon={<Vote className="h-3 w-3" />} label="Voters" active={layers.voters} colorClass="text-purple-400" activeBg="bg-purple-500/10 border-purple-500/20" onClick={() => toggleLayer('voters')} />
                <LayerToggle icon={<HandCoins className="h-3 w-3" />} label="Fundraising" active={layers.fundraising} colorClass="text-emerald-400" activeBg="bg-emerald-500/10 border-emerald-500/20" onClick={() => toggleLayer('fundraising')} />
                <LayerToggle icon={<Palette className="h-3 w-3" />} label="Customizable" active={layers.customizable} colorClass="text-violet-400" activeBg="bg-violet-500/10 border-violet-500/20" onClick={() => toggleLayer('customizable')} />
                <LayerToggle icon={<Users className="h-3 w-3" />} label="Households" active={layers.persons} colorClass="text-sky-400" activeBg="bg-sky-500/10 border-sky-500/20" onClick={() => {
                  const next = !layers.persons
                  setLayers((prev) => ({ ...prev, persons: next }))
                  if (next) void loadPersons()
                }} />
                <LayerToggle icon={<Fence className="h-3 w-3" />} label="Geofencing" active={layers.geofencing} colorClass="text-cyan-400" activeBg="bg-cyan-500/10 border-cyan-500/20" onClick={() => toggleLayer('geofencing')} />
                <LayerToggle
                  icon={<Route className="h-3 w-3" />}
                  label="Turf walk"
                  active={layers.turf}
                  colorClass="text-teal-400"
                  activeBg="bg-teal-500/10 border-teal-500/20"
                  onClick={() => {
                    const next = !layers.turf
                    setLayers((prev) => ({ ...prev, turf: next }))
                    if (next) void loadTurfList()
                  }}
                />
              </div>
            </Section>

            <Section title="Propensity funnel" defaultOpen>
              <div className="space-y-2 text-[10px] text-muted-foreground">
                <p>
                  Hot / warm / cold from the decaying blend. Pins: solid emerald ring = confirmed,
                  amber = estimated.
                </p>
                {propensityLoading && !propensitySummary ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : propensitySummary ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-1">
                      {(['hot', 'warm', 'cold'] as const).map((t) => {
                        const count =
                          t === 'hot'
                            ? propensitySummary.hot
                            : t === 'warm'
                              ? propensitySummary.warm
                              : propensitySummary.cold
                        const on = personFilters.tier.includes(t)
                        const tone =
                          t === 'hot'
                            ? 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                            : t === 'warm'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                        return (
                          <button
                            key={t}
                            type="button"
                            title={`Filter map to ${t}`}
                            className={`rounded border px-1.5 py-1 text-center capitalize ${tone} ${
                              on ? 'ring-1 ring-foreground/40' : ''
                            }`}
                            onClick={() => {
                              setPersonFilters((prev) => ({
                                ...prev,
                                tier: on ? prev.tier.filter((x) => x !== t) : [...prev.tier, t],
                              }))
                              setLayers((prev) => ({ ...prev, persons: true }))
                              setPersonColorMode('tier')
                            }}
                          >
                            <p className="text-[9px] uppercase">{t}</p>
                            <p className="text-[12px] font-semibold text-foreground tabular-nums">
                              {count}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[9px]">
                      k={propensitySummary.decayK.toFixed(2)} · avg P{' '}
                      {propensitySummary.avgPropensity != null
                        ? propensitySummary.avgPropensity.toFixed(2)
                        : '—'}{' '}
                      · est {propensitySummary.estimated ?? '—'} / conf{' '}
                      {propensitySummary.confirmed ?? '—'}
                    </p>
                  </div>
                ) : (
                  <p className="italic">No rows yet — recompute after households are on the map.</p>
                )}

                <div className="space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Who to work next
                  </p>
                  {whoToWork.length === 0 ? (
                    <p className="italic text-[9px]">Refresh propensity to populate the work list.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {whoToWork.slice(0, 12).map((w, i) => (
                        <button
                          key={w.person_record_id}
                          type="button"
                          className="w-full text-left rounded border border-border/50 px-1.5 py-1 hover:bg-muted/40"
                          onClick={() => {
                            if (w.latitude != null && w.longitude != null) {
                              setLayers((prev) => ({ ...prev, persons: true }))
                              setSelectedPersonId(w.person_record_id)
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[10px] text-foreground">
                              {i + 1}. {w.label || `#${w.person_record_id}`}
                            </span>
                            <span
                              className={`shrink-0 text-[9px] capitalize px-1 rounded border ${
                                w.tier === 'hot'
                                  ? 'border-orange-500/40 text-orange-600'
                                  : w.tier === 'warm'
                                    ? 'border-amber-500/40 text-amber-600'
                                    : 'border-sky-500/40 text-sky-600'
                              }`}
                            >
                              {w.tier}
                            </span>
                          </div>
                          <p className="text-[9px] text-muted-foreground">
                            P={w.propensity.toFixed(2)} · {w.signal || 'estimated'} ·{' '}
                            {w.party || '—'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-[10px]"
                    disabled={propensityRefreshing}
                    onClick={() => void refreshPropensity()}
                  >
                    {propensityRefreshing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Refresh
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1 h-7 text-[10px]" asChild>
                    <Link href="/targeting/propensity">
                      <Crosshair className="h-3 w-3" />
                      Plan
                    </Link>
                  </Button>
                </div>
              </div>
            </Section>

            <div className="rounded-md border border-border/50 bg-muted/15 px-1.5 py-1.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
                Map assistant
              </p>
              {!mapAssistantOpen ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full h-8 justify-center gap-1.5 text-[10px]"
                  onClick={() => setMapAssistantOpen(true)}
                >
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  Open chat
                </Button>
              ) : (
                <div className="rounded border border-border/40 bg-background flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between gap-1 px-1.5 py-1 border-b border-border/40 shrink-0">
                    <span className="text-[10px] font-medium text-muted-foreground truncate">Chat</span>
                    <div className="flex items-center gap-0 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[9px]"
                        onClick={() => {
                          setCustomMapPins([])
                          toast.success('Pins cleared')
                        }}
                      >
                        Clear pins
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setMapAssistantOpen(false)}
                        aria-label="Collapse map assistant"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[160px] overflow-y-auto px-1.5">
                    <div className="space-y-1.5 py-1.5">
                      {mapAssistantMessages.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          Ask about layers or upload a CSV for custom pins. Use <strong>Customizable</strong> for your data.
                        </p>
                      ) : (
                        mapAssistantMessages.map((m, i) => (
                          <div
                            key={i}
                            className={`text-[10px] leading-snug rounded px-1.5 py-1 ${
                              m.role === 'user'
                                ? 'bg-primary/12 text-foreground ml-2'
                                : 'bg-muted/40 text-muted-foreground mr-2'
                            }`}
                          >
                            {m.content}
                          </div>
                        ))
                      )}
                      {mapAssistantLoading && (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground py-0.5">
                          <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-1.5 border-t border-border/40 space-y-1 shrink-0">
                    <Textarea
                      value={mapAssistantInput}
                      onChange={(e) => setMapAssistantInput(e.target.value)}
                      placeholder={
                        customFileRows && customFileRows.length > 0
                          ? 'Filter schools, change style…'
                          : 'Ask about the map…'
                      }
                      className="min-h-[48px] text-[10px] resize-none py-1.5"
                      disabled={mapAssistantLoading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void sendMapAssistantMessage()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="w-full h-7 text-[10px]"
                      disabled={mapAssistantLoading || !mapAssistantInput.trim()}
                      onClick={() => void sendMapAssistantMessage()}
                    >
                      {mapAssistantLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {layers.geofencing && (
              <Section title="Canvass geofencing" defaultOpen>
                <div className="space-y-2 text-[10px] text-muted-foreground">
                  <p>
                    Draw green <span className="text-emerald-500 font-medium">include</span> or red{' '}
                    <span className="text-red-500 font-medium">exclude</span> zones. Client preview highlights instantly;
                    Finish saves to MySQL for authoritative spatial queries (and the{' '}
                    <code className="text-[9px]">addresses_in_area</code> tool).
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
                      className="h-7 text-[11px]"
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
                        toast.success('Include zone: click the map to add corners, then Finish.')
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
                        toast.success('Exclude zone: click the map to add corners, then Finish.')
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
                      onClick={finishGeofencePolygon}
                      disabled={!geofenceDrawMode || geofenceDraftVertices.length < 3 || geofenceSaving}
                    >
                      {geofenceSaving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Finish & save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 gap-0.5" onClick={cancelGeofenceDraft}>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        if (!confirm('Clear map zones? (Does not delete saved fences)')) return
                        setGeofences([])
                        setGeofenceDraftVertices([])
                        setGeofenceDrawMode(null)
                        setGeofenceQueryCount(null)
                      }}
                    >
                      Clear zones
                    </Button>
                  </div>
                  {geofences.length > 0 && (
                    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1">
                      <p className="font-medium text-foreground text-[10px]">Saved fences</p>
                      {geofences.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-1">
                          <span className="truncate text-[10px]">
                            {f.label || f.id}
                            {f.mode === 'exclude' ? ' (exclude)' : ''}
                            {!f.dbId && !/^\d+$/.test(f.id) ? ' · unsaved' : ''}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 text-[9px] px-1.5 shrink-0"
                            disabled={geofenceQueryBusy || (!f.dbId && !/^\d+$/.test(f.id))}
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
                  <p className="text-[9px] pt-1 border-t border-border/50">
                    Preview rules: exclude wins. With include zones, only addresses inside an include (and not in exclude)
                    are “canvass”. DB Query uses ST_Contains on voter_geo — not the client classifier.
                  </p>
                  <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-dashed border-border text-[11px] cursor-pointer hover:bg-muted/50">
                    <Upload className="h-3 w-3" />
                    Register CSV (lat/lng)
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
                            toast.error('CSV needs a header row and data rows.')
                            return
                          }
                          const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
                          const latCol =
                            header.find((h) => /^(lat|latitude)$/i.test(h.trim())) ||
                            header.find((h) => /\blat(itude)?\b/i.test(h)) ||
                            ''
                          const lngCol =
                            header.find((h) => /^(lng|lon|longitude|long)$/i.test(h.trim())) ||
                            header.find((h) => /\b(lng|lon|longitude)\b/i.test(h)) ||
                            ''
                          if (!latCol || !lngCol) {
                            toast.error('Could not find latitude/longitude columns (try lat, latitude, lng, longitude).')
                            return
                          }
                          const labelCol = header.find((h) => /address|street|line1|addr/i.test(h)) || header[0]
                          const out: { id: string; lng: number; lat: number; label?: string }[] = []
                          for (let i = 1; i < lines.length; i++) {
                            const vals = lines[i].match(/("([^"]*)")|([^,]+)/g)?.map((s) => (s?.startsWith('"') ? s.slice(1, -1) : s?.trim() ?? '')) ?? lines[i].split(',')
                            const row: Record<string, string> = {}
                            header.forEach((h, j) => {
                              row[h] = vals[j] ?? ''
                            })
                            const lat = parseFloat(String(row[latCol] ?? '').replace(/,/g, ''))
                            const lng = parseFloat(String(row[lngCol] ?? '').replace(/,/g, ''))
                            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
                            out.push({
                              id: `row-${i}`,
                              lat,
                              lng,
                              label: row[labelCol] || undefined,
                            })
                          }
                          setGeofenceAddressRows(out)
                          toast.success(`Loaded ${out.length} addresses with coordinates.`)
                        } catch {
                          toast.error('Failed to parse CSV.')
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
                    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-[10px] space-y-0.5">
                      <p className="font-medium text-foreground">Addresses vs fences</p>
                      <p>
                        <span className="text-emerald-600 dark:text-emerald-400">Canvass {geofenceStats.canvass}</span>
                        {' · '}
                        <span className="text-red-600 dark:text-red-400">Skip {geofenceStats.skip}</span>
                        {geofenceStats.neutral > 0 && (
                          <>
                            {' · '}
                            <span className="text-slate-500">Neutral {geofenceStats.neutral}</span>
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {layers.turf && (
              <Section title="Turf walk-list" defaultOpen>
                <div className="space-y-2 text-[10px] text-muted-foreground">
                  <p>
                    Load a saved turf (from <code className="text-[9px]">build_turf</code>) as numbered field
                    stops. Assign yourself, knock, record outcomes.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[10px]"
                    disabled={turfLoading}
                    onClick={() => void loadTurfList()}
                  >
                    {turfLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
                    Refresh turfs
                  </Button>
                  {turfList.length === 0 ? (
                    <p className="text-[10px] italic">No saved turfs yet. Build one via consultant or API.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {turfList.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between gap-1 rounded border px-1.5 py-1 ${
                            activeTurfId === t.id ? 'border-teal-500/50 bg-teal-500/10' : 'border-border/60'
                          }`}
                        >
                          <button
                            type="button"
                            className="min-w-0 text-left truncate text-[10px] text-foreground"
                            onClick={() => void loadTurfStops(t.id)}
                          >
                            {t.label}
                            <span className="text-muted-foreground"> · {t.address_count}</span>
                          </button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 text-[9px] px-1.5 shrink-0"
                            disabled={turfLoading}
                            onClick={() => void loadTurfStops(t.id)}
                          >
                            Load
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTurfId && (
                    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1.5">
                      <p className="font-medium text-foreground text-[10px]">
                        Active: {activeTurfLabel} · {turfStops.length} stops
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[10px]"
                          onClick={() => void assignActiveTurfToMe()}
                        >
                          Assign to me
                        </Button>
                        <Button asChild size="sm" variant="outline" className="h-7 text-[10px]">
                          <Link href={`/dashboard/print-map?turfId=${activeTurfId}`}>
                            <Printer className="h-3 w-3" />
                            Print walk sheet
                          </Link>
                        </Button>
                      </div>
                      <p className="text-[9px]">
                        Done:{' '}
                        {turfStops.filter((s) => s.canvassStatus && s.canvassStatus !== 'not_contacted').length}
                        {' / '}
                        {turfStops.length}
                      </p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {(layers.political || layers.districts) && (
              <Section title="Legend">
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    Cook PVI {layers.districts ? '(Districts)' : '(States)'}
                  </p>
                  <div className="flex items-center gap-0.5">
                    {[-25, -15, -5, 0, 5, 15, 25].map(v => (
                      <div key={v} className="flex-1 h-2.5 rounded-sm" style={{ backgroundColor: pviToColor(v, 0.8) }} />
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px] text-red-400 font-medium">R+25</span>
                    <span className="text-[9px] text-muted-foreground">Even</span>
                    <span className="text-[9px] text-blue-400 font-medium">D+25</span>
                  </div>
                </div>
              </Section>
            )}

            {layers.customizable && customLayerData && (
              <Section title="Custom legend">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium truncate" title={customLayerData.columnName}>{customLayerData.columnName}</p>
                  <p className="text-[9px] text-muted-foreground capitalize">{customLayerData.style} · {customLayerData.type}</p>
                  {customLayerData.minVal != null && customLayerData.maxVal != null && (
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>{customLayerData.minVal}</span>
                      <span>{customLayerData.maxVal}</span>
                    </div>
                  )}
                  {customLayerData.aiSummary && (
                    <p className="text-[9px] text-muted-foreground italic border-t border-border/60 pt-1.5 mt-1">{customLayerData.aiSummary}</p>
                  )}
                </div>
              </Section>
            )}

            {layers.districts && (
              <Section title="District intelligence" defaultOpen={true}>
                <div className="space-y-2">
                  {!selectedDistrict ? (
                    <p className="text-[10px] text-muted-foreground">
                      Click a district on the map to load a public-data intelligence brief.
                    </p>
                  ) : (
                    <>
                      <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
                        <p className="text-[11px] font-medium">{selectedDistrict.districtCode}</p>
                        <p className="text-[9px] text-muted-foreground">State {selectedDistrict.state} · District {selectedDistrict.districtNumber}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-[10px]"
                          onClick={() => loadDistrictIntel(selectedDistrict.districtCode)}
                          disabled={districtIntelLoading}
                        >
                          {districtIntelLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Refresh report
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-7 text-[10px]"
                          onClick={() => {
                            const code = selectedDistrict.districtCode
                            window.location.href = `/cohort-chat?district=${encodeURIComponent(code)}`
                          }}
                        >
                          Open in chat
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full h-7 text-[10px]"
                        onClick={generateDeepDistrictReport}
                        disabled={districtDeepLoading}
                      >
                        {districtDeepLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Generate deeper report (LLM)
                      </Button>
                      {districtIntel ? (
                        <div className="space-y-1.5 rounded border border-border/60 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground">
                            PVI {districtIntel.district.pvi || 'N/A'} · Margin 2024 {districtIntel.district.margin2024.toFixed(1)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Incumbent: {districtIntel.district.incumbentName || 'Unknown'} ({districtIntel.district.incumbentParty || 'N/A'})
                          </p>
                          <p className="text-[9px] text-muted-foreground line-clamp-4">{districtIntel.intelligence.narrative}</p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted">Census: {districtIntel.external.censusStatus}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted">FEC: {districtIntel.external.fecStatus}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted">OpenStates: {districtIntel.external.openStatesStatus}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted">Ballotpedia: {districtIntel.external.ballotpediaStatus}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted">MIT Lab: {districtIntel.external.mitElectionLabStatus}</span>
                          </div>
                        </div>
                      ) : null}
                      {districtDeepReport ? (
                        <div className="space-y-1 rounded border border-primary/30 bg-primary/5 px-2 py-1.5">
                          <p className="text-[10px] font-medium">{districtDeepReport.title}</p>
                          <p className="text-[9px] text-muted-foreground line-clamp-6">{districtDeepReport.executiveSummary}</p>
                          {districtDeepReport.strategicAngles?.length ? (
                            <div>
                              <p className="text-[9px] font-medium">Strategic angles</p>
                              <ul className="text-[9px] text-muted-foreground list-disc pl-3">
                                {districtDeepReport.strategicAngles.slice(0, 3).map((item, idx) => (
                                  <li key={idx}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {districtDeepReport.messageTestingIdeas?.length ? (
                            <div>
                              <p className="text-[9px] font-medium">Message tests</p>
                              <ul className="text-[9px] text-muted-foreground list-disc pl-3">
                                {districtDeepReport.messageTestingIdeas.slice(0, 3).map((item, idx) => (
                                  <li key={idx}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {districtDeepConversationId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-auto min-h-7 py-1.5 px-2 mt-1 whitespace-normal text-center text-[10px] leading-snug"
                              onClick={() => {
                                window.location.href = `/cohort-chat?openConversation=${encodeURIComponent(districtDeepConversationId)}`
                              }}
                            >
                              <Newspaper className="h-3 w-3 mr-1 shrink-0" />
                              <span>View full cited report in general/news</span>
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </Section>
            )}

            <Section title="Households · party & address" defaultOpen>
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Upload a mock / unified district CSV (lat/lng + party) to pin households by address.
                  Filter by partisanship, toggle a density heatmap, then confirm lean at the door.
                </p>
                <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-dashed border-border text-[11px] cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-3 w-3" />
                  Upload household CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadPersonCsv(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[10px]"
                  disabled={personLoading}
                  onClick={() => void loadPersons()}
                >
                  {personLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                  Load from database
                </Button>
                <Button asChild size="sm" variant="secondary" className="w-full h-7 text-[10px]">
                  <Link href="/dashboard/print-map">
                    <Printer className="h-3 w-3" />
                    Print on map
                  </Link>
                </Button>
                <div className="space-y-1">
                  <Label className="text-[10px]">Party / lean filter</Label>
                  <div className="flex flex-wrap gap-1">
                    {['Democrat', 'Republican', 'Independent', 'Unaffiliated'].map((p) => {
                      const on = personFilters.party.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300' : 'border-border text-muted-foreground'}`}
                          onClick={() =>
                            setPersonFilters((prev) => ({
                              ...prev,
                              party: on ? prev.party.filter((x) => x !== p) : [...prev.party, p],
                            }))
                          }
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Propensity tier</Label>
                  <div className="flex flex-wrap gap-1">
                    {(['hot', 'warm', 'cold'] as const).map((t) => {
                      const on = personFilters.tier.includes(t)
                      const tone =
                        t === 'hot'
                          ? 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-300'
                          : t === 'warm'
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                            : 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] border capitalize ${
                            on ? tone : 'border-border text-muted-foreground'
                          }`}
                          onClick={() =>
                            setPersonFilters((prev) => ({
                              ...prev,
                              tier: on ? prev.tier.filter((x) => x !== t) : [...prev.tier, t],
                            }))
                          }
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Inside area (geofence label)</Label>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(
                      new Set([
                        'Area A',
                        ...geofences.filter((g) => g.mode === 'include' && g.label).map((g) => g.label!),
                      ])
                    ).map((label) => {
                      const on = personFilters.includeArea.includes(label)
                      return (
                        <button
                          key={label}
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${
                            on
                              ? 'bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300'
                              : 'border-border text-muted-foreground'
                          }`}
                          onClick={() =>
                            setPersonFilters((prev) => ({
                              ...prev,
                              includeArea: on
                                ? prev.includeArea.filter((x) => x !== label)
                                : [...prev.includeArea, label],
                            }))
                          }
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personFilters.excludeSuppressed}
                    onChange={(e) =>
                      setPersonFilters((prev) => ({
                        ...prev,
                        excludeSuppressed: e.target.checked,
                      }))
                    }
                  />
                  Not DNC (exclude suppressed)
                </label>
                <div className="space-y-1">
                  <Label className="text-[10px]">Age bucket</Label>
                  <div className="flex flex-wrap gap-1">
                    {['18-24', '25-34', '35-44', '45-54', '55-64', '65+'].map((b) => {
                      const on = personFilters.ageBucket.includes(b)
                      return (
                        <button
                          key={b}
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? 'bg-sky-500/15 border-sky-500/40' : 'border-border text-muted-foreground'}`}
                          onClick={() =>
                            setPersonFilters((prev) => ({
                              ...prev,
                              ageBucket: on ? prev.ageBucket.filter((x) => x !== b) : [...prev.ageBucket, b],
                            }))
                          }
                        >
                          {b}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personHeatmap}
                    onChange={(e) => setPersonHeatmap(e.target.checked)}
                  />
                  Party density heatmap
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] border ${
                      personColorMode === 'tier'
                        ? 'bg-orange-500/15 border-orange-500/40'
                        : 'border-border text-muted-foreground'
                    }`}
                    onClick={() => setPersonColorMode('tier')}
                  >
                    Color by tier
                  </button>
                  <button
                    type="button"
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] border ${
                      personColorMode === 'party'
                        ? 'bg-sky-500/15 border-sky-500/40'
                        : 'border-border text-muted-foreground'
                    }`}
                    onClick={() => setPersonColorMode('party')}
                  >
                    Color by party
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {personPins.length} households ·{' '}
                  {personColorMode === 'tier'
                    ? 'tier fill (hot/warm/cold) · emerald=confirmed · amber=estimated'
                    : 'party fill · emerald ring=confirmed engagement'}
                </p>

                {selectedPerson && (
                  <div className="rounded border border-border p-2 space-y-1.5 bg-muted/20">
                    <p className="text-[11px] font-medium">{selectedPerson.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedPerson.addressLine || '—'} · {selectedPerson.district || 'no district'}
                    </p>
                    <p className="text-[10px]">
                      File lean: <strong>{selectedPerson.party || '—'}</strong>
                      {selectedPerson.effectiveParty &&
                      selectedPerson.effectiveParty !== selectedPerson.party
                        ? ` → door: ${selectedPerson.effectiveParty}`
                        : ''}
                    </p>
                    <Label className="text-[10px]">Confirm at door</Label>
                    <select
                      className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                      value={confirmStatus}
                      onChange={(e) => setConfirmStatus(e.target.value)}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="contacted">Contacted</option>
                      <option value="not_home">Not home</option>
                      <option value="refused">Refused</option>
                      <option value="moved">Moved</option>
                      <option value="wrong_address">Wrong address</option>
                    </select>
                    <select
                      className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                      value={confirmParty}
                      onChange={(e) => setConfirmParty(e.target.value)}
                    >
                      <option>Democrat</option>
                      <option>Republican</option>
                      <option>Independent</option>
                      <option>Unaffiliated</option>
                    </select>
                    <Textarea
                      value={confirmNotes}
                      onChange={(e) => setConfirmNotes(e.target.value)}
                      placeholder="Door notes (optional)"
                      rows={2}
                      className="text-[11px] min-h-[48px]"
                    />
                    <Button
                      size="sm"
                      className="w-full h-7 text-[10px]"
                      disabled={confirmBusy}
                      onClick={() => void confirmPersonAtDoor()}
                    >
                      {confirmBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Save door confirmation
                    </Button>
                    <p className="text-[9px] text-muted-foreground">
                      Tip: tap a household dot on the map for one-tap Dem/Rep confirm.
                    </p>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Upload data set to map" defaultOpen={false}>
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  CSV with state or district column + a numeric column (e.g. Census). For facility pins, include latitude &amp; longitude
                  columns. After upload, use <strong>Map assistant</strong> (under Map Layers) to filter rows or switch styling in plain language.
                </p>
                <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-dashed border-border text-[11px] cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-3 w-3" />
                  Choose CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setCustomUploadLoading(true)
                      try {
                        const text = await file.text()
                        const lines = text.split(/\r?\n/).filter(Boolean)
                        if (lines.length < 2) { toast.error('CSV needs a header and at least one row'); return }
                        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
                        const rows: Record<string, string>[] = []
                        for (let i = 1; i < lines.length; i++) {
                          const vals = lines[i].match(/("([^"]*)")|([^,]+)/g)?.map(s => (s?.startsWith('"') ? s.slice(1, -1) : s?.trim() ?? '')) ?? lines[i].split(',')
                          const row: Record<string, string> = {}
                          header.forEach((h, j) => { row[h] = vals[j] ?? '' })
                          rows.push(row)
                        }
                        setCustomFileRows(rows)
                        setCustomFileColumns(header)
                        setCustomSelectedColumn(header.find(h => /value|rate|pct|percent|pop|population|income|median/i.test(h)) ?? header[1] ?? header[0])
                        setCustomGeoColumn(header.find(h => /state|district|name|geo|fips/i.test(h)) ?? header[0])
                        setCustomAiSummary(null)
                        setCustomMapPins([])
                        toast.success(`Loaded ${rows.length} rows`)
                      } catch (err) {
                        toast.error('Failed to parse CSV')
                      } finally {
                        setCustomUploadLoading(false)
                        e.target.value = ''
                      }
                    }}
                  />
                </label>
                {customUploadLoading && <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Parsing…</div>}
                {customFileRows && customFileColumns.length > 0 && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Geo level</Label>
                      <select
                        className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                        value={customGeoType}
                        onChange={(e) => setCustomGeoType(e.target.value as CustomLayerGeoType)}
                      >
                        <option value="state">State</option>
                        <option value="district">District</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Geo column (state or district id)</Label>
                      <select
                        className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                        value={customGeoColumn}
                        onChange={(e) => setCustomGeoColumn(e.target.value)}
                      >
                        {customFileColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Value column</Label>
                      <select
                        className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                        value={customSelectedColumn}
                        onChange={(e) => setCustomSelectedColumn(e.target.value)}
                      >
                        {customFileColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Display style</Label>
                      <select
                        className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                        value={customSelectedStyle}
                        onChange={(e) => setCustomSelectedStyle(e.target.value as CustomLayerStyle)}
                      >
                        <option value="color">Color</option>
                        <option value="saturation">Saturation</option>
                        <option value="heatmap">Heat map</option>
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-[10px] h-7 gap-1"
                        onClick={async () => {
                          setCustomAiAnalyzing(true)
                          try {
                            const res = await fetch('/api/dashboard/custom-map/analyze', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ rows: customFileRows.slice(0, 50), columns: customFileColumns, valueColumn: customSelectedColumn }),
                            })
                            const data = await res.json()
                            if (data?.summary) setCustomAiSummary(data.summary)
                            if (data?.suggestedColumn) setCustomSelectedColumn(data.suggestedColumn)
                            if (data?.suggestedStyle) setCustomSelectedStyle(data.suggestedStyle)
                          } catch {
                            toast.error('AI analysis failed')
                          } finally {
                            setCustomAiAnalyzing(false)
                          }
                        }}
                        disabled={customAiAnalyzing}
                      >
                        {customAiAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        AI analyze
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-[10px] h-7"
                        onClick={() => {
                          const nameCol = customGeoColumn || customFileColumns[0]
                          const values: Record<string, number> = {}
                          let minVal = Infinity, maxVal = -Infinity
                          for (const row of customFileRows!) {
                            let key = (row[nameCol] ?? row['State'] ?? row['state'] ?? row['NAME'] ?? '').trim()
                            if (customGeoType === 'state' && key.length === 2) {
                              key = ABBREV_TO_STATE_NAME[key.toUpperCase()] ?? key
                            }
                            const num = parseFloat((row[customSelectedColumn] ?? '').replace(/[%,$]/g, ''))
                            if (key && !Number.isNaN(num)) {
                              values[key] = num
                              minVal = Math.min(minVal, num)
                              maxVal = Math.max(maxVal, num)
                            }
                          }
                          setCustomLayerData({
                            type: customGeoType,
                            values,
                            columnName: customSelectedColumn,
                            style: customSelectedStyle,
                            minVal: minVal === Infinity ? undefined : minVal,
                            maxVal: maxVal === -Infinity ? undefined : maxVal,
                            aiSummary: customAiSummary ?? undefined,
                          })
                          setLayers(prev => ({ ...prev, customizable: true }))
                          toast.success('Applied to map')
                        }}
                      >
                        Apply to map
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Section>

            <Section title="Bots & scrapers" defaultOpen={true}>
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center gap-1.5 text-[11px] h-7"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Create automation
                </Button>
                {automationsLoading ? (
                  <div className="flex items-center justify-center py-4 gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : automations.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground px-0.5">No automations yet. Create a news scraper, company finder, or BBC monitor.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {automations.map((a) => (
                      <li key={a.id} className="rounded border border-border/60 bg-muted/30 px-1.5 py-1.5">
                        <div className="flex items-center gap-1 truncate">
                          <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="text-[11px] font-medium truncate" title={a.name}>{a.name}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 gap-0.5">
                          <span className="text-[9px] text-muted-foreground capitalize">{a.type.replace('_', ' ')}</span>
                          <div className="flex gap-0.5">
                            <button
                              onClick={() => handleRun(a.id)}
                              disabled={runningId === a.id}
                              className="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground disabled:opacity-50"
                              title="Run now"
                            >
                              {runningId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              disabled={deletingId === a.id}
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                        {a.last_run_at && (
                          <p className="text-[9px] text-muted-foreground mt-0.5">Last run: {new Date(a.last_run_at).toLocaleDateString()}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create automation</DialogTitle>
            <DialogDescription>Add a bot or scraper: news by district, companies by region, or BBC commodity news.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid gap-2">
                {AUTOMATION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCreateType(t.value)}
                    className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                      createType === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {t.icon}
                    <div>
                      <div className="font-medium text-sm">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {createType === 'news_scraper' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="state">State (e.g. NJ)</Label>
                  <Input
                    id="state"
                    value={createConfig.state ?? ''}
                    onChange={(e) => setCreateConfig(c => ({ ...c, state: e.target.value }))}
                    placeholder="NJ"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district">District</Label>
                  <Input
                    id="district"
                    value={createConfig.district ?? ''}
                    onChange={(e) => setCreateConfig(c => ({ ...c, district: e.target.value }))}
                    placeholder="5"
                  />
                </div>
              </div>
            )}
            {createType === 'company_scraper' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={createConfig.region ?? ''}
                    onChange={(e) => setCreateConfig(c => ({ ...c, region: e.target.value }))}
                    placeholder="Central Jersey"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="min_employees">Min employees</Label>
                  <Input
                    id="min_employees"
                    type="number"
                    min={1}
                    value={createConfig.min_employees ?? 50}
                    onChange={(e) => setCreateConfig(c => ({ ...c, min_employees: parseInt(e.target.value, 10) || 50 }))}
                  />
                </div>
              </div>
            )}
            {createType === 'bbc_commodity_bot' && (
              <div className="space-y-1.5">
                <Label htmlFor="keywords">Keywords (e.g. commodity shocks)</Label>
                <Input
                  id="keywords"
                  value={createConfig.keywords ?? ''}
                  onChange={(e) => setCreateConfig(c => ({ ...c, keywords: e.target.value }))}
                  placeholder="commodity shocks"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={getDefaultName(createType, createConfig)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} disabled={createSubmitting}>
              {createSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LayerToggle({
  icon, label, active, colorClass, activeBg, onClick,
}: {
  icon: React.ReactNode; label: string; active: boolean
  colorClass: string; activeBg: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? `${activeBg} ${colorClass} border`
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
