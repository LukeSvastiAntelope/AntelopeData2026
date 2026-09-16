'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, Loader2, Send, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StagedActionCard, type StagedActionCardModel } from '@/components/consultant/staged-action-card';
import { useAgent } from '@/app/context/AgentContext';
import { cn } from '@/lib/utils';

type StoredMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  meta?: {
    kind?: 'text' | 'tool_result' | 'staged_notice';
    toolName?: string;
    risk?: 'auto' | 'approval';
    stagedActionId?: number;
    implemented?: boolean;
  };
  createdAt?: string;
};

type Props = {
  /** compact = dock rail; expanded = page embed */
  variant?: 'dock' | 'page';
  className?: string;
  /** Called after conversation loads / updates (e.g. to sync dock badge) */
  onPendingCountChange?: (count: number) => void;
};

export function ConsultantPanel({
  variant = 'dock',
  className,
  onPendingCountChange,
}: Props) {
  const { organization } = useAgent();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [staged, setStaged] = useState<StagedActionCardModel[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyStagedId, setBusyStagedId] = useState<number | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const orgId = organization?.id ? Number(organization.id) : null;

  const scrollToEnd = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };

  const applyState = useCallback(
    (payload: {
      conversation?: { id: number; messages?: StoredMessage[] } | null;
      stagedActions?: StagedActionCardModel[];
      messages?: StoredMessage[];
      needsMigration?: boolean;
    }) => {
      if (payload.needsMigration) setNeedsMigration(true);
      if (payload.conversation) {
        setConversationId(payload.conversation.id);
        setMessages(payload.conversation.messages || payload.messages || []);
      } else if (payload.messages) {
        setMessages(payload.messages);
      }
      const nextStaged = payload.stagedActions || [];
      setStaged(nextStaged);
      onPendingCountChange?.(nextStaged.filter((s) => s.status === 'pending').length);
    },
    [onPendingCountChange]
  );

  const loadConversation = useCallback(async () => {
    setBootstrapping(true);
    setError(null);
    try {
      const qs = orgId ? `?organizationId=${orgId}` : '';
      const res = await fetch(`/api/agents/consultant/conversation${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load conversation');
      applyState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBootstrapping(false);
    }
  }, [orgId, applyState]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    scrollToEnd();
  }, [messages, staged, loading]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setError(null);
    // Optimistic user bubble
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, meta: { kind: 'text' }, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch('/api/agents/consultant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
          organizationId: orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Turn failed');
      setConversationId(data.conversationId);
      applyState({
        conversation: { id: data.conversationId, messages: data.messages },
        stagedActions: data.stagedActions,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Turn failed');
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id: number) => {
    setBusyStagedId(id);
    setError(null);
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approve failed');
      if (data.conversation?.messages) {
        setMessages(data.conversation.messages);
      }
      setStaged((prev) => prev.filter((s) => s.id !== id));
      onPendingCountChange?.(0);
      // Refresh pending list
      await loadConversation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusyStagedId(null);
    }
  };

  const dismiss = async (id: number) => {
    setBusyStagedId(id);
    setError(null);
    try {
      const res = await fetch(`/api/agents/consultant/staged/${id}/dismiss`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dismiss failed');
      setStaged((prev) => prev.filter((s) => s.id !== id));
      await loadConversation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed');
    } finally {
      setBusyStagedId(null);
    }
  };

  const pending = staged.filter((s) => s.status === 'pending');

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0 bg-background',
        variant === 'page' && 'rounded-lg border border-border',
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Bot className="h-4 w-4 text-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-none">Campaign consultant</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Intake → artifacts. High-risk actions need Approve.
          </p>
        </div>
        {pending.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400">
            {pending.length} to review
          </Badge>
        )}
      </div>

      {needsMigration && (
        <div className="mx-3 mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground flex gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Run migration <code className="text-[10px]">20260916_add_consultant_conversations.sql</code> to persist chat.
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 px-3 py-3">
        <div className="space-y-3 pr-2">
          {bootstrapping && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading conversation…
            </div>
          )}

          {!bootstrapping &&
            messages.map((m, idx) => {
              if (m.role !== 'user' && m.role !== 'assistant') return null;
              const isUser = m.role === 'user';
              const isTool = m.meta?.kind === 'tool_result';
              const isStagedNotice = m.meta?.kind === 'staged_notice';
              return (
                <div
                  key={`${idx}-${m.createdAt || ''}`}
                  className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] rounded-lg px-3 py-2 text-sm',
                      isUser && 'bg-primary text-primary-foreground',
                      !isUser && !isTool && !isStagedNotice && 'bg-muted text-foreground',
                      isTool && 'bg-emerald-500/10 border border-emerald-500/25 text-foreground w-full',
                      isStagedNotice && 'bg-amber-500/10 border border-amber-500/30 text-foreground w-full'
                    )}
                  >
                    {isTool && m.meta?.toolName && (
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Result · {m.meta.toolName.replace(/_/g, ' ')}
                        {m.meta.implemented === false ? ' · not implemented' : ''}
                      </p>
                    )}
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          {pending.map((action) => (
            <StagedActionCard
              key={action.id}
              action={action}
              onApprove={approve}
              onDismiss={dismiss}
              busyId={busyStagedId}
            />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {error && (
        <p className="px-3 text-xs text-destructive shrink-0 pb-1">{error}</p>
      )}

      <div className="border-t border-border p-3 space-y-2 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What office are you running for?"
          rows={variant === 'page' ? 3 : 2}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={loading}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Private tools run inline. Sends stay behind Approve.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
