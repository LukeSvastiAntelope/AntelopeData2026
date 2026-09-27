'use client'

import { PortalShell } from '@/app/components/portal/portal-shell'

export default function PortalContactsPage() {
  return (
    <PortalShell title="Contacts">
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 space-y-2">
        <p className="text-sm font-semibold text-zinc-900">Friends &amp; family</p>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Your relational contacts stay private to you — separate from the
          campaign voter file. Outreach always goes through the approval gate.
        </p>
        <p className="text-[11px] text-zinc-400">Coming in a later Volunteer phase.</p>
      </div>
    </PortalShell>
  )
}
