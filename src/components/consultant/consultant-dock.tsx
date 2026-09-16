'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConsultantPanel } from '@/components/consultant/consultant-panel';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'antelope.consultant.dockOpen';

/**
 * Persistent, dockable consultant shell.
 * Self-contained so the same panel can later become a full-screen landing without a rewrite.
 * Does not gate or replace the workflow sidebar.
 */
export function ConsultantDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  const preferOpen = pathname === '/dashboard';
  const hideDock = pathname?.startsWith('/agents/campaign-consultant');

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (hideDock) {
      setOpen(false);
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setOpen(true);
      else if (stored === '0') setOpen(false);
      else if (preferOpen) setOpen(true);
    } catch {
      if (preferOpen) setOpen(true);
    }
  }, [preferOpen, hideDock]);

  if (hideDock) return null;

  const setDockOpen = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // Desktop: inline right rail (no overlay) so sidebar stays fully usable
  if (isDesktop) {
    return (
      <>
        {!open && (
          <button
            type="button"
            onClick={() => setDockOpen(true)}
            className={cn(
              'fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-md',
              'text-sm font-medium text-card-foreground hover:bg-accent transition-colors'
            )}
            aria-label="Open campaign consultant"
          >
            <Bot className="h-4 w-4" />
            Consultant
            {pendingCount > 0 && (
              <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{pendingCount}</Badge>
            )}
          </button>
        )}

        <aside
          className={cn(
            'shrink-0 border-l border-border bg-background transition-[width] duration-200 ease-out overflow-hidden',
            open ? 'w-[380px]' : 'w-0'
          )}
          aria-hidden={!open}
        >
          <div className="h-screen sticky top-0 w-[380px] flex flex-col">
            <div className="flex items-center justify-end px-2 py-1 border-b border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setDockOpen(false)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                Dock
              </Button>
            </div>
            <ConsultantPanel
              variant="dock"
              className="flex-1 min-h-0"
              onPendingCountChange={setPendingCount}
            />
          </div>
        </aside>
      </>
    );
  }

  // Mobile / narrow: sheet overlay
  return (
    <>
      <button
        type="button"
        onClick={() => setDockOpen(true)}
        className={cn(
          'fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-md',
          'text-sm font-medium text-card-foreground hover:bg-accent transition-colors'
        )}
        aria-label="Open campaign consultant"
      >
        <Bot className="h-4 w-4" />
        Consultant
        {pendingCount > 0 && (
          <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{pendingCount}</Badge>
        )}
      </button>

      <Sheet open={open} onOpenChange={setDockOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Campaign consultant</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-end px-2 py-1 border-b border-border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDockOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ConsultantPanel
            variant="dock"
            className="flex-1 min-h-0"
            onPendingCountChange={setPendingCount}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
