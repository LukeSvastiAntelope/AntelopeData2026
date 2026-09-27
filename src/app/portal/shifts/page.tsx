'use client'

import { PortalShell } from '@/app/components/portal/portal-shell'

function Placeholder({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <PortalShell title={title}>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 space-y-2">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-sm text-zinc-600 leading-relaxed">{body}</p>
        <p className="text-[11px] text-zinc-400">Coming in a later Volunteer phase.</p>
      </div>
    </PortalShell>
  )
}

export default function PortalShiftsPage() {
  return (
    <Placeholder
      title="Shifts"
      body="Sign up for canvass shifts tied to turf — show up, walk your list, stay on the phone."
    />
  )
}
