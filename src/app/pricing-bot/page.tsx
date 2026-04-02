'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Bot, Loader2, HeartHandshake, Send, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const PROMO_COPY = 'for the first 3 months'

export default function PricingBotPage() {
  const router = useRouter()
  const [profile, setProfile] = useState({
    positionRunningFor: '',
    candidateName: '',
    districtCode: '',
    campaignWebsite: '',
    reductionSoughtPct: 25,
    issue: '',
    supporterName: '',
    email: '',
  })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [cumulative, setCumulative] = useState(0)
  const [quote, setQuote] = useState<null | {
    quoteToken: string
    listPrice: number
    finalPrice: number
    discountPct: number
    referralLink?: string
    shareText?: string
  }>(null)
  const [draft, setDraft] = useState('')
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const [origin, setOrigin] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startChat = async () => {
    if (!profile.positionRunningFor.trim() || !profile.candidateName.trim()) {
      toast.error('Add position and candidate name to start.')
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/pricing-bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          profile: {
            campaignType: profile.positionRunningFor,
            candidateName: profile.candidateName,
            districtCode: profile.districtCode,
            campaignWebsite: profile.campaignWebsite,
            reductionSoughtPct: profile.reductionSoughtPct,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Could not start chat.')
        return
      }
      setSessionId(data.sessionId)
      setMessages(data.messages || [])
      setCumulative(data.cumulativeFavorabilityScore ?? 0)
      setQuote({
        quoteToken: data.quote.quoteToken,
        listPrice: data.quote.listPrice,
        finalPrice: data.quote.finalPrice,
        discountPct: data.quote.discountPct,
        referralLink: data.referralLink,
        shareText: data.shareText,
      })
      toast.success('Chat started — make your case.')
    } catch {
      toast.error('Could not start chat.')
    } finally {
      setStarting(false)
    }
  }

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text || !sessionId) return
    setSending(true)
    try {
      const res = await fetch('/api/pricing-bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId, userMessage: text }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Send failed.')
        return
      }
      setMessages(data.messages || [])
      setCumulative(data.cumulativeFavorabilityScore ?? 0)
      setQuote({
        quoteToken: data.quote.quoteToken,
        listPrice: data.quote.listPrice,
        finalPrice: data.quote.finalPrice,
        discountPct: data.quote.discountPct,
        referralLink: data.referralLink,
        shareText: data.shareText,
      })
      setDraft('')
    } catch {
      toast.error('Send failed.')
    } finally {
      setSending(false)
    }
  }

  const applyShareBonus = useCallback(
    async (action: 'linkedin' | 'facebook' | 'campaign_email') => {
      if (!quote?.quoteToken) return
      try {
        const res = await fetch('/api/pricing-bot/share-bonus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteToken: quote.quoteToken, action }),
        })
        const data = await res.json()
        if (!res.ok || !data?.status) return
        setQuote((prev) =>
          prev
            ? {
                ...prev,
                finalPrice: data.quote.finalPrice,
                discountPct: data.quote.discountPct,
              }
            : prev
        )
        toast.success('+5% share bonus applied (once).')
      } catch {
        /* ignore */
      }
    },
    [quote?.quoteToken]
  )

  const handleOpenCampaignActionKit = () => {
    if (!quote) return
    const d = profile.districtCode?.trim()
    if (!d) {
      toast.error('Add a US House district (e.g. NJ-5) to open your district report.')
      return
    }
    const params = new URLSearchParams()
    params.set('district', d)
    if (profile.candidateName) params.set('candidate', profile.candidateName)
    if (profile.positionRunningFor) params.set('position', profile.positionRunningFor)
    if (profile.issue) params.set('issue', profile.issue)
    params.set('quoted', String(quote.finalPrice))
    params.set('discount', String(quote.discountPct))
    router.push(`/campaign-action-kit?${params.toString()}`)
  }

  const handleHumanReview = async () => {
    if (!quote) return
    setReviewLoading(true)
    try {
      const res = await fetch('/api/pricing-bot/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: profile.email || null,
          pricingForm: profile,
          pricingResult: quote,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) {
        toast.error(data?.message || 'Failed to submit human review.')
        return
      }
      toast.success(`Human review submitted (${data.requestId}).`)
    } catch {
      toast.error('Failed to submit human review.')
    } finally {
      setReviewLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-full border border-violet-400/50 bg-violet-500/10 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-violet-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">Antelope Pricing Bot</h1>
            <p className="text-[11px] text-muted-foreground">Professional, diplomatic tone—calibrate pricing in a few exchanges.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Home</Link>
        </Button>
      </header>

      {sessionId && quote ? (
        <div className="border-b border-border px-4 py-3 space-y-3 bg-muted/30 shrink-0">
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Cumulative favorability
              </span>
              <span className="font-medium tabular-nums text-foreground">{cumulative}/100</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-lime-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(2, cumulative)}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              List ${quote.listPrice}/mo ({PROMO_COPY})
            </span>
            <span className="text-base font-semibold tabular-nums">
              ${quote.finalPrice}/mo · {quote.discountPct}% off ({PROMO_COPY})
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full">
        {!sessionId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              List price is <strong>$650/mo</strong> {PROMO_COPY}. Every reply starts from a <strong>5% respectful baseline</strong> and can improve with a normal range around your case—share a few thoughtful exchanges to move{' '}
              <strong>cumulative favorability</strong> and your quote.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Position running for</span>
              <Input
                value={profile.positionRunningFor}
                onChange={(e) => setProfile((p) => ({ ...p, positionRunningFor: e.target.value }))}
                placeholder="e.g. Congress, Mayor"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Candidate name</span>
              <Input
                value={profile.candidateName}
                onChange={(e) => setProfile((p) => ({ ...p, candidateName: e.target.value }))}
                placeholder="Full name"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">US campaign district (if applicable)</span>
              <Input
                value={profile.districtCode}
                onChange={(e) => setProfile((p) => ({ ...p, districtCode: e.target.value }))}
                placeholder="e.g. NJ-5"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Campaign website (optional)</span>
              <Input
                type="url"
                inputMode="url"
                value={profile.campaignWebsite}
                onChange={(e) => setProfile((p) => ({ ...p, campaignWebsite: e.target.value }))}
                placeholder="https://…"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Discount percentage sought</span>
              <p className="text-[11px] text-muted-foreground">Target only — not a guarantee.</p>
              <Input
                type="number"
                min={0}
                max={90}
                value={profile.reductionSoughtPct}
                onChange={(e) => setProfile((p) => ({ ...p, reductionSoughtPct: Number(e.target.value || 0) }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Top issue (optional)</span>
              <Input
                value={profile.issue}
                onChange={(e) => setProfile((p) => ({ ...p, issue: e.target.value }))}
                placeholder="e.g. housing — for action kit drafts"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Your name (optional)</span>
              <Input
                value={profile.supporterName}
                onChange={(e) => setProfile((p) => ({ ...p, supporterName: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Email (optional, human review)</span>
              <Input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
            </label>
            <Button className="w-full" onClick={startChat} disabled={starting}>
              {starting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                'Open chat & begin'
              )}
            </Button>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {messages.map((m, i) => (
                <li
                  key={`${i}-${m.role}`}
                  className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground ml-6' : 'bg-muted mr-4 border border-border/80'
                  }`}
                >
                  {m.content}
                </li>
              ))}
            </ul>
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {sessionId ? (
        <div className="border-t border-border p-4 space-y-3 bg-background shrink-0 max-w-lg mx-auto w-full">
          <div className="flex gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Argue your next point — strategy, impact, path to win…"
              rows={2}
              className="min-h-[72px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
            />
            <Button type="button" className="shrink-0 self-end h-11 w-11 p-0" onClick={() => void sendMessage()} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
          {quote ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
              {quote.shareText ? (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Share blurb</span>
                  <Textarea readOnly rows={2} value={quote.shareText} className="text-[11px]" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      await navigator.clipboard.writeText(quote.shareText || '')
                      toast.success('Copied.')
                    }}
                  >
                    Copy share text
                  </Button>
                </div>
              ) : null}
              {quote.referralLink ? (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Referral link</span>
                  <Textarea readOnly rows={2} value={`${origin}${quote.referralLink}`} className="text-[11px]" />
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={handleHumanReview} disabled={reviewLoading}>
                  {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartHandshake className="h-4 w-4 mr-1" />}
                  Human review
                </Button>
                <Button size="sm" className="flex-1" onClick={handleOpenCampaignActionKit}>
                  Action kit
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
