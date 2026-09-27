'use client'

/**
 * Volunteer V1 — magic-link landing. Staff share /portal/auth/verify?token=…
 * or a join page that explains how to get an invite.
 */

import { useState } from 'react'
import Link from 'next/link'

export default function PortalJoinPage() {
  const [token, setToken] = useState('')

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 flex flex-col px-4 py-10">
      <div className="max-w-sm mx-auto w-full space-y-6">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-teal-800/70 font-medium">
            Antelope Volunteer
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Get in with a link
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            No password. Open the invite your campaign emailed you, or paste the
            token below.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const t = token.trim()
            if (!t) return
            window.location.href = `/portal/auth/verify?token=${encodeURIComponent(t)}`
          }}
        >
          <label className="block text-xs font-medium text-zinc-600">
            Invite token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              placeholder="Paste from your invite"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-800 text-white text-sm font-medium py-2.5 active:bg-teal-900"
          >
            Continue
          </button>
        </form>

        <p className="text-xs text-zinc-500 text-center">
          Campaign staff?{' '}
          <Link href="/auth/login" className="text-teal-800 underline">
            Sign in to the full app
          </Link>
        </p>
      </div>
    </div>
  )
}
