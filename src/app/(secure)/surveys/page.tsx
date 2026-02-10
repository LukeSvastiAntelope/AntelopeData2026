'use client'

import dynamic from 'next/dynamic'
import { SidebarTrigger } from "@/components/ui/sidebar"

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

const SurveysPage = () => {
  return (
    <div className="flex-1 w-full h-[calc(100vh-1rem)] p-2 bg-background relative">
      {/* Sidebar trigger floating over map */}
      <div className="absolute top-4 left-4 z-20">
        <SidebarTrigger className="h-8 w-8 bg-background/80 backdrop-blur-md rounded-md border border-border/50 shadow-lg text-muted-foreground hover:text-foreground" />
      </div>

      {/* Full-bleed map */}
      <DashboardMap className="h-full rounded-lg" />
    </div>
  )
}

export default SurveysPage
