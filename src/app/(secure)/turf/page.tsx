'use client'

import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { TurfCutter } from '@/app/components/ground-game/turf-cutter'
import { Button } from '@/components/ui/button'
import { Users } from 'lucide-react'

export default function TurfPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Turf</h1>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/assignments">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Assignments
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Cut walkable turf on the map, build door lists from saved geofences, and
            hand them off on Assignments. Coverage climbs here as walkers sync outcomes.
          </p>
          <TurfCutter />
        </div>
      </div>
    </div>
  )
}
