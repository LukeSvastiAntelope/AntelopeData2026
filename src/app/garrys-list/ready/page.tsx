'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import LogoText from '@/components/logo-text'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Lock, Copy, KeyRound, ShieldAlert, ChevronDown } from 'lucide-react'

interface GeneratedQuestion {
  id: string
  type: string
  prompt: string
  options: { id: string; label: string }[]
}

interface ReadyData {
  status: boolean
  surveyId: number
  slug: string
  shortCode: string
  token: string
  publicUrl: string
  embedSnippet: string
  title: string
  previewQuestion: GeneratedQuestion
  allQuestions?: GeneratedQuestion[]
  breakdownsSummary: string[]
  methodologyNote: string
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        className="flex-1 h-10 px-3 rounded-md border border-input bg-muted/40 text-sm font-mono truncate"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success(`${label} copied`)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            toast.error('Could not copy')
          }
        }}
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

export default function GarrysListReadyPage() {
  const router = useRouter()
  const [data, setData] = useState<ReadyData | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('garrys-list-ready')
    if (!raw) {
      router.replace('/')
      return
    }
    try {
      setData(JSON.parse(raw))
    } catch {
      router.replace('/')
    }
  }, [router])

  if (!data) return null

  const remainingQuestions = data.allQuestions?.slice(1) || []
  const remainingOpinionCount = remainingQuestions.filter((q) => q.type === 'opinion').length
  const breakdownCount = data.breakdownsSummary?.length || 0

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
          <Link href="/" className="flex items-center">
            <LogoText className="text-zinc-900 dark:text-zinc-100" width={120} height={30} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border bg-background p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Survey ready
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Generated from your story · {data.title}</p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              <Lock className="h-3 w-3 mr-1" /> Locked
            </Badge>
          </div>

          {/* Preview */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-xs text-muted-foreground">Preview — reader sees</p>
            <p className="font-medium">{data.previewQuestion?.prompt}</p>
            <div className="flex flex-wrap gap-2">
              {data.previewQuestion?.options?.map((o) => (
                <span key={o.id} className="text-sm px-3 py-1 rounded-md border bg-muted/40">
                  {o.label}
                </span>
              ))}
            </div>
            {remainingQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                {remainingOpinionCount > 0 && `+${remainingOpinionCount} opinion question${remainingOpinionCount === 1 ? '' : 's'}`}
                {remainingOpinionCount > 0 && breakdownCount > 0 && ', '}
                {breakdownCount > 0 && `${breakdownCount} optional breakdown${breakdownCount === 1 ? '' : 's'} (${data.breakdownsSummary.join(', ')})`}
              </button>
            )}
            {expanded && remainingQuestions.length > 0 && (
              <div className="space-y-3 pt-2 border-t mt-2">
                {remainingQuestions.map((q, i) => (
                  <div key={q.id || i} className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {q.prompt}
                      {q.type === 'demographic' && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {q.options?.map((o) => (
                        <span key={o.id} className="text-xs px-2.5 py-1 rounded-md border bg-muted/40">
                          {o.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Token */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="h-4 w-4" /> Save this token to keep your survey respondent data
            </p>
            <p className="text-xs text-muted-foreground">
              This is the only key to your responses until you log in. We can&apos;t recover it. Store it somewhere safe.
            </p>
            <CopyField value={data.token} label="Token" />
          </div>

          {/* Public link */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Public survey link — live now, no login</p>
            <CopyField value={data.publicUrl} label="Survey link" />
          </div>

          {/* Embed */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Embed for your newsletter — one tap in the email</p>
            <CopyField value={data.embedSnippet} label="Embed code" />
          </div>

          {/* Edit callout */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="h-3.5 w-3.5" /> Want to edit the questions?
            </p>
            <p className="text-xs text-muted-foreground">
              The survey is locked so shared links never change under readers. Log in to edit wording, reorder, add
              questions, or see who&apos;s responding — your token carries the data over.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" asChild>
              <Link href={`/garrys-list/claim?surveyId=${data.surveyId}&token=${encodeURIComponent(data.token)}`}>Log in to edit ↗</Link>
            </Button>
            <Button asChild>
              <Link href={`/garrys-list/results?token=${encodeURIComponent(data.token)}`}>View results ↗</Link>
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground pt-2 border-t">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {data.methodologyNote}
          </p>
        </div>
      </main>
    </div>
  )
}
