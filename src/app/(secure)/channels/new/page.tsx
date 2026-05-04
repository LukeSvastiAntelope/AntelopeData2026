'use client'

import { useEffect, useMemo, useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Provider = 'telegram' | 'discord' | 'sms' | 'whatsapp' | 'email' | 'web'

export default function NewChannelWizardPage() {
  const params = useSearchParams()
  const preset = (params.get('provider') as Provider) || undefined

  const [provider, setProvider] = useState<Provider | ''>(preset || '')
  const [step, setStep] = useState<number>(1)

  const [botToken, setBotToken] = useState('')
  const [emailProvider, setEmailProvider] = useState<'sendgrid' | 'smtp' | ''>('')
  const [twilioSid, setTwilioSid] = useState('')
  const [twilioAuth, setTwilioAuth] = useState('')
  const [twilioPhone, setTwilioPhone] = useState('')

  useEffect(() => {
    if (preset) setProvider(preset)
  }, [preset])

  const canContinue = useMemo(() => {
    if (step === 1) return provider !== ''
    if (step === 2) {
      switch (provider) {
        case 'telegram': return botToken.length > 0
        case 'email': return emailProvider !== ''
        case 'sms': return twilioSid.length > 0 && twilioAuth.length > 0 && twilioPhone.length > 0
        default: return true
      }
    }
    return true
  }, [step, provider, botToken, emailProvider, twilioSid, twilioAuth, twilioPhone])

  const next = async () => {
    if (!canContinue) return
    if (step === 1) { setStep(2); return }
    if (step === 2) {
      try {
        if (provider === 'telegram') {
          const res = await fetch('/api/channels/telegram/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken }),
          })
          const data = await res.json()
          if (!res.ok || !data.status) throw new Error(data.message || 'Failed')
          toast.success('Telegram connected')
        } else if (provider === 'sms') {
          const res = await fetch('/api/channels/sms/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ twilioSid, twilioAuthToken: twilioAuth, twilioPhone }),
          })
          const data = await res.json()
          if (!res.ok || !data.status) throw new Error(data.message || 'Failed to save SMS credentials')
          toast.success('Twilio SMS connected')
        } else if (provider === 'email') {
          toast.success('Email channel saved (stub)')
        }
        setStep(3)
      } catch (e: any) {
        toast.error(e.message || 'Failed to save settings')
      }
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Create New Channel</h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {step === 1 ? '1. Choose Channel Type' : step === 2 ? '2. Configuration' : '3. Done'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Step 1 — pick provider */}
              {step === 1 && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Channel Type</Label>
                    <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                      <SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telegram">Telegram</SelectItem>
                        <SelectItem value="sms">SMS (Twilio)</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="web">Web (built-in)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">The next step adapts to your choice.</p>
                  </div>
                  <Button onClick={next} disabled={!canContinue}>Continue</Button>
                </div>
              )}

              {/* Step 2 — Telegram */}
              {step === 2 && provider === 'telegram' && (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Bot Token</Label>
                    <Input type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456:ABC-DEF1234..." />
                    <p className="text-xs text-muted-foreground">Create a bot with @BotFather → /newbot → copy the token.</p>
                  </div>
                  <div className="rounded-md border p-3 text-xs bg-muted">
                    After connecting, the webhook is configured automatically and you can enable Telegram per survey.
                  </div>
                  <Button onClick={next} disabled={!canContinue}>Connect</Button>
                </div>
              )}

              {/* Step 2 — SMS / Twilio */}
              {step === 2 && provider === 'sms' && (
                <div className="grid gap-4">
                  <div className="rounded-md border border-border p-3 text-xs bg-muted space-y-1">
                    <p className="font-medium">Where to find these:</p>
                    <p>1. Log in at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="underline">console.twilio.com</a></p>
                    <p>2. <strong>Account SID</strong> and <strong>Auth Token</strong> are on the homepage dashboard.</p>
                    <p>3. Phone number: Phone Numbers → Manage → Active Numbers.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Account SID</Label>
                      <Input value={twilioSid} onChange={e => setTwilioSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                    </div>
                    <div className="space-y-2">
                      <Label>Auth Token</Label>
                      <Input type="password" value={twilioAuth} onChange={e => setTwilioAuth(e.target.value)} placeholder="your auth token" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Twilio Phone Number</Label>
                    <Input value={twilioPhone} onChange={e => setTwilioPhone(e.target.value)} placeholder="+15551234567 (E.164 format)" />
                  </div>
                  <Button onClick={next} disabled={!canContinue}>Connect Twilio</Button>
                </div>
              )}

              {/* Step 2 — Email */}
              {step === 2 && provider === 'email' && (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Email Provider</Label>
                    <Select value={emailProvider} onValueChange={(v) => setEmailProvider(v as any)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sendgrid">SendGrid</SelectItem>
                        <SelectItem value="smtp">SMTP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-md border p-3 text-xs bg-muted">We'll ask for credentials based on your pick in the next step.</div>
                  <Button onClick={next} disabled={!canContinue}>Continue</Button>
                </div>
              )}

              {/* Step 2 — others (coming soon) */}
              {step === 2 && provider !== 'telegram' && provider !== 'sms' && provider !== 'email' && (
                <div className="grid gap-4">
                  <div className="rounded-md border p-3 text-sm bg-muted">
                    {provider.charAt(0).toUpperCase() + provider.slice(1)} integration is coming soon.
                  </div>
                  <Button onClick={next}>Continue anyway</Button>
                </div>
              )}

              {/* Step 3 — done */}
              {step === 3 && (
                <div className="space-y-4 text-sm">
                  <p>All set! Your channel is connected.</p>
                  {provider === 'sms' && (
                    <div className="rounded-md border border-border p-3 bg-muted text-xs space-y-1">
                      <p className="font-medium">Next step: create contact lists</p>
                      <p>Go to <strong>Channels → SMS → Contact Lists</strong> to upload a spreadsheet of phone numbers, filter by age, district, etc., and save as named lists you can blast surveys to.</p>
                    </div>
                  )}
                  <Button asChild variant="outline">
                    <Link href="/channels">Back to Channels</Link>
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
