'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { toast } from '@/components/ui/sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export default function TelegramSetupPage() {
  const [botToken, setBotToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState<boolean>(false)
  const [webhookUrl, setWebhookUrl] = useState<string>('')

  useEffect(() => {
    // fetch connection status
    ;(async ()=>{
      try {
        const res = await fetch('/api/channels/telegram/status')
        if (res.ok) {
          const data = await res.json()
          setConnected(Boolean(data.connected))
          setWebhookUrl(data?.settings?.webhookUrl || '')
        }
      } catch {}
    })()
  }, [])

  const connect = async () => {
    if (!botToken) return
    setLoading(true)
    try {
      const res = await fetch('/api/channels/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      })
      const data = await res.json()
      if (res.ok && data.status) {
        toast.success('Telegram connected')
        setConnected(true)
        setWebhookUrl(data.webhookUrl || '')
      } else {
        toast.error(data.message || 'Failed to connect Telegram')
      }
    } catch (e) {
      toast.error('Failed to connect Telegram')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Telegram Setup</h1>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 max-w-xl">
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>1. Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>Connect your Telegram bot to deliver surveys via private chat. You will paste the bot token issued by BotFather.</p>
                <div className="space-y-2">
                  <Label htmlFor="token">Bot Token</Label>
                  <Input id="token" type="password" value={botToken} onChange={e=>setBotToken(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={connect} disabled={!botToken || loading}>{loading ? 'Connecting...' : (connected ? 'Reconnect' : 'Connect & Set Webhook')}</Button>
                  {connected && webhookUrl && (
                    <span className="text-xs text-muted-foreground">Webhook: {webhookUrl}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Need a token? In Telegram, message <span className="font-medium">@BotFather</span> → “/newbot” → follow prompts → copy the token.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Channel Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Default behavior: users start the survey via deep link. You’ll attach the link or QR code where you invite participants.</p>
                <div className="rounded-md border p-3 bg-muted text-xs">
                  <div className="font-medium mb-1">Deep link format</div>
                  <code>https://t.me/your_bot?start=survey_{`<slug>`}</code>
                  <div className="mt-1 text-muted-foreground">We’ll show the exact link per survey on the survey’s Channels tab.</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Channel Verification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Once connected, Telegram will send events to your webhook. Use the button below to send a test message and verify delivery.</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={!connected}>Send Test</Button>
                  <span className="text-xs text-muted-foreground">We’ll add a lightweight test soon; for now, ensure the webhook shows “Connected”.</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. Complete Setup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Next, enable Telegram for specific surveys under Survey → Edit → Channels. Each survey provides its own deep link and welcome text.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}


