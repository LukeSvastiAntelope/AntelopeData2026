'use client'

/**
 * /website — Website add-on gate (Sites S3).
 * Not entitled → upsell. Entitled → builder shell (Phase 4 fills the editor).
 */

import { useCallback, useEffect, useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Globe,
  Check,
  Loader2,
  LayoutTemplate,
  Megaphone,
  Users,
  Sparkles,
} from 'lucide-react'

type EntitlementState = {
  loading: boolean
  entitled: boolean
  organizationId: number | null
  error: string | null
}

export default function WebsitePage() {
  const [state, setState] = useState<EntitlementState>({
    loading: true,
    entitled: false,
    organizationId: null,
    error: null,
  })
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/website/entitlement')
      const data = await res.json()
      if (!res.ok || data.status === false) {
        throw new Error(data.message || 'Could not check entitlement')
      }
      setState({
        loading: false,
        entitled: Boolean(data.entitled),
        organizationId: data.organizationId ?? null,
        error: null,
      })
    } catch (e) {
      setState({
        loading: false,
        entitled: false,
        organizationId: null,
        error: e instanceof Error ? e.message : 'Failed to load',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAdd = async () => {
    if (!state.organizationId) {
      setState((s) => ({
        ...s,
        error: 'Create or join a campaign organization first (Team).',
      }))
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/website/entitlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: state.organizationId }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Could not add Website')
      }
      setState((s) => ({ ...s, entitled: true, error: null }))
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : 'Add failed',
      }))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Website
            </h1>
            {!state.loading && state.entitled && (
              <Badge variant="secondary" className="ml-3 text-[10px]">
                Add-on active
              </Badge>
            )}
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6">
          {state.loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your campaign…
            </div>
          ) : state.entitled ? (
            <WebsiteBuilderPlaceholder />
          ) : (
            <WebsiteUpsell
              onAdd={() => void handleAdd()}
              adding={adding}
              error={state.error}
              hasOrg={state.organizationId != null}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function WebsiteUpsell({
  onAdd,
  adding,
  error,
  hasOrg,
}: {
  onAdd: () => void
  adding: boolean
  error: string | null
  hasOrg: boolean
}) {
  const included = [
    {
      icon: LayoutTemplate,
      title: 'Opinionated templates',
      body: 'Pick a finished-looking campaign site — edit named slots, not a blank canvas.',
    },
    {
      icon: Sparkles,
      title: 'AI-written copy',
      body: 'Draft headlines and about text from what Antelope already knows about your race.',
    },
    {
      icon: Megaphone,
      title: 'Publish in one click',
      body: 'Live at antelopedata.org/s/your-slug the moment you publish — no separate build tool.',
    },
    {
      icon: Users,
      title: 'Capture back into Antelope',
      body: 'Signups, donors, and volunteers feed your campaign contacts and suites.',
    },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Campaign add-on
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Build your campaign site
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
          A live site with signup, donate, and volunteer capture — sold separately from
          the core Antelope loop. Add the Website product for your campaign.
        </p>
        <p className="text-lg font-medium">
          $20<span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {included.map((item) => (
          <li
            key={item.title}
            className="rounded-lg border border-border p-4 space-y-2"
          >
            <div className="flex items-center gap-2 font-medium text-sm">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {item.title}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button size="lg" onClick={onAdd} disabled={adding || !hasOrg}>
          {adding ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding…
            </>
          ) : (
            <>Add for $20/mo</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {/* TODO(stripe): wire Checkout — entitlement flip is a stub seam */}
          Payment via Stripe comes next; this enables the add-on for your org so you can
          build.
        </p>
      </div>

      {!hasOrg && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          You need a campaign organization before adding Website. Create or join one under
          Team.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** Phase 4 replaces this with the template gallery + split editor. */
function WebsiteBuilderPlaceholder() {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Check className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Website add-on is on</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Template gallery and the split editor land in the next phase. Your campaign can
        publish to <code className="text-xs bg-muted px-1 rounded">/s/&lt;slug&gt;</code>{' '}
        as soon as a site is created.
      </p>
    </div>
  )
}
