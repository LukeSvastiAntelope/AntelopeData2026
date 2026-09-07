'use client'

import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HandCoins, Upload, Database, FileText, Mail, Filter, Sparkles, Send, Scale } from 'lucide-react'

export default function FundraisingPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <HandCoins className="h-4 w-4" />
              Fundraising
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-5xl space-y-6">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload your list
                    </CardTitle>
                    <CardDescription>
                      Bring your own data (CSV/Excel/TSV/TXT, and Word .docx). Segment with commands like “isolate women 35+
                      without college degrees” and export a new file.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <Link href="/fundraising/upload">Start</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Get electoral data
                    </CardTitle>
                    <CardDescription>
                      Choose from data providers (e.g. NCSL and other public electoral datasets) and import into Antelope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/fundraising/data">Browse options</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Fundraising reports
                    </CardTitle>
                    <CardDescription>
                      View analysis reports and optionally pin selected insights to the dashboard map.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/fundraising/reports">Open</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="text-xs text-muted-foreground">
                Note: The “Get electoral data” path is a UI stub until we wire provider APIs/contracts and billing.
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Targeted outreach from the electoral register</CardTitle>
                  <CardDescription>
                    Build a customized address list, layer demographic assumptions into message variants, and run a repeatable
                    workflow from upload through send. Example: upload an electoral register, isolate women under 35 in
                    congressional district 11, then mass-send a message tuned to likely voting patterns for that slice.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ol className="list-decimal list-inside space-y-4 text-sm text-muted-foreground">
                    <li>
                      <span className="text-foreground font-medium">Import the register.</span>{' '}
                      Upload your authorized electoral or voter file (standard columns: name, address, district, age band or DOB,
                      sex where permitted, party or turnout history if available). Antelope normalizes fields so filters apply
                      consistently across jurisdictions.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Isolate your universe.</span>{' '}
                      Use natural-language or structured filters—for example, “women under 35 in district 11”—to produce a
                      deduplicated list of deliverable addresses (and optional channels: mail, SMS, email where you have consent).
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Define message cores and variants.</span>{' '}
                      Start from a core script (fundraising ask, turnout reminder, issue framing). Attach demographic “assumption
                      tags” (e.g. younger voters, suburban district) so the system can generate or select variant copy that stays
                      on-brand while reflecting those priors—always review before send.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Preview and approve.</span>{' '}
                      Spot-check a sample of rows with merged fields (name, salutation, district-specific lines) and run a small
                      test cohort before full rollout.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Execute the send workflow.</span>{' '}
                      Queue the batch through your connected channels (print/mail house export, compliant SMS/email providers),
                      with logging tied back to the same list version for reporting and follow-up.
                    </li>
                  </ol>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
                      <Filter className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Custom list builder</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Combine geography (district, precinct), demographics, and past engagement to define exactly who receives
                          each wave.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
                      <Mail className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Address + message pairing</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Each row can carry a resolved address and a chosen message template or AI-assisted variant keyed to your
                          demographic assumptions.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
                      <Sparkles className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Demographic-informed copy</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Map segments to message cores (e.g. turnout vs persuasion) so bulk output stays coherent while reflecting
                          the slice you targeted.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
                      <Send className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Mass send orchestration</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          One workflow from approved list to channel dispatch, with versioning so you can reproduce or audit a wave.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                    <Scale className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Use only data you are legally entitled to use for outreach. Electoral register rules, consent, and “Do Not
                      Contact” lists vary by state and country—confirm compliance before uploading or messaging.
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href="/fundraising/upload">Start with list upload &amp; segmentation</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/fundraising/data">Electoral data sources</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

