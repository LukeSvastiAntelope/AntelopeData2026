'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Landmark, MapPin, TrendingUp, Users, ExternalLink, Sparkles } from 'lucide-react'
import type { PublicDistrictBrief } from '@/lib/district-brief-public'

function CampaignActionKitContent() {
  const searchParams = useSearchParams()
  const districtRaw = searchParams.get('district') || searchParams.get('districtCode') || ''
  const candidate = searchParams.get('candidate') || ''
  const position = searchParams.get('position') || ''
  const issue = searchParams.get('issue') || ''
  const quoted = searchParams.get('quoted') || ''
  const discount = searchParams.get('discount') || ''

  const [brief, setBrief] = useState<PublicDistrictBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!districtRaw.trim()) {
      setLoading(false)
      setError('no-district')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/public/district-brief?districtCode=${encodeURIComponent(districtRaw.trim())}`
        )
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data?.status) {
          setError(data?.message || 'Could not load district data.')
          setBrief(null)
          return
        }
        setBrief(data.brief as PublicDistrictBrief)
      } catch {
        if (!cancelled) setError('Network error loading report.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [districtRaw])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/40 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10 pb-28">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
            <Sparkles className="h-3.5 w-3.5" />
            Antelope campaign intelligence
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl bg-gradient-to-r from-white via-violet-100 to-cyan-200 bg-clip-text text-transparent">
            Your district field brief
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
            Built from Census Bureau ACS, FEC.gov filings, Open States (when configured), plus Ballotpedia & MIT Election Lab
            pointers—free public data, one readable snapshot.
          </p>
        </div>

        {(candidate || position) && (
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-violet-300/90">Your run</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {candidate || 'Your campaign'}
              {position ? ` · ${position}` : ''}
            </p>
            {issue ? <p className="mt-2 text-sm text-slate-300">Focus: {issue}</p> : null}
            {quoted && discount ? (
              <p className="mt-3 text-sm text-emerald-300/90">
                Pricing bot snapshot: ${quoted}/mo · {discount}% off list (first 3 months)
              </p>
            ) : null}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-sm">Pulling Census, FEC, and state context…</p>
          </div>
        )}

        {!loading && error === 'no-district' && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <p className="text-amber-100 font-medium">Add a US House district to unlock this report</p>
            <p className="mt-2 text-sm text-amber-200/80">
              Go back to the pricing bot and enter a district like <strong>NJ-5</strong> or <strong>CA-12</strong>, then open
              the action kit again.
            </p>
            <Button asChild className="mt-6">
              <Link href="/">Return home</Link>
            </Button>
          </div>
        )}

        {!loading && error && error !== 'no-district' && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-100">
            {error}
          </div>
        )}

        {!loading && brief && (
          <>
            <section className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-900/50 to-slate-900/80 p-0 shadow-2xl shadow-violet-900/20">
              <div className="relative grid gap-0 sm:grid-cols-2">
                <div className="relative min-h-[200px] bg-slate-900/60 p-6 sm:p-8">
                  <div className="pointer-events-none absolute inset-0 opacity-25">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/images/map.svg"
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 text-violet-300">
                      <MapPin className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-semibold tracking-wide uppercase">District overlay</span>
                    </div>
                    <p className="mt-4 text-4xl font-black tracking-tight text-white">{brief.districtCode}</p>
                    <p className="mt-2 text-sm text-violet-100/90">{brief.tagline}</p>
                  </div>
                </div>
                <div className="flex flex-col justify-center border-t border-white/10 bg-black/20 p-6 sm:border-l sm:border-t-0 sm:p-8">
                  <div className="flex items-start gap-3">
                    <Landmark className="h-6 w-6 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase text-cyan-300/90">Electoral snapshot</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-200">{brief.narrative}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <TrendingUp className="h-5 w-5 text-violet-400 mb-2" />
                <p className="text-xs text-slate-400">Cook PVI</p>
                <p className="text-xl font-bold text-white">{brief.pvi ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Users className="h-5 w-5 text-cyan-400 mb-2" />
                <p className="text-xs text-slate-400">Population (est.)</p>
                <p className="text-xl font-bold text-white">
                  {brief.demographics.totalPopulation != null
                    ? brief.demographics.totalPopulation.toLocaleString()
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Landmark className="h-5 w-5 text-emerald-400 mb-2" />
                <p className="text-xs text-slate-400">2024 margin (pts)</p>
                <p className="text-xl font-bold text-white">
                  {brief.margin2024 != null ? `${brief.margin2024 > 0 ? '+' : ''}${brief.margin2024.toFixed(1)}` : '—'}
                </p>
              </div>
            </section>

            <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                Momentum index
              </h2>
              <p className="mt-1 text-xs text-slate-500">Relative scales for planning (not a forecast).</p>
              <div className="mt-6 space-y-4">
                {brief.chart.map((c) => (
                  <div key={c.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{c.name}</span>
                      <span className="tabular-nums text-slate-300">{c.value}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, c.value)}%`, backgroundColor: c.fill }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-10 rounded-2xl border border-violet-500/20 bg-violet-950/20 p-6">
              <h2 className="text-lg font-semibold text-white">Field notes</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {brief.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10 grid gap-3 sm:grid-cols-2">
              <a
                href={brief.ballotpedia.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 transition-colors"
              >
                <span>{brief.ballotpedia.label}</span>
                <ExternalLink className="h-4 w-4 text-slate-500" />
              </a>
              <a
                href={brief.openStates.directoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 transition-colors"
              >
                <span>Open States — {brief.state}</span>
                <ExternalLink className="h-4 w-4 text-slate-500" />
              </a>
              <a
                href={brief.mitElectionLab.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 transition-colors sm:col-span-2"
              >
                <span>{brief.mitElectionLab.label}</span>
                <ExternalLink className="h-4 w-4 text-slate-500" />
              </a>
            </section>

            <section className="mt-8 rounded-xl border border-white/5 bg-slate-900/50 p-4 text-xs text-slate-500">
              <p>
                Census: {brief.census.status} · FEC: {brief.fec.status} · Open States: {brief.openStates.status}. Ballotpedia
                has no single public API key flow here—use search. MIT Election Lab hosts research-grade election data.
              </p>
              <p className="mt-2">{brief.openStates.note}</p>
            </section>

            {brief.fec.sampleCandidates.length > 0 && (
              <section className="mt-8 rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-slate-300">FEC sample filings (House)</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-400">
                  {brief.fec.sampleCandidates.map((c, i) => (
                    <li key={i}>
                      {c.name} <span className="text-slate-600">· {c.party}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-950/95 backdrop-blur-md px-4 py-4 z-50">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400 text-center sm:text-left">
            Run surveys, voter chat, and full district workflows inside Antelope.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="lg" className="bg-violet-600 hover:bg-violet-500 text-white">
              <Link href="/register">Create your free account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CampaignActionKitPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <CampaignActionKitContent />
    </Suspense>
  )
}
