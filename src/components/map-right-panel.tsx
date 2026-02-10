'use client'

import { Landmark, MapPin, Vote, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface MapRightPanelProps {
  layers: { political: boolean; responses: boolean; voters: boolean }
  onToggleLayer: (key: 'political' | 'responses' | 'voters') => void
  onClose: () => void
}

// PVI colour helper (matches dashboard-map.tsx)
function pviToColor(pvi: number, alpha: number = 0.6): string {
  const clamped = Math.max(-30, Math.min(30, pvi))
  const t = (clamped + 30) / 60
  const r = Math.round(220 - t * 180)
  const b = Math.round(40 + t * 180)
  const g = Math.round(60 + (1 - Math.abs(t - 0.5) * 2) * 40)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  )
}

export default function MapRightPanel({ layers, onToggleLayer }: MapRightPanelProps) {
  return (
    <div className="w-[13rem] flex-shrink-0 h-full ml-2 overflow-y-auto rounded-lg border border-border bg-background">
      <div className="p-3 space-y-4">
        {/* Layers section */}
        <CollapsibleSection title="Layers">
          <div className="space-y-1">
            <LayerToggle
              icon={<Landmark className="h-3 w-3" />}
              label="Political"
              active={layers.political}
              colorClass="text-red-400"
              activeBg="bg-red-500/10 border-red-500/20"
              onClick={() => onToggleLayer('political')}
            />
            <LayerToggle
              icon={<MapPin className="h-3 w-3" />}
              label="Responses"
              active={layers.responses}
              colorClass="text-blue-400"
              activeBg="bg-blue-500/10 border-blue-500/20"
              onClick={() => onToggleLayer('responses')}
            />
            <LayerToggle
              icon={<Vote className="h-3 w-3" />}
              label="Voters"
              active={layers.voters}
              colorClass="text-purple-400"
              activeBg="bg-purple-500/10 border-purple-500/20"
              onClick={() => onToggleLayer('voters')}
            />
          </div>
        </CollapsibleSection>

        {/* Legend section */}
        {layers.political && (
          <CollapsibleSection title="Legend">
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">Partisan Lean (Cook PVI)</p>
              <div className="flex items-center gap-0.5">
                {[-25, -15, -5, 0, 5, 15, 25].map(v => (
                  <div
                    key={v}
                    className="flex-1 h-2.5 rounded-sm"
                    style={{ backgroundColor: pviToColor(v, 0.8) }}
                  />
                ))}
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] text-red-400 font-medium">R+25</span>
                <span className="text-[9px] text-muted-foreground">Even</span>
                <span className="text-[9px] text-blue-400 font-medium">D+25</span>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Info section */}
        <CollapsibleSection title="About" defaultOpen={false}>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            State-level Cook PVI scores, 2024 election margins, electoral votes, governor and senate data.
            Hover over any state for details.
          </p>
        </CollapsibleSection>
      </div>
    </div>
  )
}

// Compact layer toggle button
function LayerToggle({
  icon,
  label,
  active,
  colorClass,
  activeBg,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  colorClass: string
  activeBg: string
  onClick: () => void
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
