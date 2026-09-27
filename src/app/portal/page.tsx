'use client'

import { PortalShell } from '@/app/components/portal/portal-shell'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function PortalHomePage() {
  const { data } = useSession()
  const name = data?.user?.name || data?.user?.email || 'Volunteer'

  return (
    <PortalShell title="Home">
      <div className="space-y-5">
        <section className="space-y-1">
          <p className="text-sm text-zinc-500">Welcome back</p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {name}
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Your shifts, tasks, and contacts live here — phone-first, no heavy
            dashboard. More is coming in the next phases.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-2">
          {[
            { href: '/portal/shifts', label: 'Shifts', hint: 'When you show up' },
            { href: '/portal/tasks', label: 'Tasks', hint: 'What to do next' },
            {
              href: '/portal/contacts',
              label: 'Contacts',
              hint: 'Friends & family',
            },
            { href: '/portal/profile', label: 'Profile', hint: 'Your history' },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-zinc-200 bg-white p-3 active:bg-zinc-50"
            >
              <p className="text-sm font-semibold text-zinc-900">{card.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{card.hint}</p>
            </Link>
          ))}
        </section>
      </div>
    </PortalShell>
  )
}
