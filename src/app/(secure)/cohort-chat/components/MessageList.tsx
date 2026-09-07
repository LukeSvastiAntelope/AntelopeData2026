import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import ChartRenderer from '@/components/ChartRenderer';
import { cn } from '@/lib/utils';
import { ChatMessage } from '../types';
import MarkdownWithCitations from './MarkdownWithCitations';
import DataCards from './DataCards';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

type SourceLogo = {
  url: string;
  host: string;
  label: string;
};

type ParsedSource = SourceLogo & {
  raw: string;
};

function splitContentAndSources(content: string): { mainContent: string; sources: ParsedSource[] } {
  if (!content) return { mainContent: content, sources: [] };
  const markerMatch = content.match(/\n##\s*Sources\s*\n/i) || content.match(/^##\s*Sources\s*\n/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return { mainContent: content, sources: [] };
  }

  const splitAt = markerMatch.index;
  const mainContent = content.slice(0, splitAt).trim();
  const sourcesBlock = content.slice(splitAt + markerMatch[0].length);
  const lines = sourcesBlock
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sources: ParsedSource[] = [];
  const seenUrls = new Set<string>();

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s)]+/i);
    if (!urlMatch) continue;
    const url = urlMatch[0];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const labelMatch = line.match(/\[([^\]]+)\]/);
      sources.push({
        url,
        host,
        label: labelMatch?.[1] || host,
        raw: line,
      });
    } catch {
      continue;
    }
  }

  return { mainContent: mainContent || content, sources };
}

function uniqueSourceLogos(sources: ParsedSource[]): SourceLogo[] {
  const logos: SourceLogo[] = [];
  const seenHosts = new Set<string>();
  for (const source of sources) {
    if (seenHosts.has(source.host)) continue;
    seenHosts.add(source.host);
    logos.push({ url: source.url, host: source.host, label: source.label });
  }
  return logos.slice(0, 12);
}

// Python-interpreter-style trace of how a result was computed. Shown live
// (expanded) while the analysis runs, and as a collapsible block afterward.
function InterpreterTrace({ steps, live = false }: { steps: string[]; live?: boolean }) {
  const [open, setOpen] = useState(live);
  const block = (
    <pre className="mt-1 rounded-md border bg-muted/60 p-2 text-[11px] leading-relaxed font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
      {steps.map((step, i) => (
        <div key={i}>
          <span className="text-primary/70">&gt;&gt;&gt;</span> {step}
        </div>
      ))}
    </pre>
  );
  if (live) return block;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span>🐍</span> {open ? 'Hide' : 'Show'} analysis steps
      </button>
      {open && block}
    </div>
  );
}

function AgentMessageBody({ message }: { message: ChatMessage }) {
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const rawContent = typeof message.content === 'string' ? message.content : '';
  const { mainContent, sources } = splitContentAndSources(rawContent);
  const sourceLogos = uniqueSourceLogos(sources);
  const visibleLogos = sourceLogos.slice(0, 6);
  const remaining = sourceLogos.length - visibleLogos.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-1">
        {(!rawContent || rawContent.trim() === '') ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                {message.thinkingSteps && message.thinkingSteps.length > 0 ? 'Running analysis…' : 'Thinking…'}
              </span>
            </div>
            {message.thinkingSteps && message.thinkingSteps.length > 0 && (
              <InterpreterTrace steps={message.thinkingSteps} live />
            )}
          </div>
        ) : (
          <>
            <MarkdownWithCitations text={mainContent} citations={message.citations} isUpload={message.isUpload} />
            {message.thinkingSteps && message.thinkingSteps.length > 0 && (
              <InterpreterTrace steps={message.thinkingSteps} />
            )}
          </>
        )}

        {message.dataCards && <DataCards dataCards={message.dataCards} />}

        {sourceLogos.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {visibleLogos.map((src, sourceIdx) => (
                  <a
                    key={`${src.host}-${sourceIdx}`}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    title={src.label}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-background overflow-hidden bg-muted"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(src.host)}`}
                      alt={src.label}
                      className="h-4 w-4 rounded-full"
                    />
                  </a>
                ))}
                {remaining > 0 && (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-background bg-muted text-[10px] text-muted-foreground">
                    +{remaining}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setShowSourceDetails((v) => !v)}
              >
                {showSourceDetails ? 'Hide source details' : 'View source details'}
              </button>
            </div>

            {showSourceDetails && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-1">
                {sources.map((source, idx) => (
                  <a
                    key={`${source.url}-${idx}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-muted-foreground hover:text-foreground hover:underline break-all"
                  >
                    {idx + 1}. {source.label} — {source.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function MessageList({ 
  messages, 
  isLoading, 
  messagesEndRef
}: MessageListProps) {
  // Detect if the last message is an agent placeholder awaiting streamed content
  const lastMessage = messages[messages.length - 1];
  const hasAgentPlaceholder = !!lastMessage && lastMessage.role === 'agent' && (!lastMessage.content || lastMessage.content.trim() === '');
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-4 space-y-6">
        {messages.map((m, idx) => (
          <div 
            key={(m as any).id ?? idx}
            className="text-sm animate-in fade-in duration-500"
            style={{ 
              animationDelay: `${Math.min(idx * 50, 500)}ms`,
              animationFillMode: 'both'
            }}
          >
            <div className={cn(
              'rounded-lg px-4 py-3 max-w-[85%] chat-message',
              m.role === 'user' ? 'bg-primary text-primary-foreground' : 'text-foreground'
            )}>
              {m.role === 'agent' ? (
                <AgentMessageBody message={m} />
              ) : (
                <div className="font-medium text-primary-foreground">
                  {m.content}
                </div>
              )}
              {m.role === 'agent' && m.chartSpec && (
                <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                  <ChartRenderer spec={m.chartSpec} />
                </div>
              )}
            </div>
          </div>
        ))}
        {(isLoading && !hasAgentPlaceholder) && (
          <div className="text-sm animate-in fade-in duration-500">
            <div className="rounded-lg px-4 py-3 max-w-[85%] chat-message text-foreground">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        {/* Auto-scroll target */}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
} 