'use client';

import Link from 'next/link';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, ShieldAlert, Sparkles } from 'lucide-react';
import { ConsultantPanel } from '@/components/consultant/consultant-panel';

/**
 * Prominent consultant surface. Uses the same self-contained ConsultantPanel
 * as the dock — chat-first full-screen landing can reuse this without a rewrite.
 */
export default function CampaignConsultantPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background min-h-0">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg flex flex-col min-h-[calc(100vh-1rem)]">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center min-w-0">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-medium text-card-foreground truncate">
                    Campaign Consultant
                  </h1>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Intake agent
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Produces artifacts and staged actions — not generic advice. Workflow sidebar stays usable.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] flex-1 min-h-0">
          <aside className="border-b lg:border-b-0 lg:border-r border-border p-4 space-y-4 overflow-y-auto">
            <Card className="bg-muted/30 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  How this works
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-muted-foreground space-y-1.5">
                <p>1. Tell it the office and place you&apos;re running.</p>
                <p>2. It asks for voter files / documents it needs.</p>
                <p>3. Private tools run inline (drafts, district data, analytics).</p>
                <p>4. Anything that goes public waits behind Approve.</p>
              </CardContent>
            </Card>

            <Card className="bg-amber-500/5 border-amber-500/30 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  Review before it goes out
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-muted-foreground space-y-1.5">
                <p>
                  Publish, SMS, email, webhooks, charges, and video posts never auto-run.
                  Same approval language as Auto-Post.
                </p>
              </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground px-1">
              Ready today: Plan, Know, Ask, Understand. Spread/Act stay honest stubs until outbound is real.
            </p>
          </aside>

          <section className="min-h-[560px] lg:min-h-0 flex flex-col">
            <ConsultantPanel variant="page" className="flex-1 border-0 rounded-none shadow-none" />
          </section>
        </div>
      </div>
    </div>
  );
}
