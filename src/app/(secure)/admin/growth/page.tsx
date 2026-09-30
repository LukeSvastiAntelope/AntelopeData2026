'use client'

/**
 * Admin A5 — Antelope own-growth marketing (X/Twitter).
 * Drafts stage for Luke's approval; nothing auto-posts.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Check,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Webhook,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

type GrowthChannel = {
  id: number
  provider: string
  handle: string
  displayName: string | null
  status: string
  settings: Record<string, unknown>
  hasCredentials: boolean
}

type MarketingDraft = {
  id: number
  status: string
  body: string
  topic: string | null
  tone: string | null
  source: string
  stagedActionId: number | null
  createdAt: string | null
  approvedAt: string | null
  postedAt: string | null
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending_approval':
      return (
        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-0">
          Pending approval
        </Badge>
      )
    case 'approved':
      return (
        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">
          Approved
        </Badge>
      )
    case 'rejected':
      return <Badge variant="secondary">Rejected</Badge>
    case 'posted':
      return <Badge variant="default">Posted</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

type PlatformWebhook = {
  id: number
  label: string
  urlMasked: string
  secretMasked: string
  contentTypes: string[]
  enabled: boolean
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

export default function AdminGrowthPage() {
  const router = useRouter()
  const [channel, setChannel] = useState<GrowthChannel | null>(null)
  const [drafts, setDrafts] = useState<MarketingDraft[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [manualBody, setManualBody] = useState('')
  const [topic, setTopic] = useState('')
  const [autoDraft, setAutoDraft] = useState(true)
  const [savingChannel, setSavingChannel] = useState(false)
  const [platformHooks, setPlatformHooks] = useState<PlatformWebhook[]>([])
  const [hookLabel, setHookLabel] = useState('Antelope X via Zapier')
  const [hookUrl, setHookUrl] = useState('')
  const [savingHook, setSavingHook] = useState(false)
  const [testingHookId, setTestingHookId] = useState<number | null>(null)
  const [freshHookSecret, setFreshHookSecret] = useState<string | null>(null)

  const loadPublishing = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/growth/publishing')
      const data = await res.json()
      if (res.ok && data.status) {
        setPlatformHooks(Array.isArray(data.webhooks) ? data.webhooks : [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/growth')
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to load growth panel')
        return
      }
      setChannel(data.channel)
      setDrafts(data.drafts || [])
      setPendingCount(Number(data.pendingCount) || 0)
      setAutoDraft(data.channel?.settings?.autoDraftEnabled !== false)
      await loadPublishing()
    } catch {
      toast.error('Failed to load growth panel')
    } finally {
      setLoading(false)
    }
  }, [loadPublishing])

  useEffect(() => {
    void load()
  }, [load])

  const generateDraft = async (opts?: { body?: string }) => {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generate: !opts?.body,
          body: opts?.body || undefined,
          topic: topic || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to stage draft')
        return
      }
      toast.success('Draft staged for approval — nothing posted')
      setManualBody('')
      await load()
    } catch {
      toast.error('Failed to stage draft')
    } finally {
      setGenerating(false)
    }
  }

  const act = async (
    id: number,
    action: 'approve' | 'reject' | 'mark_posted'
  ) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/growth/drafts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || `Failed to ${action}`)
        return
      }
      toast.success(
        action === 'approve'
          ? data.distribution?.queued
            ? 'Approved — Zapier delivery queued'
            : 'Approved — add a platform webhook to deliver via Zapier'
          : action === 'reject'
            ? 'Rejected'
            : 'Marked posted'
      )
      await load()
    } catch {
      toast.error(`Failed to ${action}`)
    } finally {
      setBusyId(null)
    }
  }

  const saveChannel = async () => {
    if (!channel) return
    setSavingChannel(true)
    try {
      const res = await fetch('/api/admin/growth/channel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: channel.handle,
          status: channel.status,
          settings: {
            ...(channel.settings || {}),
            autoDraftEnabled: autoDraft,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to save channel')
        return
      }
      setChannel(data.channel)
      toast.success('Channel saved')
    } catch {
      toast.error('Failed to save channel')
    } finally {
      setSavingChannel(false)
    }
  }

  const savePlatformHook = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingHook(true)
    setFreshHookSecret(null)
    try {
      const res = await fetch('/api/admin/growth/publishing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: hookLabel.trim() || 'Antelope X via Zapier',
          url: hookUrl.trim(),
          contentTypes: ['text'],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to save webhook')
        return
      }
      if (data.secret) setFreshHookSecret(String(data.secret))
      setHookUrl('')
      toast.success('Platform webhook saved')
      await loadPublishing()
    } catch {
      toast.error('Failed to save webhook')
    } finally {
      setSavingHook(false)
    }
  }

  const testPlatformHook = async (id: number) => {
    setTestingHookId(id)
    try {
      const res = await fetch(`/api/admin/growth/publishing/${id}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Test send failed')
        return
      }
      toast.success(data.message || 'Test sent')
      await loadPublishing()
    } catch {
      toast.error('Test send failed')
    } finally {
      setTestingHookId(null)
    }
  }

  const togglePlatformHook = async (wh: PlatformWebhook, enabled: boolean) => {
    try {
      const res = await fetch(`/api/admin/growth/publishing/${wh.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to update')
        return
      }
      await loadPublishing()
    } catch {
      toast.error('Failed to update')
    }
  }

  const deletePlatformHook = async (wh: PlatformWebhook) => {
    if (!window.confirm(`Remove platform hook “${wh.label}”?`)) return
    try {
      const res = await fetch(`/api/admin/growth/publishing/${wh.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to delete')
        return
      }
      toast.success('Removed')
      await loadPublishing()
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push('/admin')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Admin
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Antelope growth
          </h1>
          <p className="text-xs text-muted-foreground">
            Own-account X drafts · approval-gated · never auto-posts · not
            candidate outbound
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        {loading && !channel ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardDescription className="text-[11px] uppercase">
                    Channel
                  </CardDescription>
                  <CardTitle className="text-base">
                    @{channel?.handle || 'antelopeHQ'}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardDescription className="text-[11px] uppercase">
                    Pending approval
                  </CardDescription>
                  <CardTitle className="text-base">{pendingCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardDescription className="text-[11px] uppercase">
                    Live X API
                  </CardDescription>
                  <CardTitle className="text-base text-muted-foreground">
                    Not wired
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Channel settings</CardTitle>
                <CardDescription>
                  Platform-owned (@{channel?.handle}). Scheduler may draft into
                  the approval queue; it never tweets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="handle">Handle</Label>
                    <Input
                      id="handle"
                      value={channel?.handle || ''}
                      onChange={(e) =>
                        setChannel((c) =>
                          c
                            ? {
                                ...c,
                                handle: e.target.value.replace(/^@/, ''),
                              }
                            : c
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 mt-6 sm:mt-0">
                    <div>
                      <p className="text-sm font-medium">Auto-draft (scheduler)</p>
                      <p className="text-xs text-muted-foreground">
                        Cron stages drafts only
                      </p>
                    </div>
                    <Switch checked={autoDraft} onCheckedChange={setAutoDraft} />
                  </div>
                </div>
                <Button size="sm" onClick={() => void saveChannel()} disabled={savingChannel}>
                  {savingChannel && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  Save channel
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Webhook className="h-4 w-4" />
                  Platform publishing (Zapier / Make)
                </CardTitle>
                <CardDescription>
                  Super-admin only. Separate from campaign Publishing destinations.
                  After you approve a growth draft, Antelope posts a signed payload
                  here so your Zap can publish to @
                  {channel?.handle || 'antelopeHQ'}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {freshHookSecret && (
                  <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium">Signing secret (copy now)</p>
                    <code className="text-xs break-all block select-all">
                      {freshHookSecret}
                    </code>
                  </div>
                )}
                {platformHooks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No platform Catch Hook yet. Add one to fan out approved Antelope
                    posts.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {platformHooks.map((wh) => (
                      <li
                        key={wh.id}
                        className="rounded-md border border-border p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{wh.label}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {wh.urlMasked}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">
                              {wh.enabled ? 'Enabled' : 'Disabled'}
                            </Label>
                            <Switch
                              checked={wh.enabled}
                              onCheckedChange={(v) =>
                                void togglePlatformHook(wh, v)
                              }
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={testingHookId === wh.id}
                            onClick={() => void testPlatformHook(wh.id)}
                          >
                            {testingHookId === wh.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5 mr-1" />
                            )}
                            Send test
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => void deletePlatformHook(wh)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={savePlatformHook} className="space-y-3 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="plat-label">Name</Label>
                    <Input
                      id="plat-label"
                      value={hookLabel}
                      onChange={(e) => setHookLabel(e.target.value)}
                      placeholder="Antelope X via Zapier"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plat-url">Catch Hook URL</Label>
                    <Input
                      id="plat-url"
                      type="url"
                      required
                      value={hookUrl}
                      onChange={(e) => setHookUrl(e.target.value)}
                      placeholder="https://hooks.zapier.com/hooks/catch/…"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      https only · encrypted at rest · masked after save · audited
                    </p>
                  </div>
                  <Button type="submit" size="sm" disabled={savingHook || !hookUrl.trim()}>
                    {savingHook && (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    )}
                    Save platform destination
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stage a draft</CardTitle>
                <CardDescription>
                  Agent or manual copy → pending approval. Same gate language as
                  Auto-Post.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic (optional)</Label>
                  <Input
                    id="topic"
                    placeholder="e.g. transparent pricing"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Manual body (optional)</Label>
                  <Textarea
                    id="body"
                    rows={3}
                    maxLength={280}
                    placeholder="Leave blank to let the agent draft…"
                    value={manualBody}
                    onChange={(e) => setManualBody(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {manualBody.length}/280
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void generateDraft()}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Agent draft → stage
                  </Button>
                  <Button
                    variant="outline"
                    disabled={generating || !manualBody.trim()}
                    onClick={() => void generateDraft({ body: manualBody })}
                  >
                    Stage manual copy
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Draft queue</CardTitle>
                <CardDescription>
                  Approve does not tweet. Mark posted only after you publish on
                  X yourself.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {drafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No drafts yet
                  </p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead>Copy</TableHead>
                          <TableHead className="w-[100px]">Source</TableHead>
                          <TableHead className="w-[100px]">When</TableHead>
                          <TableHead className="w-[200px] text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drafts.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>
                              <StatusBadge status={d.status} />
                            </TableCell>
                            <TableCell>
                              <p className="text-sm whitespace-pre-wrap">
                                {d.body}
                              </p>
                              {d.topic && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {d.topic}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {d.source}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {d.createdAt
                                ? formatDistanceToNow(new Date(d.createdAt), {
                                    addSuffix: true,
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {d.status === 'pending_approval' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7"
                                    disabled={busyId === d.id}
                                    onClick={() => void act(d.id, 'approve')}
                                  >
                                    {busyId === d.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7"
                                    disabled={busyId === d.id}
                                    onClick={() => void act(d.id, 'reject')}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {d.status === 'approved' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  disabled={busyId === d.id}
                                  onClick={() => void act(d.id, 'mark_posted')}
                                >
                                  Mark posted
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
