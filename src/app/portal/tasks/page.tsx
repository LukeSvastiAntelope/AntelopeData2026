'use client'

import { PortalShell } from '@/app/components/portal/portal-shell'

export default function PortalTasksPage() {
  return (
    <PortalShell title="Tasks">
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 space-y-2">
        <p className="text-sm font-semibold text-zinc-900">Tasks</p>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Lightweight asks from the campaign — one tap to mark done.
        </p>
        <p className="text-[11px] text-zinc-400">Coming in a later Volunteer phase.</p>
      </div>
    </PortalShell>
  )
}
