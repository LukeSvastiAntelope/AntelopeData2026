'use client'

/**
 * Volunteer V1 — consume magic-link via NextAuth credentials (magicToken).
 */

import { Suspense, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function VerifyInner() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!token.trim()) {
      setError('Missing invite token')
      setBusy(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await signIn('credentials', {
          magicToken: token.trim(),
          redirect: false,
          callbackUrl: '/portal',
        })
        if (cancelled) return
        if (res?.error) {
          setError(
            res.error === 'MagicLinkInvalid' || res.code === 'MagicLinkInvalid'
              ? 'This invite link is invalid, expired, or already used.'
              : 'Could not sign you in. Ask your campaign for a fresh invite.'
          )
          setBusy(false)
          return
        }
        window.location.href = res?.url || '/portal'
      } catch {
        if (!cancelled) {
          setError('Something went wrong signing you in.')
          setBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 flex items-center justify-center px-4">
      <div className="max-w-sm w-full rounded-xl border border-zinc-200 bg-white p-6 space-y-3 text-center">
        {busy && !error ? (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-800 border-t-transparent" />
            <p className="text-sm font-medium">Signing you in…</p>
            <p className="text-xs text-zinc-500">No password needed.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-900">Invite problem</p>
            <p className="text-sm text-zinc-600">{error}</p>
            <Link
              href="/portal/join"
              className="inline-block text-sm text-teal-800 underline"
            >
              Try another link
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function PortalVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-zinc-50 flex items-center justify-center text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  )
}
