'use client'

/**
 * Admin G3 — cross-org AI credit usage.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ArrowLeft, Loader2, RefreshCw, Shield, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

type OrgUsage = {
  organizationId: number
  organizationName: string | null
  planTier: string
  planLabel: string
  allowance: number
  usedCredits: number
  remainingCredits: number
  percentUsed: number
  warn: boolean
  blocked: boolean
  callCount: number
  costUsd: number
  periodLabel: string
}

const PLANS = ['grassroots', 'campaign', 'congressional'] as const

export default function AdminAiUsagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<OrgUsage[]>([])
  const [totals, setTotals] = useState({
    usedCredits: 0,
    callCount: 0,
    costUsd: 0,
    orgCount: 0,
  })
  const [unattributedCredits, setUnattributedCredits] = useState(0)
  const [hardEnforce, setHardEnforce] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai-usage', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 || res.status === 403) {
        toast.error('Super-admin required')
        router.push('/dashboard')
        return
      }
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to load AI usage')
      }
      setOrgs(data.orgs || [])
      setTotals(data.totals || { usedCredits: 0, callCount: 0, costUsd: 0, orgCount: 0 })
      setUnattributedCredits(Number(data.unattributed?.credits) || 0)
      setHardEnforce(Boolean(data.hardEnforce))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const setPlan = async (organizationId: number, planTier: string) => {
    setSavingId(organizationId)
    try {
      const res = await fetch('/api/admin/ai-usage', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, planTier }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.status) {
        throw new Error(data?.message || 'Failed to update plan')
      }
      toast.success('AI plan updated')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Admin
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-org credits this period · hard enforce{' '}
            {hardEnforce ? (
              <Badge variant="destructive">ON</Badge>
            ) : (
              <Badge variant="secondary">off</Badge>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Orgs</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{totals.orgCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Credits used</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {Math.round(totals.usedCredits).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>AI calls</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {totals.callCount.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Est. cost (USD)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                ${totals.costUsd.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <p className="text-sm text-muted-foreground">
          Unattributed usage: {Math.round(unattributedCredits).toLocaleString()}{' '}
          credits (last 30d)
          {unattributedCredits > 0 ? (
            <Badge variant="outline" className="ml-2 text-[10px]">
              check gateway wraps
            </Badge>
          ) : null}
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Accounts
            </CardTitle>
            <CardDescription>
              Grassroots / Campaign / Congressional allowances. Soft-warn near
              cap; hard block only when AI_USAGE_HARD_ENFORCE is on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Allowance</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((o) => (
                    <TableRow key={o.organizationId}>
                      <TableCell>
                        <Link
                          href={`/admin/accounts/${o.organizationId}`}
                          className="font-medium hover:underline"
                        >
                          {o.organizationName || `Org ${o.organizationId}`}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          #{o.organizationId}
                          {o.warn && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              near cap
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={o.planTier}
                          disabled={savingId === o.organizationId}
                          onValueChange={(v) => void setPlan(o.organizationId, v)}
                        >
                          <SelectTrigger className="w-[160px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLANS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(o.usedCredits).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.allowance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.callCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.percentUsed.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  {!orgs.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No organizations yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
