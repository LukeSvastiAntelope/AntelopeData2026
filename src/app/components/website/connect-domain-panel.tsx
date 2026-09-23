'use client'

/**
 * Connect your domain — Sites S6 (tier-gated via Website add-on + published site).
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getSiteRootDomain, platformSubdomainUrl } from '@/app/utils/site-host'

type DomainRow = {
  id: number
  host: string
  verified: boolean
  verificationToken: string
  dnsInstructions: {
    records?: Array<{ type: string; name: string; value: string }>
    stubbed?: boolean
    note?: string | null
  } | null
  verifiedAt: string | null
}

type Props = {
  siteId: number
  organizationId: number
  slug: string
  published: boolean
}

export function ConnectDomainPanel({
  siteId,
  organizationId,
  slug,
  published,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [platformUrl, setPlatformUrl] = useState(() =>
    platformSubdomainUrl(slug)
  )
  const [rootDomain, setRootDomain] = useState(() => getSiteRootDomain())
  const [hostInput, setHostInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [verifyingId, setVerifyingId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sites/${siteId}/domains`)
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Failed to load domains')
      }
      setDomains(data.domains || [])
      if (data.platformSubdomain) setPlatformUrl(data.platformSubdomain)
      if (data.siteRootDomain) setRootDomain(data.siteRootDomain)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Domain load failed')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  const connect = async () => {
    if (!published) {
      toast.error('Publish the site first')
      return
    }
    const host = hostInput.trim().toLowerCase()
    if (!host) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sites/${siteId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, host }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Connect failed')
      }
      setHostInput('')
      toast.success(
        data.vercel?.stubbed
          ? 'Domain registered — add the CNAME (Vercel API stubbed locally)'
          : 'Domain registered with Vercel — add DNS, then Verify'
      )
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (domainId: number) => {
    setVerifyingId(domainId)
    try {
      const res = await fetch(
        `/api/sites/${siteId}/domains/${domainId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Verify failed')
      }
      if (data.domain?.verified) {
        toast.success('Domain verified — live on this host')
      } else {
        toast.message(
          data.vercel?.message ||
            'Not verified yet — wait for DNS, then try again'
        )
      }
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verify failed')
    } finally {
      setVerifyingId(null)
    }
  }

  const remove = async (domainId: number) => {
    if (!confirm('Disconnect this domain?')) return
    try {
      const res = await fetch(`/api/sites/${siteId}/domains/${domainId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Remove failed')
      }
      toast.success('Domain disconnected')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Globe2 className="h-4 w-4" />
          Domains
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Platform subdomain is included with the Website add-on. Custom domains
          are tier-gated to entitled, published sites. The Antelope dashboard
          stays on the apex/app host and never collides with tenant hosts.
        </p>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs font-medium">Platform subdomain</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded break-all">
            {platformUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => void copy(platformUrl)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {published && (
            <a
              href={platformUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ops: point <code className="text-[10px]">*.{rootDomain}</code> at the
          Vercel project (wildcard DNS + domain). Host routing rewrites{' '}
          <code className="text-[10px]">
            {'{slug}'}.{rootDomain}
          </code>{' '}
          → <code className="text-[10px]">/s/{'{slug}'}</code>.
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium">Connect your domain</p>
        {!published && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Publish the site before connecting a custom domain.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="custom-host" className="text-xs">
              Hostname
            </Label>
            <Input
              id="custom-host"
              placeholder="www.yourcampaign.com"
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              disabled={!published || busy}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              disabled={!published || busy || !hostInput.trim()}
              onClick={() => void connect()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Connecting…
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading domains…
        </div>
      ) : domains.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom domains yet.</p>
      ) : (
        <ul className="space-y-3">
          {domains.map((d) => {
            const records =
              d.dnsInstructions?.records ||
              ([
                {
                  type: 'CNAME',
                  name: d.host,
                  value: 'cname.vercel-dns.com',
                },
              ] as Array<{ type: string; name: string; value: string }>)
            return (
              <li
                key={d.id}
                className="rounded-md border border-border p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-xs font-medium truncate">{d.host}</code>
                    <Badge
                      variant={d.verified ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {d.verified ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        'Pending'
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {!d.verified && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={verifyingId === d.id}
                        onClick={() => void verify(d.id)}
                      >
                        {verifyingId === d.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Verify'
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      onClick={() => void remove(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {!d.verified && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Add DNS at your registrar, then click Verify:
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pr-2 py-1 font-medium">Type</th>
                            <th className="pr-2 py-1 font-medium">Name</th>
                            <th className="py-1 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((r, i) => (
                            <tr key={i} className="border-t border-border/60">
                              <td className="pr-2 py-1 align-top">{r.type}</td>
                              <td className="pr-2 py-1 align-top break-all">
                                {r.name}
                              </td>
                              <td className="py-1 align-top break-all">
                                {r.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {d.dnsInstructions?.stubbed && (
                      <p className="text-[11px] text-muted-foreground">
                        Vercel Domains API stubbed — set{' '}
                        <code className="text-[10px]">VERCEL_TOKEN</code> +{' '}
                        <code className="text-[10px]">VERCEL_PROJECT_ID</code>{' '}
                        in production.
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
