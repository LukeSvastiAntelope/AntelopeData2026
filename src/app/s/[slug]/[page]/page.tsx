/**
 * Public candidate site add-on page — /s/<slug>/<page>
 * page ∈ enabled_pages (issues | events | volunteer | donate). 404 if not published
 * or page not enabled for this site's tier.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteRepo } from '@/app/utils/database/site-repo'
import {
  FooterBlock,
  SecondaryButton,
  SectionLabel,
  SiteShell,
} from '@/components/site-templates/shared'
import {
  SiteDonateForm,
  SiteVolunteerForm,
} from '@/components/site-templates/SiteCaptureForms'
import type { SitePageKey, SiteRecord } from '@/app/utils/types/site'

const ADDON_PAGES: SitePageKey[] = ['issues', 'events', 'volunteer', 'donate']

type PageProps = {
  params: Promise<{ slug: string; page: string }>
}

function isAddonPage(page: string): page is SitePageKey {
  return (ADDON_PAGES as string[]).includes(page)
}

function pageHeading(page: SitePageKey, site: SiteRecord): string {
  switch (page) {
    case 'issues':
      return 'Issues'
    case 'events':
      return 'Events'
    case 'volunteer':
      return site.content.slots.cta.secondaryLabel || 'Volunteer'
    case 'donate':
      return site.content.slots.cta.primaryLabel || 'Donate'
    default:
      return 'Page'
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, page } = await params
  const site = await SiteRepo.getPublishedSiteBySlug(slug)
  if (!site || !isAddonPage(page) || !site.enabledPages.includes(page)) {
    return { title: 'Not found', robots: { index: false, follow: false } }
  }
  const name = site.content.meta.candidateName
  const heading = pageHeading(page, site)
  const title = `${heading} · ${name}`
  const description =
    site.content.slots.hero.subheadline ||
    `${heading} — ${name} for ${site.content.meta.office}`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `/s/${slug}/${page}` },
  }
}

export default async function PublicSiteAddonPage({ params }: PageProps) {
  const { slug, page: pageRaw } = await params
  if (!slug?.trim() || !pageRaw?.trim()) notFound()

  const page = pageRaw.trim().toLowerCase()
  if (!isAddonPage(page)) notFound()

  const site = await SiteRepo.getPublishedSiteBySlug(slug.trim())
  if (!site) notFound()
  if (!site.enabledPages.includes(page)) notFound()

  const { content, theme } = site
  const heading = pageHeading(page, site)

  return (
    <main className="min-h-screen">
      <SiteShell variant="modern" theme={theme}>
        <header
          className="px-6 py-4 border-b"
          style={{
            borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
          }}
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <Link href={`/s/${site.slug}`} className="font-semibold tracking-tight hover:opacity-80">
              {content.meta.candidateName}
            </Link>
            <p className="text-sm opacity-70">{content.meta.office}</p>
          </div>
        </header>

        <section className="px-6 py-12 md:py-16">
          <div className="max-w-3xl mx-auto">
            <SectionLabel>{content.meta.office}</SectionLabel>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
              {heading}
            </h1>

            {page === 'issues' && (
              <div className="space-y-5">
                {(content.slots.issues.items.length
                  ? content.slots.issues.items
                  : [{ title: 'Coming soon', summary: 'Issue details will appear here.' }]
                ).map((item, i) => (
                  <div
                    key={`${item.title}-${i}`}
                    className="p-5 border"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
                      borderRadius: 'var(--site-radius)',
                    }}
                  >
                    <h2 className="font-semibold text-lg mb-2">{item.title}</h2>
                    <p className="opacity-80 leading-relaxed">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}

            {page === 'events' && (
              <p className="opacity-80 leading-relaxed">
                Campaign events will be listed here. Check back soon, or{' '}
                <a href={`/s/${site.slug}#signup`} className="underline underline-offset-2">
                  sign up
                </a>{' '}
                for updates from {content.meta.candidateName}.
              </p>
            )}

            {page === 'volunteer' && (
              <div className="space-y-6 max-w-lg">
                <p className="opacity-80 leading-relaxed">
                  {content.slots.cta.body ||
                    `Join ${content.meta.candidateName}'s volunteer team.`}
                </p>
                <SiteVolunteerForm
                  siteSlug={site.slug}
                  candidateName={content.meta.candidateName}
                />
              </div>
            )}

            {page === 'donate' && (
              <div className="space-y-6 max-w-lg">
                <p className="opacity-80 leading-relaxed">
                  {content.slots.cta.body ||
                    `Chip in to support ${content.meta.candidateName} for ${content.meta.office}.`}
                </p>
                <SiteDonateForm
                  siteSlug={site.slug}
                  candidateName={content.meta.candidateName}
                />
                <SecondaryButton href={`/s/${site.slug}`}>Back to home</SecondaryButton>
              </div>
            )}
          </div>
        </section>

        <FooterBlock content={content} />
      </SiteShell>
    </main>
  )
}
