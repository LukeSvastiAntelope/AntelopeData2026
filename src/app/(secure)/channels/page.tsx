'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Bot, Send, MessageCircle, Mail, Globe, List } from 'lucide-react'

export default function ChannelsPage() {
  const [tgConnected, setTgConnected] = useState<boolean | null>(null)
  const [tgUsername, setTgUsername] = useState<string | null>(null)
  const [smsConnected, setSmsConnected] = useState<boolean | null>(null)
  const [smsPhone, setSmsPhone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadTelegram = async () => {
      try {
        const res = await fetch('/api/channels/telegram/status')
        const data = await res.json().catch(() => ({}))
        if (!cancelled && data?.status) {
          setTgConnected(Boolean(data.connected))
          setTgUsername(data.botUsername || null)
        }
      } catch {
        if (!cancelled) setTgConnected(false)
      }
    }

    const loadSms = async () => {
      try {
        const res = await fetch('/api/channels/sms/credentials', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && data?.status) {
          setSmsConnected(Boolean(data.connected))
          setSmsPhone(data.twilioPhone || null)
        }
      } catch {
        if (!cancelled) setSmsConnected(false)
      }
    }

    loadTelegram()
    loadSms()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Channels</h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">Channel Integrations</h2>
              <p className="text-muted-foreground text-base mt-2 max-w-3xl">
                Connect once, then enable channels per survey. Responses are attributed by source so you can
                segment results while still seeing overall statistics.
              </p>
            </div>
            <Link href="/channels/new"><Button>Add Channel</Button></Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Telegram */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4" /> Telegram
                </CardTitle>
                <Badge variant={tgConnected ? 'default' : 'secondary'}>
                  {tgConnected ? 'Connected' : 'Available'}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="w-full space-y-2">
                  <Link href="/channels/new?provider=telegram">
                    <Button size="sm">{tgConnected ? 'Manage' : 'Set up'}</Button>
                  </Link>
                  {tgConnected && tgUsername && (
                    <p className="text-xs text-muted-foreground">Bot: @{tgUsername}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SMS / Twilio */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Send className="h-4 w-4" /> SMS (Twilio)
                </CardTitle>
                <Badge variant={smsConnected ? 'default' : 'secondary'}>
                  {smsConnected === null ? '…' : smsConnected ? 'Connected' : 'Not set up'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {smsConnected ? (
                  <>
                    {smsPhone && <p className="text-xs text-muted-foreground">From: {smsPhone}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" asChild variant="outline">
                        <Link href="/channels/sms/lists">
                          <List className="h-3.5 w-3.5 mr-1" />Contact Lists
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href="/channels/new?provider=sms">Reconfigure</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button size="sm" asChild>
                    <Link href="/channels/new?provider=sms">Connect Twilio</Link>
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* WhatsApp */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </CardTitle>
                <Badge variant="secondary">Coming soon</Badge>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" disabled>Coming soon</Button>
              </CardContent>
            </Card>

            {/* Email */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </CardTitle>
                <Badge variant="secondary">Coming soon</Badge>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" disabled>Coming soon</Button>
              </CardContent>
            </Card>

            {/* Discord */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Discord
                </CardTitle>
                <Badge variant="secondary">Coming soon</Badge>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" disabled>Coming soon</Button>
              </CardContent>
            </Card>

            {/* Web */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Web
                </CardTitle>
                <Badge variant="default">Built-in</Badge>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" disabled>Always enabled</Button>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
