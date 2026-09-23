'use client'

/**
 * Website builder — empty → gallery → split editor (Sites S4).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Globe,
  LayoutTemplate,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2,
  Check,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { SiteTemplateView } from '@/components/site-templates'
import {
  SITE_TEMPLATE_META,
  defaultSiteContent,
  type SiteAiSlotPath,
  type SiteContent,
  type SitePageKey,
  type SiteRecord,
  type SiteTemplateId,
  type SiteTheme,
} from '@/app/utils/types/site'
import { platformSubdomainUrl } from '@/app/utils/site-host'
import { ConnectDomainPanel } from '@/app/components/website/connect-domain-panel'

type TemplateMeta = {
  id: SiteTemplateId
  name: string
  description: string
}

type PreviewMode = 'desktop' | 'mobile'

const ADDON_PAGES: { key: SitePageKey; label: string; hint: string }[] = [
  { key: 'issues', label: 'Issues', hint: 'Dedicated issues page' },
  { key: 'events', label: 'Events', hint: 'Events listing (stub)' },
  { key: 'volunteer', label: 'Volunteer', hint: 'Volunteer signup page' },
  { key: 'donate', label: 'Donate', hint: 'Donate page' },
]

type WebsiteBuilderProps = {
  organizationId: number
}

export function WebsiteBuilder({ organizationId }: WebsiteBuilderProps) {
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<SiteRecord[]>([])
  const [templates, setTemplates] = useState<TemplateMeta[]>(
    Object.values(SITE_TEMPLATE_META)
  )
  const [view, setView] = useState<'empty' | 'gallery' | 'editor'>('empty')
  const [active, setActive] = useState<SiteRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/sites?organizationId=${organizationId}`
      )
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Could not load sites')
      }
      const list = (data.sites || []) as SiteRecord[]
      setSites(list)
      if (Array.isArray(data.templates) && data.templates.length) {
        setTemplates(data.templates)
      }
      if (list.length === 0) {
        setView('empty')
        setActive(null)
      } else {
        setActive(list[0])
        setView('editor')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (templateId: SiteTemplateId) => {
    setCreating(true)
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, templateId }),
      })
      const data = await res.json()
      if (!res.ok || !data.status || !data.site) {
        throw new Error(data.message || 'Could not create site')
      }
      const site = data.site as SiteRecord
      setSites((prev) => [site, ...prev])
      setActive(site)
      setView('editor')
      toast.success('Draft site created — edit slots, then publish')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading builder…
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  if (view === 'gallery') {
    return (
      <TemplateGallery
        templates={templates}
        creating={creating}
        onPick={(id) => void handleCreate(id)}
        onBack={() => setView(sites.length ? 'editor' : 'empty')}
      />
    )
  }

  if (view === 'empty' || !active) {
    return (
      <EmptyState onChooseTemplate={() => setView('gallery')} />
    )
  }

  return (
    <SiteEditor
      key={active.id}
      organizationId={organizationId}
      site={active}
      onSiteChange={(site) => {
        setActive(site)
        setSites((prev) =>
          prev.map((s) => (s.id === site.id ? site : s))
        )
      }}
      onChangeTemplate={() => setView('gallery')}
      onDeleted={() => {
        setSites((prev) => {
          const next = prev.filter((s) => s.id !== active.id)
          if (next.length === 0) {
            setActive(null)
            setView('empty')
          } else {
            setActive(next[0])
            setView('editor')
          }
          return next
        })
      }}
    />
  )
}

function EmptyState({ onChooseTemplate }: { onChooseTemplate: () => void }) {
  return (
    <div className="max-w-xl mx-auto py-16 text-center space-y-5">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Globe className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          No campaign site yet
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Pick a finished-looking template, fill the named slots, and publish to
          a live <code className="text-xs bg-muted px-1 rounded">/s/</code> URL —
          no separate build step.
        </p>
      </div>
      <Button size="lg" onClick={onChooseTemplate}>
        <LayoutTemplate className="h-4 w-4 mr-2" />
        Choose a template
      </Button>
    </div>
  )
}

function TemplateGallery({
  templates,
  creating,
  onPick,
  onBack,
}: {
  templates: TemplateMeta[]
  creating: boolean
  onPick: (id: SiteTemplateId) => void
  onBack: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Choose a template
          </h2>
          <p className="text-sm text-muted-foreground">
            Opinionated layouts with named editable slots — not a blank canvas.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={creating}>
          Back
        </Button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {templates.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-border p-4 flex flex-col gap-3"
          >
            <div className="aspect-[4/3] rounded-md bg-muted/60 border border-border/60 flex items-center justify-center">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground/70" />
            </div>
            <div className="space-y-1 flex-1">
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.description}
              </p>
            </div>
            <Button
              size="sm"
              disabled={creating}
              onClick={() => onPick(t.id)}
            >
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                'Use template'
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SiteEditor({
  organizationId,
  site,
  onSiteChange,
  onChangeTemplate,
  onDeleted,
}: {
  organizationId: number
  site: SiteRecord
  onSiteChange: (site: SiteRecord) => void
  onChangeTemplate: () => void
  onDeleted: () => void
}) {
  const [content, setContent] = useState<SiteContent>(site.content)
  const [theme, setTheme] = useState<SiteTheme>(site.theme)
  const [templateId, setTemplateId] = useState<SiteTemplateId>(site.templateId)
  const [enabledPages, setEnabledPages] = useState<SitePageKey[]>(
    site.enabledPages?.length ? site.enabledPages : ['home']
  )
  const [status, setStatus] = useState(site.status)
  const [slug, setSlug] = useState(site.slug)
  const [publishedAt, setPublishedAt] = useState(site.publishedAt)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [aiBusy, setAiBusy] = useState<SiteAiSlotPath | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef({ content, theme, templateId, enabledPages, slug })

  useEffect(() => {
    latestRef.current = { content, theme, templateId, enabledPages, slug }
  }, [content, theme, templateId, enabledPages, slug])

  const markDirty = useCallback(() => setDirty(true), [])

  const persistDraft = useCallback(
    async (opts?: { silent?: boolean }) => {
      setSaving(true)
      try {
        const payload = latestRef.current
        const res = await fetch(`/api/sites/${site.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            content: payload.content,
            theme: payload.theme,
            templateId: payload.templateId,
            enabledPages: payload.enabledPages,
            slug: payload.slug,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.status || !data.site) {
          throw new Error(data.message || 'Save failed')
        }
        const next = data.site as SiteRecord
        setDirty(false)
        setStatus(next.status)
        setPublishedAt(next.publishedAt)
        setSlug(next.slug)
        onSiteChange(next)
        if (!opts?.silent) toast.success('Draft saved')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    },
    [organizationId, site.id, onSiteChange]
  )

  // Debounced autosave for drafts
  useEffect(() => {
    if (!dirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persistDraft({ silent: true })
    }, 900)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [dirty, content, theme, templateId, enabledPages, slug, persistDraft])

  const updateContent = (next: SiteContent) => {
    setContent(next)
    markDirty()
  }

  const handlePublishToggle = async (published: boolean) => {
    setPublishing(true)
    try {
      // Flush draft first so live URL matches editor
      if (dirty) {
        await persistDraft({ silent: true })
      }
      const res = await fetch(`/api/sites/${site.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          published,
          content: latestRef.current.content,
          theme: latestRef.current.theme,
          enabledPages: latestRef.current.enabledPages,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status || !data.site) {
        throw new Error(data.message || 'Publish failed')
      }
      const next = data.site as SiteRecord
      setStatus(next.status)
      setPublishedAt(next.publishedAt)
      setSlug(next.slug)
      setDirty(false)
      onSiteChange(next)
      toast.success(
        published
          ? `Live at /s/${next.slug}`
          : 'Unpublished — draft kept'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const handleAiWrite = async (slotPath: SiteAiSlotPath) => {
    setAiBusy(slotPath)
    try {
      const res = await fetch('/api/sites/ai-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          slotPath,
          content,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status || !data.result) {
        throw new Error(data.message || 'AI write failed')
      }
      const result = data.result as {
        kind: string
        value?: string
        items?: unknown[]
      }
      const next = structuredClone(content) as SiteContent
      if (result.kind === 'string' && typeof result.value === 'string') {
        if (slotPath === 'hero.headline') next.slots.hero.headline = result.value
        if (slotPath === 'hero.subheadline')
          next.slots.hero.subheadline = result.value
        if (slotPath === 'about.body') next.slots.about.body = result.value
        if (slotPath === 'cta.headline') next.slots.cta.headline = result.value
        if (slotPath === 'cta.body') next.slots.cta.body = result.value
      } else if (result.kind === 'issues' && Array.isArray(result.items)) {
        next.slots.issues.items = result.items as SiteContent['slots']['issues']['items']
      } else if (
        result.kind === 'endorsements' &&
        Array.isArray(result.items)
      ) {
        next.slots.endorsements.items =
          result.items as SiteContent['slots']['endorsements']['items']
      }
      updateContent(next)
      toast.success('Draft copy inserted — edit anything that needs a fact-check')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI write failed')
    } finally {
      setAiBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this campaign site? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/sites/${site.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Delete failed')
      }
      toast.success('Site deleted')
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const publicPath = `/s/${slug}`
  const platformUrl = platformSubdomainUrl(slug)
  const isPublished = status === 'published'

  const pageEnabled = useMemo(() => {
    const set = new Set(enabledPages)
    return (key: SitePageKey) => set.has(key)
  }, [enabledPages])

  const togglePage = (key: SitePageKey, on: boolean) => {
    if (key === 'home') return
    setEnabledPages((prev) => {
      const next = new Set(prev)
      next.add('home')
      if (on) next.add(key)
      else next.delete(key)
      return Array.from(next) as SitePageKey[]
    })
    markDirty()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isPublished ? 'default' : 'secondary'}>
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          )}
          {!saving && dirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          {!saving && !dirty && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="h-3 w-3" />
              Draft synced
            </span>
          )}
          {isPublished && (
            <>
              <Link
                href={publicPath}
                target="_blank"
                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
              >
                {publicPath}
                <ExternalLink className="h-3 w-3" />
              </Link>
              <a
                href={platformUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"
              >
                {platformUrl.replace(/^https:\/\//, '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setPreviewMode('desktop')}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setPreviewMode('mobile')}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void persistDraft()}
            disabled={saving || !dirty}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save draft
          </Button>

          <div className="flex items-center gap-2 pl-1">
            <Switch
              id="site-publish"
              checked={isPublished}
              disabled={publishing}
              onCheckedChange={(on) => void handlePublishToggle(on)}
            />
            <Label htmlFor="site-publish" className="text-sm cursor-pointer">
              {publishing ? 'Updating…' : 'Publish'}
            </Label>
          </div>
        </div>
      </div>

      {/* Split editor */}
      <div className="grid gap-4 xl:grid-cols-2 min-h-[70vh]">
        <div className="rounded-lg border border-border overflow-hidden flex flex-col min-h-[420px]">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Live preview</span>
            <span className="uppercase tracking-wide">
              {SITE_TEMPLATE_META[templateId]?.name || templateId}
            </span>
          </div>
          <div className="flex-1 overflow-auto bg-muted/20 p-3 flex justify-center">
            <div
              className="bg-background shadow-sm border border-border overflow-hidden transition-[width] duration-300 ease-out origin-top"
              style={{
                width: previewMode === 'mobile' ? 390 : '100%',
                maxWidth: '100%',
              }}
            >
              <SiteTemplateView
                templateId={templateId}
                content={content}
                theme={theme}
                siteSlug={slug}
                preview
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden flex flex-col min-h-[420px]">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            Slot fields
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {/* Meta + slug */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Campaign identity</h3>
              <Field
                label="Candidate name"
                value={content.meta.candidateName}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    meta: { ...content.meta, candidateName: v },
                  })
                }
              />
              <Field
                label="Office"
                value={content.meta.office}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    meta: { ...content.meta, office: v },
                  })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Party label"
                  value={content.meta.partyLabel || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      meta: { ...content.meta, partyLabel: v || null },
                    })
                  }
                />
                <Field
                  label="Election"
                  value={content.meta.electionDate || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      meta: { ...content.meta, electionDate: v || undefined },
                    })
                  }
                />
              </div>
              <Field
                label="Public slug"
                value={slug}
                onChange={(v) => {
                  setSlug(v.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase())
                  markDirty()
                }}
                hint={`Live URL: /s/${slug || '…'}`}
              />
            </section>

            <Separator />

            {/* Hero */}
            <SlotSection
              title="Hero"
              slotPath="hero.headline"
              aiBusy={aiBusy}
              onAi={() => void handleAiWrite('hero.headline')}
              extraAi={[
                {
                  label: 'Subheadline',
                  path: 'hero.subheadline',
                  onClick: () => void handleAiWrite('hero.subheadline'),
                },
              ]}
            >
              <Field
                label="Headline"
                value={content.slots.hero.headline}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      hero: { ...content.slots.hero, headline: v },
                    },
                  })
                }
              />
              <Field
                label="Subheadline"
                value={content.slots.hero.subheadline || ''}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      hero: { ...content.slots.hero, subheadline: v },
                    },
                  })
                }
                multiline
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="CTA label"
                  value={content.slots.hero.ctaLabel || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        hero: { ...content.slots.hero, ctaLabel: v },
                      },
                    })
                  }
                />
                <Field
                  label="CTA link"
                  value={content.slots.hero.ctaHref || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        hero: { ...content.slots.hero, ctaHref: v },
                      },
                    })
                  }
                />
              </div>
              <Field
                label="Hero photo URL"
                value={content.slots.hero.photoUrl || ''}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      hero: { ...content.slots.hero, photoUrl: v || null },
                    },
                  })
                }
              />
            </SlotSection>

            <Separator />

            {/* About */}
            <SlotSection
              title="About"
              slotPath="about.body"
              aiBusy={aiBusy}
              onAi={() => void handleAiWrite('about.body')}
            >
              <Field
                label="About body"
                value={content.slots.about.body}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      about: { ...content.slots.about, body: v },
                    },
                  })
                }
                multiline
                rows={6}
              />
            </SlotSection>

            <Separator />

            {/* Issues */}
            <SlotSection
              title="Issues"
              slotPath="issues.items"
              aiBusy={aiBusy}
              onAi={() => void handleAiWrite('issues.items')}
            >
              <div className="space-y-3">
                {content.slots.issues.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Issue {idx + 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        onClick={() => {
                          const items = content.slots.issues.items.filter(
                            (_, i) => i !== idx
                          )
                          updateContent({
                            ...content,
                            slots: {
                              ...content.slots,
                              issues: { items },
                            },
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Field
                      label="Title"
                      value={item.title}
                      onChange={(v) => {
                        const items = content.slots.issues.items.map((it, i) =>
                          i === idx ? { ...it, title: v } : it
                        )
                        updateContent({
                          ...content,
                          slots: { ...content.slots, issues: { items } },
                        })
                      }}
                    />
                    <Field
                      label="Summary"
                      value={item.summary}
                      onChange={(v) => {
                        const items = content.slots.issues.items.map((it, i) =>
                          i === idx ? { ...it, summary: v } : it
                        )
                        updateContent({
                          ...content,
                          slots: { ...content.slots, issues: { items } },
                        })
                      }}
                      multiline
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        issues: {
                          items: [
                            ...content.slots.issues.items,
                            { title: 'New issue', summary: '' },
                          ],
                        },
                      },
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add issue
                </Button>
              </div>
            </SlotSection>

            <Separator />

            {/* Endorsements */}
            <SlotSection
              title="Endorsements"
              slotPath="endorsements.items"
              aiBusy={aiBusy}
              onAi={() => void handleAiWrite('endorsements.items')}
            >
              <div className="space-y-3">
                {content.slots.endorsements.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Endorsement {idx + 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        onClick={() => {
                          const items =
                            content.slots.endorsements.items.filter(
                              (_, i) => i !== idx
                            )
                          updateContent({
                            ...content,
                            slots: {
                              ...content.slots,
                              endorsements: { items },
                            },
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Field
                      label="Name"
                      value={item.name}
                      onChange={(v) => {
                        const items = content.slots.endorsements.items.map(
                          (it, i) => (i === idx ? { ...it, name: v } : it)
                        )
                        updateContent({
                          ...content,
                          slots: {
                            ...content.slots,
                            endorsements: { items },
                          },
                        })
                      }}
                    />
                    <Field
                      label="Role"
                      value={item.role || ''}
                      onChange={(v) => {
                        const items = content.slots.endorsements.items.map(
                          (it, i) => (i === idx ? { ...it, role: v } : it)
                        )
                        updateContent({
                          ...content,
                          slots: {
                            ...content.slots,
                            endorsements: { items },
                          },
                        })
                      }}
                    />
                    <Field
                      label="Quote"
                      value={item.quote || ''}
                      onChange={(v) => {
                        const items = content.slots.endorsements.items.map(
                          (it, i) => (i === idx ? { ...it, quote: v } : it)
                        )
                        updateContent({
                          ...content,
                          slots: {
                            ...content.slots,
                            endorsements: { items },
                          },
                        })
                      }}
                      multiline
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        endorsements: {
                          items: [
                            ...content.slots.endorsements.items,
                            {
                              name: 'Supporter',
                              role: '',
                              quote: '',
                            },
                          ],
                        },
                      },
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add endorsement
                </Button>
              </div>
            </SlotSection>

            <Separator />

            {/* CTA */}
            <SlotSection
              title="Call to action"
              slotPath="cta.headline"
              aiBusy={aiBusy}
              onAi={() => void handleAiWrite('cta.headline')}
              extraAi={[
                {
                  label: 'Body',
                  path: 'cta.body',
                  onClick: () => void handleAiWrite('cta.body'),
                },
              ]}
            >
              <Field
                label="Headline"
                value={content.slots.cta.headline}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      cta: { ...content.slots.cta, headline: v },
                    },
                  })
                }
              />
              <Field
                label="Body"
                value={content.slots.cta.body || ''}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      cta: { ...content.slots.cta, body: v },
                    },
                  })
                }
                multiline
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Primary label"
                  value={content.slots.cta.primaryLabel}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        cta: { ...content.slots.cta, primaryLabel: v },
                      },
                    })
                  }
                />
                <Field
                  label="Primary link"
                  value={content.slots.cta.primaryHref}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        cta: { ...content.slots.cta, primaryHref: v },
                      },
                    })
                  }
                />
              </div>
            </SlotSection>

            <Separator />

            {/* Footer */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Footer</h3>
              <Field
                label="Paid for by"
                value={content.slots.footer.paidForBy || ''}
                onChange={(v) =>
                  updateContent({
                    ...content,
                    slots: {
                      ...content.slots,
                      footer: { ...content.slots.footer, paidForBy: v },
                    },
                  })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Email"
                  value={content.slots.footer.email || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        footer: { ...content.slots.footer, email: v },
                      },
                    })
                  }
                />
                <Field
                  label="Phone"
                  value={content.slots.footer.phone || ''}
                  onChange={(v) =>
                    updateContent({
                      ...content,
                      slots: {
                        ...content.slots,
                        footer: { ...content.slots.footer, phone: v },
                      },
                    })
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Theme */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Theme</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Primary color"
                  value={theme.primaryColor || ''}
                  onChange={(v) => {
                    setTheme((t) => ({ ...t, primaryColor: v }))
                    markDirty()
                  }}
                />
                <Field
                  label="Accent color"
                  value={theme.accentColor || ''}
                  onChange={(v) => {
                    setTheme((t) => ({ ...t, accentColor: v }))
                    markDirty()
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  Object.keys(SITE_TEMPLATE_META) as SiteTemplateId[]
                ).map((id) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={templateId === id ? 'secondary' : 'outline'}
                    onClick={() => {
                      setTemplateId(id)
                      markDirty()
                    }}
                  >
                    {SITE_TEMPLATE_META[id].name}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="px-0"
                onClick={onChangeTemplate}
              >
                Start over with a new template…
              </Button>
            </section>

            <Separator />

            {/* Enabled pages */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Add-on pages</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Home is always on. Extra pages are tier-gated via{' '}
                  <code className="text-[10px] bg-muted px-1 rounded">
                    enabled_pages
                  </code>
                  .
                </p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm opacity-70">
                  <Checkbox checked disabled />
                  Home (included)
                </label>
                {ADDON_PAGES.map((page) => (
                  <div
                    key={page.key}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={pageEnabled(page.key)}
                      onCheckedChange={(v) => togglePage(page.key, Boolean(v))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{page.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {page.hint} · /s/{slug}/{page.key}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <ConnectDomainPanel
              siteId={site.id}
              organizationId={organizationId}
              slug={slug}
              published={isPublished}
            />

            <Separator />

            <div className="flex items-center justify-between gap-3 pb-4">
              <p className="text-[11px] text-muted-foreground">
                {publishedAt
                  ? `First published ${new Date(publishedAt).toLocaleString()}`
                  : 'Never published'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void handleDelete()}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete site
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
  hint?: string
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}
      {hint && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function SlotSection({
  title,
  slotPath,
  aiBusy,
  onAi,
  extraAi,
  children,
}: {
  title: string
  slotPath: SiteAiSlotPath
  aiBusy: SiteAiSlotPath | null
  onAi: () => void
  extraAi?: { label: string; path: SiteAiSlotPath; onClick: () => void }[]
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={aiBusy != null}
            onClick={onAi}
          >
            {aiBusy === slotPath ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Write with AI
          </Button>
          {extraAi?.map((extra) => (
            <Button
              key={extra.path}
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={aiBusy != null}
              onClick={extra.onClick}
            >
              {aiBusy === extra.path ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {extra.label}
            </Button>
          ))}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Seed content helper re-export for tests / gallery previews if needed. */
export function previewDefaultContent() {
  return defaultSiteContent()
}
