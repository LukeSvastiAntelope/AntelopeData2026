'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Clapperboard } from 'lucide-react';
import {
  VideoStudio,
  type VideoStudioPrefill,
} from '@/components/spread/video-studio';

function SpreadVideoInner() {
  const searchParams = useSearchParams();
  const prefill = useMemo<VideoStudioPrefill>(() => {
    const draftRaw =
      searchParams.get('draft') || searchParams.get('prefillDraft');
    const draftId = draftRaw ? Number(draftRaw) : null;
    const kindRaw = searchParams.get('kind');
    const tabRaw = searchParams.get('tab');
    return {
      draftId:
        draftId != null && Number.isFinite(draftId) && draftId > 0
          ? draftId
          : null,
      kind:
        kindRaw === 'clip' || kindRaw === 'explainer'
          ? kindRaw
          : null,
      tab: tabRaw === 'clip' ? 'clip' : 'generate',
    };
  }, [searchParams]);

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
              Generate + Clip
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
          <VideoStudio prefill={prefill} />
        </div>
      </div>
    </div>
  );
}

export default function SpreadVideoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-6 text-sm text-muted-foreground">
          Loading video studio…
        </div>
      }
    >
      <SpreadVideoInner />
    </Suspense>
  );
}
