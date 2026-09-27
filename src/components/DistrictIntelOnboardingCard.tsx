'use client'

/**
 * Data D2 — District Intelligence Report onboarding surface.
 * Polls async snapshot; shows "gathering…" then the fries-in-the-bag report.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, MapPinned, RefreshCw } from 'lucide-react'

type Report = {
  districtCode: string
  headline: string
  narrative: string
  demographics: {
    totalPopulation: number | null
    medianHouseholdIncome: number | null
    bachelorsOrHigherPct: number | null
    medianAge: number | null
  }
  pvi: string | null
  incumbentName: string | null
  incumbentParty: string | null
  fundraising: {
    status: string
    committeeName: string | null
    receipts: number | null
    individualContributions: number | null
    cycle: number | null
    sampleCandidates: { name: string; party: string }[]
  }
  localOfficials: {
    status: string
    sample: { name: string; role: string }[]
  }
  verifiedFacts: string[]
  sourcesHealth: Record<string, string>
  generatedAt: string
}

type JobStatus = 'none' | 'pending' | 'ready' | 'failed'

function money(n: number | null) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

export function DistrictIntelOnboardingCard() {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [needsDistrict, setNeedsDistrict] = useState(false)
  const [districtCode, setDistrictCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [districtKey, setDistrictKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/district-intel/onboarding')
      const data = await res.json()
      if (!res.ok || !data.status) {
        setMessage(data.message || 'Unable to load district report')
        return
      }
      setJobStatus(data.jobStatus)
      setNeedsDistrict(Boolean(data.needsDistrict))
      setMessage(data.message || null)
      setDistrictKey(data.districtCode || null)
      if (data.jobStatus === 'ready' && data.report) {
        setReport(data.report)
      } else {
        setReport(null)
      }
    } catch {
      setMessage('Unable to load district report')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while gathering
  useEffect(() => {
    if (jobStatus !== 'pending') return
    const t = setInterval(() => {
      void load()
    }, 2500)
    return () => clearInterval(t)
  }, [jobStatus, load])

  const bindDistrict = async () => {
    if (!districtCode.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/district-intel/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districtCode: districtCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        setMessage(data.message || 'Could not start report')
        return
      }
      setJobStatus('pending')
      setNeedsDistrict(false)
      setDistrictKey(data.districtCode)
      setMessage(data.message || 'Gathering your district data…')
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    setBusy(true)
    try {
      await fetch('/api/dashboard/district-intel/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry: true }),
      })
      setJobStatus('pending')
      setMessage('Gathering your district data…')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="w-full max-w-4xl rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned className="h-4 w-4 text-teal-800" />
            <h2 className="text-base font-semibold">
              District Intelligence Report
            </h2>
            {districtKey && (
              <Badge variant="outline" className="text-[10px]">
                {districtKey}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Your cold-start brief — demographics, fundraising landscape, local
            officials. Every figure traces to a public source.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {needsDistrict && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tell us your US House district and we&apos;ll prepare the report in
              the background.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                className="h-9"
                placeholder="e.g. NJ-5 or CA-12"
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value)}
              />
              <Button
                className="h-9 shrink-0"
                disabled={busy || !districtCode.trim()}
                onClick={() => void bindDistrict()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Generate report'
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Or click a district on the{' '}
              <Link href="/dashboard" className="underline text-primary">
                campaign map
              </Link>
              .
            </p>
          </div>
        )}

        {jobStatus === 'pending' && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-teal-200 bg-teal-50/40 px-4 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-800 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-900">
                Gathering your district data…
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pulling Census, FEC, BLS, and OpenStates. This usually takes a
                few moments — you can keep exploring.
              </p>
            </div>
          </div>
        )}

        {jobStatus === 'failed' && (
          <div className="rounded-lg border border-border px-4 py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              {message || 'Could not gather district data right now.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy}
              onClick={() => void retry()}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Try again
            </Button>
          </div>
        )}

        {jobStatus === 'ready' && report && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {report.headline}
              </h3>
              {(report.pvi || report.incumbentName) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {[
                    report.pvi ? `PVI ${report.pvi}` : null,
                    report.incumbentName
                      ? `Incumbent ${report.incumbentName}${
                          report.incumbentParty
                            ? ` (${report.incumbentParty})`
                            : ''
                        }`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  label: 'Population',
                  value: report.demographics.totalPopulation
                    ? report.demographics.totalPopulation.toLocaleString()
                    : '—',
                },
                {
                  label: 'Median HH income',
                  value: money(report.demographics.medianHouseholdIncome),
                },
                {
                  label: 'Median age',
                  value:
                    report.demographics.medianAge != null
                      ? String(report.demographics.medianAge)
                      : '—',
                },
                {
                  label: 'BA+',
                  value:
                    report.demographics.bachelorsOrHigherPct != null
                      ? `${report.demographics.bachelorsOrHigherPct}%`
                      : '—',
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-md bg-muted/40 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fundraising landscape
                </p>
                {report.fundraising.receipts != null ? (
                  <p className="text-sm">
                    <span className="font-medium">
                      {money(report.fundraising.receipts)}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      receipts
                      {report.fundraising.cycle
                        ? ` · cycle ${report.fundraising.cycle}`
                        : ''}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    FEC totals {report.fundraising.status}
                  </p>
                )}
                {report.fundraising.sampleCandidates.length > 0 && (
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    {report.fundraising.sampleCandidates.map((c, i) => (
                      <li key={`${c.name}-${i}`}>
                        {c.name}{' '}
                        <span className="opacity-70">({c.party})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Local officials
                </p>
                {report.localOfficials.sample.length > 0 ? (
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    {report.localOfficials.sample.map((o, i) => (
                      <li key={`${o.name}-${i}`}>
                        {o.name}{' '}
                        <span className="opacity-70">— {o.role}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    OpenStates {report.localOfficials.status}
                  </p>
                )}
              </div>
            </div>

            {report.verifiedFacts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Verified facts
                </p>
                <ul className="space-y-1">
                  {report.verifiedFacts.slice(0, 8).map((f, i) => (
                    <li
                      key={i}
                      className="text-xs text-muted-foreground leading-relaxed pl-2 border-l-2 border-teal-200"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(report.sourcesHealth || {}).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[10px] font-normal">
                  {k}: {v}
                </Badge>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
              Powered by Antelope · Aggregate public data only · Generated{' '}
              {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
