'use client'

import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Banknote } from 'lucide-react'

/**
 * Payroll — placeholder home for MiniVAN paid-canvasser miles/time.
 * GPS mileage logging lands with the Walk PWA (later phase).
 */
export default function PayrollPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Payroll</h1>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 max-w-lg space-y-4">
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3">
            <Banknote className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Payroll comes next</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paid canvassers will sync miles and time from the Walk PWA. For now,
              cut turf and assign walkers so the trail is ready when payroll
              lands.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <Link href="/turf">Turf</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/assignments">Assignments</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
