'use client';

import Link from 'next/link';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import LogoText from '@/components/logo-text';

// Primary marketing nav — the "usual columns" for a public SaaS site.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Solutions', href: '/solutions' },
  { label: 'Who We Serve', href: '/who-we-serve' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Resources', href: '/resources' },
  { label: 'Why Antelope', href: '/about#why-antelope' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const LEGAL_LINKS: { label: string; href: string }[] = [
  { label: 'Privacy Policy', href: '/companypolicy/privacypolicy' },
  { label: 'Terms & Conditions', href: '/companypolicy/termsandconditions' },
];

/**
 * Site-wide public header: hamburger + logo + primary nav + legal links + auth CTAs.
 * Rendered once inside PublicLayout so it appears consistently across every
 * public marketing page (home, about, blog, pricing, resources, solutions, etc).
 */
export function PublicTopNav() {
  return (
    <header className="border-b border-border bg-background">
      <div className="px-6 py-4">
        {/* Utility row */}
        <div className="flex items-center justify-between gap-3">
          <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/auth/login" className="text-sm font-semibold text-primary hover:underline">
              Login
            </Link>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/auth/register">Sign Up Free</Link>
            </Button>
          </div>
        </div>

        {/* Logo row */}
        <div className="mt-4 flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <LogoText className="text-zinc-900 dark:text-zinc-100" width={140} height={34} />
          </Link>
        </div>

        {/* Primary nav row */}
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Legal row */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {LEGAL_LINKS.map((l, i) => (
            <span key={l.href} className="flex items-center gap-x-4">
              {i > 0 && <span className="text-xs text-muted-foreground/40">·</span>}
              <Link
                href={l.href}
                className="text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
