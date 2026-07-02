import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import LogoText from '@/components/logo-text'

/**
 * Shared, publicly-accessible legal document layout (Terms, Privacy).
 * Renders markdown with clean, readable prose styling — no auth required so
 * carriers, reviewers, and recipients can reach it directly.
 */
export function LegalDoc({
  title,
  updated,
  markdown,
}: {
  title: string
  updated?: string
  markdown: string
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center">
            <LogoText className="text-zinc-900 dark:text-zinc-100" width={120} height={30} />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/companypolicy/termsandconditions" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/companypolicy/privacypolicy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Antelope Data, Inc.{updated ? ` · ${updated}` : ''}
        </p>

        <div className="mt-10 space-y-5 text-[15px] leading-7 text-foreground/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 className="mt-10 border-t pt-8 text-xl font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-6 text-base font-semibold text-foreground">{children}</h3>
              ),
              p: ({ children }) => <p className="leading-7">{children}</p>,
              ul: ({ children }) => (
                <ul className="my-3 list-disc space-y-2 pl-6 marker:text-muted-foreground">
                  {children}
                </ul>
              ),
              li: ({ children }) => <li className="leading-7">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a href={href} className="font-medium text-primary underline underline-offset-2">
                  {children}
                </a>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        <footer className="mt-16 border-t pt-6 text-sm text-muted-foreground">
          <p>
            <a href="https://antelopedata.org" className="hover:text-foreground">
              antelopedata.org
            </a>{' '}
            ·{' '}
            <a href="mailto:lukesvasti@antelopedata.org" className="hover:text-foreground">
              lukesvasti@antelopedata.org
            </a>
          </p>
          <p className="mt-1">© 2026 Antelope Data, Inc. All rights reserved.</p>
        </footer>
      </main>
    </div>
  )
}
