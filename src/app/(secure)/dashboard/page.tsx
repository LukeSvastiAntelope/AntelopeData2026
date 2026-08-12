'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useSidebar } from "@/components/ui/sidebar"
import { PanelLeft, Landmark, MapPin, Vote, Grid3x3, ChevronDown, ChevronRight, HandCoins, Bot, Plus, Play, Trash2, Loader2, Newspaper, Building2, Globe, Palette, Upload, Sparkles, Fence, Check, X, MessageSquare } from 'lucide-react'
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
  })
  const [geofences, setGeofences] = useState<GeofencePolygon[]>([])
  const [geofenceDraftVertices, setGeofenceDraftVertices] = useState<[number, number][]>([])
  const [geofenceDrawMode, setGeofenceDrawMode] = useState<null | 'include' | 'exclude'>(null)
  const [geofenceAddressRows, setGeofenceAddressRows] = useState<{ id: string; lng: number; lat: number; label?: string }[]>([])
  const [geofenceCsvLoading, setGeofenceCsvLoading] = useState(false)
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

  const finishGeofencePolygon = () => {
    if (geofenceDraftVertices.length < 3) {
      toast.error('Add at least three clicks on the map to close a zone.')
      return
    }
    if (!geofenceDrawMode) return
    const mode = geofenceDrawMode
    const ring = normalizeRing(geofenceDraftVertices)
    setGeofences((prev) => [...prev, { id: crypto.randomUUID(), mode, ring }])
    setGeofenceDraftVertices([])
    setGeofenceDrawMode(null)
    toast.success(mode === 'include' ? 'Canvass zone saved.' : 'Exclusion zone saved.')
  }

  const cancelGeofenceDraft = () => {
    setGeofenceDraftVertices([])
    setGeofenceDrawMode(null)
  }

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

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
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <DashboardMap
          layers={layers}
          customLayerData={layers.customizable ? customLayerData : null}
          customMapPins={customMapPins}
          geofencing={geofencingMapProps}
          onDistrictSelect={(district) => {
            setSelectedDistrict(district)
            loadDistrictIntel(district.districtCode)
          }}
        />
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
                <LayerToggle icon={<Fence className="h-3 w-3" />} label="Geofencing" active={layers.geofencing} colorClass="text-cyan-400" activeBg="bg-cyan-500/10 border-cyan-500/20" onClick={() => toggleLayer('geofencing')} />
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
                    <span className="text-red-500 font-medium">exclude</span> zones. Upload a register CSV with lat/lng to see which
                    addresses fall inside your turf (zoom in for street-level planning).
                  </p>
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
                    <Button size="sm" variant="secondary" className="h-7 text-[10px] px-2 gap-0.5" onClick={finishGeofencePolygon} disabled={!geofenceDrawMode || geofenceDraftVertices.length < 3}>
                      <Check className="h-3 w-3" /> Finish zone
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 gap-0.5" onClick={cancelGeofenceDraft}>
                      <X className="h-3 w-3" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        if (!confirm('Clear all geofence zones?')) return
                        setGeofences([])
                        setGeofenceDraftVertices([])
                        setGeofenceDrawMode(null)
                      }}
                    >
                      Clear zones
                    </Button>
                  </div>
                  <p className="text-[9px] pt-1 border-t border-border/50">
                    Rules: exclude wins. With include zones, only addresses inside an include (and not in exclude) are “canvass”.
                    With no include zones, everywhere except excludes is canvass.
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
