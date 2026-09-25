'use client'

/**
 * Live L3 — presenter on-screen view (projected room display).
 * SSE with short-poll fallback; host controls when host token present.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Loader2,
  Radio,
  Users,
  ChevronRight,
  Square,
  Play,
  ListOrdered,
} from 'lucide-react'

type Snapshot = {
  asOf: string
  session: {
    id: number
    code: string
    title: string
    hostName: string | null
    eventType: string
    identifyMode: string
    status: string
  }
  participantCount: number
  activeQuestion: null | {
    id: number
    kind: string
    prompt: string
    options: unknown
    identifyEffective: string
    results: {
      responseCount: number
      pollBars: Array<{ label: string; count: number; pct: number }>
      scale: {
        average: number | null
        count: number
        buckets: number[]
      } | null
      wordCloud: Array<{ text: string; weight: number }>
    }
  }
  questions: Array<{
    id: number
    kind: string
    prompt: string
    state: string
    orderIdx: number
  }>
  qa: Array<{
    askEventId: number
    text: string
    upvotes: number
    displayName: string | null
    identified: boolean
  }>
  joinPath: string
}

type Props = { code: string; initialHostToken?: string | null }

const HOST_KEY = (code: string) => `live-ht:${code.toUpperCase()}`

export function LiveScreenClient({ code, initialHostToken }: Props) {
  const joinCode = code.toUpperCase()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transport, setTransport] = useState<'sse' | 'poll' | 'connecting'>(
    'connecting'
  )
  const [hostToken, setHostToken] = useState<string | null>(null)
  const [hostUnlock, setHostUnlock] = useState('')
  const [controlBusy, setControlBusy] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const pollRef = useRef<number | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  const joinUrl = `${origin}/live/${joinCode}`
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`

  useEffect(() => {
    const fromQuery = initialHostToken?.trim() || null
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(HOST_KEY(joinCode))
        : null
    const tok = fromQuery || saved
    if (tok) {
      setHostToken(tok)
      setShowControls(true)
      if (fromQuery && typeof window !== 'undefined') {
        window.localStorage.setItem(HOST_KEY(joinCode), fromQuery)
      }
    }
  }, [joinCode, initialHostToken])

  const applySnapshot = useCallback((snap: Snapshot) => {
    setSnapshot(snap)
    setError(null)
  }, [])

  const fetchSnapshot = useCallback(async () => {
    const res = await fetch(
      `/api/public/live/${encodeURIComponent(joinCode)}/snapshot`
    )
    const data = await res.json()
    if (!res.ok || !data.status) {
      throw new Error(data.message || 'Snapshot failed')
    }
    applySnapshot(data.snapshot)
  }, [joinCode, applySnapshot])

  const startPoll = useCallback(() => {
    setTransport('poll')
    if (pollRef.current) window.clearInterval(pollRef.current)
    void fetchSnapshot().catch((e) =>
      setError(e instanceof Error ? e.message : 'Poll failed')
    )
    pollRef.current = window.setInterval(() => {
      void fetchSnapshot().catch(() => undefined)
    }, 2500)
  }, [fetchSnapshot])

  useEffect(() => {
    let cancelled = false

    const connectSse = () => {
      setTransport('connecting')
      try {
        const es = new EventSource(
          `/api/public/live/${encodeURIComponent(joinCode)}/stream`
        )
        esRef.current = es
        let gotMessage = false

        es.onmessage = (ev) => {
          gotMessage = true
          try {
            const msg = JSON.parse(ev.data)
            if (msg.type === 'snapshot' && msg.snapshot) {
              setTransport('sse')
              applySnapshot(msg.snapshot)
            }
          } catch {
            /* ignore malformed */
          }
        }

        es.onerror = () => {
          es.close()
          esRef.current = null
          if (!cancelled) {
            // Fallback to short-poll
            if (!gotMessage) {
              startPoll()
            } else {
              // brief reconnect attempt then poll
              window.setTimeout(() => {
                if (!cancelled && !esRef.current) startPoll()
              }, 1500)
            }
          }
        }
      } catch {
        if (!cancelled) startPoll()
      }
    }

    connectSse()

    return () => {
      cancelled = true
      esRef.current?.close()
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [joinCode, applySnapshot, startPoll])

  const control = async (body: Record<string, unknown>) => {
    if (!hostToken) return
    setControlBusy(true)
    try {
      const res = await fetch(
        `/api/public/live/${encodeURIComponent(joinCode)}/control`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-live-host': hostToken,
          },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Control failed')
      }
      if (data.snapshot) applySnapshot(data.snapshot)
      else await fetchSnapshot()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Control failed')
    } finally {
      setControlBusy(false)
    }
  }

  const unlockHost = () => {
    const t = hostUnlock.trim()
    if (!t) return
    window.localStorage.setItem(HOST_KEY(joinCode), t)
    setHostToken(t)
    setShowControls(true)
    setHostUnlock('')
  }

  const active = snapshot?.activeQuestion
  const maxCloud = useMemo(() => {
    const w = active?.results.wordCloud || []
    return w.reduce((m, x) => Math.max(m, x.weight), 1)
  }, [active])

  if (!snapshot && !error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-stone-950 text-stone-300 gap-3">
        <Loader2 className="h-6 w-6 animate-spin" />
        Connecting to session…
      </div>
    )
  }

  if (error && !snapshot) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-stone-950 text-stone-100 p-8">
        <div className="text-center space-y-2 max-w-md">
          <p className="text-xl font-semibold">Screen unavailable</p>
          <p className="text-stone-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!snapshot) return null

  return (
    <div className="min-h-[100dvh] bg-stone-950 text-stone-50 flex flex-col">
      {/* Top bar */}
      <header className="flex items-start justify-between gap-6 px-8 pt-8 pb-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400/90 font-medium">
            Antelope Live
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight truncate">
            {snapshot.session.title}
          </h1>
          {snapshot.session.hostName && (
            <p className="mt-1 text-stone-400 text-sm">
              {snapshot.session.hostName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="inline-flex items-center gap-1.5 text-sm text-teal-300">
              <Users className="h-4 w-4" />
              <span className="tabular-nums text-2xl font-semibold text-white">
                {snapshot.participantCount}
              </span>
            </p>
            <p className="text-[11px] text-stone-500">in the room</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
              transport === 'sse'
                ? 'border-teal-500/40 text-teal-300'
                : 'border-amber-500/40 text-amber-200'
            }`}
            title={transport === 'sse' ? 'Server-Sent Events' : 'Polling fallback'}
          >
            <Radio className="h-3 w-3 animate-pulse" />
            {transport === 'sse' ? 'Live' : transport === 'poll' ? 'Poll' : '…'}
          </span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 px-8 pb-8">
        {/* Main stage */}
        <main className="min-w-0 space-y-6">
          {!active ? (
            <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-12 text-center space-y-3">
              <p className="text-2xl font-medium text-stone-200">
                Waiting for the next question
              </p>
              <p className="text-stone-500 text-sm">
                Scan the code to join — results appear here when the host
                activates a prompt.
              </p>
            </div>
          ) : (
            <section className="rounded-2xl border border-stone-800 bg-stone-900/70 p-8 space-y-8">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">
                  {active.kind}
                  {active.identifyEffective === 'anonymous'
                    ? ' · anonymous'
                    : ' · identified'}
                  {' · '}
                  {active.results.responseCount} response
                  {active.results.responseCount === 1 ? '' : 's'}
                </p>
                <h2 className="mt-2 text-2xl md:text-3xl font-semibold leading-snug">
                  {active.prompt}
                </h2>
              </div>

              {active.kind === 'poll' && (
                <ul className="space-y-4">
                  {active.results.pollBars.map((bar) => (
                    <li key={bar.label} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-stone-100">
                          {bar.label}
                        </span>
                        <span className="tabular-nums text-stone-400">
                          {bar.pct}% · {bar.count}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-stone-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-[width] duration-700 ease-out"
                          style={{ width: `${bar.pct}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {active.kind === 'scale' && active.results.scale && (
                <div className="space-y-4">
                  <p className="text-5xl font-semibold tabular-nums text-teal-300">
                    {active.results.scale.average ?? '—'}
                    <span className="text-lg text-stone-500 font-normal ml-2">
                      avg / 10
                    </span>
                  </p>
                  <div className="flex items-end gap-1.5 h-28">
                    {active.results.scale.buckets.map((n, i) => {
                      const max = Math.max(
                        1,
                        ...active.results.scale!.buckets
                      )
                      const h = Math.round((n / max) * 100)
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col justify-end items-center gap-1"
                        >
                          <div
                            className="w-full rounded-t bg-teal-500/80 transition-[height] duration-500"
                            style={{ height: `${h}%` }}
                          />
                          <span className="text-[10px] text-stone-500">
                            {i + 1}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {(active.kind === 'wordcloud' || active.kind === 'open') && (
                <div className="flex flex-wrap gap-x-4 gap-y-3 items-center justify-center py-4 min-h-[12rem]">
                  {active.results.wordCloud.length === 0 ? (
                    <p className="text-stone-500 text-sm">
                      Words will gather here as people answer…
                    </p>
                  ) : (
                    active.results.wordCloud.map((w) => {
                      const scale =
                        0.85 + (w.weight / maxCloud) * 1.6
                      return (
                        <span
                          key={w.text}
                          className="text-teal-200/95 transition-all duration-500"
                          style={{
                            fontSize: `${scale}rem`,
                            opacity: 0.55 + (w.weight / maxCloud) * 0.45,
                            fontWeight: w.weight >= maxCloud ? 650 : 500,
                          }}
                        >
                          {w.text}
                        </span>
                      )
                    })
                  )}
                </div>
              )}

              {active.kind === 'qa' && (
                <p className="text-stone-400 text-sm">
                  Audience questions are ranked on the right.
                </p>
              )}
            </section>
          )}

          {/* Q&A board (also when not qa kind) */}
          {snapshot.qa.length > 0 && (
            <section className="rounded-2xl border border-stone-800 bg-stone-900/40 p-6">
              <h3 className="text-sm font-medium text-stone-400 mb-4">
                Top questions
              </h3>
              <ol className="space-y-3">
                {snapshot.qa.slice(0, 8).map((q, i) => (
                  <li key={q.askEventId} className="flex gap-3 items-start">
                    <span className="tabular-nums text-teal-400 font-semibold w-8 shrink-0">
                      ↑{q.upvotes}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base text-stone-100 leading-snug">
                        <span className="text-stone-500 mr-2">{i + 1}.</span>
                        {q.text}
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {q.identified
                          ? q.displayName || 'Participant'
                          : 'Anonymous'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </main>

        {/* Join rail */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-stone-800 bg-white p-4 text-center space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Join QR"
              width={200}
              height={200}
              className="mx-auto rounded-md"
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">
                Join code
              </p>
              <p className="text-2xl font-bold tracking-[0.2em] text-stone-900">
                {joinCode}
              </p>
            </div>
            <p className="text-[11px] text-stone-600 break-all leading-snug">
              {joinUrl.replace(/^https?:\/\//, '')}
            </p>
          </div>

          {/* Host controls */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4 space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs text-stone-400 hover:text-stone-200"
              onClick={() => setShowControls((v) => !v)}
            >
              <span className="font-medium">Host controls</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  showControls ? 'rotate-90' : ''
                }`}
              />
            </button>

            {showControls && (
              <div className="space-y-3">
                {!hostToken ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-stone-500">
                      Paste a host token (from the dashboard) to advance
                      questions.
                    </p>
                    <input
                      value={hostUnlock}
                      onChange={(e) => setHostUnlock(e.target.value)}
                      placeholder="Host token"
                      className="w-full h-9 rounded-md bg-stone-950 border border-stone-700 px-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={unlockHost}
                      className="w-full h-8 rounded-md bg-stone-100 text-stone-900 text-xs font-semibold"
                    >
                      Unlock
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot.session.status !== 'live' && (
                        <CtrlBtn
                          disabled={controlBusy}
                          onClick={() => void control({ action: 'go_live' })}
                        >
                          <Play className="h-3 w-3" /> Go live
                        </CtrlBtn>
                      )}
                      <CtrlBtn
                        disabled={controlBusy}
                        onClick={() => void control({ action: 'end' })}
                      >
                        <Square className="h-3 w-3" /> End
                      </CtrlBtn>
                    </div>
                    <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                      {snapshot.questions.map((q) => (
                        <li
                          key={q.id}
                          className={`rounded-md border px-2 py-1.5 text-[11px] space-y-1 ${
                            q.state === 'active'
                              ? 'border-teal-500/50 bg-teal-500/10'
                              : 'border-stone-700'
                          }`}
                        >
                          <p className="font-medium text-stone-200 line-clamp-2">
                            {q.prompt}
                          </p>
                          <p className="text-stone-500 flex items-center gap-1">
                            <ListOrdered className="h-3 w-3" />
                            {q.kind} · {q.state}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {q.state !== 'active' && (
                              <CtrlBtn
                                disabled={controlBusy}
                                onClick={() =>
                                  void control({
                                    action: 'activate',
                                    questionId: q.id,
                                  })
                                }
                              >
                                Activate
                              </CtrlBtn>
                            )}
                            {q.state === 'active' && (
                              <CtrlBtn
                                disabled={controlBusy}
                                onClick={() =>
                                  void control({
                                    action: 'close',
                                    questionId: q.id,
                                  })
                                }
                              >
                                Close
                              </CtrlBtn>
                            )}
                            {q.state !== 'queued' && (
                              <CtrlBtn
                                disabled={controlBusy}
                                onClick={() =>
                                  void control({
                                    action: 'queue',
                                    questionId: q.id,
                                  })
                                }
                              >
                                Queue
                              </CtrlBtn>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function CtrlBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-stone-600 bg-stone-800 text-[10px] font-medium text-stone-100 hover:bg-stone-700 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
