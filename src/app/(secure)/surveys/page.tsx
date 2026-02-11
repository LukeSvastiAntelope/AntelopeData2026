'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useSidebar } from "@/components/ui/sidebar"
import { PanelLeft, Landmark, MapPin, Vote, ChevronDown, ChevronRight } from 'lucide-react'

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

/** Shared style for both sidebar/panel toggle buttons */
const toggleBtnClass =
  'flex items-center justify-center h-7 w-7 rounded-md bg-background/80 backdrop-blur-md border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer'

export default function SurveysPage() {
  const { toggleSidebar } = useSidebar()
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [layers, setLayers] = useState({
    political: true,
    responses: true,
    voters: true,
  })

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Map — takes all remaining space */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <DashboardMap layers={layers} />

        {/* Left sidebar toggle — inside map, top-left */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}>
          <button onClick={toggleSidebar} className={toggleBtnClass} title="Toggle sidebar">
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right panel toggle — inside map, top-right */}
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

      {/* Right panel — layers/legend */}
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
                <LayerToggle icon={<MapPin className="h-3 w-3" />} label="Responses" active={layers.responses} colorClass="text-blue-400" activeBg="bg-blue-500/10 border-blue-500/20" onClick={() => toggleLayer('responses')} />
                <LayerToggle icon={<Vote className="h-3 w-3" />} label="Voters" active={layers.voters} colorClass="text-purple-400" activeBg="bg-purple-500/10 border-purple-500/20" onClick={() => toggleLayer('voters')} />
              </div>
            </Section>

            {layers.political && (
              <Section title="Legend">
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">Cook PVI</p>
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

            <Section title="About" defaultOpen={false}>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Cook PVI scores, 2024 margins, electoral votes, governor &amp; senate data. Hover any state for details.
              </p>
            </Section>
          </div>
        </div>
      </div>
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
