'use client'

/**
 * Admin A4 — persistent banner while a support "view as" session is active.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'

type SupportPayload = {
  id: string
  mode: 'read' | 'write'
  targetOrganizationId: number
  targetOrganizationName: string | null
  expiresAt: string
  remainingSeconds: number
}

function formatRemaining(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(r).padStart(2, '0')}`
}

export function SupportSessionBanner() {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<SupportPayload | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [ending, setEnding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/support/session', { cache: 'no-store' })
      if (!res.ok) {
        setSession(null)
        return
      }
      const data = await res.json()
      if (data?.active && data.session) {
        setSession(data.session)
        setRemaining(Number(data.session.remainingSeconds) || 0)
      } else {
        setSession(null)
      }
    } catch {
      setSession(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, pathname])

  useEffect(() => {
    if (!session) return
    const tick = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          void load()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [session, load])

  const endSession = async () => {
    setEnding(true)
    try {
      const res = await fetch('/api/support/session', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.status === false) {
        toast.error(data.message || 'Failed to end support session')
        return
      }
      setSession(null)
      toast.success('Support session ended')
      router.refresh()
      // Force profile reload so org context clears
      window.location.href = '/admin'
    } catch {
      toast.error('Failed to end support session')
    } finally {
      setEnding(false)
    }
  }

  if (!session) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-50 border-b border-amber-600/40 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Viewing as{' '}
            <span className="underline underline-offset-2">
              {session.targetOrganizationName ||
                `Org #${session.targetOrganizationId}`}
            </span>
          </span>
          <Badge
            variant="outline"
            className="border-amber-700/40 text-[10px] uppercase tracking-wide"
          >
            {session.mode === 'write' ? 'Write (audited)' : 'Read-only'}
          </Badge>
          <span className="text-xs opacity-80 font-mono">
            {formatRemaining(remaining)} left
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-700/40 bg-transparent hover:bg-amber-100/80 dark:hover:bg-amber-900"
            onClick={() => router.push(`/admin/accounts/${session.targetOrganizationId}`)}
          >
            Account
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-700/40 bg-transparent hover:bg-amber-100/80 dark:hover:bg-amber-900"
            onClick={endSession}
            disabled={ending}
          >
            {ending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <X className="h-3.5 w-3.5 mr-1" />
            )}
            End session
          </Button>
        </div>
      </div>
    </div>
  )
}
