/**
 * Public candidate site — live the moment status=published.
 * GET /s/<slug> → 404 if not published (no build step).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteRepo } from '@/app/utils/database/site-repo'
import { SiteTemplateView } from '@/components/site-templates'
import type { SiteRecord } from '@/app/utils/types/site'

type PageProps = {
  params: Promise<{ slug: string }>
}

function siteTitle(site: SiteRecord): string {
  const { candidateName, office } = site.content.meta
  if (candidateName && office) return `${candidateName} for ${office}`
  return candidateName || office || 'Campaign site'
}

function siteDescription(site: SiteRecord): string {
  const hero = site.content.slots.hero
  return (
    hero.subheadline?.trim() ||
    hero.headline?.trim() ||
    site.content.slots.about.body?.slice(0, 160) ||
    `Campaign site for ${site.content.meta.candidateName}`
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const site = await SiteRepo.getPublishedSiteBySlug(slug)
  if (!site) {
    return {
      title: 'Site not found',
      robots: { index: false, follow: false },
    }
  }

  const title = siteTitle(site)
  const description = siteDescription(site)
  const ogImage =
    site.content.slots.hero.photoUrl ||
    site.content.branding.heroImageUrl ||
    site.content.branding.logoUrl ||
    undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/s/${site.slug}`,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function PublicSiteBySlugPage({ params }: PageProps) {
  const { slug } = await params
  if (!slug?.trim()) notFound()

  const site = await SiteRepo.getPublishedSiteBySlug(slug.trim())
  if (!site) notFound()

  return (
    <main className="min-h-screen">
      <SiteTemplateView
        templateId={site.templateId}
        content={site.content}
        theme={site.theme}
      />
    </main>
  )
}
