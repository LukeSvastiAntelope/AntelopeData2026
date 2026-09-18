'use client';

import Link from 'next/link';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clapperboard, Megaphone, Webhook } from 'lucide-react';

export default function SpreadPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Spread
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6 max-w-3xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Distribution hub</h2>
            <p className="text-muted-foreground">
              Reach voters with video, channels, and partner webhooks. Video generation is live;
              clipping plugins land next.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4" />
                <h3 className="font-medium">Video studio</h3>
                <Badge variant="secondary">Live</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Describe a clip in plain words, or clip a long speech into ranked shorts (Opus /
                Klap). Preview, then approve for post — never auto-posts.
              </p>
              <Button asChild size="sm">
                <Link href="/spread/video">Open video studio</Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-3 opacity-80">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                <h3 className="font-medium">Channels & webhooks</h3>
                <Badge variant="outline">Soon</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Email, SMS, QR, and partner webhooks stay available from Surveys for now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
