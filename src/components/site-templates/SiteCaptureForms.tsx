'use client'

/**
 * Site capture forms (Sites S5) — signup → /api/optin, contact → /api/contact,
 * volunteer → /api/volunteer, donate → /api/donate.
 * Always posts siteSlug; never relies on client organizationId for tenancy.
 */

import { useState, type FormEvent } from 'react'

export type SiteFormKind = 'signup' | 'contact' | 'volunteer' | 'donate'

type BaseProps = {
  siteSlug: string
  preview?: boolean
  className?: string
  candidateName?: string
}

const fieldClass =
  'w-full px-3 py-2 text-sm border bg-white/90 text-[color:var(--site-fg,#111)] placeholder:opacity-50'
const labelClass = 'block text-xs font-medium mb-1 opacity-80'
const btnClass =
  'inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60'
const btnStyle = {
  backgroundColor: 'var(--site-primary, #1a1a2e)',
  borderRadius: 'var(--site-radius, 0.5rem)',
} as const

function FieldShell({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      className="space-y-3 text-left"
      style={{
        borderRadius: 'var(--site-radius, 0.5rem)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function StatusLine({
  error,
  ok,
}: {
  error: string | null
  ok: string | null
}) {
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (ok) return <p className="text-sm" style={{ color: 'var(--site-accent)' }}>{ok}</p>
  return null
}

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.status === false) {
    throw new Error(data.message || `Request failed (${res.status})`)
  }
  return data
}

export function SiteSignupForm({
  siteSlug,
  preview,
  className,
  candidateName,
}: BaseProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const data = await postJson('/api/optin', {
        siteSlug,
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
        consent: true,
        disclosure: `I agree to receive campaign updates from ${candidateName || 'this campaign'}. Msg & data rates may apply. Reply STOP to opt out.`,
      })
      setOk(data.message || 'You are signed up.')
      setName('')
      setEmail('')
      setPhone('')
      setConsent(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="signup"
      onSubmit={(e) => void onSubmit(e)}
      className={className}
      aria-label="Campaign signup"
    >
      <FieldShell>
        <p className="text-sm font-semibold">Get updates</p>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-signup-name`}>
            Name
          </label>
          <input
            id={`${siteSlug}-signup-name`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={preview || busy}
            autoComplete="name"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-signup-email`}>
            Email
          </label>
          <input
            id={`${siteSlug}-signup-email`}
            type="email"
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={preview || busy}
            autoComplete="email"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-signup-phone`}>
            Phone (optional)
          </label>
          <input
            id={`${siteSlug}-signup-phone`}
            type="tel"
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={preview || busy}
            autoComplete="tel"
            placeholder="+1…"
          />
        </div>
        <label className="flex items-start gap-2 text-xs opacity-80">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={preview || busy}
            className="mt-0.5"
            required
          />
          <span>
            I agree to receive campaign updates
            {candidateName ? ` from ${candidateName}` : ''}. Reply STOP to opt out of
            texts.
          </span>
        </label>
        <button
          type="submit"
          className={btnClass}
          style={btnStyle}
          disabled={preview || busy || !consent || (!email && !phone)}
        >
          {busy ? 'Signing up…' : preview ? 'Preview only' : 'Sign up'}
        </button>
        <StatusLine error={error} ok={ok} />
      </FieldShell>
    </form>
  )
}

export function SiteContactForm({
  siteSlug,
  preview,
  className,
}: BaseProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const data = await postJson('/api/contact', {
        siteSlug,
        name,
        email,
        message,
      })
      setOk(data.message || 'Message sent.')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="contact"
      onSubmit={(e) => void onSubmit(e)}
      className={className}
      aria-label="Contact the campaign"
    >
      <FieldShell>
        <p className="text-sm font-semibold">Contact</p>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-contact-name`}>
            Name
          </label>
          <input
            id={`${siteSlug}-contact-name`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={preview || busy}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-contact-email`}>
            Email
          </label>
          <input
            id={`${siteSlug}-contact-email`}
            type="email"
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={preview || busy}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-contact-message`}>
            Message
          </label>
          <textarea
            id={`${siteSlug}-contact-message`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
            disabled={preview || busy}
          />
        </div>
        <button
          type="submit"
          className={btnClass}
          style={btnStyle}
          disabled={preview || busy}
        >
          {busy ? 'Sending…' : preview ? 'Preview only' : 'Send message'}
        </button>
        <StatusLine error={error} ok={ok} />
      </FieldShell>
    </form>
  )
}

export function SiteVolunteerForm({
  siteSlug,
  preview,
  className,
  candidateName,
}: BaseProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [availability, setAvailability] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const data = await postJson('/api/volunteer', {
        siteSlug,
        name,
        email: email || undefined,
        phone: phone || undefined,
        availability: availability || undefined,
        notes: notes || undefined,
      })
      setOk(data.message || 'Thanks for volunteering!')
      setName('')
      setEmail('')
      setPhone('')
      setAvailability('')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="volunteer"
      onSubmit={(e) => void onSubmit(e)}
      className={className}
      aria-label="Volunteer signup"
    >
      <FieldShell>
        <p className="text-sm font-semibold">
          Volunteer{candidateName ? ` for ${candidateName}` : ''}
        </p>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-vol-name`}>
            Name
          </label>
          <input
            id={`${siteSlug}-vol-name`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={preview || busy}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={`${siteSlug}-vol-email`}>
              Email
            </label>
            <input
              id={`${siteSlug}-vol-email`}
              type="email"
              className={fieldClass}
              style={{ borderRadius: 'var(--site-radius)' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={preview || busy}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${siteSlug}-vol-phone`}>
              Phone
            </label>
            <input
              id={`${siteSlug}-vol-phone`}
              type="tel"
              className={fieldClass}
              style={{ borderRadius: 'var(--site-radius)' }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={preview || busy}
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-vol-avail`}>
            Availability
          </label>
          <input
            id={`${siteSlug}-vol-avail`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            placeholder="Weekends, evenings…"
            disabled={preview || busy}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-vol-notes`}>
            Notes
          </label>
          <textarea
            id={`${siteSlug}-vol-notes`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={preview || busy}
          />
        </div>
        <button
          type="submit"
          className={btnClass}
          style={btnStyle}
          disabled={preview || busy || (!email && !phone)}
        >
          {busy ? 'Submitting…' : preview ? 'Preview only' : 'I want to help'}
        </button>
        <StatusLine error={error} ok={ok} />
      </FieldShell>
    </form>
  )
}

export function SiteDonateForm({
  siteSlug,
  preview,
  className,
  candidateName,
}: BaseProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const data = await postJson('/api/donate', {
        siteSlug,
        name,
        email: email || undefined,
        phone: phone || undefined,
        amount: amount || undefined,
      })
      setOk(data.message || 'Thank you!')
      setName('')
      setEmail('')
      setPhone('')
      setAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="donate"
      onSubmit={(e) => void onSubmit(e)}
      className={className}
      aria-label="Donate interest"
    >
      <FieldShell>
        <p className="text-sm font-semibold">
          Chip in{candidateName ? ` for ${candidateName}` : ''}
        </p>
        <p className="text-xs opacity-70">
          Records your interest for the campaign fundraising suite. Payment
          checkout comes next.
        </p>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-don-name`}>
            Name
          </label>
          <input
            id={`${siteSlug}-don-name`}
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={preview || busy}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={`${siteSlug}-don-email`}>
              Email
            </label>
            <input
              id={`${siteSlug}-don-email`}
              type="email"
              className={fieldClass}
              style={{ borderRadius: 'var(--site-radius)' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={preview || busy}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${siteSlug}-don-amount`}>
              Amount (USD)
            </label>
            <input
              id={`${siteSlug}-don-amount`}
              type="number"
              min={1}
              step={1}
              className={fieldClass}
              style={{ borderRadius: 'var(--site-radius)' }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={preview || busy}
              placeholder="25"
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${siteSlug}-don-phone`}>
            Phone (optional)
          </label>
          <input
            id={`${siteSlug}-don-phone`}
            type="tel"
            className={fieldClass}
            style={{ borderRadius: 'var(--site-radius)' }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={preview || busy}
          />
        </div>
        <button
          type="submit"
          className={btnClass}
          style={btnStyle}
          disabled={preview || busy || (!email && !phone)}
        >
          {busy ? 'Recording…' : preview ? 'Preview only' : 'Pledge interest'}
        </button>
        <StatusLine error={error} ok={ok} />
      </FieldShell>
    </form>
  )
}

/** Compact capture band used on home templates under the CTA. */
export function SiteCaptureBand({
  siteSlug,
  preview,
  candidateName,
}: {
  siteSlug: string
  preview?: boolean
  candidateName?: string
}) {
  if (!siteSlug) return null
  return (
    <section className="px-6 pb-16" id="capture">
      <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-2">
        <div
          className="p-5 border"
          style={{
            borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
            borderRadius: 'var(--site-radius)',
          }}
        >
          <SiteSignupForm
            siteSlug={siteSlug}
            preview={preview}
            candidateName={candidateName}
          />
        </div>
        <div
          className="p-5 border"
          style={{
            borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
            borderRadius: 'var(--site-radius)',
          }}
        >
          <SiteContactForm siteSlug={siteSlug} preview={preview} />
        </div>
      </div>
    </section>
  )
}
