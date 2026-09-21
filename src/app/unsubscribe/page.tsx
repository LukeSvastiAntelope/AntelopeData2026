'use client'

/**
 * Public unsubscribe confirmation page (linked from CAN-SPAM footer).
 * Token is HMAC-verified server-side; suppresses only that candidate's list.
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function UnsubscribeInner() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const alreadyDone = params.get('done') === '1'
  const [state, setState] = useState<'idle' | 'working' | 'ok' | 'error'>(
    alreadyDone ? 'ok' : 'idle'
  )
  const [message, setMessage] = useState(
    alreadyDone ? 'You have been unsubscribed from this campaign.' : ''
  )

  useEffect(() => {
    if (alreadyDone || !token || state !== 'idle') return
    let cancelled = false
    setState('working')
    void (async () => {
      try {
        const res = await fetch('/api/email/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data.status) {
          setState('error')
          setMessage(data.message || 'Could not unsubscribe. The link may be invalid.')
          return
        }
        setState('ok')
        setMessage(data.message || 'You have been unsubscribed from this campaign.')
      } catch {
        if (!cancelled) {
          setState('error')
          setMessage('Network error — please try again.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, alreadyDone, state])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground mb-2">Unsubscribe</h1>
        {state === 'working' && (
          <p className="text-sm text-muted-foreground">Processing your request…</p>
        )}
        {state === 'ok' && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
        {state === 'error' && (
          <p className="text-sm text-destructive">{message}</p>
        )}
        {state === 'idle' && !token && (
          <p className="text-sm text-muted-foreground">
            Missing unsubscribe token. Use the link from your email.
          </p>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          Sent via Antelope Data. This only stops email from this campaign.
        </p>
      </div>
    </main>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-background px-4">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <UnsubscribeInner />
    </Suspense>
  )
}
