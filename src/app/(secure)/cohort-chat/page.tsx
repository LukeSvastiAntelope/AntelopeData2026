'use client';

import React, { useEffect, useState, useRef } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Cohort, CohortFilterRule } from '@/app/utils/interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSmart from 'remark-smartypants';
// import rehypeSlug from 'rehype-slug';
// import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ChartRenderer from '@/components/ChartRenderer';
import { getAllModels } from '@/app/utils/models';

// Optional markdown plugins – if not installed, fall back gracefully
let smart: any = null;
try { smart = require('remark-smartypants'); } catch {}

const toPlugin=(mod:any)=>{
  if(!mod) return null;
  if(typeof mod==='function') return mod;
  if(typeof mod.default==='function') return mod.default;
  return null;
};

const optionalRemark = [remarkGfm, toPlugin(smart)].filter(Boolean);
const optionalRehype: any[] = [];

// helper to normalise whitespace and remove duplicates like 'ageThe'
const normaliseText=(txt:string)=>{
  return txt
    // collapse newlines before and after citation markers so they stay inline
    .replace(/\n+\s*\[(\d+)\]/g, ' [$1]')    // newline(s) before marker
    .replace(/\[(\d+)\]\s*\n+/g, '[$1] ')    // newline(s) after marker
    .replace(/\s+\n/g,'\n')           // trim spaces before newline
    .replace(/\n{3,}/g,'\n\n')        // collapse >2 blank lines
    .replace(/([a-z])([A-Z])/g,'$1 $2')  // add space if missing
    .replace(/\b(\w+)\s+\1\b/gi,'$1'); // remove duplicated words
};

export default function CohortChatPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  type ChatMessage = { role:'user'|'agent'; content:string; citations?: Record<string,string>; chartSpec?: any };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterRules, setFilterRules] = useState<CohortFilterRule[]>([]);
  const [newCohortName, setNewCohortName] = useState('');
  const [saving, setSaving] = useState(false);
  const [surveys, setSurveys] = useState<{id:number,title:string}[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [sources, setSources] = useState<{survey: boolean; twins: boolean; web: boolean}>({survey: true, twins: true, web: false});
  const [systemPrompt, setSystemPrompt] = useState('You are an expert analyst summarising the perspectives of a group of survey respondents.');
  const [rightPanelView, setRightPanelView] = useState<'cohort' | 'agent'>('cohort');
  
  // Ref for auto-scrolling to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
    // Fetch surveys belonging to the current user
    if (token) {
      fetch('/api/surveys', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => { 
          console.log('Surveys data:', data);
          if (data.surveys) setSurveys(data.surveys); 
        });
    }
    // Fetch cohorts on mount
    if (token) {
      fetch('/api/cohorts', { headers: { 'Authorization': `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => {
          if (data.cohorts) setCohorts(data.cohorts);
        });
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error('Please enter a question');
      return;
    }
    const question = input.trim();
    setInput('');
    setMessages(prev=>[...prev,{role:'user',content:question}]);
    setIsLoading(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
    const payload = {
      cohort: selectedCohortId ? { id: selectedCohortId } : undefined,
      question,
      surveyId: selectedSurveyId || undefined,
      model: selectedModel,
      sources,
      systemPrompt,
    };

    const res = await fetch('/api/cohort/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });

    if (!res.body) {
      toast.error('No response');
      setIsLoading(false);
      return;
    }

    // add placeholder agent message
    setMessages(prev=>[...prev,{role:'agent',content:'', citations:{}}]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      setMessages(prev=>{
        const updated=[...prev];
        const last=updated[updated.length-1];
        if(last && last.role==='agent') {
          last.content += chunk;
          updated[updated.length-1]=last;
        }
        return updated;
      });
    }
    // After stream completes, process citations block
    setMessages(prev=>{
      const updated=[...prev];
      const last=updated[updated.length-1];
      if(last && last.role==='agent') {
        const chartMatchFull = last.content.match(/```chart[\s\S]*?```/);
        let parts = last.content.split('\n---\n');
        if(parts.length>1) {
          const answerTxt=parts[0];
          const stats=parts.slice(1).join('\n---\n');
          // extract citations mapping
          const match = stats.match(/citations:\s*([\s\S]*)/);
          const citationsBlock = match? match[1]:'';
          const citations:Record<string,string>={};
          citationsBlock.split('\n').forEach(line=>{
            const m=line.match(/\[(\d+)\]\s+"(.+?)"/);
            if(m) citations[m[1]] = m[2];
          });
          // extract chart spec fenced block
          if(chartMatchFull){
            try {
              const jsonPart=chartMatchFull[0].replace(/```chart|```/g,'').trim();
              last.chartSpec=JSON.parse(jsonPart);
              last.content=answerTxt.replace(chartMatchFull[0],'').trim();
            } catch{}
          } else {
            last.content=answerTxt.trim();
          }
          last.citations=citations;
          updated[updated.length-1]=last;
        }
      }
      return updated;
    });
    setIsLoading(false);
  };

  const handleKeyDown=(e:React.KeyboardEvent<HTMLTextAreaElement>)=> {
    if (e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveCohort = async () => {
    if (!newCohortName.trim() || filterRules.length === 0) return;
    setSaving(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
    const res = await fetch('/api/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: newCohortName, filter: filterRules, visibility: 'private' }),
    });
    const data = await res.json();
    if (data.status) {
      setCohorts([...cohorts, { id: data.id, name: newCohortName, filter: filterRules, visibility: 'private', description: '', createdBy: 1, createdAt: '', updatedAt: '' } as any]);
      setNewCohortName('');
      setFilterRules([]);
    }
    setSaving(false);
  };

  const handleDeleteCohort = async () => {
    if (!selectedCohortId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
    await fetch(`/api/cohorts/${selectedCohortId}`, {
      method: 'DELETE',
      headers: token? { 'Authorization': `Bearer ${token}` } : undefined,
    });
    setCohorts(cohorts.filter(c=>c.id!==selectedCohortId));
    setSelectedCohortId(null);
  };

  // helper to update filter rule
  const updateRule = (idx:number, key: keyof CohortFilterRule, value:string) => {
    setFilterRules(prev => prev.map((r,i)=> i===idx? { ...r, [key]: value }: r));
  };

  const renderWithCitations=(text:string,citations?:Record<string,string>)=> {
    if(!citations || Object.keys(citations).length===0) {
      text = normaliseText(text);
      return (
        <div className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-p:text-foreground prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown
            remarkPlugins={optionalRemark}
            rehypePlugins={optionalRehype}
          >
            {text}
          </ReactMarkdown>
        </div>
      );
    }
    
    // First normalize the text to ensure citations are inline
    const normalizedText = normaliseText(text);
    
    // Render the markdown first
    const markdownContent = (
      <ReactMarkdown
        remarkPlugins={optionalRemark}
        rehypePlugins={optionalRehype}
        components={{
          // Custom renderer for text nodes to handle citations
          p: ({ children, ...props }) => {
            const processChildren = (children: any): any => {
              if (typeof children === 'string') {
                const elements: React.ReactNode[] = [];
                const regex = /\[(\d+)\]/g;
                let lastIndex = 0;
                let match;
                
                while ((match = regex.exec(children)) !== null) {
                  const idx = match.index;
                  const num = match[1];
                  
                  // Add text before citation
                  if (idx > lastIndex) {
                    elements.push(children.slice(lastIndex, idx));
                  }
                  
                  // Add citation tooltip
                  const quote = citations[num];
                  elements.push(
                    <Tooltip key={`citation-${idx}`}>
                      <TooltipTrigger asChild>
                        <span className="inline-block px-1 rounded-sm bg-muted/50 underline cursor-help text-primary">
                          [{num}]
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {quote || 'Quote not found'}
                      </TooltipContent>
                    </Tooltip>
                  );
                  
                  lastIndex = idx + match[0].length;
                }
                
                // Add remaining text
                if (lastIndex < children.length) {
                  elements.push(children.slice(lastIndex));
                }
                
                return elements.length > 1 ? elements : children;
              }
              
              if (Array.isArray(children)) {
                return children.map(processChildren);
              }
              
              return children;
            };
            
            return <p {...props}>{processChildren(children)}</p>;
          }
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    );

    return (
      <div className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-p:text-foreground prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
        {markdownContent}
      </div>
    );
  };

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto h-full rounded-lg bg-card text-card-foreground shadow-lg flex">
        {/* Main area */}
        <div className={cn('flex-1', isCollapsed? 'w-[calc(100%-50px)]':'w-[calc(100%-350px)]')}>
          {/* Header */}
          <div className="px-6 py-4">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Cohort Chat</h1>
            </div>
          </div>

          <div className="border-b border-border" />

          <div className="p-4">

          {/* Chat Area - No more tabs, just clean chat */}
          <div className="flex flex-col h-[calc(100vh-140px)]">
            {messages.length===0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-6">
                <h1 className="text-2xl font-bold">Ask Questions.</h1>
                <div className="relative w-full max-w-xl">
                  <Textarea 
                    className="flex-1 min-h-[80px] pr-12 resize-none" 
                    placeholder="Ask the cohort…" 
                    value={input} 
                    onChange={e=>setInput(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    rows={2}
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-2 bottom-2 h-8 w-8" 
                    onClick={handleSend} 
                    disabled={isLoading}
                  >
                    <Send className="h-4 w-4"/>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {messages.map((m,idx)=>(
                      <div 
                        key={idx} 
                        className="flex gap-3 text-sm justify-start animate-in fade-in duration-500"
                        style={{ 
                          animationDelay: `${Math.min(idx * 50, 500)}ms`,
                          animationFillMode: 'both'
                        }}
                      >
                        {m.role==='agent' && <Avatar className="h-8 w-8 flex-shrink-0"><AvatarImage src="/assets/images/logo-simple.svg"/><AvatarFallback>C</AvatarFallback></Avatar>}
                        {m.role==='user' && <Avatar className="h-8 w-8 flex-shrink-0"><AvatarFallback>U</AvatarFallback></Avatar>}
                        <div className={cn(
                          'rounded-lg px-4 py-2 max-w-[80%] chat-message',
                          m.role==='user'? 'bg-primary text-primary-foreground':'text-foreground'
                        )}>
                          {m.role==='agent' ? (
                            <TooltipProvider delayDuration={150}>
                              {renderWithCitations(m.content, m.citations)}
                            </TooltipProvider>
                          ): m.content}
                          {m.role==='agent' && m.chartSpec && (
                            <div className="mt-4 animate-in fade-in duration-700 delay-300">
                              <ChartRenderer spec={m.chartSpec}/>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3 text-sm justify-start animate-in fade-in duration-300">
                        <Avatar className="h-8 w-8 flex-shrink-0"><AvatarFallback>C</AvatarFallback></Avatar>
                        <div className="rounded-lg px-4 py-2 text-foreground chat-message">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-sm opacity-70">Analyzing cohort...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Auto-scroll target */}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                <div className="sticky bottom-0 p-4 bg-card">
                  <div className="relative">
                    <Textarea 
                      placeholder="Ask the cohort…" 
                      className="flex-1 min-h-[80px] pr-12 resize-none" 
                      value={input} 
                      onChange={e=>setInput(e.target.value)} 
                      onKeyDown={handleKeyDown} 
                      disabled={isLoading}
                      rows={2}
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="absolute right-2 bottom-2 h-8 w-8" 
                      onClick={handleSend} 
                      disabled={isLoading}
                    >
                      <Send className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          </div>
        </div>
        {/* Right Pane */}
        <div className="relative">
          <Button variant="ghost" size="icon" className="absolute -left-3 top-3 h-6 w-6 rounded-full border bg-background shadow-md" onClick={()=>setIsCollapsed(!isCollapsed)}>
            {isCollapsed? <ChevronRight className="h-4 w-4"/>:<ChevronLeft className="h-4 w-4"/>}
          </Button>
          <div className={cn('h-full bg-muted/30', isCollapsed? 'w-[50px]':'w-[350px] overflow-y-auto p-6 space-y-6')}>
            {!isCollapsed && (
              <>
                {/* Panel Toggle */}
                <div className="flex rounded-md bg-muted/50 p-0.5">
                  <Button
                    variant={rightPanelView === 'cohort' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-1 h-7 text-xs font-medium"
                    onClick={() => setRightPanelView('cohort')}
                  >
                    Cohort
                  </Button>
                  <Button
                    variant={rightPanelView === 'agent' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-1 h-7 text-xs font-medium"
                    onClick={() => setRightPanelView('agent')}
                  >
                    Agent
                  </Button>
                </div>

                {rightPanelView === 'cohort' ? (
                  <>
                    {/* Cohort select */}
                    <div className="space-y-2">
                      <Label>Cohort</Label>
                      <Select value={selectedCohortId? String(selectedCohortId):'all'} onValueChange={val=>setSelectedCohortId(val==='all'? null: Number(val))}>
                        <SelectTrigger><SelectValue placeholder="All"/></SelectTrigger>
                        <SelectContent className="z-50">
                          <SelectItem value="all">All</SelectItem>
                          {cohorts.map(c=> <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Survey select */}
                    <div className="space-y-2">
                      <Label>Survey</Label>
                      <Select value={selectedSurveyId? String(selectedSurveyId):'all'} onValueChange={val=>setSelectedSurveyId(val==='all'? null: Number(val))}>
                        <SelectTrigger><SelectValue placeholder="All"/></SelectTrigger>
                        <SelectContent className="z-50">
                          <SelectItem value="all">All</SelectItem>
                          {surveys.map(s=> <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Filter Builder */}
                    <div className="space-y-4 mt-4">
                      <h3 className="text-sm font-medium">Ad-hoc Filter</h3>
                      {filterRules.map((rule, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <Input placeholder="field" value={rule.field} onChange={e=>updateRule(idx,'field',e.target.value)} className="w-28" />
                          <select value={rule.op} onChange={e=>updateRule(idx,'op',e.target.value as any)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                            <option value="=">=</option>
                            <option value="IN">IN</option>
                            <option value="CONTAINS">CONTAINS</option>
                          </select>
                          <Input placeholder="value" value={Array.isArray(rule.value)? rule.value.join(','): rule.value as string} onChange={e=>updateRule(idx,'value',e.target.value)} className="flex-1" />
                        </div>
                      ))}
                      <Button size="sm" variant="secondary" onClick={() => setFilterRules([...filterRules,{ field:'', op:'=', value:''}])}>+ Add Rule</Button>
                    </div>
                    {/* Save Cohort */}
                    <div className="flex gap-2 items-center mt-2">
                      <Input placeholder="Cohort name" value={newCohortName} onChange={e=>setNewCohortName(e.target.value)} className="flex-1" />
                      <Button size="sm" onClick={handleSaveCohort} disabled={saving || !newCohortName.trim() || filterRules.length===0}>Save Cohort</Button>
                    </div>
                    <Separator className="my-4"/>
                    {messages.length>0 && selectedCohortId && (<Button variant="destructive" onClick={handleDeleteCohort}>Delete</Button>)}
                  </>
                ) : (
                  <>
                    {/* Agent Setup */}
                    <div className="space-y-6">
                      {/* Model select */}
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="z-50">
                            {getAllModels().map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} ({model.provider})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Sources */}
                      <div className="space-y-2">
                        <Label>Sources</Label>
                        {['survey','twins','web'].map(src=> (
                          <div key={src} className="flex items-center gap-2">
                            <Checkbox checked={sources[src as keyof typeof sources]} onCheckedChange={val=>setSources({...sources,[src]:!!val})}/>
                            <span className="text-sm capitalize">{src}</span>
                          </div>
                        ))}
                      </div>

                      {/* Prompt Editor */}
                      <div className="space-y-2">
                        <Label>Agent Instructions</Label>
                        <Textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} className="min-h-32"/>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 