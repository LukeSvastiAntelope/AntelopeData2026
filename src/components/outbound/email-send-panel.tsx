'use client'

/**
 * P2 — In-app email: upload/paste list → compose → send via platform Resend.
 * Reuses the distribute-page spreadsheet upload pattern (xlsx/csv + paste).
 * Candidate never leaves Antelope; no connect-account step.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Check,
  FileSpreadsheet,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

function extractEmailsFromRows(rows: unknown[][]): string[] {
  if (!rows.length) return []
  const out = new Set<string>()
  const header = (rows[0] || []).map((c) => String(c ?? '').toLowerCase().trim())
  const emailCol = header.findIndex((h) => /e-?mail/.test(h))
  if (emailCol >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const row = (rows[i] || []) as unknown[]
      const val = row[emailCol]
      if (val == null) continue
      const s = String(val).trim()
      if (EMAIL_RE.test(s)) out.add(s.toLowerCase())
    }
    if (out.size) return Array.from(out)
  }
  for (const row of rows) {
    for (const cell of (row as unknown[]) || []) {
      if (cell == null) continue
      const s = String(cell).trim()
      if (EMAIL_RE.test(s)) out.add(s.toLowerCase())
    }
  }
  return Array.from(out)
}

function parseSubjectBody(emailDraftBody: string): { subject: string; body: string } {
  const lines = emailDraftBody.split(/\r?\n/)
  if (/^subject:\s*/i.test(lines[0] || '')) {
    const subject = lines[0].replace(/^subject:\s*/i, '').trim()
    let start = 1
    if (lines[1]?.trim() === '') start = 2
    return { subject, body: lines.slice(start).join('\n').trim() }
  }
  return { subject: '', body: emailDraftBody.trim() }
}

type CatalogItem = {
  id: string
  name: string
  description: string | null
  source: 'preset' | 'saved'
  category?: string
}

type Receipt = {
  id: string
  sendId?: number
  provider: string
  from: string
  subject: string
  sentAt: string
  summary: { total: number; sent: number; failed: number }
  prepared: {
    rawCount: number
    validCount: number
    invalidCount: number
    duplicateCount: number
    suppressedCount: number
  }
  canSpam?: boolean
  messageIds?: string[]
  recipients?: Array<{ email: string; status: string; providerMessageId: string | null }>
}

type RecentSend = {
  id: number
  subject: string
  from: string
  provider: string
  receiptId: string | null
  createdAt: string
  recipients: Array<{
    id: number
    email: string
    status: string
    providerMessageId: string | null
    lastEventAt: string | null
  }>
}

type EmailStreamEvent = {
  id: number
  sendId: number | null
  email: string | null
  eventType: string
  createdAt: string
}

type SuppressionRow = {
  id: number
  email: string
  reason: string
  source: string
  createdAt: string
}

type Props = {
  segmentCatalog?: CatalogItem[]
}

function statusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'bounced' || status === 'complained' || status === 'failed') {
    return 'destructive'
  }
  if (status === 'opened' || status === 'delivered') return 'default'
  return 'secondary'
}

export function OutboundEmailSendPanel({ segmentCatalog = [] }: Props) {
  const [emailInput, setEmailInput] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [tailoring, setTailoring] = useState(false)
  const [segmentId, setSegmentId] = useState<string>('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [prepareNote, setPrepareNote] = useState<string | null>(null)
  const [recentSends, setRecentSends] = useState<RecentSend[]>([])
  const [streamEvents, setStreamEvents] = useState<EmailStreamEvent[]>([])
  const [suppressions, setSuppressions] = useState<SuppressionRow[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const typedCount = emailInput
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean).length

  const loadResults = useCallback(async () => {
    setLoadingResults(true)
    try {
      const res = await fetch('/api/outbound/email/results')
      const data = await res.json()
      if (!data.status) return
      setRecentSends(Array.isArray(data.sends) ? data.sends : [])
      setStreamEvents(Array.isArray(data.events) ? data.events : [])
      setSuppressions(Array.isArray(data.suppressions) ? data.suppressions : [])
    } catch {
      /* ignore — panel still usable offline */
    } finally {
      setLoadingResults(false)
    }
  }, [])

  useEffect(() => {
    void loadResults()
  }, [loadResults])

  const handleFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
      })
      const emails = extractEmailsFromRows(rows as unknown[][])
      if (!emails.length) {
        toast.error('No email addresses found. Include a column named "email".')
        return
      }
      setEmailInput((prev) => {
        const existing = prev
          .split(/[\n,;]+/)
          .map((n) => n.trim())
          .filter(Boolean)
        return Array.from(new Set([...existing, ...emails])).join('\n')
      })
      setUploadedFile(file.name)
      setUploadedCount(emails.length)
      toast.success(`${emails.length} emails loaded from ${file.name}`)
    } catch (err) {
      console.error(err)
      toast.error('Could not read the file. Use .xlsx, .xls or .csv')
    }
  }, [])

  const runPrepare = useCallback(async () => {
    const emails = emailInput
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (!emails.length) {
      toast.error('Add at least one email address')
      return
    }
    setPreparing(true)
    setPrepareNote(null)
    try {
      const res = await fetch('/api/outbound/email/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Prepare failed')
      setPrepareNote(
        [
          `${data.readyCount} ready to send`,
          data.invalidCount ? `${data.invalidCount} invalid` : null,
          data.duplicateCount ? `${data.duplicateCount} duplicates dropped` : null,
          data.suppressedCount
            ? `${data.suppressedCount} on suppression list (dropped)`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      )
      if (Array.isArray(data.emails) && data.emails.length && !data.emailsTruncated) {
        setEmailInput(data.emails.join('\n'))
      }
      toast.success('List validated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Prepare failed')
    } finally {
      setPreparing(false)
    }
  }, [emailInput])

  const tailorFromSegment = useCallback(async () => {
    if (!segmentId) {
      toast.error('Pick a segment to tailor from')
      return
    }
    setTailoring(true)
    try {
      const res = await fetch('/api/outbound/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segmentId,
          formats: ['email'],
          goal: subject.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!data.status) throw new Error(data.message || 'Draft failed')
      const draft = (data.drafts || []).find(
        (d: { format: string }) => d.format === 'email'
      )
      if (!draft?.body) throw new Error('No email draft returned')
      const parsed = parseSubjectBody(String(draft.body))
      if (parsed.subject) setSubject(parsed.subject)
      setBody(parsed.body)
      toast.success(
        data.context?.thinSegment
          ? 'Tailored email loaded (thin segment — coarse + disclaimer)'
          : 'Tailored email loaded from stated positions'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tailor failed')
    } finally {
      setTailoring(false)
    }
  }, [segmentId, subject])

  const handleSend = useCallback(async () => {
    const emails = emailInput
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (!emails.length) {
      toast.error('Enter at least one email address')
      return
    }
    if (!subject.trim()) {
      toast.error('Subject is required')
      return
    }
    if (!body.trim()) {
      toast.error('Message body is required')
      return
    }

    setSending(true)
    setReceipt(null)
    try {
      const res = await fetch('/api/outbound/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails,
          subject: subject.trim(),
          body: body.trim(),
        }),
      })
      const data = await res.json()
      if (!data.status) {
        toast.error(data.message || 'Send failed')
        return
      }
      setReceipt(data.receipt as Receipt)
      toast.success(
        `Sent to ${data.receipt?.summary?.sent ?? 0} of ${data.receipt?.summary?.total ?? 0}`
      )
      void loadResults()
    } catch {
      toast.error('Send request failed')
    } finally {
      setSending(false)
    }
  }, [emailInput, subject, body, loadResults])

  const tracked = segmentCatalog.filter(
    (c) => c.category === 'tracked' || c.source === 'saved'
  )
  const catalog = tracked.length ? tracked : segmentCatalog

  return (
    <Card className="border-foreground/15">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send email
            </CardTitle>
            <CardDescription>
              Upload or paste a list, write your message, hit send — all inside Antelope.
              No external login.
            </CardDescription>
          </div>
          <Badge variant="secondary">Platform email</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Recipients */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              Recipients{' '}
              <span className="text-muted-foreground font-normal">
                (one per line or comma-separated)
              </span>
            </Label>
            <span className="text-xs text-muted-foreground">
              {typedCount} address{typedCount === 1 ? '' : 'es'}
            </span>
          </div>
          <Textarea
            placeholder={'voter1@example.com\nvoter2@example.com'}
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="font-mono text-sm min-h-[120px]"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Bulk upload (Excel / CSV)
          </Label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload spreadsheet
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={preparing || !typedCount}
              onClick={() => void runPrepare()}
            >
              {preparing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : null}
              Validate list
            </Button>
            {uploadedFile && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {uploadedFile} — {uploadedCount} emails
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFile(null)
                    setUploadedCount(0)
                  }}
                  className="ml-1 hover:text-foreground"
                  aria-label="clear upload badge"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Include a column named <code>email</code>. Invalid addresses and anyone on your
            suppression list are dropped at send. Works the same for 50 or 5,000.
          </p>
          {prepareNote && (
            <p className="text-xs text-muted-foreground rounded-md border border-border px-2 py-1.5">
              {prepareNote}
            </p>
          )}
        </div>

        {/* Optional segment tailor */}
        {catalog.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Tailor from segment (optional)
            </Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={segmentId || undefined} onValueChange={setSegmentId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Choose a segment" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((c) => (
                    <SelectItem key={`${c.source}-${c.id}`} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!segmentId || tailoring}
                onClick={() => void tailorFromSegment()}
              >
                {tailoring ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                Fill subject &amp; body
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses survey-stated positions only — message tailoring, not who to email.
            </p>
          </div>
        )}

        {/* Compose */}
        <div className="space-y-2">
          <Label htmlFor="outbound-email-subject">Subject</Label>
          <Input
            id="outbound-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Your subject line"
            className="text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="outbound-email-body">Message</Label>
          <Textarea
            id="outbound-email-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="text-sm min-h-[160px]"
          />
        </div>

        <Button
          onClick={() => void handleSend()}
          disabled={sending || !typedCount || !subject.trim() || !body.trim()}
          className="w-full sm:w-auto"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send email
            </>
          )}
        </Button>

        {receipt && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
              <Check className="h-4 w-4" />
              Receipt — emails sent from Antelope
              {receipt.canSpam ? (
                <Badge variant="outline" className="ml-1 text-[10px]">
                  CAN-SPAM
                </Badge>
              ) : null}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-medium text-foreground">Receipt id: </dt>
                <dd className="inline font-mono">{receipt.id}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">From: </dt>
                <dd className="inline">{receipt.from}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Sent: </dt>
                <dd className="inline">
                  {receipt.summary.sent} / {receipt.summary.total}
                  {receipt.summary.failed ? ` (${receipt.summary.failed} failed)` : ''}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Dropped: </dt>
                <dd className="inline">
                  {receipt.prepared.suppressedCount} suppressed ·{' '}
                  {receipt.prepared.invalidCount} invalid ·{' '}
                  {receipt.prepared.duplicateCount} dupes
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-foreground">When: </dt>
                <dd className="inline">{new Date(receipt.sentAt).toLocaleString()}</dd>
              </div>
            </dl>
            {receipt.recipients && receipt.recipients.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {receipt.recipients.slice(0, 20).map((r) => (
                  <li
                    key={r.email}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-mono truncate">{r.email}</span>
                    <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* P3 — Delivery status + event stream + suppressions */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <h3 className="text-sm font-medium">Delivery status</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loadingResults}
              onClick={() => void loadResults()}
            >
              {loadingResults ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
          </div>

          {recentSends.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sends yet. After you send, per-recipient delivered / opened / bounced status
              appears here.
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {recentSends.map((s) => (
                <div key={s.id} className="rounded-md border border-border/80 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.subject}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()} · {s.from}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {s.recipients.length} rcpt
                    </Badge>
                  </div>
                  <ul className="space-y-1">
                    {s.recipients.slice(0, 30).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-mono truncate">{r.email}</span>
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {streamEvents.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-xs font-medium text-foreground">Event stream</p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {streamEvents.slice(0, 25).map((ev) => (
                  <li key={ev.id} className="text-[11px] text-muted-foreground flex gap-2">
                    <span className="shrink-0 tabular-nums">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                    <span className="font-medium text-foreground">{ev.eventType}</span>
                    {ev.email ? <span className="font-mono truncate">{ev.email}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {suppressions.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-xs font-medium text-foreground">
                Suppression list (this candidate only)
              </p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {suppressions.slice(0, 40).map((s) => (
                  <li
                    key={s.id}
                    className="text-[11px] flex items-center justify-between gap-2"
                  >
                    <span className="font-mono truncate">{s.email}</span>
                    <span className="text-muted-foreground shrink-0">
                      {s.reason} · {s.source}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
