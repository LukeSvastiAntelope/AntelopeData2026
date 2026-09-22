'use client';

/**
 * Community Local — warm, neighborly district feel.
 */

import type { SiteTemplateProps } from './shared';
import {
  FooterBlock,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  SiteShell,
} from './shared';

export function CommunityLocalTemplate({
  content,
  theme,
  className,
}: SiteTemplateProps) {
  const { meta, branding, slots } = content;
  const heroPhoto = slots.hero.photoUrl || branding.heroImageUrl;

  return (
    <SiteShell variant="community" theme={theme} className={className}>
      <header className="px-6 pt-8 pb-4">
        <div className="max-w-4xl mx-auto text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em] mb-2"
            style={{ color: 'var(--site-accent)' }}
          >
            {meta.office}
            {meta.partyLabel ? ` · ${meta.partyLabel}` : ''}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{meta.candidateName}</p>
        </div>
      </header>

      {/* hero */}
      <section className="px-6 pb-12">
        <div className="max-w-4xl mx-auto">
          <div
            className="overflow-hidden mb-8 min-h-[220px] bg-[color-mix(in_oklab,var(--site-primary)_10%,transparent)]"
            style={{ borderRadius: 'calc(var(--site-radius) * 1.5)' }}
          >
            {heroPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroPhoto}
                alt=""
                className="w-full max-h-[360px] object-cover"
              />
            ) : (
              <div className="flex items-center justify-center min-h-[220px] text-sm opacity-50">
                Neighborhood photo
              </div>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center leading-tight">
            {slots.hero.headline}
          </h1>
          {slots.hero.subheadline && (
            <p className="mt-4 text-center text-lg opacity-80 max-w-2xl mx-auto leading-relaxed">
              {slots.hero.subheadline}
            </p>
          )}
          <div className="mt-8 flex justify-center">
            <PrimaryButton href={slots.hero.ctaHref}>
              {slots.hero.ctaLabel || 'Join us'}
            </PrimaryButton>
          </div>
        </div>
      </section>

      {/* about */}
      <section
        className="px-6 py-12"
        style={{
          backgroundColor: 'color-mix(in oklab, var(--site-accent) 12%, transparent)',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <SectionLabel>Our story</SectionLabel>
          <h2 className="text-2xl font-semibold mb-4">From this community</h2>
          <p className="leading-relaxed whitespace-pre-wrap opacity-90">
            {slots.about.body}
          </p>
        </div>
      </section>

      {/* issues */}
      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <SectionLabel>On the issues</SectionLabel>
          <h2 className="text-2xl font-semibold mb-6">Listening. Then delivering.</h2>
          <ul className="space-y-4">
            {(slots.issues.items.length
              ? slots.issues.items
              : [{ title: 'Local priority', summary: 'Add issues in the editor.' }]
            ).map((item, i) => (
              <li
                key={`${item.title}-${i}`}
                className="flex gap-4 p-4 bg-[color-mix(in_oklab,var(--site-primary)_6%,transparent)]"
                style={{ borderRadius: 'var(--site-radius)' }}
              >
                <span
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--site-primary)' }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm opacity-80 mt-1 leading-relaxed">{item.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* endorsements */}
      <section className="px-6 py-12 border-t" style={{ borderColor: 'color-mix(in oklab, var(--site-fg) 10%, transparent)' }}>
        <div className="max-w-4xl mx-auto">
          <SectionLabel>Neighbors say</SectionLabel>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(slots.endorsements.items.length
              ? slots.endorsements.items
              : [{ name: 'Neighbor', quote: 'Add a local endorsement.' }]
            ).map((item, i) => (
              <div
                key={`${item.name}-${i}`}
                className="p-5 border"
                style={{
                  borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)',
                  borderRadius: 'var(--site-radius)',
                }}
              >
                {item.quote && (
                  <p className="leading-relaxed mb-3">&ldquo;{item.quote}&rdquo;</p>
                )}
                <p className="text-sm font-semibold">{item.name}</p>
                {item.role && <p className="text-xs opacity-70">{item.role}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="px-6 py-14">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{slots.cta.headline}</h2>
          {slots.cta.body && (
            <p className="mt-3 opacity-80">{slots.cta.body}</p>
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
