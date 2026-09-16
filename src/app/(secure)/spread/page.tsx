'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Megaphone } from 'lucide-react'

export default function SpreadPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Spread
            </h1>
            <Badge variant="secondary" className="ml-3">
              Coming together
            </Badge>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 max-w-2xl space-y-3">
          <h2 className="text-2xl font-semibold">Distribution hub</h2>
          <p className="text-muted-foreground">
            This is where survey distribution and webhook delivery will live — email, SMS, QR,
            channels, and partner webhooks — so your Ask stage reaches voters cleanly.
          </p>
          <p className="text-sm text-muted-foreground">
            Stub only for Phase 1. Existing survey distribute tools remain available from Surveys.
          </p>
        </div>
      </div>
    </div>
  )
}
