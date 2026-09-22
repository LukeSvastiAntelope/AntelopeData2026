'use client';

/**
 * Classic Civic — traditional campaign layout with navy/serif hierarchy.
 * Named slots only: hero, about, issues, endorsements, cta, footer.
 */

import type { SiteTemplateProps } from './shared';
import {
  FooterBlock,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  SiteShell,
} from './shared';

export function ClassicCivicTemplate({
  content,
  theme,
  className,
}: SiteTemplateProps) {
  const { meta, branding, slots } = content;
  const heroPhoto = slots.hero.photoUrl || branding.heroImageUrl;

  return (
    <SiteShell variant="classic" theme={theme} className={className}>
      <header className="border-b px-6 py-4" style={{ borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold tracking-tight">{meta.candidateName}</p>
            <p className="text-sm opacity-70">{meta.office}</p>
          </div>
          {meta.partyLabel && (
            <span
              className="text-xs font-semibold uppercase tracking-wide px-2 py-1"
              style={{
                color: 'var(--site-primary)',
                border: '1px solid color-mix(in oklab, var(--site-primary) 40%, transparent)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              {meta.partyLabel}
            </span>
          )}
        </div>
      </header>

      {/* hero */}
      <section className="px-6 py-14 md:py-20">
        <div className="max-w-5xl mx-auto grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <SectionLabel>For {meta.office}</SectionLabel>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
              {slots.hero.headline}
            </h1>
            {slots.hero.subheadline && (
              <p className="mt-4 text-lg opacity-80 leading-relaxed">
                {slots.hero.subheadline}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryButton href={slots.hero.ctaHref}>
                {slots.hero.ctaLabel || 'Join the campaign'}
              </PrimaryButton>
            </div>
          </div>
          <div
            className="min-h-[240px] bg-[color-mix(in_oklab,var(--site-primary)_8%,transparent)] overflow-hidden"
            style={{ borderRadius: 'var(--site-radius)' }}
          >
            {heroPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroPhoto}
                alt=""
                className="w-full h-full object-cover min-h-[240px]"
              />
            ) : (
              <div className="flex items-center justify-center min-h-[240px] text-sm opacity-50 px-6 text-center">
                Add a hero photo in the editor
              </div>
            )}
          </div>
        </div>
      </section>

      {/* about */}
      <section className="px-6 py-12 bg-[color-mix(in_oklab,var(--site-primary)_4%,transparent)]">
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-start">
          <div>
            <SectionLabel>About</SectionLabel>
            <h2 className="text-2xl font-semibold mb-4">Meet {meta.candidateName}</h2>
            <p className="leading-relaxed whitespace-pre-wrap opacity-90">
              {slots.about.body}
            </p>
          </div>
          <div
            className="min-h-[180px] bg-[color-mix(in_oklab,var(--site-fg)_6%,transparent)] overflow-hidden"
            style={{ borderRadius: 'var(--site-radius)' }}
          >
            {slots.about.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slots.about.photoUrl}
                alt=""
                className="w-full h-full object-cover min-h-[180px]"
              />
            ) : (
              <div className="flex items-center justify-center min-h-[180px] text-sm opacity-50">
                Portrait photo
              </div>
            )}
          </div>
        </div>
      </section>

      {/* issues */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <SectionLabel>Priorities</SectionLabel>
          <h2 className="text-2xl font-semibold mb-8">What I&apos;ll fight for</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(slots.issues.items.length
              ? slots.issues.items
              : [{ title: 'Your issue', summary: 'Add issue copy in the editor.' }]
            ).map((item, i) => (
              <div
                key={`${item.title}-${i}`}
                className="p-5 border"
                style={{
                  borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
                  borderRadius: 'var(--site-radius)',
                }}
              >
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm opacity-80 leading-relaxed">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* endorsements */}
      <section className="px-6 py-12 bg-[color-mix(in_oklab,var(--site-primary)_4%,transparent)]">
        <div className="max-w-5xl mx-auto">
          <SectionLabel>Endorsements</SectionLabel>
          <h2 className="text-2xl font-semibold mb-8">Who stands with us</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {(slots.endorsements.items.length
              ? slots.endorsements.items
              : [{ name: 'Endorser', quote: 'Add an endorsement.' }]
            ).map((item, i) => (
              <blockquote
                key={`${item.name}-${i}`}
                className="p-5 border bg-[var(--site-bg,white)]"
                style={{
                  borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
                  borderRadius: 'var(--site-radius)',
                }}
              >
                {item.quote && (
                  <p className="text-base leading-relaxed mb-3">&ldquo;{item.quote}&rdquo;</p>
                )}
                <footer className="text-sm">
                  <span className="font-semibold">{item.name}</span>
                  {item.role && <span className="opacity-70"> — {item.role}</span>}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="px-6 py-14">
        <div
          className="max-w-5xl mx-auto p-8 md:p-10 text-center"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--site-primary) 10%, transparent)',
            borderRadius: 'var(--site-radius)',
          }}
        >
          <h2 className="text-3xl font-semibold">{slots.cta.headline}</h2>
          {slots.cta.body && (
            <p className="mt-3 opacity-80 max-w-xl mx-auto">{slots.cta.body}</p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PrimaryButton href={slots.cta.primaryHref}>
              {slots.cta.primaryLabel}
            </PrimaryButton>
            {slots.cta.secondaryLabel && (
              <SecondaryButton href={slots.cta.secondaryHref}>
                {slots.cta.secondaryLabel}
              </SecondaryButton>
            )}
          </div>
        </div>
      </section>

      <FooterBlock content={content} />
    </SiteShell>
  );
}
