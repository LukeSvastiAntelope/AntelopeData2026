'use client'

/**
 * Admin A2 — per-account (organization) drill-down. Read-only; audited via API.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  ArrowLeft,
  Building2,
  FileText,
  Loader2,
  Send,
  Users,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

type AccountDetail = {
  id: number
  name: string
  slug: string | null
  officeType: string | null
  state: string | null
  districtCode: string | null
  candidateName: string | null
  party: string | null
  electionYear: number | null
  createdAt: string | null
  lastActiveAt: string | null
  plan: string
  entitlements: string[]
  memberCount: number
  surveyCount: number
  contactCount: number
  sendCount: number
  ownerEmail: string | null
  ownerDisplayName: string | null
  members: Array<{
    userId: number
    email: string | null
    displayName: string | null
    role: string
    status: string
    acceptedAt: string | null
  }>
  recentActivity: Array<{
    id: number
    userId: number | null
    action: string
    resourceType: string | null
    resourceId: string | null
    createdAt: string
  }>
  recentSurveys: Array<{
    id: number
    title: string
    status: string
    responseCount: number
    createdAt: string | null
  }>
}

function when(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

export default function AdminAccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!res.ok || !data.status) {
        toast.error(data.message || 'Failed to load account')
        setAccount(null)
        return
      }
      setAccount(data.account)
    } catch {
      toast.error('Failed to load account')
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) void load()
  }, [id, load])

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
          Accounts
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0" />
            {account?.name || (loading ? 'Loading…' : 'Account')}
          </h1>
          <p className="text-xs text-muted-foreground">
            Read-only cross-org view · audited
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        {loading && !account ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !account ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Organization not found.{' '}
            <Link href="/admin" className="underline">
              Back
            </Link>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: 'Plan',
                  value: account.plan,
                  icon: <Building2 className="h-4 w-4" />,
                },
                {
                  label: 'Surveys',
                  value: String(account.surveyCount),
                  icon: <FileText className="h-4 w-4" />,
                },
                {
                  label: 'Contacts',
                  value: String(account.contactCount),
                  icon: <Users className="h-4 w-4" />,
                },
                {
                  label: 'Sends',
                  value: String(account.sendCount),
                  icon: <Send className="h-4 w-4" />,
                },
              ].map((m) => (
                <Card key={m.label}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                      {m.icon}
                      {m.label}
                    </CardDescription>
                    <CardTitle className="text-base font-semibold truncate">
                      {m.value}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign</CardTitle>
                <CardDescription>
                  Created {when(account.createdAt)} · Last active{' '}
                  {when(account.lastActiveAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Owner
                  </p>
                  <p>
                    {account.ownerDisplayName || '—'}{' '}
                    <span className="text-muted-foreground">
                      {account.ownerEmail ? `(${account.ownerEmail})` : ''}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Race
                  </p>
                  <p>
                    {[
                      account.officeType,
                      account.state,
                      account.districtCode,
                      account.party,
                      account.electionYear,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Candidate
                  </p>
                  <p>{account.candidateName || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Slug
                  </p>
                  <p className="font-mono text-xs">{account.slug || '—'}</p>
                </div>
                {account.entitlements.length > 0 && (
                  <div className="sm:col-span-2 flex flex-wrap gap-1.5">
                    {account.entitlements.map((e) => (
                      <Badge key={e} variant="outline" className="text-[10px]">
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Members ({account.members.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {account.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {account.members.map((m) => (
                          <TableRow key={`${m.userId}-${m.role}`}>
                            <TableCell className="text-sm">
                              <div>{m.displayName || '—'}</div>
                              <div className="text-xs text-muted-foreground">
                                {m.email || `user #${m.userId}`}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {m.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{m.status}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {when(m.acceptedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent surveys</CardTitle>
                </CardHeader>
                <CardContent>
                  {account.recentSurveys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {account.recentSurveys.map((s) => (
                        <li
                          key={s.id}
                          className="flex justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0"
                        >
                          <span className="truncate font-medium">
                            {s.title || `Survey #${s.id}`}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {s.status} · {s.responseCount} resp
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Org activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {account.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {account.recentActivity.slice(0, 15).map((a) => (
                        <li
                          key={a.id}
                          className="flex justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0"
                        >
                          <span className="font-mono text-xs truncate">
                            {a.action}
                            {a.resourceType ? ` · ${a.resourceType}` : ''}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {when(a.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
