'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import {
  ClipboardList,
  FileText,
  Users,
  Sparkles,
  Mail,
  Copy,
  Loader2,
} from 'lucide-react'

export default function VolunteerStaffPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastJoinPath, setLastJoinPath] = useState<string | null>(null)

  const invite = async () => {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/volunteers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Invite failed')
      setLastJoinPath(data.joinPath)
      toast.success('Invite sent (and link ready to copy)')
      setEmail('')
      setDisplayName('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  const copyLink = () => {
    if (!lastJoinPath || typeof window === 'undefined') return
    const url = `${window.location.origin}${lastJoinPath}`
    void navigator.clipboard?.writeText(url)
    toast.success('Invite link copied')
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Volunteer/Staff management
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Invite a volunteer (magic link)
              </CardTitle>
              <CardDescription>
                Passwordless portal access. They tap the link on their phone —
                no heavyweight app, no password. Creates a person record +
                volunteer membership in this campaign.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vol-email">Email</Label>
                  <Input
                    id="vol-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="volunteer@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vol-name">Name (optional)</Label>
                  <Input
                    id="vol-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jordan Lee"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void invite()}>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 mr-1" />
                  )}
                  Send invite
                </Button>
                {lastJoinPath && (
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy last link
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Portal:{' '}
                <Link href="/portal/join" className="underline">
                  /portal/join
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Create a volunteer form
                </CardTitle>
                <CardDescription>
                  Build an intake form (availability, location preferences, tasks they prefer/avoid).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/create/survey">Create form</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  View responses
                </CardTitle>
                <CardDescription>
                  Review volunteer responses and identify who wants to do what, where, and when.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href="/surveys">Open surveys</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Summarize & triage
                </CardTitle>
                <CardDescription>
                  Use AI to summarize responses, extract constraints (e.g. “won’t phonebank”), and shortlist matches.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/python-analysis">Open analysis</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground">
            Next step: shifts, tasks, friends &amp; family contacts, and tasteful
            points — each as its own Volunteer phase.
          </div>
        </div>
      </div>
    </div>
  )
}
