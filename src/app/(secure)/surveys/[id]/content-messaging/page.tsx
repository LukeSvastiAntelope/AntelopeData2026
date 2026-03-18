'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Papa from 'papaparse'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MessageSquareText, Upload, Send, AlertCircle } from 'lucide-react'

type Channel = 'email' | 'sms'

type Row = Record<string, any>

function normalizeHeader(h: string) {
  return (h || '').trim()
}

function guessColumn(headers: string[], kinds: Array<'email' | 'phone' | 'name'>) {
  const lower = headers.map(h => h.toLowerCase())
  const findAny = (needles: string[]) => {
    const idx = lower.findIndex(h => needles.some(n => h.includes(n)))
    return idx >= 0 ? headers[idx] : ''
  }

  const out: Record<string, string> = {}
  if (kinds.includes('email')) out.email = findAny(['email', 'e-mail'])
  if (kinds.includes('phone')) out.phone = findAny(['phone', 'mobile', 'cell', 'tel'])
  if (kinds.includes('name')) out.name = findAny(['name', 'first', 'full'])
  return out
}

export default function ContentMessagingPage() {
  const params = useParams()
  const surveyId = params.id as string

  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [headers, setHeaders] = useState<string[]>([])

  const [channel, setChannel] = useState<Channel>('email')
  const [model, setModel] = useState<string>('gpt-4o-mini')
  const [tone, setTone] = useState<string>('friendly, concise, fundraising')
  const [campaignContext, setCampaignContext] = useState<string>('')
  const [ctaUrl, setCtaUrl] = useState<string>('')

  const guessed = useMemo(() => guessColumn(headers, ['email', 'phone', 'name']), [headers])
  const [emailCol, setEmailCol] = useState<string>('')
  const [phoneCol, setPhoneCol] = useState<string>('')
  const [nameCol, setNameCol] = useState<string>('')

  const [isSending, setIsSending] = useState(false)
  const [preview, setPreview] = useState<Array<{ to: string; message: string }>>([])
  const [isPreviewing, setIsPreviewing] = useState(false)

  // Initialize mapping once headers land
  useEffect(() => {
    if (!headers.length) return
    setEmailCol((prev) => (prev ? prev : guessed.email || ''))
    setPhoneCol((prev) => (prev ? prev : guessed.phone || ''))
    setNameCol((prev) => (prev ? prev : guessed.name || ''))
  }, [headers, guessed.email, guessed.phone, guessed.name])

  const recipients = useMemo(() => {
    const get = (r: Row, k: string) => (k ? String(r[k] ?? '').trim() : '')
    const out: Array<{ email?: string; phone?: string; name?: string }> = []
    for (const r of rows) {
      const email = get(r, emailCol)
      const phone = get(r, phoneCol)
      const name = get(r, nameCol)
      if (!email && !phone) continue
      out.push({
        email: email || undefined,
        phone: phone || undefined,
        name: name || undefined,
      })
    }
    return out
  }, [rows, emailCol, phoneCol, nameCol])

  const upload = async (file: File) => {
    setError(null)
    setInfo(null)
    setPreview([])
    try {
      const text = await file.text()
      const parsed = Papa.parse<Row>(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: normalizeHeader,
      })
      if (parsed.errors?.length) {
        throw new Error(parsed.errors[0]?.message || 'Failed to parse CSV')
      }
      const data = (parsed.data || []).filter(Boolean)
      const hs = (parsed.meta.fields || []).map(normalizeHeader).filter(Boolean)
      if (!hs.length) throw new Error('No headers found in CSV')
      if (!data.length) throw new Error('No rows found in CSV')
      setHeaders(hs)
      setRows(data.slice(0, 5000)) // hard cap for safety in UI
      setInfo(`Loaded ${Math.min(data.length, 5000)} rows (capped at 5000 in UI).`)
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    }
  }

  const runPreview = async () => {
    setError(null)
    setPreview([])
    setIsPreviewing(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/content-messaging/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          model,
          tone,
          campaignContext,
          ctaUrl,
          recipients: recipients.slice(0, 5),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) throw new Error(data?.message || 'Preview failed')
      setPreview(data.preview || [])
    } catch (e: any) {
      setError(e.message || 'Preview failed')
    } finally {
      setIsPreviewing(false)
    }
  }

  const send = async () => {
    setError(null)
    setInfo(null)
    setIsSending(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/content-messaging/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          model,
          tone,
          campaignContext,
          ctaUrl,
          recipients,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.status) throw new Error(data?.message || 'Send failed')
      setInfo(`Queued/sent: ${data.summary?.sent ?? 0} sent, ${data.summary?.failed ?? 0} failed (total ${data.summary?.total ?? 0}).`)
    } catch (e: any) {
      setError(e.message || 'Send failed')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" />
              Content messaging
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-6 max-w-3xl">
          {(error || info) && (
            <Alert variant={error ? 'destructive' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || info}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload recipients</CardTitle>
              <CardDescription>Upload a CSV with at least an email or phone column (up to 5000 rows in UI).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>CSV file</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                  }}
                />
              </div>

              {headers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Email column</Label>
                    <Select value={emailCol} onValueChange={setEmailCol}>
                      <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">(none)</SelectItem>
                        {headers.map(h => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone column</Label>
                    <Select value={phoneCol} onValueChange={setPhoneCol}>
                      <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">(none)</SelectItem>
                        {headers.map(h => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Name column</Label>
                    <Select value={nameCol} onValueChange={setNameCol}>
                      <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">(optional)</SelectItem>
                        {headers.map(h => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {rows.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Parsed recipients: <strong>{recipients.length}</strong>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message generator</CardTitle>
              <CardDescription>AI will create a short bespoke fundraising micro‑message (and a tiny poll question) per recipient.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Telegram/WhatsApp can be added once we have chat IDs/provider wiring.</p>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tone</Label>
                <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="friendly, concise, fundraising" />
              </div>

              <div className="space-y-2">
                <Label>Campaign context</Label>
                <Textarea value={campaignContext} onChange={(e) => setCampaignContext(e.target.value)} placeholder="What are we fundraising for? Key points, constraints, disclaimers, etc." rows={4} />
              </div>

              <div className="space-y-2">
                <Label>Call-to-action URL (donate link)</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={runPreview} disabled={recipients.length === 0 || isPreviewing}>
                  {isPreviewing ? 'Generating…' : 'Preview 5'}
                </Button>
                <Button onClick={send} disabled={recipients.length === 0 || isSending}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSending ? 'Sending…' : `Send to ${recipients.length}`}
                </Button>
              </div>

              {preview.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Preview</div>
                  {preview.map((p, i) => (
                    <div key={i} className="text-xs">
                      <div className="font-mono text-muted-foreground">to: {p.to}</div>
                      <div className="whitespace-pre-wrap">{p.message}</div>
                      {i !== preview.length - 1 && <div className="border-b my-2" />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

