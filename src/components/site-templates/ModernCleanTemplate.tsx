'use client';

/**
 * Modern Clean — photo-forward, minimal, phone-first.
 */

import type { SiteTemplateProps } from './shared';
import {
  FooterBlock,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  SiteShell,
} from './shared';
import { SiteCaptureBand } from './SiteCaptureForms';

export function ModernCleanTemplate({
  content,
  theme,
  className,
  siteSlug,
  preview,
}: SiteTemplateProps) {
  const { meta, branding, slots } = content;
  const heroPhoto = slots.hero.photoUrl || branding.heroImageUrl;

  return (
    <SiteShell variant="modern" theme={theme} className={className}>
      {/* Full-bleed hero */}
      <section className="relative min-h-[70vh] flex items-end">
        <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--site-primary)_12%,transparent)]">
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroPhoto}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, color-mix(in oklab, var(--site-fg) 75%, transparent), transparent 55%)',
            }}
          />
        </div>
        <div className="relative z-10 w-full px-6 pb-12 pt-24 text-white">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-90 mb-3">
              {meta.candidateName} · {meta.office}
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
              {slots.hero.headline}
            </h1>
            {slots.hero.subheadline && (
              <p className="mt-4 text-lg opacity-90 max-w-xl">
                {slots.hero.subheadline}
              </p>
            )}
            <div className="mt-8">
              <PrimaryButton href={slots.hero.ctaHref}>
                {slots.hero.ctaLabel || 'Get involved'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </section>

      {/* about */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <SectionLabel>About</SectionLabel>
          <h2 className="text-3xl font-semibold tracking-tight mb-5">
            Why I&apos;m running
          </h2>
          <p className="text-lg leading-relaxed opacity-90 whitespace-pre-wrap">
            {slots.about.body}
          </p>
        </div>
      </section>

      {/* issues — horizontal strip */}
      <section className="px-6 py-12 border-y" style={{ borderColor: 'color-mix(in oklab, var(--site-fg) 10%, transparent)' }}>
        <div className="max-w-5xl mx-auto">
          <SectionLabel>Issues</SectionLabel>
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {(slots.issues.items.length
              ? slots.issues.items
              : [{ title: 'Issue', summary: 'Add priorities in the editor.' }]
            ).map((item, i) => (
              <div key={`${item.title}-${i}`}>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--site-accent)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-sm opacity-80 leading-relaxed">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* endorsements */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <SectionLabel>Endorsements</SectionLabel>
          {(slots.endorsements.items.length
            ? slots.endorsements.items
            : [{ name: 'Endorser', quote: 'Add an endorsement.' }]
          ).map((item, i) => (
            <blockquote key={`${item.name}-${i}`} className="border-l-2 pl-5" style={{ borderColor: 'var(--site-accent)' }}>
              {item.quote && (
                <p className="text-xl leading-snug mb-3">&ldquo;{item.quote}&rdquo;</p>
              )}
              <footer className="text-sm opacity-80">
                <span className="font-medium">{item.name}</span>
                {item.role ? `, ${item.role}` : ''}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="px-6 py-16" style={{ backgroundColor: 'var(--site-primary)', color: '#fff' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {slots.cta.headline}
          </h2>
          {slots.cta.body && (
            <p className="mt-3 opacity-90">{slots.cta.body}</p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={slots.cta.primaryHref || '#signup'}
              className="inline-flex px-5 py-2.5 text-sm font-medium bg-white"
              style={{
                color: 'var(--site-primary)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              {slots.cta.primaryLabel}
            </a>
            {slots.cta.secondaryLabel && (
              <SecondaryButton href={slots.cta.secondaryHref || '#volunteer'}>
                <span className="text-white border-white/40">{slots.cta.secondaryLabel}</span>
              </SecondaryButton>
            )}
          </div>
        </div>
      </section>

      {siteSlug ? (
        <SiteCaptureBand
          siteSlug={siteSlug}
          preview={preview}
          candidateName={meta.candidateName}
        />
      ) : null}

      <FooterBlock content={content} />
    </SiteShell>
  );
}
