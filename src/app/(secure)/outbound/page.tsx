'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Send } from 'lucide-react'

export default function OutboundPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Outbound
            </h1>
            <Badge variant="secondary" className="ml-3">
              Coming together
            </Badge>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 max-w-2xl space-y-3">
          <h2 className="text-2xl font-semibold">Voter list → tailored outbound</h2>
          <p className="text-muted-foreground">
            Future home for exporting voter lists into tailored outbound sequences — the Act-stage
            bridge from understanding to contact.
          </p>
          <p className="text-sm text-muted-foreground">
            Stub only for Phase 1. Fundraising list tools remain available under Fundraising.
          </p>
        </div>
      </div>
    </div>
  )
}
