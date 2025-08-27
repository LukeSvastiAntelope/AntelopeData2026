'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Bot, Send, MessageCircle, Mail, Globe, Shield } from 'lucide-react'

const providers = [
  { key: 'telegram', name: 'Telegram', icon: Bot, status: 'Available' },
  { key: 'discord', name: 'Discord', icon: MessageCircle, status: 'Coming soon' },
  { key: 'sms', name: 'SMS', icon: Send, status: 'Coming soon' },
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, status: 'Coming soon' },
  { key: 'email', name: 'Email', icon: Mail, status: 'Coming soon' },
  { key: 'web', name: 'Web', icon: Globe, status: 'Built-in' },
]

export default function ChannelsPage() {
  const [tgConnected, setTgConnected] = useState<boolean | null>(null)
  const [tgUsername, setTgUsername] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/channels/telegram/status')
        const data = await res.json().catch(()=>({}))
        if (!cancelled && data?.status) {
          setTgConnected(Boolean(data.connected))
          setTgUsername(data.botUsername || null)
        }
      } catch {
        if (!cancelled) setTgConnected(false)
      }
    }
    load()
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
            <div className="flex items-center gap-2">
              <Link href="/channels/new"><Button>Create Channel</Button></Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map(p => (
            <Card key={p.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <p.icon className="h-4 w-4" /> {p.name}
                </CardTitle>
                <Badge variant={(p.key==='telegram' ? (tgConnected ? 'default' : 'secondary') : (p.status === 'Available' || p.status === 'Built-in' ? 'default' : 'secondary'))}>
                  {p.key==='telegram' ? (tgConnected ? 'Connected' : 'Available') : p.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                {p.key === 'telegram' ? (
                  <div className="w-full">
                    <div className="flex items-center justify-between">
                      <Link href="/channels/new?provider=telegram">
                        <Button size="sm">{tgConnected ? 'Manage' : 'Set up'}</Button>
                      </Link>
                    </div>
                    {tgConnected && (
                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                        {tgUsername && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">Bot</span>
                            <span>@{tgUsername}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Webhook</span>
                          <span className="truncate max-w-[220px]" title={(tgConnected && typeof window!=='undefined') ? '' : ''}>
                            {(typeof window !== 'undefined') ? `${window.location.origin}/api/channels/telegram/webhook` : '/api/channels/telegram/webhook'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : p.key === 'web' ? (
                  <Button size="sm" variant="outline" disabled>Enabled</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>Coming soon</Button>
                )}
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      </div>
    </div>
  )
}


