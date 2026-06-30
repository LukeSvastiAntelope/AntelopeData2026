'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Link2,
  QrCode,
  Code,
  MessageSquare,
  Copy,
  Check,
  Download,
  Loader2,
  ExternalLink,
  Smartphone,
  Upload,
  FileSpreadsheet,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

// -----------------------------------------------------------------------
// Phone extraction from spreadsheets (xlsx / csv)
// -----------------------------------------------------------------------

function looksLikePhone(s: string): boolean {
  const digits = String(s).replace(/[^\d]/g, '')
  return digits.length >= 8 && digits.length <= 15
}

function normalize(raw: string, countryCode?: string): string {
  let n = String(raw || '').trim()
  if (!n) return ''
  const cc = String(countryCode || '').replace(/[^\d+]/g, '')
  const hasPlus = n.startsWith('+') || cc.startsWith('+')
  let digits = n.replace(/[^\d]/g, '')
  if (cc && !n.startsWith('+')) {
    digits = `${cc.replace(/[^\d]/g, '')}${digits}`
  }
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits ? `+${digits}` : ''
}

/** Parse an uploaded spreadsheet into a deduped list of E.164-ish numbers. */
function extractNumbers(rows: any[][]): string[] {
  if (!rows.length) return []
  const out = new Set<string>()

  // Detect a header row with phone / country-code columns.
  const header = (rows[0] || []).map((c) => String(c ?? '').toLowerCase().trim())
  const phoneCol = header.findIndex((h) =>
    /phone|mobile|number|whatsapp|cell|contact|msisdn/.test(h)
  )
  const ccCol = header.findIndex((h) => /country.?code|dial.?code|^cc$|^code$/.test(h))

  if (phoneCol >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || []
      const phone = row[phoneCol]
      if (phone == null || String(phone).trim() === '') continue
      const cc = ccCol >= 0 ? row[ccCol] : undefined
      const num = normalize(String(phone), cc != null ? String(cc) : undefined)
      if (num && looksLikePhone(num)) out.add(num)
    }
    if (out.size) return Array.from(out)
  }

  // No usable header — scan every cell for phone-like values.
  for (const row of rows) {
    for (const cell of row || []) {
      if (cell == null) continue
      const s = String(cell).trim()
      if (looksLikePhone(s)) {
        const num = normalize(s)
        if (num) out.add(num)
      }
    }
  }
  return Array.from(out)
}

// -----------------------------------------------------------------------
// Reusable messaging panel (SMS or WhatsApp)
// -----------------------------------------------------------------------

interface MessagingPanelProps {
  surveyId: string
  channel: 'sms' | 'whatsapp'
  ready: boolean | null
  senderFrom: string | null
}

function MessagingPanel({ surveyId, channel, ready, senderFrom }: MessagingPanelProps) {
  const isWhatsApp = channel === 'whatsapp'
  const label = isWhatsApp ? 'WhatsApp' : 'SMS'

  const [phoneInput, setPhoneInput] = useState('')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'default' | 'canvass'>('default')
  const [sending, setSending] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [result, setResult] = useState<{
    sent: boolean
    formattedMessage?: string
    message?: string
    summary?: { total: number; sent: number; failed: number }
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parseNumbers = useCallback(
    () =>
      phoneInput
        .split(/[\n,;]+/)
        .map((n) => n.trim())
        .filter(Boolean),
    [phoneInput]
  )

  const handleFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false })
      const numbers = extractNumbers(rows as any[][])
      if (!numbers.length) {
        toast.error('No phone numbers found. Include a "phone" column with country code.')
        return
      }
      // Merge with anything already typed, dedupe.
      setPhoneInput((prev) => {
        const existing = prev
          .split(/[\n,;]+/)
          .map((n) => n.trim())
          .filter(Boolean)
        const merged = Array.from(new Set([...existing, ...numbers]))
        return merged.join('\n')
      })
      setUploadedFile(file.name)
      setUploadedCount(numbers.length)
      toast.success(`${numbers.length} numbers loaded from ${file.name}`)
    } catch (err) {
      console.error(err)
      toast.error('Could not read the file. Use .xlsx, .xls or .csv')
    }
  }, [])

  const handleSend = useCallback(async () => {
    const numbers = parseNumbers()
    if (numbers.length === 0) {
      toast.error('Enter at least one phone number')
      return
    }

    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumbers: numbers, message: message || undefined, mode }),
      })
      const data = await res.json()
      if (data.status) {
        setResult({
          sent: data.sent,
          formattedMessage: data.formattedMessage,
          message: data.message,
          summary: data.summary,
        })
        if (data.sent) {
          toast.success(`${data.summary.sent} ${label} sent, ${data.summary.failed} failed`)
        }
      } else {
        toast.error(data.message || `${label} failed`)
      }
    } catch {
      toast.error(`${label} request failed`)
    } finally {
      setSending(false)
    }
  }, [surveyId, channel, label, message, mode, parseNumbers])

  const copyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Message copied')
    } catch {
      toast.error('Failed to copy')
    }
  }, [])

  const typedCount = parseNumbers().length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{label} Distribution</CardTitle>
            <CardDescription>
              Send survey invitations via {isWhatsApp ? 'WhatsApp message' : 'text message'}
            </CardDescription>
          </div>
          {ready === true ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              <Check className="h-3 w-3 mr-1" /> Connected{senderFrom ? ` · ${senderFrom}` : ''}
            </Badge>
          ) : ready === false ? (
            <Badge variant="secondary" className="text-amber-700 bg-amber-100 hover:bg-amber-100">
              Sender not set
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phone numbers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              Phone Numbers{' '}
              <span className="text-muted-foreground font-normal">
                (one per line or comma-separated, with country code)
              </span>
            </Label>
            <span className="text-xs text-muted-foreground">{typedCount} number{typedCount === 1 ? '' : 's'}</span>
          </div>
          <Textarea
            placeholder={'+15551234567\n+447911123456'}
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="font-mono text-sm min-h-[100px]"
          />
        </div>

        {/* Bulk upload */}
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
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload spreadsheet
            </Button>
            {uploadedFile && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {uploadedFile} — {uploadedCount} numbers
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFile(null)
                    setUploadedCount(0)
                  }}
                  className="ml-1 hover:text-foreground"
                  aria-label="clear"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Include a column named <code>phone</code> (and optionally <code>country code</code>). Numbers are
            appended to the list above so you can also add individuals by hand.
          </p>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <Label>
            Custom Message{' '}
            <span className="text-muted-foreground font-normal">
              (optional — use {'{{link}}'} for survey URL)
            </span>
          </Label>
          <Textarea
            placeholder="Leave blank for default message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Mode */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'default' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('default')}
          >
            Standard
          </Button>
          <Button
            variant={mode === 'canvass' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('canvass')}
          >
            <Smartphone className="h-4 w-4 mr-1" />
            Canvass Mode
          </Button>
        </div>

        <Button onClick={handleSend} disabled={sending}>
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending...
            </>
          ) : (
            <>
              <MessageSquare className="h-4 w-4 mr-2" />
              Send {label}
            </>
          )}
        </Button>

        {/* Result */}
        {result && (
          <div className="border rounded-lg p-4 space-y-2">
            {result.sent ? (
              <p className="text-sm font-medium text-green-600">
                {result.summary?.sent} sent, {result.summary?.failed} failed
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-600">
                  {result.message || `${label} not configured — manual send required`}
                </p>
                {result.formattedMessage && (
                  <>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-mono whitespace-pre-wrap">{result.formattedMessage}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyMessage(result.formattedMessage || '')}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Message
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------

export default function DistributePage() {
  const params = useParams()
  const surveyId = params.id as string

  const [surveySlug, setSurveySlug] = useState<string | null>(null)
  const [surveyTitle, setSurveyTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // QR state
  const [qrMode, setQrMode] = useState<'default' | 'canvass'>('default')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  // Messaging readiness
  const [smsReady, setSmsReady] = useState<boolean | null>(null)
  const [whatsappReady, setWhatsappReady] = useState<boolean | null>(null)
  const [smsFrom, setSmsFrom] = useState<string | null>(null)
  const [whatsappFrom, setWhatsappFrom] = useState<string | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const surveyUrl = surveySlug ? `${baseUrl}/survey/${surveySlug}` : ''
  const canvassUrl = surveySlug ? `${baseUrl}/survey/${surveySlug}/canvass` : ''

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const res = await fetch(`/api/surveys?id=${surveyId}`)
        const data = await res.json()
        if (data.status !== false && data.surveys) {
          const s = data.surveys.find((s: any) => String(s.id) === surveyId)
          if (s) {
            setSurveySlug(s.slug)
            setSurveyTitle(s.title)
          }
        }
      } catch {
        toast.error('Failed to load survey')
      } finally {
        setLoading(false)
      }
    }
    fetchSurvey()
  }, [surveyId])

  // Messaging status
  useEffect(() => {
    fetch('/api/messaging/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.status) {
          setSmsReady(!!d.smsConfigured)
          setWhatsappReady(!!d.whatsappConfigured)
          setSmsFrom(d.smsFrom || null)
          setWhatsappFrom(d.whatsappFrom || null)
        }
      })
      .catch(() => {})
  }, [])

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      toast.success(`${label} copied`)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [])

  const fetchQR = useCallback(
    async (mode: 'default' | 'canvass') => {
      setQrLoading(true)
      setQrMode(mode)
      try {
        const res = await fetch(`/api/surveys/${surveyId}/qr?mode=${mode}&format=dataurl`)
        const data = await res.json()
        if (data.status) {
          setQrDataUrl(data.dataUrl)
        } else {
          toast.error('Failed to generate QR code')
        }
      } catch {
        toast.error('QR generation failed')
      } finally {
        setQrLoading(false)
      }
    },
    [surveyId]
  )

  useEffect(() => {
    if (surveySlug) fetchQR('default')
  }, [surveySlug, fetchQR])

  const downloadQR = useCallback(() => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `survey-${surveyId}-qr-${qrMode}.png`
    a.click()
  }, [qrDataUrl, surveyId, qrMode])

  const embedCode = surveyUrl
    ? `<iframe src="${surveyUrl}" width="100%" height="700" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>`
    : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Distribute Survey</h1>
          <p className="text-sm text-muted-foreground">{surveyTitle}</p>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        <Tabs defaultValue="link">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="link" className="flex items-center gap-1">
              <Link2 className="h-4 w-4" /> Link
            </TabsTrigger>
            <TabsTrigger value="qr" className="flex items-center gap-1">
              <QrCode className="h-4 w-4" /> QR Code
            </TabsTrigger>
            <TabsTrigger value="embed" className="flex items-center gap-1">
              <Code className="h-4 w-4" /> Embed
            </TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1">
              <Smartphone className="h-4 w-4" /> WhatsApp
            </TabsTrigger>
          </TabsList>

          {/* ---- LINK ---- */}
          <TabsContent value="link" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Direct Link</CardTitle>
                <CardDescription>Share this link to collect responses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Standard Survey URL</Label>
                  <div className="flex gap-2">
                    <Input value={surveyUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyText(surveyUrl, 'Survey URL')}>
                      {copied === 'Survey URL' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Canvass Mode URL
                    <Badge variant="secondary" className="text-xs">Mobile-Optimized</Badge>
                  </Label>
                  <div className="flex gap-2">
                    <Input value={canvassUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyText(canvassUrl, 'Canvass URL')}>
                      {copied === 'Canvass URL' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <a href={canvassUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- QR CODE ---- */}
          <TabsContent value="qr" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>QR Code</CardTitle>
                <CardDescription>Print or display at events for easy mobile access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={qrMode === 'default' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => fetchQR('default')}
                  >
                    Standard
                  </Button>
                  <Button
                    variant={qrMode === 'canvass' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => fetchQR('canvass')}
                  >
                    <Smartphone className="h-4 w-4 mr-1" />
                    Canvass Mode
                  </Button>
                </div>

                <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg border">
                  {qrLoading ? (
                    <Loader2 className="h-12 w-12 animate-spin" />
                  ) : qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="Survey QR Code" className="w-64 h-64" />
                  ) : (
                    <p className="text-muted-foreground">QR code not available</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {qrMode === 'canvass' ? canvassUrl : surveyUrl}
                  </p>
                </div>

                <Button variant="outline" onClick={downloadQR} disabled={!qrDataUrl}>
                  <Download className="h-4 w-4 mr-2" />
                  Download PNG
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- EMBED ---- */}
          <TabsContent value="embed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Embed Code</CardTitle>
                <CardDescription>Add the survey to any website using an iframe</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto font-mono">{embedCode}</pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyText(embedCode, 'Embed code')}
                  >
                    {copied === 'Embed code' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Paste this code into your website HTML to embed the survey.</p>
                  <p className="mt-1">
                    Adjust the <code>height</code> attribute as needed for your layout.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- SMS ---- */}
          <TabsContent value="sms" className="space-y-4">
            <MessagingPanel surveyId={surveyId} channel="sms" ready={smsReady} senderFrom={smsFrom} />
          </TabsContent>

          {/* ---- WHATSAPP ---- */}
          <TabsContent value="whatsapp" className="space-y-4">
            <MessagingPanel
              surveyId={surveyId}
              channel="whatsapp"
              ready={whatsappReady}
              senderFrom={whatsappFrom}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
