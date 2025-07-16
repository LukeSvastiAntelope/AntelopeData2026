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
import { ChevronLeft, ChevronRight, Send, PanelLeft, PanelRight, Upload, FileText, X, Plus, MessageCircle, Trash2, ChevronDown, ChevronRight as ChevronRightIcon, FolderOpen, Folder, ChevronUp, BarChart3, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import ChartRenderer from '@/components/ChartRenderer'
import { getAllModels } from '@/app/utils/models'
import remarkSmart from 'remark-smartypants'
import OnboardingEmptyState from '@/components/OnboardingEmptyState'
import SurveyStatsView from '@/components/SurveyStatsView'

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

  interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
    surveyId?: number | null;
    cohortId?: number | null;
  }
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Conversation management state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<number>>(new Set());
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
  const [activeTab, setActiveTab] = useState<'chat' | 'stats'>('chat');
  const [systemPrompt, setSystemPrompt] = useState(`You are an expert survey analyst and data scientist specializing in extracting meaningful insights from survey responses. Your role is to help users understand their survey data through comprehensive analysis and clear communication.

CORE RESPONSIBILITIES:
• Analyze survey responses to identify patterns, trends, and key insights
• Provide data-driven answers with specific evidence from the survey data
• Highlight demographic differences and segment variations when relevant
• Offer actionable recommendations based on findings
• Present complex data in accessible, easy-to-understand language

ANALYSIS APPROACH:
• Always ground your analysis in the actual survey data provided
• Use statistical measures (percentages, correlations, distributions) when appropriate
• Identify outliers, unexpected findings, or interesting patterns
• Compare responses across different demographic groups or cohorts
• Look for sentiment patterns, satisfaction levels, and behavioral indicators

RESPONSE STYLE:
• Start with key findings or executive summary for complex queries
• Use clear headings and bullet points for readability
• Include specific data points and percentages to support your insights
• Explain the significance of findings in practical terms
• Suggest follow-up questions or areas for deeper investigation when relevant

WHEN CITING DATA:
• Reference specific response patterns with citation numbers
• Explain methodology when discussing statistical analysis
• Acknowledge limitations or potential biases in the data
• Distinguish between correlation and causation in your interpretations

Remember: You are not just summarizing data - you are providing expert interpretation that helps users make informed decisions based on their survey insights.`);
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
          // Check for saved survey preference
          const savedSurveyId = localStorage.getItem('cohort-chat-selected-survey');
          if (savedSurveyId && savedSurveyId !== 'null') {
            const surveyId = Number(savedSurveyId);
            // Only set if the survey still exists
            if (data.surveys.find((s: any) => s.id === surveyId)) {
              setSelectedSurveyId(surveyId);
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

  // Load conversations on component mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-expand surveys that contain the current conversation
  useEffect(() => {
    if (currentConversationId && conversations.length > 0) {
      const currentConversation = conversations.find(c => c.id === currentConversationId);
      if (currentConversation?.surveyId) {
        setExpandedSurveys(prev => new Set([...prev, currentConversation.surveyId!]));
      }
    }
  }, [currentConversationId, conversations]);

  // Save conversation whenever messages change
  useEffect(() => {
    if (currentConversationId && messages.length > 0 && !isLoading) {
      // Debounce saving to avoid interfering with streaming
      const timeoutId = setTimeout(() => {
        saveConversation(currentConversationId, messages);
      }, 1000); // Wait 1 second after messages stop changing
      
      return () => clearTimeout(timeoutId);
    }
  }, [messages, currentConversationId, isLoading]);
  
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

    const isEventStream = res.headers.get('content-type')?.includes('text/event-stream');

    // Handle non-streaming JSON responses only when we explicitly requested them *and* the server did not return SSE
    if (streamingMode === 'off' && !isEventStream) {
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
    console.log('🎬 Added placeholder agent message, starting stream processing...');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    console.log('📖 Stream reader initialized');

    while (true) {
      const { done, value } = await reader.read();
      console.log('📥 Stream chunk received:', { done, valueLength: value?.length });
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      console.log('📝 Buffer updated, total length:', buffer.length);
      console.log('📝 Buffer content:', JSON.stringify(buffer));
      
      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      console.log('🔍 Processing lines:', lines.length, 'Remaining buffer:', JSON.stringify(buffer));
      console.log('🔍 All lines:', lines.map((line, i) => `[${i}]: ${JSON.stringify(line)}`));
      
      for (const line of lines) {
        console.log('📄 Processing line:', JSON.stringify(line));
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6); // Remove 'data: ' prefix
          console.log('📊 SSE data found:', JSON.stringify(dataStr));
          
          if (dataStr === '[DONE]') {
            // Stream completed
            console.log('✅ Stream completed with [DONE]');
            continue;
          }
          
          // Skip empty data lines
          if (!dataStr.trim()) {
            console.log('⏭️ Skipping empty data line');
            continue;
          }
          
          try {
            const cleanJsonStr = dataStr.trim();
            console.log('🔍 Attempting to parse JSON:', JSON.stringify(cleanJsonStr));
            const data = JSON.parse(cleanJsonStr);
            console.log('🔧 Parsed JSON data:', data);
            
            // Check if this is a report generation message
            if (data.reportId) {
              console.log('📋 Report generation detected');
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
              console.log('📝 Content found in data:', data.content.slice(0, 100));
              accumulatedContent += data.content;
              console.log('📚 Accumulated content length:', accumulatedContent.length);
              
              // Different streaming modes
              let shouldUpdate = false;
              
              if (streamingMode === 'instant') {
                shouldUpdate = true; // Update on every token
              } else if (streamingMode === 'smart') {
                shouldUpdate = isCompleteUnit(accumulatedContent); // Smart buffering
              } else if (streamingMode === 'buffered') {
                shouldUpdate = accumulatedContent.length % 200 === 0; // Update every 200 chars
              }
              else {
                // Default case - always update for fact sheet responses
                shouldUpdate = true;
              }
              
              console.log('🔄 Should update UI:', shouldUpdate, 'Mode:', streamingMode);
              
              if (shouldUpdate) {
                console.log('🎨 Updating messages with content:', accumulatedContent.slice(0, 100));
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'agent') {
                    // Process partial content for citations during streaming
                    const partialProcessed = processPartialResponse(accumulatedContent, last);
                    console.log('🔧 Partial processing result:', {
                      originalLength: accumulatedContent.length,
                      processedLength: partialProcessed.content.length,
                      hasContent: !!partialProcessed.content,
                      contentPreview: partialProcessed.content.slice(0, 100)
                    });
                    last.content = partialProcessed.content;
                    last.citations = partialProcessed.citations;
                    // Keep existing chartSpec and dataCards during streaming
                    updated[updated.length - 1] = last;
                  }
                  console.log('✅ Messages updated, new length:', updated.length);
                  return updated;
                });
              }
            }
          } catch (error) {
            console.error('❌ JSON parse failed for dataStr:', JSON.stringify(dataStr), 'Error:', error);
            console.error('❌ Original line was:', JSON.stringify(line));
            // If not JSON, treat as plain text (fallback for non-streaming responses)
            if (dataStr.trim()) {
              accumulatedContent += dataStr;
              console.log('📝 Added plain text to accumulated content');
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
          console.log('📄 Non-SSE line found:', line);
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
    
    // Append any remaining buffered data that wasn't followed by a newline (e.g. single-chunk plain text)
    if (buffer.trim()) {
      console.log('📝 Processing remaining buffer:', buffer);
      accumulatedContent += buffer;
    }
    
    console.log('🏁 Stream processing complete, final accumulated content:', accumulatedContent.length, 'chars');
    
    // Final update with complete content and post-processing
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'agent') {
        // Process the complete content
        console.log('🎯 Final processing - raw content length:', accumulatedContent.length);
        const processedContent = processCompleteResponse(accumulatedContent, last);
        console.log('🎯 Final processing result:', {
          content: processedContent.content,
          citations: processedContent.citations,
          chartSpec: processedContent.chartSpec,
          dataCards: processedContent.dataCards
        });
        console.log('🎯 Setting final message state:', {
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
      console.log('🏆 Final messages array length:', updated.length);
      return updated;
    });
    setIsLoading(false);
    console.log('🎬 Stream processing finished, isLoading set to false');
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
  const generateDynamicPrompts = (surveyData: any, forceRefresh = false) => {
    if (!surveyData || !surveyData.questions) return [];
    
    const prompts: string[] = [];
    
    // Check if we already have cached prompts for this survey
    const cacheKey = `survey-prompts-${surveyData.id}`;
    const cachedPrompts = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}-timestamp`);
    
    // Use cached prompts if they exist and are less than 1 hour old (unless force refresh)
    if (!forceRefresh && cachedPrompts && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp);
      if (cacheAge < 60 * 60 * 1000) { // 1 hour cache
        try {
          const parsedPrompts = JSON.parse(cachedPrompts);
          if (parsedPrompts.length > 0) {
            setDynamicPrompts(parsedPrompts);
            console.log('📊 Using cached dynamic prompts for survey', surveyData.id);
            return;
          }
        } catch (error) {
          console.log('Error parsing cached prompts:', error);
        }
      }
    }
    
    // Fetch survey-specific insights from advanced analytics
    const fetchAnalyticsPrompts = async () => {
      try {
        console.log('📊 Fetching analytics prompts for survey', surveyData.id, forceRefresh ? '(force refresh)' : '');
        const schemaUrl = `/api/surveys/${surveyData.id}/schema${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(schemaUrl);
        if (response.ok) {
          const schemaData = await response.json();
          const analyticsPrompts: string[] = [];
          
          // Log cache status
          if (schemaData.access_info?.from_cache) {
            console.log('📊 Schema data served from cache');
          } else {
            console.log('📊 Schema data generated fresh');
          }
          
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
            const finalPrompts = analyticsPrompts.slice(0, 3);
            setDynamicPrompts(finalPrompts);
            
            // Cache the prompts
            localStorage.setItem(cacheKey, JSON.stringify(finalPrompts));
            localStorage.setItem(`${cacheKey}-timestamp`, Date.now().toString());
            
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

  // Conversation management functions
  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const response = await fetch('/api/conversations', {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        
        // If no current conversation, create a new one
        if (!currentConversationId && data.conversations.length === 0) {
          createNewConversation();
        } else if (!currentConversationId && data.conversations.length > 0) {
          // Load the most recent conversation
          const mostRecent = data.conversations[0];
          setCurrentConversationId(mostRecent.id);
          setMessages(mostRecent.messages || []);
          
          // Set survey context from the loaded conversation if not already set
          if (!selectedSurveyId && mostRecent.surveyId) {
            setSelectedSurveyId(mostRecent.surveyId);
            localStorage.setItem('cohort-chat-selected-survey', String(mostRecent.surveyId));
          }
          
          // Set cohort context from the loaded conversation if not already set
          if (!selectedCohortId && mostRecent.cohortId) {
            setSelectedCohortId(mostRecent.cohortId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  const saveConversation = async (conversationId: string, messages: ChatMessage[], title?: string) => {
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: conversationId,
          title: title || generateConversationTitle(messages),
          messages,
          surveyId: selectedSurveyId,
          cohortId: selectedCohortId
        })
      });
      
      // Update local state
      setConversations(prev => {
        const existing = prev.find(c => c.id === conversationId);
        const updatedConversation = {
          id: conversationId,
          title: title || generateConversationTitle(messages),
          messages,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          surveyId: selectedSurveyId,
          cohortId: selectedCohortId
        };
        
        if (existing) {
          return prev.map(c => c.id === conversationId ? updatedConversation : c);
        } else {
          return [updatedConversation, ...prev];
        }
      });
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const createNewConversation = () => {
    const newId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentConversationId(newId);
    setMessages([]);
    
    // Create empty conversation in state with current survey context
    const newConversation: Conversation = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surveyId: selectedSurveyId,
      cohortId: selectedCohortId
    };
    
    setConversations(prev => [newConversation, ...prev]);
    
    // Auto-expand the survey if one is selected
    if (selectedSurveyId) {
      setExpandedSurveys(prev => new Set([...prev, selectedSurveyId]));
    }
  };

  const switchConversation = (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      setCurrentConversationId(conversationId);
      setMessages(conversation.messages || []);
      
      // Only update survey/cohort if they're actually different to prevent unnecessary effects
      if (conversation.surveyId !== selectedSurveyId) {
        setSelectedSurveyId(conversation.surveyId || null);
        // Update localStorage when survey actually changes
        localStorage.setItem('cohort-chat-selected-survey', conversation.surveyId ? String(conversation.surveyId) : 'null');
      }
      
      if (conversation.cohortId !== selectedCohortId) {
        setSelectedCohortId(conversation.cohortId || null);
      }
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      // If we deleted the current conversation, create a new one
      if (currentConversationId === conversationId) {
        createNewConversation();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const generateConversationTitle = (messages: ChatMessage[]): string => {
    if (messages.length === 0) return 'New Conversation';
    
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      // Take first 40 characters of the first user message for more concise titles
      return firstUserMessage.content.slice(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '');
    }
    
    return 'New Conversation';
  };

  // Group conversations by survey
  const groupConversationsBySurvey = () => {
    const groups: { [key: string]: Conversation[] } = {};
    
    conversations.forEach(conversation => {
      const key = conversation.surveyId ? `survey-${conversation.surveyId}` : 'no-survey';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(conversation);
    });
    
    // Sort conversations within each group by createdAt (newest first) to maintain stable order
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    
    return groups;
  };

  const toggleSurveyExpansion = (surveyId: number) => {
    setExpandedSurveys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(surveyId)) {
        newSet.delete(surveyId);
      } else {
        newSet.add(surveyId);
      }
      return newSet;
    });
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

  // Add new state for inline survey selector
  const [showSurveyDropdown, setShowSurveyDropdown] = useState(false);
  
  // Click outside handler for survey dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSurveyDropdown) {
        const target = event.target as Element;
        if (!target.closest('[data-survey-dropdown]')) {
          setShowSurveyDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSurveyDropdown]);

  // Handler for inline survey selection
  const handleInlineSurveySelect = (surveyId: number) => {
    handleSurveyChange(surveyId);
    setShowSurveyDropdown(false);
    
    // Add a survey selection message to the chat
    const selectedSurvey = surveys.find(s => s.id === surveyId);
    if (selectedSurvey) {
      const surveyMessage: ChatMessage = {
        role: 'user',
        content: `📊 **Survey Selected:** ${selectedSurvey.title}`,
        isUpload: false
      };
      setMessages(prev => [...prev, surveyMessage]);
    }
  };

  // Handlers for OnboardingEmptyState
  const handleTryDemo = () => {
    // Find the Pew Research survey
    const pewSurvey = surveys.find(s => 
      s.title.toLowerCase().includes('pew research') || 
      s.title.toLowerCase().includes('trend wave')
    );
    
    if (pewSurvey) {
      handleSurveyChange(pewSurvey.id);
      toast.success(`Demo loaded: ${pewSurvey.title}`);
    } else {
      toast.error('Demo survey not available');
    }
  };

  const handleCreateSurvey = () => {
    // Navigate to survey creation
    window.location.href = '/create/survey';
  };

  const handleImportData = () => {
    // Open upload dialog
    setShowUploadDialog(true);
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  const handleOnboardingSurveySelect = (surveyId: number) => {
    handleSurveyChange(surveyId);
  };

  const handleUploadClick = () => {
    setShowUploadDialog(true);
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* Main Content Area */}
      <div className="flex-1 p-1">
        <div className="h-full rounded-lg bg-card text-card-foreground shadow-lg">
          {/* Header */}
          <div className="px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center relative">
                <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
                <div className="h-4 border-l border-border mx-4" />
                {!selectedSurveyId ? (
                  <button
                    onClick={() => setShowSurveyDropdown(!showSurveyDropdown)}
                    className="flex items-center gap-2 text-base font-medium text-card-foreground hover:text-foreground transition-colors"
                  >
                    <span>Select Survey</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ) : (
                  <h1 className="text-base font-medium text-card-foreground">
                    {surveys.find(s => s.id === selectedSurveyId)?.title || 'Survey'}
                  </h1>
                )}
                
                {/* Header Survey Dropdown */}
                {!selectedSurveyId && showSurveyDropdown && (
                  <div className="absolute top-full left-16 mt-2 w-80 bg-popover border border-border rounded-md shadow-lg z-50" data-survey-dropdown>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">Select Survey</h4>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setShowSurveyDropdown(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {surveys.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No surveys available
                          </div>
                        ) : (
                          surveys.map((survey) => (
                            <div
                              key={survey.id}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-muted",
                                selectedSurveyId === survey.id && "bg-muted"
                              )}
                              onClick={() => {
                                handleSurveyChange(survey.id);
                                setShowSurveyDropdown(false);
                              }}
                            >
                              <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {survey.title}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={createNewConversation}
                  title="New Conversation"
                >
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">New Conversation</span>
                </Button>
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
          </div>

          <div className="border-b border-border" />

          <div className="p-2">

          {/* Chat Area - Only show if survey is selected */}
          <div className="flex flex-col h-full">
            {!selectedSurveyId ? (
              <OnboardingEmptyState
                onTryDemo={handleTryDemo}
                onCreateSurvey={handleCreateSurvey}
                onImportData={handleImportData}
                onPromptClick={handlePromptClick}
                dynamicPrompts={dynamicPrompts}
                selectedSurveyData={selectedSurveyData}
                hasFeaturedSurvey={surveys.some(s => 
                  s.title.toLowerCase().includes('pew research') || 
                  s.title.toLowerCase().includes('trend wave')
                )}
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                isLoading={isLoading}
                surveys={surveys}
                selectedSurveyId={selectedSurveyId}
                onSurveySelect={handleOnboardingSurveySelect}
                onUploadClick={handleUploadClick}
              />
            ) : messages.length === 0 ? (
              <OnboardingEmptyState
                onTryDemo={handleTryDemo}
                onCreateSurvey={handleCreateSurvey}
                onImportData={handleImportData}
                onPromptClick={handlePromptClick}
                dynamicPrompts={dynamicPrompts}
                selectedSurveyData={selectedSurveyData}
                hasFeaturedSurvey={surveys.some(s => 
                  s.title.toLowerCase().includes('pew research') || 
                  s.title.toLowerCase().includes('trend wave')
                )}
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                isLoading={isLoading}
                surveys={surveys}
                selectedSurveyId={selectedSurveyId}
                onSurveySelect={handleOnboardingSurveySelect}
                onUploadClick={handleUploadClick}
              />
            ) : (
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'stats')} className="flex flex-col flex-1">
                <div className="px-4 pt-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="chat" className="gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Chat
                    </TabsTrigger>
                    <TabsTrigger value="stats" className="gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Stats
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="chat" className="flex flex-col flex-1 mt-0">
                  <div className="flex flex-col flex-1">
                    <ScrollArea className="flex-1 min-h-0">
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
                    
                    {/* Chat input at bottom of screen for active conversations */}
                    <div className="sticky bottom-0 p-4 pt-0 bg-card">
                      <div className="relative">
                        <div className="relative">
                          <Textarea 
                            className="min-h-[80px] pl-4 pr-4 resize-none" 
                            placeholder="Ask the cohort…" 
                            value={input} 
                            onChange={e=>setInput(e.target.value)} 
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            rows={2}
                          />
                          
                          {/* Left side buttons - Plus and Upload - positioned inside textarea */}
                          <div className="absolute left-2 bottom-2 flex gap-1">
                            {/* Plus button for survey selection */}
                            <div className="relative">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 flex-shrink-0"
                                onClick={() => setShowSurveyDropdown(!showSurveyDropdown)}
                                title="Select survey"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              
                              {/* Survey dropdown */}
                              {showSurveyDropdown && (
                                <div className="absolute bottom-full left-0 mb-2 w-80 bg-popover border border-border rounded-md shadow-lg z-50" data-survey-dropdown>
                                  <div className="p-3">
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="font-medium text-sm">Select Survey</h4>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6"
                                        onClick={() => setShowSurveyDropdown(false)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                      {surveys.length === 0 ? (
                                        <div className="text-center py-4 text-muted-foreground text-sm">
                                          No surveys available
                                        </div>
                                      ) : (
                                        surveys.map((survey) => (
                                          <div
                                            key={survey.id}
                                            className={cn(
                                              "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-muted",
                                              selectedSurveyId === survey.id && "bg-muted"
                                            )}
                                            onClick={() => handleInlineSurveySelect(survey.id)}
                                          >
                                            <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium truncate">
                                                {survey.title}
                                              </div>
                                            </div>
                                            {selectedSurveyId === survey.id && (
                                              <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0" />
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Upload button */}
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8" 
                              onClick={handleUploadClick}
                              title="Upload survey file"
                            >
                              <Upload className="h-4 w-4"/>
                            </Button>
                          </div>
                          
                          {/* Send button - positioned inside textarea on the right */}
                          <div className="absolute right-2 bottom-2">
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
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="stats" className="flex-1 mt-0">
                  {selectedSurveyId && (
                    <SurveyStatsView surveyId={selectedSurveyId} />
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
          </div>
        </div>
      </div>
      
      {/* Right Sidebar */}
      <div className="relative">
        <div className={cn('h-screen bg-background transition-all duration-300 ease-in-out sticky top-0', isCollapsed? 'w-0':'w-[350px] overflow-y-auto px-4 py-2')}>
          {!isCollapsed && (
            <Tabs defaultValue="conversations" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="conversations">Conversations</TabsTrigger>
                <TabsTrigger value="cohort">Cohort</TabsTrigger>
                <TabsTrigger value="agent">Agent</TabsTrigger>
              </TabsList>

              <TabsContent value="conversations" className="space-y-4 mt-4">
                <div className="space-y-1">
                  {conversationsLoading ? (
                    <div className="text-center py-4">
                      <div className="text-muted-foreground">Loading conversations...</div>
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-muted-foreground text-sm">No conversations yet</p>
                      <p className="text-xs text-muted-foreground">Start a new conversation to see it here</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(() => {
                        const groupedConversations = groupConversationsBySurvey();
                        const surveyGroups = Object.keys(groupedConversations).filter(key => key !== 'no-survey');
                        const noSurveyConversations = groupedConversations['no-survey'] || [];
                        
                        return (
                          <>
                            {/* Survey-grouped conversations */}
                            {surveyGroups.map((groupKey) => {
                              const surveyId = parseInt(groupKey.replace('survey-', ''));
                              const survey = surveys.find(s => s.id === surveyId);
                              const groupConversations = groupedConversations[groupKey];
                              const isExpanded = expandedSurveys.has(surveyId);
                              
                              return (
                                <div key={groupKey} className="space-y-1">
                                  {/* Survey Header */}
                                  <div
                                    className="flex items-center gap-2 px-2 py-0.5 rounded-md hover:bg-muted/50 cursor-pointer group"
                                    onClick={() => toggleSurveyExpansion(surveyId)}
                                  >
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      {isExpanded ? (
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                      ) : (
                                        <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      {isExpanded ? (
                                        <FolderOpen className="h-3 w-3 text-muted-foreground" />
                                      ) : (
                                        <Folder className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      <span className="text-xs font-medium text-foreground truncate">
                                        {survey?.title || 'Unknown Survey'}
                                      </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                                      {groupConversations.length}
                                    </span>
                                  </div>
                                  
                                  {/* Conversations under this survey */}
                                  {isExpanded && (
                                    <div className="ml-6 space-y-1">
                                      {groupConversations.map((conversation) => (
                                        <div
                                          key={conversation.id}
                                          className={cn(
                                            "flex items-center gap-2 px-2 py-0 cursor-pointer transition-colors group rounded-md",
                                            currentConversationId === conversation.id
                                              ? "text-primary font-semibold"
                                              : "text-foreground hover:text-primary hover:bg-muted/50"
                                          )}
                                          onClick={() => switchConversation(conversation.id)}
                                        >
                                          <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                          <div className="flex-1 min-w-0 text-xs truncate">
                                            {conversation.title}
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteConversation(conversation.id);
                                            }}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            
                            {/* Conversations without a survey */}
                            {noSurveyConversations.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 px-2 py-0.5">
                                  <Folder className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground">
                                    General Conversations
                                  </span>
                                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                                    {noSurveyConversations.length}
                                  </span>
                                </div>
                                <div className="ml-6 space-y-1">
                                  {noSurveyConversations.map((conversation) => (
                                    <div
                                      key={conversation.id}
                                      className={cn(
                                        "flex items-center gap-2 px-2 py-0 cursor-pointer transition-colors group rounded-md",
                                        currentConversationId === conversation.id
                                          ? "text-primary font-semibold"
                                          : "text-foreground hover:text-primary hover:bg-muted/50"
                                      )}
                                      onClick={() => switchConversation(conversation.id)}
                                    >
                                      <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0 text-xs truncate">
                                        {conversation.title}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteConversation(conversation.id);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </TabsContent>

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
                    <div className="flex items-center justify-between">
                      <Label>Agent Instructions</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSystemPrompt(`You are an expert survey analyst and data scientist specializing in extracting meaningful insights from survey responses. Your role is to help users understand their survey data through comprehensive analysis and clear communication.

CORE RESPONSIBILITIES:
• Analyze survey responses to identify patterns, trends, and key insights
• Provide data-driven answers with specific evidence from the survey data
• Highlight demographic differences and segment variations when relevant
• Offer actionable recommendations based on findings
• Present complex data in accessible, easy-to-understand language

ANALYSIS APPROACH:
• Always ground your analysis in the actual survey data provided
• Use statistical measures (percentages, correlations, distributions) when appropriate
• Identify outliers, unexpected findings, or interesting patterns
• Compare responses across different demographic groups or cohorts
• Look for sentiment patterns, satisfaction levels, and behavioral indicators

RESPONSE STYLE:
• Start with key findings or executive summary for complex queries
• Use clear headings and bullet points for readability
• Include specific data points and percentages to support your insights
• Explain the significance of findings in practical terms
• Suggest follow-up questions or areas for deeper investigation when relevant

WHEN CITING DATA:
• Reference specific response patterns with citation numbers
• Explain methodology when discussing statistical analysis
• Acknowledge limitations or potential biases in the data
• Distinguish between correlation and causation in your interpretations

Remember: You are not just summarizing data - you are providing expert interpretation that helps users make informed decisions based on their survey insights.`);
                        }}
                      >
                        Reset to Default
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Customize how the AI agent analyzes and presents survey insights. The default instruction provides comprehensive analytical capabilities.
                    </p>
                    <Textarea 
                      value={systemPrompt} 
                      onChange={e=>handleSystemPromptChange(e.target.value)} 
                      className="min-h-32"
                      placeholder="Enter custom instructions for how the AI should analyze and respond to survey questions..."
                    />
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