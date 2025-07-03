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
import { ChevronLeft, ChevronRight, Send, PanelLeft, PanelRight, Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import ChartRenderer from '@/components/ChartRenderer'
import { getAllModels } from '@/app/utils/models'
import remarkSmart from 'remark-smartypants'

// Optional markdown plugins – if not installed, fall back gracefully
let smart: any = null;
try { smart = remarkSmart; } catch {}

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

// Smart buffering - determine when content is ready for rendering
const isCompleteUnit = (content: string): boolean => {
  // Always update if content is short (first few words)
  if (content.length < 50) return true;
  
  // Update on complete sentences
  if (content.match(/[.!?]\s*$/)) return true;
  
  // Update on complete markdown blocks
  if (content.match(/\n\n$/)) return true;
  
  // Update on complete list items
  if (content.match(/\n\s*[-*+]\s+.+$/)) return true;
  
  // Update on complete headings
  if (content.match(/\n#+\s+.+\n/)) return true;
  
  // Update every 100 characters as fallback
  if (content.length % 100 === 0) return true;
  
  return false;
};

// Process partial response during streaming - extract citations as they come in
const processPartialResponse = (content: string, existingMessage: any) => {
  // Look for partial citation blocks even if incomplete
  const parts = content.split('\n---\n');
  
  let cleanContent = content;
  let citations: Record<string, string> = existingMessage?.citations || {};
  
  if (parts.length > 1) {
    const answerTxt = parts[0];
    const stats = parts.slice(1).join('\n---\n');
    
    console.log('Found parts in partial response:', { answerLength: answerTxt.length, statsLength: stats.length });
    
    // Only try to extract citations if we have a complete citations section
    // Look for citations: followed by at least one [number] pattern
    if (stats.includes('citations:') && stats.match(/\[\d+\]/)) {
      // Extract citations mapping - be more permissive for partial content
      const citationMatch = stats.match(/citations:\s*([\s\S]*?)(?=\n---|\n🎯|$)/);
      const citationsBlock = citationMatch ? citationMatch[1].trim() : '';
      
      console.log('Citations block found:', citationsBlock);
      console.log('Citations block length:', citationsBlock.length);
      console.log('Citations block lines:', citationsBlock.split('\n'));
      
      if (citationsBlock && citationsBlock.length > 10) { // Only process if we have meaningful content
        const newCitations: Record<string, string> = {};
        
        // Process each line that looks like a citation
        citationsBlock.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          console.log('Processing citation line:', trimmed);
          // Handle format: [1] Q: "question" | A: "answer"
          const m = trimmed.match(/^\[(\d+)\]\s+(.+)/);
          if (m) {
            const citationText = m[2];
            console.log('Citation text:', citationText);
            // Extract the question and answer parts for better display
            const qaParts = citationText.match(/Q:\s*"([^"]+)"\s*\|\s*A:\s*"([^"]+)"/);
            if (qaParts) {
              // Format as "Question: answer" for cleaner tooltip display
              newCitations[m[1]] = `${qaParts[1]}: \"${qaParts[2]}\"`;
              console.log('Formatted citation:', newCitations[m[1]]);
            } else {
              // Fallback to the full text if format doesn't match
              newCitations[m[1]] = citationText;
              console.log('Using fallback citation:', newCitations[m[1]]);
            }
          }
        });
        
        // Only update if we found new citations
        if (Object.keys(newCitations).length > 0) {
          citations = { ...citations, ...newCitations };
          console.log('Updated citations during streaming:', citations);
        }
      }
    } else {
      console.log('Citations section not complete yet, keeping existing citations');
    }
    
    cleanContent = answerTxt;
  } else {
    console.log('No parts found in partial response, using full content');
  }
  
  return {
    content: normalizeMarkdown(cleanContent),
    citations
  };
};

// Process complete response for citations, charts, and data cards
const processCompleteResponse = (content: string, existingMessage: any) => {
  const chartMatchFull = content.match(/```chart[\s\S]*?```/);
  const dataCardsMatchFull = content.match(/```data-cards[\s\S]*?```/);
  const parts = content.split('\n---\n');
  
  let cleanContent = content;
  let citations: Record<string, string> = existingMessage?.citations || {};
  let chartSpec = existingMessage?.chartSpec;
  let dataCards = existingMessage?.dataCards;
  
  if (parts.length > 1) {
    const answerTxt = parts[0];
    const stats = parts.slice(1).join('\n---\n');
    
    // Extract citations mapping
    const match = stats.match(/citations:\s*([\s\S]*?)(?=---|\n🎯|$)/);
    const citationsBlock = match ? match[1].trim() : '';
    
    if (citationsBlock) {
      console.log('Citations block found:', citationsBlock);
      console.log('Citations block length:', citationsBlock.length);
      console.log('Citations block lines:', citationsBlock.split('\n'));
      const newCitations: Record<string, string> = {};
      
      citationsBlock.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        console.log('Processing citation line:', trimmed);
        // Handle format: [1] Q: "question" | A: "answer"
        const m = trimmed.match(/^\[(\d+)\]\s+(.+)/);
        if (m) {
          const citationText = m[2];
          console.log('Citation text:', citationText);
          // Extract the question and answer parts for better display
          const qaParts = citationText.match(/Q:\s*"([^"]+)"\s*\|\s*A:\s*"([^"]+)"/);
          if (qaParts) {
            // Format as "Question: answer" for cleaner tooltip display
            newCitations[m[1]] = `${qaParts[1]}: \"${qaParts[2]}\"`;
            console.log('Formatted citation:', newCitations[m[1]]);
          } else {
            // Fallback to the full text if format doesn't match
            newCitations[m[1]] = citationText;
            console.log('Using fallback citation:', newCitations[m[1]]);
          }
        }
      });
      
      // Only update citations if we found new ones, otherwise preserve existing
      if (Object.keys(newCitations).length > 0) {
        citations = newCitations;
        console.log('Updated citations object:', citations);
      } else {
        console.log('No new citations found, preserving existing:', citations);
      }
    } else {
      console.log('No citations block found, preserving existing citations:', citations);
    }
    
    cleanContent = answerTxt;
  } else {
    console.log('No stats section found, preserving existing citations:', citations);
  }
  
  // Extract chart spec fenced block
  if (chartMatchFull) {
    try {
      const jsonPart = chartMatchFull[0].replace(/```chart|```/g, '').trim();
      chartSpec = JSON.parse(jsonPart);
      cleanContent = cleanContent.replace(chartMatchFull[0], '').trim();
    } catch (error) {
      console.warn('Failed to parse chart spec:', error);
    }
  }
  
  // Extract data-cards fenced block
  if (dataCardsMatchFull) {
    try {
      const jsonPart = dataCardsMatchFull[0].replace(/```data-cards|```/g, '').trim();
      dataCards = JSON.parse(jsonPart);
      cleanContent = cleanContent.replace(dataCardsMatchFull[0], '').trim();
      console.log('Extracted data cards:', dataCards);
    } catch (error) {
      console.warn('Failed to parse data cards:', error);
    }
  }
  
  return {
    content: normalizeMarkdown(cleanContent),
    citations,
    chartSpec,
    dataCards
  };
};

// Normalize markdown structure for consistent rendering across AI models
const normalizeMarkdown = (text: string): string => {
  let normalized = text;
  
  // Ensure proper spacing around headings
  normalized = normalized.replace(/\n(#{1,6}\s[^\n]+)\n/g, '\n\n$1\n\n');
  normalized = normalized.replace(/^(#{1,6}\s[^\n]+)\n/g, '$1\n\n');
  
  // Ensure proper spacing around lists
  normalized = normalized.replace(/\n(\s*[-*+]\s[^\n]+)/g, '\n\n$1');
  normalized = normalized.replace(/(\s*[-*+]\s[^\n]+)\n([^\s-*+\n])/g, '$1\n\n$2');
  
  // Ensure proper spacing around numbered lists
  normalized = normalized.replace(/\n(\s*\d+\.\s[^\n]+)/g, '\n\n$1');
  normalized = normalized.replace(/(\s*\d+\.\s[^\n]+)\n([^\s\d\n])/g, '$1\n\n$2');
  
  // Clean up excessive whitespace but preserve intentional spacing
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  
  // Move citations to more natural positions (after punctuation)
  normalized = normalized.replace(/(\[\d+\])([.,:;!?])/g, '$2$1');
  normalized = normalized.replace(/([.,:;!?])(\s*)(\[\d+\])/g, '$1$3$2');
  
  // Ensure citations don't break paragraph flow
  normalized = normalized.replace(/(\[\d+\])\s*\n\s*([A-Z])/g, '$1 $2');
  
  return normalized.trim();
};

export default function CohortChatPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  type ChatMessage = { 
    role:'user'|'agent'; 
    content:string; 
    citations?: Record<string,string>; 
    chartSpec?: any; 
    dataCards?: any[]; 
    isUpload?: boolean;
    reportId?: string;
    reportStatus?: 'initiated' | 'processing' | 'completed' | 'failed';
  };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterRules, setFilterRules] = useState<CohortFilterRule[]>([]);
  const [newCohortName, setNewCohortName] = useState('');
  const [saving, setSaving] = useState(false);
  const [surveys, setSurveys] = useState<{id:number,title:string}[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [selectedSurveyData, setSelectedSurveyData] = useState<any>(null);
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);
  const [availableFields, setAvailableFields] = useState<{name: string, label: string, type: string}[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.0);
  const [sources, setSources] = useState<{survey: boolean; twins: boolean; web: boolean}>({survey: true, twins: true, web: false});
  const [systemPrompt, setSystemPrompt] = useState('You are an expert analyst summarising the perspectives of a group of survey respondents.');
  const [streamingMode, setStreamingMode] = useState<'off' | 'smart' | 'buffered' | 'instant'>('off');

  const [showCohortCreator, setShowCohortCreator] = useState(false);
  
  // Upload functionality state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  
  // Ref for auto-scrolling to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  
  // Poll for report status updates
  useEffect(() => {
    const activeReports = messages.filter(
      m => m.reportId && (m.reportStatus === 'initiated' || m.reportStatus === 'processing')
    );
    
    if (activeReports.length > 0) {
      const interval = setInterval(async () => {
        for (const message of activeReports) {
          if (message.reportId) {
            try {
              const response = await fetch(`/api/reports/${message.reportId}/status`);
              const data = await response.json();
              
              if (data.status === 'completed') {
                // Update the message with completed status
                setMessages(prev => prev.map(m => 
                  m.reportId === message.reportId 
                    ? { ...m, reportStatus: 'completed' }
                    : m
                ));
                
                // Add a new message with the report summary
                setMessages(prev => [...prev, {
                  role: 'agent',
                  content: `✅ **Report Complete!**\n\n${data.summary || 'Your comprehensive analysis is ready.'}\n\n[View Full Report →](/reports/${message.reportId})`,
                  reportId: message.reportId,
                  reportStatus: 'completed'
                }]);
              } else if (data.status === 'failed') {
                // Update the message with failed status
                setMessages(prev => prev.map(m => 
                  m.reportId === message.reportId 
                    ? { ...m, reportStatus: 'failed' }
                    : m
                ));
              }
            } catch (error) {
              console.error('Failed to check report status:', error);
            }
          }
        }
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [messages]);

  useEffect(() => {
    // Fetch surveys belonging to the current user (NextAuth handles authentication)
    fetch('/api/surveys')
      .then(res => res.json())
      .then(data => { 
        console.log('Surveys data:', data);
        console.log('Number of surveys:', data.surveys?.length || 0);
        console.log('Survey titles:', data.surveys?.map((s: any) => s.title) || []);
        if (data.surveys) {
          setSurveys(data.surveys);
          // Only auto-select if no saved survey preference exists
          const savedSurveyId = localStorage.getItem('cohort-chat-selected-survey');
          if (!savedSurveyId || savedSurveyId === 'null') {
            // Auto-select the latest survey (most recent created_at)
            if (data.surveys.length > 0) {
              const latestSurvey = data.surveys.reduce((latest: any, current: any) => 
                new Date(current.created_at) > new Date(latest.created_at) ? current : latest
              );
              handleSurveyChange(latestSurvey.id);
            }
          }
        }
      })
      .catch(error => {
        console.error('Error fetching surveys:', error);
      });
    
    // Fetch cohorts on mount (will be filtered by survey selection later)
    fetch('/api/cohorts')
      .then((res) => res.json())
      .then((data) => {
        if (data.cohorts) setCohorts(data.cohorts);
      })
      .catch(error => {
        console.error('Error fetching cohorts:', error);
      });
  }, []);

  // Fetch survey details when selectedSurveyId changes
  useEffect(() => {
    if (selectedSurveyId) {
      fetch(`/api/surveys/${selectedSurveyId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status && data.survey) {
            setSelectedSurveyData(data.survey);
            const prompts = generateDynamicPrompts(data.survey);
            setDynamicPrompts(prompts);
            const fields = extractAvailableFields(data.survey);
            setAvailableFields(fields);
          }
        })
        .catch(error => {
          console.error('Error fetching survey details:', error);
          // Fallback to default prompts
          setDynamicPrompts([
            "What are the key trends in responses?",
            "How do demographics affect answers?", 
            "Show response patterns"
          ]);
        });
    } else {
      setSelectedSurveyData(null);
      setAvailableFields([]);
      setDynamicPrompts([
        "What are the key trends in responses?",
        "How do demographics affect answers?", 
        "Show response patterns"
      ]);
    }
  }, [selectedSurveyId]);

  // Load saved preferences on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('cohort-chat-selected-model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    
    const savedSystemPrompt = localStorage.getItem('cohort-chat-system-prompt');
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt);
    }
    
    const savedTemperature = localStorage.getItem('cohort-chat-temperature');
    if (savedTemperature) {
      setTemperature(Number(savedTemperature));
    }
    
    const savedSurveyId = localStorage.getItem('cohort-chat-selected-survey');
    if (savedSurveyId && savedSurveyId !== 'null') {
      setSelectedSurveyId(Number(savedSurveyId));
    }
    
    const savedStreamingMode = localStorage.getItem('cohort-chat-streaming-mode');
    if (savedStreamingMode && ['off','smart','buffered','instant'].includes(savedStreamingMode)) {
      setStreamingMode(savedStreamingMode as 'off' | 'smart' | 'buffered' | 'instant');
    }
  }, []);
  
  // Save model preference when it changes
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('cohort-chat-selected-model', model);
  };
  
  // Save system prompt when it changes
  const handleSystemPromptChange = (prompt: string) => {
    setSystemPrompt(prompt);
    localStorage.setItem('cohort-chat-system-prompt', prompt);
  };
  
  // Save temperature when it changes
  const handleTemperatureChange = (temp: number) => {
    setTemperature(temp);
    localStorage.setItem('cohort-chat-temperature', String(temp));
  };
  
  // Save survey selection when it changes
  const handleSurveyChange = (surveyId: number | null) => {
    setSelectedSurveyId(surveyId);
    localStorage.setItem('cohort-chat-selected-survey', surveyId ? String(surveyId) : 'null');
    
    // Clear cohort selection when changing surveys to prevent cross-survey cohort usage
    if (selectedCohortId) {
      const currentCohort = cohorts.find(c => c.id === selectedCohortId);
      if (!currentCohort || currentCohort.surveyId !== surveyId) {
        setSelectedCohortId(null);
      }
    }
    
    // Close cohort creator if open
    setShowCohortCreator(false);
    setFilterRules([]);
    setNewCohortName('');
  };

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error('Please enter a question');
      return;
    }
    const question = input.trim();
    setInput('');
    setMessages(prev=>[...prev,{role:'user',content:question}]);
    setIsLoading(true);

    // Enhance system prompt with formatting instructions for consistent markdown
    const enhancedSystemPrompt = `${systemPrompt}

FORMATTING REQUIREMENTS:
- Use clear heading hierarchy (## for main sections, ### for subsections)
- Add blank lines before and after headings
- Use consistent bullet point formatting with proper spacing
- Place citations at natural sentence/paragraph boundaries
- Ensure proper spacing around lists and paragraphs
- Structure your response with clear sections and subsections`;

    const payload: any = {
      cohort: selectedCohortId ? { id: selectedCohortId } : undefined,
      question,
      surveyId: selectedSurveyId || undefined,
      model: selectedModel,
      temperature,
      sources,
      systemPrompt: enhancedSystemPrompt,
    };

    if (streamingMode === 'off') {
      payload.stream = false;
    }

    const res = await fetch('/api/cohort/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (streamingMode === 'off') {
      // Non-streaming response (expects JSON { content: string })
      const json = await res.json();
      
      // Check if this is a report generation response
      if (json.reportId) {
        // This is a report generation - show immediate response and report status
        const immediateResponse = json.immediateResponse || 'I\'m generating a comprehensive analysis for you. This will take a moment...';
        setMessages(prev=>[...prev,{
          role:'agent',
          content: immediateResponse + '\n\n📊 **Generating detailed report...**',
          reportId: json.reportId,
          reportStatus: 'initiated'
        }]);
        setIsLoading(false);
        return;
      }
      
      // Regular response
      const finalContent = json.content || json.result || json.text || '';
      const processed = processCompleteResponse(String(finalContent), {});
      setMessages(prev=>[...prev,{role:'agent',content:processed.content,citations:processed.citations,chartSpec:processed.chartSpec,dataCards:processed.dataCards}]);
      setIsLoading(false);
      return;
    }

    if (!res.body) {
      toast.error('No response');
      setIsLoading(false);
      return;
    }

    // add placeholder agent message
    setMessages(prev=>[...prev,{role:'agent',content:'', citations:{}}]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6); // Remove 'data: ' prefix
          
          if (dataStr === '[DONE]') {
            // Stream completed
            continue;
          }
          
          try {
            const data = JSON.parse(dataStr);
            
            // Check if this is a report generation message
            if (data.reportId) {
              // Replace the placeholder message with report generation status
              const immediateResponse = data.immediateResponse || 'I\'m generating a comprehensive analysis for you. This will take a moment...';
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'agent') {
                  last.content = immediateResponse + '\n\n📊 **Generating detailed report...**';
                  last.reportId = data.reportId;
                  last.reportStatus = 'initiated';
                  updated[updated.length - 1] = last;
                }
                return updated;
              });
              setIsLoading(false);
              return; // Exit the streaming loop for report generation
            }
            
            if (data.content) {
              accumulatedContent += data.content;
              
              // Different streaming modes
              let shouldUpdate = false;
              
              if (streamingMode === 'instant') {
                shouldUpdate = true; // Update on every token
              } else if (streamingMode === 'smart') {
                shouldUpdate = isCompleteUnit(accumulatedContent); // Smart buffering
              } else if (streamingMode === 'buffered') {
                shouldUpdate = accumulatedContent.length % 200 === 0; // Update every 200 chars
              }
              
              if (shouldUpdate) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'agent') {
                    // Process partial content for citations during streaming
                    const partialProcessed = processPartialResponse(accumulatedContent, last);
                    console.log('Partial processing result:', {
                      originalContent: accumulatedContent.slice(-100),
                      processedContent: partialProcessed.content.slice(-100),
                      citations: partialProcessed.citations
                    });
                    last.content = partialProcessed.content;
                    last.citations = partialProcessed.citations;
                    // Keep existing chartSpec and dataCards during streaming
                    updated[updated.length - 1] = last;
                  }
                  return updated;
                });
              }
            }
          } catch (error) {
            // If not JSON, treat as plain text (fallback for non-streaming responses)
            if (dataStr.trim()) {
              accumulatedContent += dataStr;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'agent') {
                  const partialProcessed = processPartialResponse(accumulatedContent, last);
                  last.content = partialProcessed.content;
                  last.citations = partialProcessed.citations;
                  updated[updated.length - 1] = last;
                }
                return updated;
              });
            }
          }
        } else if (line.trim() && !line.startsWith('data: ')) {
          // Handle non-SSE content (fallback for plain text responses)
          accumulatedContent += line + '\n';
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'agent') {
              const partialProcessed = processPartialResponse(accumulatedContent, last);
              last.content = partialProcessed.content;
              last.citations = partialProcessed.citations;
              updated[updated.length - 1] = last;
            }
            return updated;
          });
        }
      }
    }
    
    // Final update with complete content and post-processing
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'agent') {
        // Process the complete content
        console.log('Final processing - raw content:', accumulatedContent);
        const processedContent = processCompleteResponse(accumulatedContent, last);
        console.log('Final processing result:', {
          content: processedContent.content,
          citations: processedContent.citations,
          chartSpec: processedContent.chartSpec,
          dataCards: processedContent.dataCards
        });
        console.log('Setting final message state:', {
          citationKeys: processedContent.citations ? Object.keys(processedContent.citations) : [],
          citationCount: processedContent.citations ? Object.keys(processedContent.citations).length : 0,
          firstCitation: processedContent.citations ? processedContent.citations['1'] : 'none'
        });
        last.content = processedContent.content;
        last.citations = processedContent.citations;
        last.chartSpec = processedContent.chartSpec;
        last.dataCards = processedContent.dataCards;
        updated[updated.length - 1] = last;
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
    if (!newCohortName.trim() || filterRules.length === 0 || !selectedSurveyId) return;
    setSaving(true);
    const res = await fetch('/api/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: newCohortName, 
        filter: filterRules, 
        visibility: 'private',
        surveyId: selectedSurveyId 
      }),
    });
    const data = await res.json();
    if (data.status) {
      const newCohort = { id: data.id, name: newCohortName, filter: filterRules, visibility: 'private', description: '', createdBy: 1, createdAt: '', updatedAt: '' } as any;
      setCohorts([...cohorts, newCohort]);
      // Auto-select the newly created cohort
      setSelectedCohortId(data.id);
      // Close the creator and reset form
      setShowCohortCreator(false);
      setNewCohortName('');
      setFilterRules([]);
      toast.success(`Cohort "${newCohortName}" created successfully!`);
    } else {
      toast.error(data.message || 'Failed to create cohort');
    }
    setSaving(false);
  };

  const handleDeleteCohort = async () => {
    if (!selectedCohortId) return;
    await fetch(`/api/cohorts/${selectedCohortId}`, {
      method: 'DELETE',
    });
    setCohorts(cohorts.filter(c=>c.id!==selectedCohortId));
    setSelectedCohortId(null);
  };

  // helper to update filter rule
  const updateRule = (idx:number, key: keyof CohortFilterRule, value:string) => {
    setFilterRules(prev => prev.map((r,i)=> i===idx? { ...r, [key]: value }: r));
  };

  // Upload functionality handlers
  const handleFileUpload = async (file: File) => {
    console.log('Upload button clicked, file:', file.name, 'type:', file.type, 'size:', file.size);
    setUploadFile(file);
    setUploadLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      console.log('Making request to /api/surveys/import');
      
      const response = await fetch('/api/surveys/import', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);
      
      if (result.status) {
        setUploadPreview(result.preview);
        toast.success('File analyzed successfully!');
        
        // Add upload message to chat
        setMessages(prev => [...prev, {
          role: 'agent',
          content: `📤 Uploaded: ${file.name}\n\n✅ Ready to import`,
          citations: {},
          isUpload: true
        }]);
      } else {
        console.error('Upload failed:', result.message);
        toast.error(result.message || 'Failed to analyze file');
        setShowUploadDialog(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
      setShowUploadDialog(false);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!uploadPreview || !uploadFile) return;
    
    setUploadLoading(true);
    try {
      // Create column mappings from the preview data
      const columnMappings = uploadPreview.columns.map(col => ({
        originalName: col.name,
        mappedName: col.name,
        questionType: col.type,
        isDemographic: col.isDemographic,
        demographicField: col.demographicField,
        isRequired: col.isRequired,
        includeInSurvey: !col.isDemographic // Include non-demographic columns by default
      }));
      
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('config', JSON.stringify({
        fileName: uploadPreview.fileName,
        surveyTitle: uploadPreview.suggestedTitle,
        surveyDescription: `Imported survey from ${uploadPreview.fileName}`,
        isPublic: false,
        columnMappings,
        createDigitalTwins: uploadPreview.detectedDemographics.length > 0
      }));
      
      const response = await fetch('/api/surveys/import/execute', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      if (result.status && result.result) {
        toast.success(`Survey imported successfully! ${result.result.responsesCreated} responses created.`);
        setShowUploadDialog(false);
        resetUploadDialog();
        
        // Update the last message (the upload message) to show completion
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].content.includes('📤 Uploaded:')) {
            newMessages[newMessages.length - 1].content = `📤 Uploaded: ${uploadFile?.name}\n\n✅ Import complete! Survey "${uploadPreview?.suggestedTitle}" imported with ${result.result.responsesCreated} responses. You can now ask questions about this data.`;
          }
          return newMessages;
        });
        
        // Refresh surveys list
        const surveysResponse = await fetch('/api/surveys');
        const surveysData = await surveysResponse.json();
        if (surveysData.surveys) {
          setSurveys(surveysData.surveys);
          // Auto-select the newly imported survey
          if (result.result.surveyId) {
            handleSurveyChange(result.result.surveyId);
          }
        }
      } else {
        toast.error(result.message || 'Failed to import survey');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import survey');
    } finally {
      setUploadLoading(false);
    }
  };

  const resetUploadDialog = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLoading(false);
  };

  // Extract available fields from survey data for cohort filtering
  const extractAvailableFields = (surveyData: any) => {
    if (!surveyData) return [];
    
    const fields: {name: string, label: string, type: string}[] = [];
    
    // Add common demographic fields
    const commonDemographics = [
      { name: 'age', label: 'Age', type: 'demographic' },
      { name: 'gender', label: 'Gender', type: 'demographic' },
      { name: 'location', label: 'Location', type: 'demographic' },
      { name: 'occupation', label: 'Occupation', type: 'demographic' },
      { name: 'education', label: 'Education', type: 'demographic' },
      { name: 'income', label: 'Income', type: 'demographic' }
    ];
    
    fields.push(...commonDemographics);
    
    // Add survey questions as filterable fields
    if (surveyData.questions) {
      surveyData.questions.forEach((question: any, index: number) => {
        const fieldName = question.field_name || `question_${index + 1}`;
        const label = question.prompt || question.title || `Question ${index + 1}`;
        const shortLabel = label.length > 30 ? label.substring(0, 30) + '...' : label;
        
        fields.push({
          name: fieldName,
          label: shortLabel,
          type: question.type || 'question'
        });
      });
    }
    
    return fields;
  };

  // Generate dynamic prompts based on survey data and advanced analytics
  const generateDynamicPrompts = (surveyData: any) => {
    if (!surveyData || !surveyData.questions) return [];
    
    const prompts: string[] = [];
    
    // Fetch survey-specific insights from advanced analytics
    const fetchAnalyticsPrompts = async () => {
      try {
        const response = await fetch(`/api/surveys/${surveyData.id}/schema`);
        if (response.ok) {
          const schemaData = await response.json();
          const analyticsPrompts: string[] = [];
          
          // Extract suggested queries from usage recommendations
          if (schemaData.usage_recommendations) {
            schemaData.usage_recommendations.forEach((rec: any) => {
              if (rec.suggested_queries && rec.suggested_queries.length > 0) {
                // Add the first 2 suggested queries from each recommendation
                analyticsPrompts.push(...rec.suggested_queries.slice(0, 2));
              }
            });
          }
          
          // If we have analytics-based prompts, use those first
          if (analyticsPrompts.length > 0) {
            setDynamicPrompts(analyticsPrompts.slice(0, 3));
            return;
          }
        }
      } catch (error) {
        console.log('Could not fetch analytics prompts, using fallback:', error);
      }
      
      // Fallback to basic prompts if analytics fetch fails
      generateBasicPrompts();
    };
    
    const generateBasicPrompts = () => {
      const questions = surveyData.questions;
      
      // Analyze question types and content to generate relevant prompts
      const hasRatingQuestions = questions.some((q: any) => q.type === 'rating' || q.type === 'scale');
      const hasChoiceQuestions = questions.some((q: any) => q.type === 'single-choice' || q.type === 'multiple-choice');
      const hasTextQuestions = questions.some((q: any) => q.type === 'text');
      
      // Get first few question prompts for specific analysis
      const sampleQuestions = questions.slice(0, 3);
      
      if (hasRatingQuestions) {
        prompts.push("What are the average ratings across different demographics?");
      }
      
      if (hasChoiceQuestions) {
        prompts.push("Show the distribution of responses for multiple choice questions");
      }
      
      if (hasTextQuestions) {
        prompts.push("What are the common themes in open-ended responses?");
      }
      
      // Add survey-specific prompts based on question content
      if (sampleQuestions.length > 0) {
        const firstQuestion = sampleQuestions[0];
        if (firstQuestion.prompt) {
          // Create a prompt about the first question
          const questionSnippet = firstQuestion.prompt.length > 50 
            ? firstQuestion.prompt.substring(0, 50) + "..." 
            : firstQuestion.prompt;
          prompts.push(`Analyze responses to: "${questionSnippet}"`);
        }
      }
      
      // Add general analysis prompts
      prompts.push(`Summarize key insights from "${surveyData.title}"`);
      prompts.push("Compare responses across age groups");
      
      setDynamicPrompts(prompts.slice(0, 3));
    };
    
    // Start with basic prompts immediately, then try to enhance with analytics
    generateBasicPrompts();
    
    // Asynchronously try to get better prompts from analytics
    fetchAnalyticsPrompts();
    
    return prompts.slice(0, 3); // Return initial basic prompts
  };

  // Render data cards (Perplexity-style visualizations)
  const renderDataCards = (dataCards: any[]) => {
    if (!dataCards || dataCards.length === 0) return null;
    
    return (
      <div className="grid gap-4 mt-4 mb-4">
        {dataCards.map((card, index) => (
          <div key={index} className="bg-muted/30 rounded-lg p-4 border">
            <h4 className="font-medium text-sm text-foreground mb-3">{card.title}</h4>
            
            {card.chart_type === 'horizontal_bar' && (
              <div className="space-y-2">
                {card.data.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground truncate">
                      {item.label}
                    </div>
                    <div className="flex-1 bg-muted rounded-full h-2 relative">
                      <div 
                        className="bg-primary h-2 rounded-full" 
                        style={{ width: `${Math.min(item.value, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs font-medium w-12 text-right">
                      {item.value}%
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {card.chart_type === 'metric_card' && (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-foreground">{card.data.average}</div>
                  <div className="text-xs text-muted-foreground">Average</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{card.data.median}</div>
                  <div className="text-xs text-muted-foreground">Median</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{card.data.range}</div>
                  <div className="text-xs text-muted-foreground">Range</div>
                </div>
              </div>
            )}
            
            {card.chart_type === 'pie' && (
              <div className="space-y-1">
                {card.data.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-foreground">{item.label}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderWithCitations=(text:string,citations?:Record<string,string>,isUpload?:boolean)=> {
    const normalizedText = isUpload ? text : normalizeMarkdown(normaliseText(text));
    
    console.log('renderWithCitations called with:', {
      textLength: text.length,
      textPreview: text.slice(0, 200),
      citations: citations,
      citationCount: citations ? Object.keys(citations).length : 0,
      isUpload
    });
    
    if(!citations || Object.keys(citations).length===0) {
      // Handle upload messages with simple paragraph splitting
      if (isUpload) {
        const paragraphs = normalizedText.split('\n\n').filter(p => p.trim());
        return (
          <div className="space-y-2">
            {paragraphs.map((paragraph, index) => (
              <div key={index} className="text-foreground">
                {paragraph.trim()}
              </div>
            ))}
          </div>
        );
      }
      
      return (
        <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-li:my-1 prose-blockquote:text-foreground prose-blockquote:border-l-primary">
          <ReactMarkdown
            remarkPlugins={optionalRemark}
            rehypePlugins={optionalRehype}
            components={{
              h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-foreground border-b border-border pb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-foreground">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-medium mb-2 mt-4 first:mt-0 text-foreground">{children}</h3>,
              p: ({ children }) => <p className="mb-3 leading-relaxed text-foreground">{children}</p>,
              ul: ({ children }) => <ul className="list-disc ml-0 mb-4 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal ml-0 mb-4 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-foreground leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em className="italic text-foreground">{children}</em>,
              blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
              hr: () => <hr className="my-6 border-border" />,
              code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
            }}
          >
            {normalizedText}
          </ReactMarkdown>
        </div>
      );
    }
    
    // Custom component to handle inline citations within markdown
    const CitationMarkdown = ({ children }: { children: React.ReactNode }) => {
      // Recursive function to extract text from any React node structure
      const extractText = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (node === null || node === undefined) return '';
        if (typeof node === 'boolean') return '';
        
        if (Array.isArray(node)) {
          return node.map(extractText).join('');
        }
        
        if (React.isValidElement(node)) {
          // Handle React elements by extracting their children
          const props = node.props as any;
          if (props && props.children) {
            return extractText(props.children);
          }
          return '';
        }
        
        // For any other object types, try to stringify safely
        if (typeof node === 'object') {
          try {
            // If it has a toString method that's not the default Object.toString
            if (node.toString && node.toString !== Object.prototype.toString) {
              return node.toString();
            }
          } catch (e) {
            // Ignore errors
          }
          return '';
        }
        
        return String(node);
      };
      
      const textContent = extractText(children);
      
      // Split text by citation markers but keep them in the result
      const parts = textContent.split(/(\[\d+\])/);
      
      return (
        <>
          {parts.map((part, index) => {
            const citationMatch = part.match(/\[(\d+)\]/);
            if (citationMatch) {
              const num = citationMatch[1];
              const quote = citations[num];
              
              return (
                <Tooltip key={`citation-${index}-${num}`}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-baseline px-1 py-0 mx-0.5 rounded bg-blue-100 cursor-default text-blue-700 hover:bg-blue-200 font-medium text-xs border border-blue-200 leading-none align-baseline">
                      {num}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent 
                    className="max-w-lg text-xs p-3 bg-white border border-gray-200 shadow-lg z-[9999]"
                    side="top"
                    align="start"
                  >
                    <div className="space-y-1">
                      {quote ? (
                        <div className="whitespace-pre-wrap break-words text-gray-900">
                          {String(quote)}
                        </div>
                      ) : (
                        <div className="text-gray-500">Quote not found for [{num}]</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            } else {
              return <span key={index}>{part}</span>;
            }
          })}
        </>
      );
    };
    
    return (
      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-li:my-1 prose-blockquote:text-foreground prose-blockquote:border-l-primary">
        <ReactMarkdown
          remarkPlugins={optionalRemark}
          rehypePlugins={optionalRehype}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-foreground border-b border-border pb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-foreground">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-medium mb-2 mt-4 first:mt-0 text-foreground">{children}</h3>,
            p: ({ children }) => (
              <p className="mb-3 leading-relaxed text-foreground">
                <CitationMarkdown>{children}</CitationMarkdown>
              </p>
            ),
            ul: ({ children }) => <ul className="list-disc ml-0 mb-4 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal ml-0 mb-4 space-y-1">{children}</ol>,
            li: ({ children }) => (
              <li className="text-foreground leading-relaxed">
                <CitationMarkdown>{children}</CitationMarkdown>
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                <CitationMarkdown>{children}</CitationMarkdown>
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-foreground">
                <CitationMarkdown>{children}</CitationMarkdown>
              </em>
            ),
            blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
            hr: () => <hr className="my-6 border-border" />,
            code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
          }}
        >
          {normalizedText}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* Main Content Area */}
      <div className="flex-1 p-1">
        <div className="h-full rounded-lg bg-card text-card-foreground shadow-lg">
          {/* Header */}
          <div className="px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
                <div className="h-4 border-l border-border mx-4" />
                <h1 className="text-base font-medium text-card-foreground">Cohort Chat</h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-0.5 h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={()=>setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? <PanelRight /> : <PanelLeft />}
                <span className="sr-only">Toggle Right Panel</span>
              </Button>
            </div>
          </div>

          <div className="border-b border-border" />

          <div className="p-2">

          {/* Chat Area - No more tabs, just clean chat */}
          <div className="flex flex-col h-[calc(100vh-80px)]">
            {messages.length===0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-6">
                <h1 className="text-2xl font-bold">Ask Questions.</h1>
                <div className="relative w-full max-w-xl">
                  <Textarea 
                    className="flex-1 min-h-[80px] pr-24 resize-none" 
                    placeholder="Ask the cohort…" 
                    value={input} 
                    onChange={e=>setInput(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    rows={2}
                  />
                  <div className="absolute right-2 bottom-2 flex gap-1">
                    <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8" 
                          title="Upload survey file"
                        >
                          <Upload className="h-4 w-4"/>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Import Survey Data</DialogTitle>
                        </DialogHeader>
                        {!uploadPreview ? (
                          <div className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                              <input
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(file);
                                }}
                                className="hidden"
                                id="file-upload-initial"
                              />
                              <label htmlFor="file-upload-initial" className="cursor-pointer">
                                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-lg font-medium mb-2">Drop your survey file here</p>
                                <p className="text-sm text-gray-500">or click to browse (CSV, Excel)</p>
                                <p className="text-xs text-gray-400 mt-2">Max file size: 10MB</p>
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                                                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h3 className="font-medium text-green-800 mb-2">File Analysis Complete</h3>
                                <div className="space-y-2 text-sm">
                                  <p><strong>Title:</strong> {uploadPreview.suggestedTitle}</p>
                                  <p><strong>Responses:</strong> {uploadPreview.totalRows || 0}</p>
                                  <p><strong>Questions:</strong> {uploadPreview.columns?.length || 0}</p>
                                  {uploadPreview.detectedDemographics && uploadPreview.detectedDemographics.length > 0 && (
                                    <p><strong>Demographics:</strong> {uploadPreview.detectedDemographics.join(', ')}</p>
                                  )}
                                </div>
                              </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadDialog(); }}>
                                Cancel
                              </Button>
                              <Button onClick={handleExecuteImport} disabled={uploadLoading}>
                                {uploadLoading ? 'Importing...' : 'Import Survey'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8" 
                      onClick={handleSend} 
                      disabled={isLoading}
                    >
                      <Send className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-center max-w-xl space-y-2">
                  <p className="font-medium text-muted-foreground">
                    {selectedSurveyData ? `Try asking about "${selectedSurveyData.title}":` : "Try asking:"}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {dynamicPrompts.map((prompt, index) => (
                      <div 
                        key={index}
                        className="px-3 py-1.5 border border-border rounded-md bg-background/50 text-muted-foreground hover:bg-background/80 transition-colors cursor-pointer"
                        onClick={() => setInput(prompt)}
                      >
                        &quot;{prompt}&quot;
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-6">
                    {messages.map((m,idx)=>(
                      <div 
                        key={idx} 
                        className="flex gap-4 text-sm justify-start animate-in fade-in duration-500"
                        style={{ 
                          animationDelay: `${Math.min(idx * 50, 500)}ms`,
                          animationFillMode: 'both'
                        }}
                      >
                        {m.role==='agent' && <Avatar className="h-8 w-8 flex-shrink-0"><AvatarImage src="/assets/images/logo-simple.svg"/><AvatarFallback>C</AvatarFallback></Avatar>}
                        {m.role==='user' && <Avatar className="h-8 w-8 flex-shrink-0"><AvatarFallback>U</AvatarFallback></Avatar>}
                        <div className={cn(
                          'rounded-lg px-4 py-3 max-w-[85%] chat-message',
                          m.role==='user'? 'bg-primary text-white':'text-foreground'
                        )}>
                          {m.role==='agent' ? (
                            <TooltipProvider delayDuration={150}>
                              <div className="space-y-1">
                                {m.dataCards && renderDataCards(m.dataCards)}

                                {renderWithCitations(m.content, m.citations, m.isUpload)}
                              </div>
                            </TooltipProvider>
                          ): (
                            <div className="font-medium text-white">
                              {m.content}
                            </div>
                          )}
                          {m.role==='agent' && m.chartSpec && (
                            <div className="mt-4 animate-in fade-in duration-700 delay-300">
                              <ChartRenderer spec={m.chartSpec}/>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-4 text-sm justify-start animate-in fade-in duration-300">
                        <Avatar className="h-8 w-8 flex-shrink-0"><AvatarFallback>C</AvatarFallback></Avatar>
                        <div className="rounded-lg px-4 py-3 text-foreground chat-message">
                          <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-sm opacity-70 font-medium">Analyzing cohort responses...</span>
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
                      className="flex-1 min-h-[80px] pr-24 resize-none" 
                      placeholder="Ask the cohort…" 
                      value={input} 
                      onChange={e=>setInput(e.target.value)} 
                      onKeyDown={handleKeyDown}
                      disabled={isLoading}
                      rows={2}
                    />
                    <div className="absolute right-2 bottom-2 flex gap-1">
                      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                        <DialogTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8" 
                            title="Upload survey file"
                          >
                            <Upload className="h-4 w-4"/>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Import Survey Data</DialogTitle>
                          </DialogHeader>
                          {!uploadPreview ? (
                            <div className="space-y-4">
                              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                <input
                                  type="file"
                                  accept=".csv,.xlsx,.xls"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                  }}
                                  className="hidden"
                                  id="file-upload-bottom"
                                />
                                <label htmlFor="file-upload-bottom" className="cursor-pointer">
                                  <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                  <p className="text-lg font-medium mb-2">Drop your survey file here</p>
                                  <p className="text-sm text-gray-500">or click to browse (CSV, Excel)</p>
                                  <p className="text-xs text-gray-400 mt-2">Max file size: 10MB</p>
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h3 className="font-medium text-green-800 mb-2">File Analysis Complete</h3>
                                <div className="space-y-2 text-sm">
                                  <p><strong>Title:</strong> {uploadPreview.suggestedTitle}</p>
                                  <p><strong>Responses:</strong> {uploadPreview.totalRows || 0}</p>
                                  <p><strong>Questions:</strong> {uploadPreview.columns?.length || 0}</p>
                                  {uploadPreview.detectedDemographics && uploadPreview.detectedDemographics.length > 0 && (
                                    <p><strong>Demographics:</strong> {uploadPreview.detectedDemographics.join(', ')}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadDialog(); }}>
                                  Cancel
                                </Button>
                                <Button onClick={handleExecuteImport} disabled={uploadLoading}>
                                  {uploadLoading ? 'Importing...' : 'Import Survey'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8" 
                        onClick={handleSend} 
                        disabled={isLoading}
                      >
                        <Send className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>
                  {/* Only show suggestions when there are no messages */}
                  {messages.length === 0 && (
                    <div className="text-xs mt-3 space-y-2">
                      <p className="font-medium text-muted-foreground">Examples:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dynamicPrompts.map((prompt, index) => (
                          <div 
                            key={index}
                            className="px-2 py-1 border border-border rounded text-muted-foreground bg-background/50 hover:bg-background/80 transition-colors cursor-pointer"
                            onClick={() => setInput(prompt)}
                          >
                            &quot;{prompt}&quot;
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          </div>
        </div>
      </div>
      
      {/* Right Sidebar */}
      <div className="relative">
        <div className={cn('h-full bg-background transition-all duration-300 ease-in-out', isCollapsed? 'w-0':'w-[350px] overflow-y-auto px-4 py-2')}>
          {!isCollapsed && (
            <Tabs defaultValue="cohort" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="cohort">Cohort</TabsTrigger>
                <TabsTrigger value="agent">Agent</TabsTrigger>
              </TabsList>

              <TabsContent value="cohort" className="space-y-4 mt-4">
                <div className="space-y-4">
                  {/* Survey select */}
                  <div className="space-y-2">
                    <Label>Survey</Label>
                    <Select value={selectedSurveyId? String(selectedSurveyId):'all'} onValueChange={val=>handleSurveyChange(val==='all'? null: Number(val))}>
                      <SelectTrigger><SelectValue placeholder="All"/></SelectTrigger>
                      <SelectContent className="z-50">
                        <SelectItem value="all">All</SelectItem>
                        {surveys.map(s=> <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Cohort select */}
                  <div className="space-y-2">
                    <Label>Cohort (Filter Respondents)</Label>
                    <Select 
                      value={showCohortCreator ? 'create-new' : (selectedCohortId? String(selectedCohortId):'all')} 
                      onValueChange={val=> {
                        if (val === 'create-new') {
                          setShowCohortCreator(true);
                          setSelectedCohortId(null);
                          // Initialize with one empty rule if none exist
                          if (filterRules.length === 0) {
                            setFilterRules([{ field: '', op: '=', value: '' }]);
                          }
                        } else {
                          setShowCohortCreator(false);
                          setSelectedCohortId(val==='all'? null: Number(val));
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="All Respondents"/></SelectTrigger>
                      <SelectContent className="z-50">
                        <SelectItem value="all">All Respondents</SelectItem>
                        {cohorts
                          .filter(c => !selectedSurveyId || c.surveyId === selectedSurveyId)
                          .map(c=> <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)
                        }
                        {selectedSurveyId && (
                          <SelectItem value="create-new" className="text-primary font-medium">
                            + Create New Cohort
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Cohort Creator */}
                  {showCohortCreator && (
                    <div className="space-y-4 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="text-sm font-medium">Create New Cohort</h3>
                          <p className="text-xs text-muted-foreground">
                            {selectedSurveyId 
                              ? "Select fields from your survey to create filter rules"
                              : "Select a survey above to create cohorts for that specific survey"
                            }
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => {
                            setShowCohortCreator(false);
                            setFilterRules([]);
                            setNewCohortName('');
                          }}
                          className="h-8 w-8 p-0"
                        >
                          ×
                        </Button>
                      </div>
                      
                      {filterRules.map((rule, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Select value={rule.field} onValueChange={val=>updateRule(idx,'field',val)}>
                              <SelectTrigger className="w-full text-left">
                                <SelectValue placeholder="Select field" className="text-left"/>
                              </SelectTrigger>
                              <SelectContent className="z-50">
                                {!selectedSurveyId && (
                                  <SelectItem value="" disabled>
                                    Select a survey first
                                  </SelectItem>
                                )}
                                {availableFields.map(field => (
                                  <SelectItem key={field.name} value={field.name}>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{field.label}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {field.type === 'demographic' ? 'Demographics' : 'Survey Question'}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {filterRules.length > 1 && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => setFilterRules(filterRules.filter((_, i) => i !== idx))}
                                className="h-8 w-8 p-0 ml-2 flex-shrink-0"
                              >
                                ×
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <select value={rule.op} onChange={e=>updateRule(idx,'op',e.target.value as any)} className="h-8 rounded-md border border-input bg-background px-2 text-xs w-24">
                              <option value="=">=</option>
                              <option value="IN">IN</option>
                              <option value="CONTAINS">CONTAINS</option>
                            </select>
                            <Input placeholder="value" value={Array.isArray(rule.value)? rule.value.join(','): rule.value as string} onChange={e=>updateRule(idx,'value',e.target.value)} className="flex-1 text-left" />
                          </div>
                        </div>
                      ))}
                      
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => setFilterRules([...filterRules,{ field:'', op:'=', value:''}])}
                        disabled={!selectedSurveyId}
                        className="w-full"
                      >
                        + Add Filter Rule
                      </Button>
                      
                      <div className="space-y-2">
                        <Input placeholder="Enter cohort name (e.g., 'Young Males')" value={newCohortName} onChange={e=>setNewCohortName(e.target.value)} />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setShowCohortCreator(false);
                              setFilterRules([]);
                              setNewCohortName('');
                            }}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={handleSaveCohort} 
                            disabled={saving || !newCohortName.trim() || filterRules.length===0 || !selectedSurveyId} 
                            className="flex-1"
                          >
                            {saving ? 'Saving...' : 'Save Cohort'}
                          </Button>
                        </div>
                      </div>
                                          </div>
                    )}
                  {messages.length>0 && selectedCohortId && (<Button variant="destructive" onClick={handleDeleteCohort}>Delete</Button>)}
                </div>
              </TabsContent>
              
              <TabsContent value="agent" className="space-y-4 mt-4">
                <div className="space-y-4">
                  {/* Model select */}
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={selectedModel} onValueChange={handleModelChange}>
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

                  {/* Temperature control */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Temperature</Label>
                      <span className="text-xs text-muted-foreground">{temperature}</span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => handleTemperatureChange(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0.0 (Precise)</span>
                        <span>1.0 (Creative)</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {temperature === 0.0 && "Maximum precision for data analysis"}
                        {temperature > 0.0 && temperature <= 0.3 && "Low creativity, focused on facts"}
                        {temperature > 0.3 && temperature <= 0.7 && "Balanced creativity and accuracy"}
                        {temperature > 0.7 && "High creativity, more interpretive"}
                      </p>
                    </div>
                  </div>

                  {/* Streaming Mode control */}
                  <div className="space-y-2">
                    <Label>Streaming Quality</Label>
                    <Select value={streamingMode} onValueChange={(value: 'off' | 'smart' | 'buffered' | 'instant') => {
                      setStreamingMode(value);
                      localStorage.setItem('cohort-chat-streaming-mode', value);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="z-50">
                        <SelectItem value="off">Off (no streaming)</SelectItem>
                        <SelectItem value="smart">Smart (recommended)</SelectItem>
                        <SelectItem value="buffered">Buffered</SelectItem>
                        <SelectItem value="instant">Instant</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {streamingMode === 'off' && "Waits for full response - safest formatting"}
                      {streamingMode === 'smart' && "Updates on complete sentences/blocks - best markdown quality"}
                      {streamingMode === 'buffered' && "Updates every 200 characters - balanced speed/quality"}
                      {streamingMode === 'instant' && "Updates on every word - fastest but may break formatting"}
                    </p>
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
                    <Textarea value={systemPrompt} onChange={e=>handleSystemPromptChange(e.target.value)} className="min-h-32"/>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
} 