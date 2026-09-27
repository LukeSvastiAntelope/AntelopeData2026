'use client'

/**
 * Volunteer V2 — public self-signup (website-builder style public page).
 * /join/[orgSlug] — host-defined intake → identity + magic link + opt-in.
 */

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { VolunteerIntakeField } from '@/app/utils/database/volunteer-repo'

type Schema = {
  headline?: string
  body?: string
  consentPrompt?: string
  fields: VolunteerIntakeField[]
}

export default function PublicVolunteerJoinPage() {
  const params = useParams()
  const slug = String(params?.orgSlug || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [schema, setSchema] = useState<Schema | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/public/volunteer-signup/${encodeURIComponent(slug)}`)
        const data = await res.json()
        if (!res.ok || !data.status) {
          throw new Error(data.message || 'Campaign not found')
        }
        if (cancelled) return
        setOrgName(data.organization?.name || '')
        setSchema(data.intakeSchema)
        const init: Record<string, string> = {}
        for (const f of data.intakeSchema?.fields || []) init[f.id] = ''
        setAnswers(init)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!schema) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/public/volunteer-signup/${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers, consent }),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Signup failed')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-zinc-50 flex items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  if (error && !schema) {
    return (
      <div className="min-h-dvh bg-zinc-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-zinc-200 bg-white p-6 space-y-2 text-center">
          <p className="text-sm font-semibold">Cannot join</p>
          <p className="text-sm text-zinc-600">{error}</p>
          <Link href="/" className="text-sm text-teal-800 underline">
            Home
          </Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-dvh bg-zinc-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-zinc-200 bg-white p-6 space-y-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-teal-800/70 font-medium">
            {orgName || 'Campaign'}
          </p>
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            We sent a magic link to open the volunteer portal on your phone — no
            password needed.
          </p>
          <Link
            href="/portal/join"
            className="inline-block text-sm text-teal-800 underline"
          >
            Already have a link?
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="max-w-md mx-auto px-4 py-10 space-y-6">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-teal-800/70 font-medium">
            {orgName || 'Campaign'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {schema?.headline || 'Join as a volunteer'}
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            {schema?.body}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4"
        >
          {(schema?.fields || []).map((field) => (
            <label key={field.id} className="block space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'select' ? (
                <select
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm bg-white"
                  value={answers[field.id] || ''}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [field.id]: e.target.value }))
                  }
                  required={field.required}
                >
                  <option value="">Select…</option>
                  {(field.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    field.type === 'email'
                      ? 'email'
                      : field.type === 'tel'
                        ? 'tel'
                        : field.type === 'number'
                          ? 'number'
                          : field.type === 'url'
                            ? 'url'
                            : 'text'
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm"
                  value={answers[field.id] || ''}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [field.id]: e.target.value }))
                  }
                  required={field.required}
                />
              )}
            </label>
          ))}

          <label className="flex gap-2 items-start text-xs text-zinc-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>
              {schema?.consentPrompt ||
                'I agree to be contacted about volunteering.'}
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-teal-800 text-white text-sm font-medium py-2.5 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Join & get magic link'}
          </button>
        </form>
      </div>
    </div>
  )
}
