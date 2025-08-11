import React from 'react';
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

export function MessageList({ 
  messages, 
  isLoading, 
  messagesEndRef
}: MessageListProps) {
  return (
    <ScrollArea className="flex-1 min-h-0" style={{ paddingBottom: '96px' }}>
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
              m.role === 'user' ? 'bg-primary text-white' : 'text-foreground'
            )}>
              {m.role === 'agent' ? (
                <TooltipProvider delayDuration={150}>
                  <div className="space-y-1">
                    {/* Content first, then charts - updated order */}
                    <MarkdownWithCitations text={m.content} citations={m.citations} isUpload={m.isUpload} />
                    {m.dataCards && <DataCards dataCards={m.dataCards} />}
                  </div>
                </TooltipProvider>
              ) : (
                <div className="font-medium text-white">
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
        {isLoading && (
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