'use client';

import Link from 'next/link';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Clapperboard } from 'lucide-react';
import { VideoStudio } from '@/components/spread/video-studio';

export default function SpreadVideoPage() {
  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center flex-wrap gap-2">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Clapperboard className="h-4 w-4" />
              Spread · Video
            </h1>
            <Badge variant="secondary" className="ml-1">
              Generate
            </Badge>
            <Link
              href="/spread"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Back to Spread
            </Link>
          </div>
        </div>
        <div className="border-b border-border" />
        <div className="p-6">
          <VideoStudio />
        </div>
      </div>
    </div>
  );
}
