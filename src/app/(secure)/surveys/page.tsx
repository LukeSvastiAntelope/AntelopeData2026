'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { PanelRightOpen, PanelRightClose } from "lucide-react"

// Dynamic import for the map (requires browser APIs)
const DashboardMap = dynamic(() => import('@/components/dashboard-map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-muted/30 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="text-sm">Loading map...</p>
      </div>
    </div>
  ),
})

// Dynamic import for the right panel
const MapRightPanel = dynamic(() => import('@/components/map-right-panel'), { ssr: false })

const SurveysPage = () => {
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
    <div className="flex-1 w-full h-[calc(100vh-1rem)] p-2 bg-background relative flex">
      {/* Map area — grows to fill remaining space */}
      <div className="flex-1 relative min-w-0">
        {/* Sidebar trigger floating over map */}
        <div className="absolute top-3 left-3 z-20">
          <SidebarTrigger className="h-7 w-7 bg-background/80 backdrop-blur-md rounded-md border border-border/50 shadow-lg text-muted-foreground hover:text-foreground" />
        </div>

        {/* Right panel toggle floating over map */}
        <div className="absolute top-3 right-3 z-20">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 bg-background/80 backdrop-blur-md border-border/50 shadow-lg"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            {rightPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <DashboardMap className="h-full rounded-lg" layers={layers} />
      </div>

      {/* Collapsible right panel */}
      {rightPanelOpen && (
        <MapRightPanel
          layers={layers}
          onToggleLayer={toggleLayer}
          onClose={() => setRightPanelOpen(false)}
        />
      )}
    </div>
  )
}

export default SurveysPage
