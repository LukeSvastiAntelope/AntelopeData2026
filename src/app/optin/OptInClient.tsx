'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LogoText from '@/components/logo-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ShieldCheck } from 'lucide-react'

// Fallback survey used when /optin is opened without a ?survey=<slug> param, so
// the page is always publicly usable at antelopedata.org/optin.
const FALLBACK_SLUG = 'example-candidate-favorability-debate-reaction-7541aac8'

export function OptInClient() {
  const params = useSearchParams()
  const slug = (params.get('survey') || params.get('s') || FALLBACK_SLUG).trim()

  const [org, setOrg] = useState<string>('')
  const [surveyTitle, setSurveyTitle] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const surveyUrl = `/survey/${slug}`

  // Contextualize the page from the survey.
  useEffect(() => {
    let active = true
    fetch(`/api/public/surveys/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        const s = d?.survey
        if (s) {
          setSurveyTitle(s.title || '')
          setOrg(s.organization_name || s.organization || '')
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [slug])

  const orgName = org || 'this campaign'
  const disclosure = useMemo(
    () =>
      `By checking this box and providing my number, I agree to receive recurring text messages from ${
        org || '[Campaign / Organization]'
      } via Antelope Data. Message frequency varies. Message & data rates may apply. Reply STOP to opt out, HELP for help.`,
    [org]
  )

  const goToSurvey = () => {
    window.location.href = surveyUrl
  }

  const handleSignUp = async () => {
    setError(null)
    if (!phone.trim()) {
      setError('Please enter your mobile number, or choose “just take me to the survey”.')
      return
    }
    if (!consent) {
      setError('Please check the box to agree to receive text messages.')
      return
    }
    setSubmitting(true)
    try {
      await fetch('/api/optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveySlug: slug, phone, consent: true, disclosure }),
      })
    } catch {
      /* best-effort — still send them to the survey */
    } finally {
      goToSurvey()
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <LogoText className="text-zinc-900 dark:text-zinc-100" width={120} height={30} />
          <span className="text-xs text-muted-foreground">{org || 'Antelope'}</span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10">
        <div className="rounded-xl border bg-background p-8 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            {org ? org.toUpperCase() : 'A MESSAGE FROM YOUR COMMUNITY'}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">We&apos;d like to hear from you</h1>
          <p className="mt-3 text-[15px] leading-7 text-foreground/90">
            You&apos;re a few seconds from a short survey
            {surveyTitle ? <> — <span className="font-medium">{surveyTitle}</span></> : null}. Thanks for
            taking part.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Taking the survey is free and optional. You can complete it without signing up for anything
            else. Your answers help shape local priorities.
          </p>

          <Button className="mt-5 w-full" size="lg" onClick={goToSurvey}>
            Start the survey
          </Button>

          {/* Optional opt-in */}
          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Optional</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <h2 className="text-lg font-semibold">Want to stay in the loop?</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Add your number to get occasional text updates from {orgName}. Totally optional — it won&apos;t
            affect your survey.
          </p>

          <label className="mt-4 block text-sm font-medium">Mobile number (optional)</label>
          <Input
            type="tel"
            inputMode="tel"
            placeholder="(201) 555-0134"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1"
          />

          <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-input"
            />
            <span>{disclosure}</span>
          </label>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <Button className="mt-5 w-full" size="lg" onClick={handleSignUp} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing up…
              </>
            ) : (
              'Sign up & start survey'
            )}
          </Button>

          <button
            onClick={goToSurvey}
            className="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            No thanks — just take me to the survey
          </button>

          <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your information is handled per our{' '}
              <Link href="/companypolicy/privacypolicy" className="underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/companypolicy/termsandconditions" className="underline">
                Terms &amp; Conditions
              </Link>
              . We never sell or share your number.
            </span>
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">Sent via Antelope Data, Inc.</p>
      </main>
    </div>
  )
}
