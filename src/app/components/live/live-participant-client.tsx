'use client'

/**
 * Live L2 — phone participant: intake + consent → room (poll/scale/open/Q&A).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronUp,
  Loader2,
  MessageCircleQuestion,
  Radio,
} from 'lucide-react'

type IntakeField = {
  id: string
  label: string
  type: 'text' | 'select' | 'multi-select' | 'number' | 'email' | 'url'
  required?: boolean
  options?: string[]
}

type SessionPublic = {
  code: string
  title: string
  hostName: string | null
  eventType: string
  identifyMode: string
  status: string
  intakeSchema: { fields: IntakeField[]; consentPrompt?: string }
  consentText: string | null
  requiresConsent: boolean
}

type ActiveQuestion = {
  id: number
  kind: string
  prompt: string
  options: unknown
  identifyOverride: string | null
  identifyEffective: string
}

type QaRow = {
  askEventId: number
  text: string
  upvotes: number
  displayName: string | null
  identified: boolean
  createdAt: string
  upvotedByMe?: boolean
}

type Props = { code: string }

const TOKEN_KEY = (code: string) => `live-pt:${code.toUpperCase()}`

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`
}

function optionList(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o) =>
      typeof o === 'string' ? o : String((o as any)?.label ?? (o as any)?.value ?? o)
    )
  }
  if (options && typeof options === 'object' && Array.isArray((options as any).choices)) {
    return (options as any).choices.map(String)
  }
  return []
}

export function LiveParticipantClient({ code }: Props) {
  const joinCode = code.toUpperCase()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<SessionPublic | null>(null)
  const [active, setActive] = useState<ActiveQuestion | null>(null)
  const [qa, setQa] = useState<QaRow[]>([])
  const [linkedInEnabled, setLinkedInEnabled] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<{
    participantId: number
    displayName: string | null
    isAnonymous: boolean
    myAnswer: unknown | null
  } | null>(null)

  // Join form
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [headline, setHeadline] = useState('')
  const [intake, setIntake] = useState<Record<string, unknown>>({})
  const [consent, setConsent] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Room
  const [answerBusy, setAnswerBusy] = useState(false)
  const [openText, setOpenText] = useState('')
  const [scaleValue, setScaleValue] = useState(5)
  const [askText, setAskText] = useState('')
  const [tab, setTab] = useState<'now' | 'qa'>('now')

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['x-live-participant'] = token
    return h
  }, [token])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/public/live/${encodeURIComponent(joinCode)}`, {
      headers: token ? { 'x-live-participant': token } : {},
    })
    const data = await res.json()
    if (!res.ok || !data.status) {
      throw new Error(data.message || 'Could not load session')
    }
    setSession(data.session)
    setActive(data.activeQuestion)
    setQa(data.qa || [])
    setLinkedInEnabled(Boolean(data.linkedInEnabled))
    if (data.me) setMe(data.me)
    else if (!token) setMe(null)
  }, [joinCode, token])

  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(TOKEN_KEY(joinCode))
        : null
    if (saved) setToken(saved)

    // LinkedIn prefill cookie
    try {
      const raw = readCookie('live_linkedin_prefill')
      if (raw) {
        const p = JSON.parse(raw)
        if (p.name) setDisplayName(String(p.name))
        if (p.email) {
          setEmail(String(p.email))
          setIntake((prev) => ({ ...prev, email: p.email }))
        }
        if (p.linkedinUrl) setLinkedinUrl(String(p.linkedinUrl))
        if (p.headline) {
          setHeadline(String(p.headline))
          setIntake((prev) => ({ ...prev, headline: p.headline }))
        }
        clearCookie('live_linkedin_prefill')
      }
    } catch {
      /* ignore */
    }
  }, [joinCode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        await refresh()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Poll while in room
  useEffect(() => {
    if (!token || !session) return
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(id)
  }, [token, session, refresh])

  const join = async (asAnonymous: boolean) => {
    setJoinBusy(true)
    setJoinError(null)
    try {
      const res = await fetch(
        `/api/public/live/${encodeURIComponent(joinCode)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName,
            email,
            linkedinUrl,
            headline,
            intake: {
              ...intake,
              ...(email ? { email } : {}),
              ...(headline ? { headline } : {}),
            },
            consent: asAnonymous ? false : consent,
            anonymous: asAnonymous,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Could not join')
      }
      window.localStorage.setItem(TOKEN_KEY(joinCode), data.participantToken)
      setToken(data.participantToken)
      setMe({
        participantId: data.participant.id,
        displayName: data.participant.displayName,
        isAnonymous: data.participant.isAnonymous,
        myAnswer: null,
      })
      await refresh()
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Join failed')
    } finally {
      setJoinBusy(false)
    }
  }

  const act = async (body: Record<string, unknown>) => {
    const res = await fetch(
      `/api/public/live/${encodeURIComponent(joinCode)}/action`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok || !data.status) {
      throw new Error(data.message || 'Action failed')
    }
    await refresh()
  }

  const submitAnswer = async (value: unknown) => {
    if (!active) return
    setAnswerBusy(true)
    try {
      await act({ action: 'answer', questionId: active.id, value })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setAnswerBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-stone-50 text-stone-600 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading session…
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-stone-900">Can’t open session</p>
          <p className="text-sm text-stone-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!session) return null

  // ── Join gate ────────────────────────────────────────────────────────
  if (!token || !me) {
    const fields = session.intakeSchema.fields || []
    const showConsent = session.requiresConsent
    return (
      <div className="min-h-[100dvh] bg-stone-50 text-stone-900">
        <header className="px-5 pt-10 pb-4 border-b border-stone-200/80 bg-white">
          <p className="text-[11px] uppercase tracking-[0.14em] text-teal-800/80 font-medium">
            Antelope Live
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight">
            {session.title}
          </h1>
          {session.hostName && (
            <p className="mt-1 text-sm text-stone-600">Hosted by {session.hostName}</p>
          )}
        </header>

        <main className="px-5 py-6 max-w-md mx-auto space-y-5">
          <p className="text-sm text-stone-600 leading-relaxed">
            {session.identifyMode === 'anonymous'
              ? 'Join anonymously — answers aren’t linked to a profile.'
              : 'Share who you are to join. Your profile powers live segments for the host — not a score.'}
          </p>

          <div className="space-y-2">
            <a
              href={`/api/public/live/linkedin/start?code=${encodeURIComponent(joinCode)}${
                linkedInEnabled ? '' : '&mock=1'
              }`}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-stone-300 bg-white text-sm font-medium hover:bg-stone-100 transition-colors"
            >
              <LinkedInMark />
              {linkedInEnabled
                ? 'Sign in with LinkedIn'
                : 'Prefill with LinkedIn (demo)'}
            </a>
            <p className="text-[11px] text-stone-500 text-center">
              Consented profile fields only — we never scrape.
            </p>
          </div>

          <div className="space-y-3">
            <Field
              label="Display name"
              required={session.identifyMode !== 'anonymous'}
              value={displayName}
              onChange={setDisplayName}
              placeholder="Your name"
            />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
            />
            {headline && (
              <p className="text-xs text-stone-500 rounded-md bg-stone-100 px-3 py-2">
                {headline}
              </p>
            )}
            {fields.map((f) => (
              <IntakeControl
                key={f.id}
                field={f}
                value={intake[f.id]}
                onChange={(v) => setIntake((prev) => ({ ...prev, [f.id]: v }))}
              />
            ))}
          </div>

          {showConsent && (
            <label className="flex gap-3 items-start rounded-lg border border-teal-800/20 bg-teal-50/60 p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-sm text-stone-800 leading-snug">
                {session.consentText ||
                  'I agree to share who I am so the host can see me in live results and follow up.'}
              </span>
            </label>
          )}

          {joinError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {joinError}
            </p>
          )}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={joinBusy}
              onClick={() => void join(false)}
              className="w-full h-12 rounded-lg bg-teal-800 text-white text-sm font-semibold hover:bg-teal-900 disabled:opacity-60 transition-colors"
            >
              {joinBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                </span>
              ) : session.identifyMode === 'anonymous' ? (
                'Join session'
              ) : (
                'Join with my profile'
              )}
            </button>
            {session.identifyMode === 'per_question' && (
              <button
                type="button"
                disabled={joinBusy}
                onClick={() => void join(true)}
                className="w-full h-10 rounded-lg border border-stone-300 bg-white text-sm text-stone-700 hover:bg-stone-100"
              >
                Join anonymously instead
              </button>
            )}
          </div>
        </main>
      </div>
    )
  }

  // ── In-session room ──────────────────────────────────────────────────
  const choices = active ? optionList(active.options) : []
  const answered = me.myAnswer != null

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-900 flex flex-col">
      <header className="px-4 pt-6 pb-3 border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-teal-800/80 font-medium">
              Live · {session.code}
            </p>
            <h1 className="text-base font-semibold truncate">{session.title}</h1>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] text-teal-800 bg-teal-50 border border-teal-800/15 rounded-md px-2 py-1 shrink-0">
            <Radio className="h-3 w-3 animate-pulse" />
            {session.status === 'live' ? 'Live' : session.status}
          </span>
        </div>
        <p className="text-xs text-stone-500 mt-1 truncate">
          {me.isAnonymous ? 'Anonymous' : me.displayName || 'You'}
        </p>
        <div className="flex gap-1 mt-3">
          <TabBtn active={tab === 'now'} onClick={() => setTab('now')}>
            Now
          </TabBtn>
          <TabBtn active={tab === 'qa'} onClick={() => setTab('qa')}>
            Q&A
          </TabBtn>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-md mx-auto w-full space-y-4">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {tab === 'now' && (
          <>
            {!active ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center space-y-2">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-stone-400" />
                <p className="text-sm font-medium">Waiting for the host…</p>
                <p className="text-xs text-stone-500">
                  The next poll or prompt will appear here.
                </p>
              </div>
            ) : (
              <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-4 shadow-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">
                    {active.kind}
                    {active.identifyEffective === 'anonymous'
                      ? ' · anonymous'
                      : ' · identified'}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold leading-snug">
                    {active.prompt}
                  </h2>
                </div>

                {answered && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-teal-800 bg-teal-50 rounded-md px-2 py-1">
                    <Check className="h-3.5 w-3.5" /> Answer recorded
                  </p>
                )}

                {active.kind === 'poll' && (
                  <div className="space-y-2">
                    {choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={answerBusy}
                        onClick={() => void submitAnswer(c)}
                        className={`w-full text-left px-3 py-3 rounded-lg border text-sm font-medium transition-colors ${
                          me.myAnswer === c
                            ? 'border-teal-700 bg-teal-50 text-teal-950'
                            : 'border-stone-200 hover:border-teal-700/40 hover:bg-stone-50'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {active.kind === 'scale' && (
                  <div className="space-y-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={
                        typeof me.myAnswer === 'number' ? me.myAnswer : scaleValue
                      }
                      onChange={(e) => setScaleValue(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-stone-500">
                      <span>1</span>
                      <span className="font-semibold text-stone-800 text-base">
                        {typeof me.myAnswer === 'number' ? me.myAnswer : scaleValue}
                      </span>
                      <span>10</span>
                    </div>
                    <button
                      type="button"
                      disabled={answerBusy}
                      onClick={() => void submitAnswer(scaleValue)}
                      className="w-full h-11 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      Submit rating
                    </button>
                  </div>
                )}

                {(active.kind === 'open' || active.kind === 'wordcloud') && (
                  <div className="space-y-2">
                    <textarea
                      value={
                        typeof me.myAnswer === 'string' && !openText
                          ? String(me.myAnswer)
                          : openText
                      }
                      onChange={(e) => setOpenText(e.target.value)}
                      rows={3}
                      placeholder={
                        active.kind === 'wordcloud'
                          ? 'One word or short phrase'
                          : 'Your response'
                      }
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm bg-white"
                    />
                    <button
                      type="button"
                      disabled={answerBusy || !openText.trim()}
                      onClick={() => void submitAnswer(openText.trim())}
                      className="w-full h-11 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      Submit
                    </button>
                  </div>
                )}

                {active.kind === 'qa' && (
                  <p className="text-sm text-stone-600">
                    Switch to the Q&A tab to ask or upvote questions.
                  </p>
                )}
              </section>
            )}
          </>
        )}

        {tab === 'qa' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 shadow-sm">
              <label className="text-xs font-medium text-stone-600 flex items-center gap-1.5">
                <MessageCircleQuestion className="h-3.5 w-3.5" />
                Ask the room
              </label>
              <textarea
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="What’s on your mind?"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={!askText.trim()}
                onClick={() => {
                  void act({ action: 'ask', text: askText.trim() })
                    .then(() => setAskText(''))
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : 'Ask failed')
                    )
                }}
                className="w-full h-10 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-60"
              >
                Submit question
              </button>
            </div>

            <ul className="space-y-2">
              {qa.length === 0 && (
                <li className="text-sm text-stone-500 text-center py-8">
                  No questions yet — be the first.
                </li>
              )}
              {qa.map((row) => (
                <li
                  key={row.askEventId}
                  className="rounded-xl border border-stone-200 bg-white p-3 flex gap-3"
                >
                  <button
                    type="button"
                    disabled={row.upvotedByMe}
                    onClick={() => {
                      void act({
                        action: 'upvote',
                        askEventId: row.askEventId,
                      }).catch((e) =>
                        setError(
                          e instanceof Error ? e.message : 'Upvote failed'
                        )
                      )
                    }}
                    className={`flex flex-col items-center justify-center min-w-[2.5rem] rounded-lg border text-xs font-semibold ${
                      row.upvotedByMe
                        ? 'border-teal-700 bg-teal-50 text-teal-900'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <ChevronUp className="h-4 w-4" />
                    {row.upvotes}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-stone-900 leading-snug">
                      {row.text}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">
                      {row.identified
                        ? row.displayName || 'Participant'
                        : 'Anonymous'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-9 rounded-md text-xs font-semibold transition-colors ${
        active
          ? 'bg-stone-900 text-white'
          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
      }`}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-stone-600">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 rounded-lg border border-stone-300 px-3 text-sm bg-white"
      />
    </label>
  )
}

function IntakeControl({
  field,
  value,
  onChange,
}: {
  field: IntakeField
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.type === 'select') {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-stone-600">
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 rounded-lg border border-stone-300 px-3 text-sm bg-white"
        >
          <option value="">Select…</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'multi-select') {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-stone-600">
          {field.label}
          {field.required ? ' *' : ''}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map((o) => {
            const on = selected.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() =>
                  onChange(
                    on ? selected.filter((x) => x !== o) : [...selected, o]
                  )
                }
                className={`h-8 px-2.5 rounded-md border text-xs ${
                  on
                    ? 'border-teal-700 bg-teal-50 text-teal-950'
                    : 'border-stone-300 bg-white'
                }`}
              >
                {o}
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }
  return (
    <Field
      label={field.label}
      required={field.required}
      type={
        field.type === 'email'
          ? 'email'
          : field.type === 'number'
            ? 'number'
            : field.type === 'url'
              ? 'url'
              : 'text'
      }
      value={value != null ? String(value) : ''}
      onChange={onChange}
    />
  )
}

function LinkedInMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="text-[#0A66C2]"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z" />
    </svg>
  )
}
