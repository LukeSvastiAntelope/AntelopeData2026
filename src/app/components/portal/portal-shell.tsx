'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { CalendarDays, CheckSquare, Users, Trophy, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/portal', label: 'Home', icon: Home, exact: true },
  { href: '/portal/shifts', label: 'Shifts', icon: CalendarDays },
  { href: '/portal/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/portal/contacts', label: 'Contacts', icon: Users },
  { href: '/portal/points', label: 'Points', icon: Trophy },
] as const

export function PortalShell({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const pathname = usePathname()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker
      .register('/sw-portal.js')
      .catch(() => undefined)
  }, [])

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-zinc-50/95 backdrop-blur px-4 py-3 safe-pt">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-teal-800/70 font-medium">
              Antelope
            </p>
            <h1 className="text-base font-semibold leading-tight">
              {title || 'Volunteer'}
            </h1>
          </div>
          <Link
            href="/logout"
            className="text-xs text-zinc-500 hover:text-zinc-800"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-4 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur safe-pb">
        <ul className="max-w-lg mx-auto grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium',
                    active ? 'text-teal-800' : 'text-zinc-500'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      active ? 'text-teal-700' : 'text-zinc-400'
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
