/**
 * Shared chrome for slot-based site templates.
 * Empty slots render defaults from SiteContent — never blank sections.
 */

'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { SiteContent, SiteTheme } from '@/app/utils/types/site';

export type SiteTemplateProps = {
  content: SiteContent;
  theme?: SiteTheme;
  /** Published site slug — required for live capture forms. */
  siteSlug?: string;
  /** When true, forms render disabled (builder live preview). */
  preview?: boolean;
  className?: string;
};

export function themeStyle(theme?: SiteTheme): CSSProperties {
  if (!theme) return {};
  return {
    ['--site-primary' as string]: theme.primaryColor || 'var(--primary)',
    ['--site-accent' as string]: theme.accentColor || 'var(--info)',
    ['--site-bg' as string]: theme.backgroundColor || 'var(--background)',
    ['--site-fg' as string]: theme.foregroundColor || 'var(--foreground)',
    ['--site-radius' as string]: theme.radius || 'var(--radius)',
    fontFamily: theme.fontFamily || 'var(--font-inter), system-ui, sans-serif',
    backgroundColor: theme.backgroundColor || undefined,
    color: theme.foregroundColor || undefined,
  };
}

export function SiteShell({
  theme,
  className,
  children,
  variant,
}: {
  theme?: SiteTheme;
  className?: string;
  children: ReactNode;
  variant: 'classic' | 'modern' | 'community';
}) {
  return (
    <div
      data-site-template={variant}
      className={`site-template antialiased ${className || ''}`}
      style={themeStyle(theme)}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-[0.14em] mb-3"
      style={{ color: 'var(--site-accent, var(--muted-foreground))' }}
    >
      {children}
    </p>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href || '#'}
      className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      style={{
        backgroundColor: 'var(--site-primary, var(--primary))',
        borderRadius: 'var(--site-radius, var(--radius))',
      }}
    >
      {children}
    </a>
  );
}

export function SecondaryButton({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href || '#'}
      className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium border transition-colors"
      style={{
        borderColor: 'var(--site-primary, var(--border))',
        color: 'var(--site-primary, var(--foreground))',
        borderRadius: 'var(--site-radius, var(--radius))',
      }}
    >
      {children}
    </a>
  );
}

export function FooterBlock({ content }: { content: SiteContent }) {
  const f = content.slots.footer;
  const socials = f.socials || {};
  return (
    <footer
      className="border-t mt-12 px-6 py-8 text-sm"
      style={{ borderColor: 'color-mix(in oklab, var(--site-fg) 12%, transparent)' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{content.meta.candidateName}</p>
          <p className="opacity-70">{content.meta.office}</p>
          {f.email && <p className="opacity-70 mt-1">{f.email}</p>}
          {f.phone && <p className="opacity-70">{f.phone}</p>}
          {f.address && <p className="opacity-70">{f.address}</p>}
        </div>
        <div className="flex flex-wrap gap-3 opacity-80">
          {socials.facebook && (
            <a href={socials.facebook} className="underline-offset-2 hover:underline">
              Facebook
            </a>
          )}
          {socials.x && (
            <a href={socials.x} className="underline-offset-2 hover:underline">
              X
            </a>
          )}
          {socials.instagram && (
            <a href={socials.instagram} className="underline-offset-2 hover:underline">
              Instagram
            </a>
          )}
          {socials.youtube && (
            <a href={socials.youtube} className="underline-offset-2 hover:underline">
              YouTube
            </a>
          )}
        </div>
      </div>
      {f.paidForBy && (
        <p className="max-w-5xl mx-auto mt-6 text-xs opacity-60">{f.paidForBy}</p>
      )}
    </footer>
  );
}
