'use client'

import { PortalShell } from '@/app/components/portal/portal-shell'

export default function PortalPointsPage() {
  return (
    <PortalShell title="Points">
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 space-y-2">
        <p className="text-sm font-semibold text-zinc-900">Points &amp; shoutouts</p>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Tasteful gamification — points, teams, a leaderboard. Enough to keep
          people active, never gaudy.
        </p>
        <p className="text-[11px] text-zinc-400">Coming in a later Volunteer phase.</p>
      </div>
    </PortalShell>
  )
}
