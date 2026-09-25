'use client'

/**
 * Live L4 — host session list (secure).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { Loader2, Plus, Radio, ExternalLink } from 'lucide-react'

type SessionRow = {
  id: number
  code: string
  title: string
  hostName: string | null
  eventType: string
  identifyMode: string
  status: string
  updatedAt: string
}

export default function LiveSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [hostName, setHostName] = useState('')
  const [eventType, setEventType] = useState('expert_brief')
  const [identifyMode, setIdentifyMode] = useState('identified')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/live/sessions')
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Load failed')
      setSessions(data.sessions || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!title.trim()) {
      toast.error('Title required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/dashboard/live/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          hostName: hostName.trim() || null,
          eventType,
          identifyMode,
          goLive: true,
          intakeSchema: {
            fields: [
              {
                id: 'role',
                label: 'Role',
                type: 'select',
                required: false,
                options: ['Founder', 'Operator', 'Investor', 'Other'],
              },
              {
                id: 'company',
                label: 'Company',
                type: 'text',
                required: false,
              },
            ],
            consentPrompt: 'Share who you are to join this session.',
          },
          consentText: 'Share who you are to join this session.',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Create failed')
      toast.success(`Session ${data.session.code} created`)
      setTitle('')
      setShowForm(false)
      await load()
      window.location.href = `/live-sessions/${data.session.id}`
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">
                Live sessions
              </h1>
            </div>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New session
            </Button>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 space-y-6">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Run an expert brief, town hall, or deliberation. Audience joins on
            their phones; you watch attributed results and cross-tabs here —
            the screen view is for the room.
          </p>

          {showForm && (
            <div className="rounded-lg border border-border p-4 space-y-3 max-w-lg">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Hubble product brief"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Host name</Label>
                <Input
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Optional"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Event type</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expert_brief">Expert brief</SelectItem>
                      <SelectItem value="town_hall">Town hall</SelectItem>
                      <SelectItem value="deliberation">Deliberation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Identify mode</Label>
                  <Select value={identifyMode} onValueChange={setIdentifyMode}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="anonymous">Anonymous</SelectItem>
                      <SelectItem value="per_question">Per question</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" disabled={creating} onClick={() => void create()}>
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Create & open'
                )}
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center space-y-2">
              <Radio className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">No sessions yet</p>
              <p className="text-xs text-muted-foreground">
                Create one to get a join code and audience intelligence.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/live-sessions/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.code} · {s.eventType.replace('_', ' ')} ·{' '}
                        {s.identifyMode.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={s.status === 'live' ? 'default' : 'secondary'}
                      >
                        {s.status}
                      </Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
