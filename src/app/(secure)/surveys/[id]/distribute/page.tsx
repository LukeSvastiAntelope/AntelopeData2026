'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

// -----------------------------------------------------------------------
// Component
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

  // SMS state
  const [phoneInput, setPhoneInput] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsMode, setSmsMode] = useState<'default' | 'canvass'>('default')
  const [smsSending, setSmsSending] = useState(false)
  const [smsResult, setSmsResult] = useState<{
    sent: boolean
    formattedMessage?: string
    summary?: { total: number; sent: number; failed: number }
  } | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const surveyUrl = surveySlug ? `${baseUrl}/survey/${surveySlug}` : ''
  const canvassUrl = surveySlug ? `${baseUrl}/survey/${surveySlug}/canvass` : ''

  // ------------------------------------------------------------------
  // Load survey info
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Copy to clipboard
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // QR Code
  // ------------------------------------------------------------------

  const fetchQR = useCallback(
    async (mode: 'default' | 'canvass') => {
      setQrLoading(true)
      setQrMode(mode)
      try {
        const res = await fetch(
          `/api/surveys/${surveyId}/qr?mode=${mode}&format=dataurl`
        )
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

  // ------------------------------------------------------------------
  // SMS
  // ------------------------------------------------------------------

  const handleSendSMS = useCallback(async () => {
    const numbers = phoneInput
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)

    if (numbers.length === 0) {
      toast.error('Enter at least one phone number')
      return
    }

    setSmsSending(true)
    setSmsResult(null)

    try {
      const res = await fetch(`/api/surveys/${surveyId}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumbers: numbers,
          message: smsMessage || undefined,
          mode: smsMode,
        }),
      })

      const data = await res.json()

      if (data.status) {
        setSmsResult({
          sent: data.sent,
          formattedMessage: data.formattedMessage,
          summary: data.summary,
        })

        if (data.sent) {
          toast.success(
            `${data.summary.sent} SMS sent, ${data.summary.failed} failed`
          )
        }
      } else {
        toast.error(data.message || 'SMS failed')
      }
    } catch {
      toast.error('SMS request failed')
    } finally {
      setSmsSending(false)
    }
  }, [surveyId, phoneInput, smsMessage, smsMode])

  // ------------------------------------------------------------------
  // Embed code
  // ------------------------------------------------------------------

  const embedCode = surveyUrl
    ? `<iframe src="${surveyUrl}" width="100%" height="700" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>`
    : ''

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

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
          <TabsList className="grid w-full grid-cols-4">
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
          </TabsList>

          {/* ---- LINK ---- */}
          <TabsContent value="link" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Direct Link</CardTitle>
                <CardDescription>Share this link to collect responses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Standard link */}
                <div className="space-y-2">
                  <Label>Standard Survey URL</Label>
                  <div className="flex gap-2">
                    <Input value={surveyUrl} readOnly className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyText(surveyUrl, 'Survey URL')}
                    >
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

                {/* Canvass link */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Canvass Mode URL
                    <Badge variant="secondary" className="text-xs">Mobile-Optimized</Badge>
                  </Label>
                  <div className="flex gap-2">
                    <Input value={canvassUrl} readOnly className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyText(canvassUrl, 'Canvass URL')}
                    >
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
                <CardDescription>
                  Print or display at events for easy mobile access
                </CardDescription>
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
                    <img
                      src={qrDataUrl}
                      alt="Survey QR Code"
                      className="w-64 h-64"
                    />
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
                <CardDescription>
                  Add the survey to any website using an iframe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto font-mono">
                    {embedCode}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyText(embedCode, 'Embed code')}
                  >
                    {copied === 'Embed code' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
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
            <Card>
              <CardHeader>
                <CardTitle>SMS Distribution</CardTitle>
                <CardDescription>
                  Send survey invitations via text message
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Phone Numbers (one per line or comma-separated)</Label>
                  <Textarea
                    placeholder={'+15551234567\n+15559876543'}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="font-mono text-sm min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Custom Message{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional — use {'{{link}}'} for survey URL)
                    </span>
                  </Label>
                  <Textarea
                    placeholder="Leave blank for default message"
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={smsMode === 'default' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSmsMode('default')}
                  >
                    Standard
                  </Button>
                  <Button
                    variant={smsMode === 'canvass' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSmsMode('canvass')}
                  >
                    <Smartphone className="h-4 w-4 mr-1" />
                    Canvass Mode
                  </Button>
                </div>

                <Button onClick={handleSendSMS} disabled={smsSending}>
                  {smsSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send SMS
                    </>
                  )}
                </Button>

                {/* SMS result */}
                {smsResult && (
                  <div className="border rounded-lg p-4 space-y-2">
                    {smsResult.sent ? (
                      <div className="text-sm">
                        <p className="font-medium text-green-600">
                          {smsResult.summary?.sent} sent, {smsResult.summary?.failed} failed
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-amber-600">
                          Twilio not configured — manual send required
                        </p>
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-mono">{smsResult.formattedMessage}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyText(smsResult.formattedMessage || '', 'SMS message')
                          }
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy Message
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
