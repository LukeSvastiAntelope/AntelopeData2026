'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import LogoText from '@/components/logo-text'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle } from 'lucide-react'

const STORAGE_KEY = 'garrys-list-claim'

export function ClaimClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  // Persist the survey/token in sessionStorage so it survives the trip
  // through /auth/login or /auth/register, which redirect back to /surveys
  // (not back to this page) once signed in.
  useEffect(() => {
    const surveyId = searchParams.get('surveyId')
    const token = searchParams.get('token')
    if (surveyId && token) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ surveyId, token }))
    }
  }, [searchParams])

  useEffect(() => {
    if (status !== 'authenticated' || claiming) return
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      setError('Missing survey info — go back to your survey-ready page and click "Log in to edit" again.')
      return
    }
    let pending: { surveyId: string; token: string }
    try {
      pending = JSON.parse(raw)
    } catch {
      setError('Missing survey info — go back to your survey-ready page and click "Log in to edit" again.')
      return
    }

    setClaiming(true)
    fetch('/api/garrys-list/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surveyId: Number(pending.surveyId), token: pending.token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.status) {
          setError(data.message || 'Could not claim this survey.')
          setClaiming(false)
          return
        }
        sessionStorage.removeItem(STORAGE_KEY)
        router.replace(`/surveys/${data.surveyId}/edit`)
      })
      .catch(() => {
        setError('Could not claim this survey.')
        setClaiming(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center">
          <LogoText className="text-zinc-900 dark:text-zinc-100" width={130} height={32} />
        </div>

        {error ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/surveys">Go to my surveys</Link>
            </Button>
          </div>
        ) : status === 'unauthenticated' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Log in or create an account to edit this survey — your token carries the data over.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/register">Create account</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Claiming your survey…
          </div>
        )}
      </div>
    </div>
  )
}
