'use client'

import { useMemo, useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Scale, CalendarDays, ExternalLink, MessageSquareText, Search } from 'lucide-react'

type ComplianceItem = {
  id: string
  dateLabel: string
  title: string
  description: string
  links: Array<{ label: string; href: string }>
  tags: string[]
}

const ITEMS: ComplianceItem[] = [
  {
    id: 'fec-registration',
    dateLabel: 'Start of campaign',
    title: 'Register your committee (Statement of Organization)',
    description:
      'Most federal committees must file Form 1 to register and designate a treasurer. Also consider Form 2 (candidate) where applicable.',
    links: [
      { label: 'FEC Form 1 (Statement of Organization)', href: 'https://www.fec.gov/help-candidates-and-committees/forms/' },
      { label: 'Committee registration overview', href: 'https://www.fec.gov/help-candidates-and-committees/registering-candidate/' },
    ],
    tags: ['registration', 'treasurer', 'committee'],
  },
  {
    id: 'fec-48hr-notices',
    dateLabel: '24 hours after certain contributions',
    title: '48-hour notices (large contributions)',
    description:
      'In the final stretch before an election, some contributions require rapid notification. Verify thresholds and election window for your committee type.',
    links: [
      { label: 'FEC: 24/48-hour reporting', href: 'https://www.fec.gov/help-candidates-and-committees/filing-reports/24-and-48-hour-reports/' },
    ],
    tags: ['last-minute', 'notices', 'rapid'],
  },
  {
    id: 'monthly-quarterly',
    dateLabel: 'Monthly / Quarterly',
    title: 'Periodic reports (disbursements + receipts)',
    description:
      'Most committees must file periodic reports. Exact schedule depends on committee type and election cycle. Keep receipts/disbursements categorized correctly.',
    links: [
      { label: 'FEC: Reporting schedules', href: 'https://www.fec.gov/help-candidates-and-committees/filing-reports/reporting-schedules/' },
      { label: 'FEC: Forms & filing resources', href: 'https://www.fec.gov/help-candidates-and-committees/forms/' },
    ],
    tags: ['reports', 'periodic', 'receipts', 'disbursements'],
  },
  {
    id: 'pre-post-general',
    dateLabel: 'Pre-election / Post-election',
    title: 'Pre- and post-election reports',
    description:
      'Pre- and post-election reports often have specific coverage dates and deadlines. Confirm for your election and committee type.',
    links: [
      { label: 'FEC: Election reporting', href: 'https://www.fec.gov/help-candidates-and-committees/filing-reports/election-reporting/' },
    ],
    tags: ['election', 'deadlines'],
  },
  {
    id: 'ie-24-48',
    dateLabel: '24/48 hours after communications spend',
    title: 'Independent expenditure reporting (if applicable)',
    description:
      'If you make independent expenditures, additional fast-turn reporting may apply depending on timing and amount.',
    links: [
      { label: 'FEC: Independent expenditures', href: 'https://www.fec.gov/help-candidates-and-committees/independent-expenditures/' },
    ],
    tags: ['independent-expenditures', 'fast-turn'],
  },
  {
    id: 'disclaimer-ads',
    dateLabel: 'Before publishing ads',
    title: 'Disclaimers on public communications',
    description:
      'Many political communications require “paid for by” disclaimers, with variations based on medium and sponsor. Validate for your jurisdiction and committee type.',
    links: [
      { label: 'FEC: Disclaimers overview', href: 'https://www.fec.gov/help-candidates-and-committees/advertising-and-disclaimers/' },
    ],
    tags: ['ads', 'disclaimers', 'communications'],
  },
]

function matchesQuery(item: ComplianceItem, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [
    item.title,
    item.description,
    item.dateLabel,
    item.tags.join(' '),
  ].join(' ').toLowerCase()
  return hay.includes(s)
}

function MiniChatWidget() {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 w-[320px] max-w-[90vw] rounded-lg border border-border/60 bg-background/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" />
              <div className="text-sm font-medium">Compliance Agent (preview)</div>
            </div>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
          <div className="p-3 text-sm space-y-2 max-h-[260px] overflow-auto">
            <div className="text-muted-foreground">
              This assistant will help smaller campaigns with filing workflows, checklists, and routing to recommended legal/tax/elections experts.
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">Example questions:</div>
              <ul className="text-xs mt-1 space-y-1">
                <li>- “What do I file first after forming a committee?”</li>
                <li>- “What’s my next deadline and what records do I need?”</li>
                <li>- “Does this ad need a disclaimer?”</li>
              </ul>
            </div>
          </div>
          <div className="p-3 border-t border-border/60">
            <Textarea
              rows={2}
              disabled
              placeholder="Ask a compliance question… (coming soon)"
              className="resize-none"
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => setOpen(o => !o)}
        className="rounded-full shadow-lg"
        size="lg"
        variant="default"
      >
        <MessageSquareText className="h-4 w-4 mr-2" />
        Compliance chat
      </Button>
    </div>
  )
}

export default function CompliancePage() {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => ITEMS.filter(i => matchesQuery(i, query)), [query])

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Compliance
              </h1>
            </div>
            <div className="w-full max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search deadlines, forms, disclaimers…"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 max-w-5xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Key filing moments & forms (FEC-focused)
              </CardTitle>
              <CardDescription>
                This is a navigable checklist-style hub. Deadlines vary by committee type and election calendar—always verify on the FEC site.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[62vh] overflow-auto pr-2">
                <div className="space-y-3">
                  {filtered.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">{item.dateLabel}</div>
                          <div className="text-sm font-medium">{item.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {item.description}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.tags.map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {item.links.map((l) => (
                            <Button key={l.href} variant="outline" size="sm" asChild>
                              <a href={l.href} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                {l.label}
                              </a>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {filtered.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No matches. Try searching “Form 1”, “disclaimer”, “24-hour”, or “quarterly”.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <MiniChatWidget />
    </div>
  )
}

