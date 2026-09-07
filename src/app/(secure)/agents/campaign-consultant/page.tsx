'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  Bot,
  Briefcase,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ConsultantAction = {
  id: string;
  label: string;
  description: string;
  href: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  actions?: ConsultantAction[];
};

const STARTER_PROMPTS = [
  'I am running for local office and need a 30-day campaign kickoff plan.',
  'Help me decide what to poll first in my district and why.',
  'Draft a message framework for persuadable voters vs base turnout.',
  'What should my weekly consultant checklist look like until election day?',
];

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: [
    '## Campaign Consultant Expert Agent',
    '',
    'I am your turnkey campaign strategist for hyperlocal races.',
    '',
    'Tell me the **office**, **district/city**, and **election date**, and I will:',
    '1. Build a kickoff plan',
    '2. Recommend what to poll first',
    '3. Draft message priorities',
    '4. Hand you concrete Antelope actions (surveys, imports, analytics)',
    '',
    'You stay in control — I recommend; you approve what launches.',
  ].join('\n'),
  actions: [
    {
      id: 'create_baseline_survey',
      label: 'Create a baseline voter survey',
      description: 'Draft a short district poll with AI.',
      href: '/create/survey/ai',
    },
    {
      id: 'import_data',
      label: 'Import existing poll data',
      description: 'Upload CSV/Excel or connect another survey tool.',
      href: '/surveys/import',
    },
  ],
};

export default function CampaignConsultantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [office, setOffice] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const starters = useMemo(() => STARTER_PROMPTS, []);

  const brief = {
    office: office || null,
    district: district || null,
    state: state || null,
  };

  const scrollToEnd = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    scrollToEnd();

    try {
      const res = await fetch('/api/agents/campaign-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          brief,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.status) {
        throw new Error(data?.error || 'Consultant agent failed');
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          actions: data.actions || [],
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            error?.message ||
            'Something went wrong talking to the consultant agent. Try again in a moment.',
          actions: [
            {
              id: 'retry_analytics',
              label: 'Back to Analytics',
              description: 'Return to the analytics home paths.',
              href: '/cohort-chat',
            },
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
      scrollToEnd();
    }
  };

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
                    Campaign Consultant Expert Agent
                  </h1>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Agent
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Turnkey strategist for hyperlocal campaigns — plan, listen, message, act.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/cohort-chat">Back to Analytics</Link>
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] flex-1 min-h-0">
          <aside className="border-b lg:border-b-0 lg:border-r border-border p-4 space-y-4 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Race context
              </h2>
              <div className="space-y-2">
                <Input
                  placeholder="Office (e.g. School Board)"
                  value={office}
                  onChange={(e) => setOffice(e.target.value)}
                />
                <Input
                  placeholder="District / city"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
                <Input
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Optional but powerful — the agent uses this as campaign memory for advice.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Starter prompts
              </h2>
              <div className="space-y-2">
                {starters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="w-full text-left text-xs rounded-md border border-border/70 p-2 hover:bg-muted transition-colors"
                    onClick={() => sendMessage(prompt)}
                    disabled={isLoading}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  How this agent works
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-muted-foreground space-y-1.5">
                <p>1. You describe the race.</p>
                <p>2. The agent recommends a plan.</p>
                <p>3. You click an action card to execute in Antelope.</p>
                <p>4. New poll data makes the next advice sharper.</p>
              </CardContent>
            </Card>
          </aside>

          <section className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, idx) => (
                <div
                  key={`${message.role}-${idx}`}
                  className={cn(
                    'max-w-3xl rounded-lg border p-4',
                    message.role === 'user'
                      ? 'ml-auto bg-primary/5 border-primary/20'
                      : 'mr-auto bg-card'
                  )}
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                    {message.role === 'user' ? 'You' : 'Campaign Consultant'}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  {!!message.actions?.length && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {message.actions.map((action) => (
                        <button
                          key={`${idx}-${action.id}`}
                          type="button"
                          onClick={() => router.push(action.href)}
                          className="text-left rounded-md border border-border p-3 hover:bg-muted/60 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{action.label}</span>
                            <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                          </div>
                          {action.description && (
                            <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultant is thinking…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-border p-4">
              <div className="relative max-w-4xl">
                <Textarea
                  className="min-h-[96px] pr-12 resize-none"
                  placeholder="Ask your campaign consultant… e.g. “Build my first 30-day plan for city council.”"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  className="absolute right-2 bottom-2 h-8 w-8"
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Advice improves when race context + poll data are connected.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
