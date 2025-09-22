'use client';

import React, { useEffect, useState, useRef } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { 
  Cohort, 
  CohortFilterRule, 
  ChatMessage, 
  Conversation, 
  StreamingMode, 
  ModelConfig, 
  DataSources, 
  Survey, 
  SurveyField, 
  SurveyData 
} from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Send, PanelLeft, PanelRight, Upload, FileText, X, Plus, MessageCircle, Trash2, ChevronDown, ChevronRight as ChevronRightIcon, FolderOpen, Folder, ChevronUp, BarChart3, RefreshCw, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import dynamic from 'next/dynamic';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import ChartRenderer from '@/components/ChartRenderer'
import { getAllModels } from '@/app/utils/models'
import OnboardingEmptyState from '@/components/OnboardingEmptyState'
import SurveyStatsView from '@/components/SurveyStatsView'
import { DEFAULT_SYSTEM_PROMPT } from './constants';
import { DynamicCohortBuilder } from '@/components/DynamicCohortBuilder'
import { 
  optionalRemark, 
  optionalRehype, 
  normaliseText, 
  normalizeMarkdown,
  isCompleteUnit, 
  processPartialResponse, 
  processCompleteResponse 
} from './utils';
import { useSurveyPrompts } from './hooks/useSurveyPrompts';
import { extractAvailableFields as extractFieldsUtil } from './utils/extractAvailableFields';
import { MessageList, ChatInput, ConfigurationPanel, ConversationManager, CohortPanel, ChatView, HeaderBar } from './components';
import { useChatStreaming } from './hooks/useChatStreaming';
import { useSaveConversation } from './hooks/useSaveConversation';
import { ConversationTypeDialog } from './components/conversation-type-dialog';
// Lazy-load heavy code analysis UI to reduce initial bundle size
const CodeConversation = dynamic(() =>
  import('./components/code-conversation').then((m) => m.CodeConversation),
  { ssr: false }
);





export default function CohortChatPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<number | null>(null);
  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [codeMessages, setCodeMessages] = useState<any[]>([]);
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
  const { prompts: surveyPrompts, refresh: refreshSurveyPrompts } = useSurveyPrompts(selectedSurveyData);
  const [availableFields, setAvailableFields] = useState<{name: string, label: string, type: string}[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.0);
  const [sources, setSources] = useState<{survey: boolean; twins: boolean; web: boolean}>({survey: true, twins: true, web: false});
  const [activeTab, setActiveTab] = useState<'chat' | 'stats'>('chat');
  const [showConversationTypeDialog, setShowConversationTypeDialog] = useState(false);
  const [currentConversationType, setCurrentConversationType] = useState<'chat' | 'code'>('chat');
  const [pythonEnvironmentInitialized, setPythonEnvironmentInitialized] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
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

  // Sync prompts from hook
  useEffect(() => {
    setDynamicPrompts(surveyPrompts || []);
  }, [surveyPrompts]);

  // Fetch survey details when selectedSurveyId changes
  useEffect(() => {
    if (selectedSurveyId) {
      fetch(`/api/surveys/${selectedSurveyId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status && data.survey) {
            setSelectedSurveyData(data.survey);
            // refresh prompts cache for this survey
            refreshSurveyPrompts(true);
            const fields = extractFieldsUtil(data.survey);
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

  // Save conversation whenever messages change (chat or code)
  useEffect(() => {
    console.log('🔄 SAVE EFFECT TRIGGERED:', {
      currentConversationId,
      messageCount: messages.length,
      codeMessageCount: codeMessages.length,
      isLoading,
      currentConversationType,
      trigger: 'useEffect dependency change'
    });
    
    // Don't save if we're loading conversations or if we have an empty state that looks like initialization
    const hasActualMessages = currentConversationType === 'code' ? codeMessages.length > 1 : messages.length > 1;
    const shouldSave = currentConversationId && hasActualMessages && !isLoading;
    
    if (shouldSave) {
      console.log('⏰ SCHEDULING SAVE in 1 second...');
      // Debounce saving to avoid interfering with streaming
      const timeoutId = setTimeout(() => {
        // Double-check we still have messages before saving
        if (currentConversationType === 'code' && codeMessages.length > 1) {
          console.log('💾 SAVING CODE CONVERSATION with', codeMessages.length, 'messages');
          saveConversation(currentConversationId, codeMessages);
        } else if (currentConversationType === 'chat' && messages.length > 1) {
          console.log('💾 SAVING CHAT CONVERSATION with', messages.length, 'messages');
          saveConversation(currentConversationId, messages);
        } else {
          console.log('🚫 SKIPPING SAVE - insufficient messages at save time');
        }
      }, 1000); // Wait 1 second after messages stop changing
      
      return () => {
        console.log('🚫 CANCELLING PREVIOUS SAVE TIMEOUT');
        clearTimeout(timeoutId);
      };
    } else {
      console.log('❌ NOT SAVING:', {
        hasConversationId: !!currentConversationId,
        hasActualMessages,
        isNotLoading: !isLoading,
        currentMessageCount: currentConversationType === 'code' ? codeMessages.length : messages.length,
        reason: !currentConversationId ? 'no conversation ID' : 
                !hasActualMessages ? 'insufficient messages (need >1)' :
                isLoading ? 'still loading' : 'unknown'
      });
    }
  }, [messages, codeMessages, currentConversationId, isLoading, currentConversationType]);
  
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
    
    // Switch to the appropriate conversation for this survey
    if (surveyId) {
      // Find conversations for this survey
      const surveyConversations = conversations.filter(c => c.surveyId === surveyId);
      
      if (surveyConversations.length > 0) {
        // Switch to the most recent conversation for this survey
        const mostRecentConversation = surveyConversations[0]; // conversations are sorted by date
        switchConversation(mostRecentConversation.id);
      } else {
        // No conversations for this survey, create a new one
        createNewConversation();
      }
    } else {
      // No survey selected, switch to most recent conversation overall or create new
      if (conversations.length > 0) {
        switchConversation(conversations[0].id);
      } else {
        createNewConversation();
      }
    }
  };

  const streamAbortRef = useRef<AbortController | null>(null);
  const { appendChunk, finalize } = useChatStreaming({
    streamingMode,
    processPartialResponse,
  });

  const { saveConversation } = useSaveConversation({
    currentConversationType,
    selectedSurveyId,
    selectedCohortId,
    setConversations,
  });

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error('Please enter a question');
      return;
    }
    const question = input.trim();
    setInput('');
    // Create stable IDs first
    const userId = `user-${Date.now()}`;
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // In a single update, append the user message first, then the assistant placeholder
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', content: question } as any,
      { id: agentId, role: 'agent', content: '', citations: {} } as any,
    ]);
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

    // 🚨 DEBUG: Track surveyId being sent
    console.log('🚨 FRONTEND DEBUG: selectedSurveyId value:', selectedSurveyId);
    console.log('🚨 FRONTEND DEBUG: Will send surveyId:', selectedSurveyId || 'NOT_SENT');

    const payload: any = {
      cohort: selectedCohortId ? { id: selectedCohortId } : undefined,
      question,
      model: selectedModel,
      temperature,
      sources,
      systemPrompt: enhancedSystemPrompt,
    };

    // Only include surveyId if it has a valid value
    if (selectedSurveyId) {
      payload.surveyId = selectedSurveyId;
      console.log('✅ FRONTEND DEBUG: Including surveyId in payload:', selectedSurveyId);
    } else {
      console.log('❌ FRONTEND DEBUG: No surveyId selected - will use old code path');
      // Replace the placeholder agent message with a helpful prompt instead of adding another bubble
      const noSurveyMessage = `Please select a survey from the dropdown above to analyze your question. Without a survey selection, I can only provide general demographic information.`;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'agent' && (last as any).id === agentId) {
          (last as any).content = noSurveyMessage;
          updated[updated.length - 1] = last;
        } else {
          updated.push({ role: 'agent', content: noSurveyMessage } as any);
        }
        return updated;
      });
      setIsLoading(false);
      return; // Exit early
    }

    if (streamingMode === 'off') {
      payload.stream = false;
    }

    // Abort any in-flight request
    if (streamAbortRef.current) {
      try { streamAbortRef.current.abort(); } catch {}
    }
    streamAbortRef.current = new AbortController();

    const res = await fetch('/api/cohort/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: streamAbortRef.current.signal,
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
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'agent' && (last as any).id === agentId) {
            (last as any).content = immediateResponse + '\n\n📊 **Generating detailed report...**';
            (last as any).reportId = json.reportId;
            (last as any).reportStatus = 'initiated';
            updated[updated.length - 1] = last;
          }
          return updated;
        });
        setIsLoading(false);
        return;
      }
      
      // Regular response
      const finalContent = json.content || json.result || json.text || '';
      const processed = processCompleteResponse(String(finalContent), {});
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'agent' && (last as any).id === agentId) {
          (last as any).content = processed.content;
          (last as any).citations = processed.citations;
          (last as any).chartSpec = processed.chartSpec;
          (last as any).dataCards = json.dataCards || processed.dataCards;
          updated[updated.length - 1] = last;
        } else {
          updated.push({
            role: 'agent',
            content: processed.content,
            citations: processed.citations,
            chartSpec: processed.chartSpec,
            dataCards: json.dataCards || processed.dataCards
          } as any);
        }
        return updated;
      });
      setIsLoading(false);
      return;
    }

    if (!res.body) {
      toast.error('No response');
      // Replace placeholder with an error message so no extra bubbles linger
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'agent' && (last as any).id === agentId) {
          (last as any).content = 'No response received from the server.';
          updated[updated.length - 1] = last;
        }
        return updated;
      });
      setIsLoading(false);
      return;
    }

    // placeholder already added above
    console.log('🎬 Placeholder agent message already added, starting stream processing...');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const accumulatedContent = '';
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
                appendChunk(data.content, setMessages, streamingMode);
            }
          } catch (error) {
            console.error('❌ JSON parse failed for dataStr:', JSON.stringify(dataStr), 'Error:', error);
            console.error('❌ Original line was:', JSON.stringify(line));
            // If not JSON, treat as plain text (fallback for non-streaming responses)
            if (dataStr.trim()) {
              appendChunk(dataStr, setMessages, streamingMode);
            }
          }
        } else if (line.trim() && !line.startsWith('data: ')) {
          console.log('📄 Non-SSE line found:', line);
          // Handle non-SSE content (fallback for plain text responses)
          appendChunk(line + '\n', setMessages, streamingMode);
        }
      }
    }
    
    // Append any remaining buffered data that wasn't followed by a newline (e.g. single-chunk plain text)
    if (buffer.trim()) {
      appendChunk(buffer, setMessages, streamingMode);
    }
    
    console.log('🏁 Stream processing complete, final accumulated content:', accumulatedContent.length, 'chars');
    
    // Final update with complete content and post-processing
    finalize(setMessages);
    let aggregatedContent = '';
    // Join all chunks processed so far by reading from the last agent message
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'agent') {
        aggregatedContent = last.content || '';
        const processedContent = processCompleteResponse(aggregatedContent, last);
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

  // moved: extractAvailableFields util

  // moved: dynamic prompt generation handled by useSurveyPrompts hook

  // Conversation management functions
  const loadConversations = async () => {
    console.log('📥 LOADING CONVERSATIONS from API...');
    setConversationsLoading(true);
    try {
      const response = await fetch('/api/conversations', {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 LOADED CONVERSATIONS:', {
          count: data.conversations?.length || 0,
          conversations: data.conversations?.map((c: any) => ({
            id: c.id,
            title: c.title,
            type: c.type,
            messageCount: c.messages?.length || 0,
            surveyId: c.surveyId
          })) || []
        });
        
        setConversations(data.conversations || []);
        
        // If no current conversation, create a new one
        if (!currentConversationId && data.conversations.length === 0) {
          console.log('🆕 No conversations found, creating new one');
          createNewConversation();
        } else if (!currentConversationId && data.conversations.length > 0) {
          // Load the most recent conversation
          const mostRecent = data.conversations[0];
          console.log('🔄 Loading most recent conversation:', mostRecent.id, 'type:', mostRecent.type);
          setCurrentConversationId(mostRecent.id);
          setCurrentConversationType(mostRecent.type || 'chat');
          
          // Load messages into the appropriate state based on conversation type
          if (mostRecent.type === 'code') {
            console.log('💾 LOADING CODE CONVERSATION with', mostRecent.messages?.length || 0, 'messages');
            setCodeMessages(mostRecent.messages || []);
            setMessages([]); // Clear chat messages
            setPythonEnvironmentInitialized(true); // Ensure environment is ready
          } else {
            console.log('💬 LOADING CHAT CONVERSATION with', mostRecent.messages?.length || 0, 'messages');
            setMessages(mostRecent.messages || []);
            setCodeMessages([]); // Clear code messages
          }
          
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
      } else {
        console.log('❌ Failed to load conversations:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  // moved: saveConversation logic into useSaveConversation hook

  const createNewConversation = (type: 'chat' | 'code' = 'chat') => {
    console.log('🆕 CREATE NEW CONVERSATION DEBUG:');
    console.log('   - selectedSurveyId:', selectedSurveyId);
    console.log('   - selectedCohortId:', selectedCohortId);
    console.log('   - conversationType:', type);
    console.log('   - Will create conversation with surveyId:', selectedSurveyId || 'NULL');
    
    const newId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentConversationId(newId);
    setCurrentConversationType(type);
    
    // Clear messages based on conversation type
    if (type === 'code') {
      setCodeMessages([]);
      setMessages([]); // Also clear chat messages
    } else {
      setMessages([]);
      setCodeMessages([]); // Also clear code messages
    }
    
    // Create empty conversation in state with current survey context
    const newConversation: Conversation = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surveyId: selectedSurveyId,
      cohortId: selectedCohortId,
      type: type
    };
    
    console.log('✅ New conversation created:', {
      id: newId,
      surveyId: newConversation.surveyId,
      cohortId: newConversation.cohortId,
      type: newConversation.type
    });
    
    setConversations(prev => [newConversation, ...prev]);
    
    // Auto-expand the survey if one is selected
    if (selectedSurveyId) {
      setExpandedSurveys(prev => new Set([...prev, selectedSurveyId]));
      console.log('📂 Auto-expanded survey:', selectedSurveyId);
    } else {
      console.log('⚠️ WARNING: No selectedSurveyId - conversation will not have survey context!');
    }
  };

  const handleNewConversation = () => {
    if (selectedSurveyId) {
      // If survey is selected, show type dialog
      setShowConversationTypeDialog(true);
    } else {
      // If no survey, create regular chat
      createNewConversation('chat');
    }
  };

  const handleConversationTypeSelect = (type: 'chat' | 'code') => {
    if (type === 'code' && !pythonEnvironmentInitialized) {
      // Show loading state immediately for code conversations
      setPythonEnvironmentInitialized(true);
    }
    createNewConversation(type);
  };

  const switchConversation = async (conversationId: string) => {
    console.log('🔄 SWITCHING TO CONVERSATION:', conversationId);
    const conversation = conversations.find(c => c.id === conversationId);
    console.log('📋 FOUND CONVERSATION:', {
      found: !!conversation,
      type: conversation?.type,
      messageCount: conversation?.messages?.length,
      title: conversation?.title,
      surveyId: conversation?.surveyId
    });
    
    if (conversation) {
      // Set loading state to prevent saves during switching
      console.log('🔒 SETTING LOADING STATE during conversation switch');
      setIsLoading(true);
      
      setCurrentConversationId(conversationId);
      setCurrentConversationType(conversation.type || 'chat');
      
      // Lazy-load messages from API to avoid heavy initial payloads
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          const loadedMessages = data.conversation?.messages || [];
      if (conversation.type === 'code') {
            console.log('💾 LOADED CODE CONVERSATION with', loadedMessages.length, 'messages');
            setCodeMessages(loadedMessages);
            setMessages([]);
          } else {
            console.log('💬 LOADED CHAT CONVERSATION with', loadedMessages.length, 'messages');
            setMessages(loadedMessages);
            setCodeMessages([]);
          }
        } else {
          console.warn('Failed to load conversation messages, falling back to in-memory');
          if (conversation.type === 'code') {
        setCodeMessages(conversation.messages || []);
            setMessages([]);
      } else {
        setMessages(conversation.messages || []);
            setCodeMessages([]);
          }
        }
      } catch (e) {
        console.warn('Error loading conversation messages, fallback to in-memory', e);
        if (conversation.type === 'code') {
          setCodeMessages(conversation.messages || []);
          setMessages([]);
        } else {
          setMessages(conversation.messages || []);
          setCodeMessages([]);
        }
      }
      
      // If switching to a code conversation, ensure environment is initialized
      if ((conversation.type || 'chat') === 'code') {
        setPythonEnvironmentInitialized(true);
      }
      
      // 🚨 FIX: Only update survey if conversation has a VALID surveyId AND it's different
      // NEVER reset selectedSurveyId to null when switching conversations
      if (conversation.surveyId && conversation.surveyId !== selectedSurveyId) {
        console.log('🔄 Survey context change:', selectedSurveyId, '→', conversation.surveyId);
        setSelectedSurveyId(conversation.surveyId);
        localStorage.setItem('cohort-chat-selected-survey', String(conversation.surveyId));
      }
      // If conversation has no surveyId, preserve current selection
      
      if (conversation.cohortId !== selectedCohortId) {
        setSelectedCohortId(conversation.cohortId || null);
      }
      
      // Clear loading state after state has settled - use longer timeout for better reliability
      setTimeout(() => {
        console.log('🔓 CLEARING LOADING STATE after conversation switch');
        setIsLoading(false);
      }, 250);
    } else {
      console.log('❌ CONVERSATION NOT FOUND:', conversationId);
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

  const generateConversationTitle = (messages: ChatMessage[] | any[]): string => {
    if (messages.length === 0) return 'New Conversation';
    
    // Handle both ChatMessage (role) and AnalysisMessage (type) formats
    const firstUserMessage = messages.find(m => 
      (m as any).role === 'user' || (m as any).type === 'user'
    );
    
    if (firstUserMessage) {
      // Take first 40 characters of the first user message for more concise titles
      const title = firstUserMessage.content.slice(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '');
      return title;
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

  // moved to components: DataCards, MarkdownWithCitations

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
    
    // Add a survey selection message to the chat after a brief delay
    // to ensure it's added to the correct conversation after the switch
    const selectedSurvey = surveys.find(s => s.id === surveyId);
    if (selectedSurvey) {
      setTimeout(() => {
        const surveyMessage: ChatMessage = {
          role: 'user',
          content: `📊 **Survey Selected:** ${selectedSurvey.title}`,
          isUpload: false
        };
        setMessages(prev => [...prev, surveyMessage]);
      }, 100); // Small delay to ensure conversation switch completes
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
      <div className="flex-1 p-1 min-w-0">
        <div className="relative min-h-screen rounded-lg bg-card text-card-foreground shadow-lg min-w-0">
          {/* Header */}
          <HeaderBar
                        surveys={surveys}
                        selectedSurveyId={selectedSurveyId}
                        onSurveyChange={handleSurveyChange}
                        conversations={conversations}
                        currentConversationId={currentConversationId}
                        onConversationSwitch={switchConversation}
                        onNewConversation={handleNewConversation}
                        conversationsLoading={conversationsLoading}
                        currentConversationType={currentConversationType}
            isCollapsed={isCollapsed}
            onToggleRightPanel={() => setIsCollapsed(!isCollapsed)}
          />

          <div className="border-b border-border" />

          <div className="p-2 min-w-0">
            {/* Chat Area - Only show if survey is selected */}
            <div className="flex flex-col h-full min-w-0">
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
              ) : (
                // 🚨 FIX: Always show active chat when survey is selected, regardless of message count
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'stats')} className="flex flex-col flex-1 min-w-0">
                  <div className="px-4 pt-4">
                    <TabsList className="inline-flex w-fit items-center gap-2">
                      <TabsTrigger value="chat" className="gap-2">
                        {currentConversationType === 'code' ? (
                          <>
                            <Code2 className="h-4 w-4" />
                            Code
                          </>
                        ) : (
                          <>
                            <MessageCircle className="h-4 w-4" />
                            Chat
                          </>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="stats" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Stats
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="chat" className="flex flex-col flex-1 mt-0 min-w-0">
                    {currentConversationType === 'code' ? (
                      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <CodeConversation 
                          key={`${selectedSurveyId}-${currentConversationId}`} // Force re-mount when conversation changes
                          surveyId={selectedSurveyId}
                          surveyTitle={surveys.find(s => s.id === selectedSurveyId)?.title}
                          environmentInitialized={pythonEnvironmentInitialized}
                          onEnvironmentReady={() => setPythonEnvironmentInitialized(true)}
                          messages={codeMessages}
                          onMessagesChange={(updater) => {
                            if (typeof updater === 'function') {
                              setCodeMessages(prev => updater(prev));
                            } else {
                              setCodeMessages(updater);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <ChatView
                          messages={messages}
                          isLoading={isLoading}
                          messagesEndRef={messagesEndRef}
                          input={input}
                          setInput={setInput}
                          onSend={handleSend}
                          onKeyDown={handleKeyDown}
                          showSurveyDropdown={showSurveyDropdown}
                          setShowSurveyDropdown={setShowSurveyDropdown}
                          surveys={surveys}
                          selectedSurveyId={selectedSurveyId}
                          onInlineSurveySelect={handleInlineSurveySelect}
                          onUploadClick={handleUploadClick}
                        />
                    )}
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
                  {conversationsLoading ? (
                    <div className="text-center py-4">
                      <div className="text-muted-foreground">Loading conversations...</div>
                    </div>
                ) : (
                  <ConversationManager
                    conversations={conversations}
                    surveys={surveys}
                    expandedSurveys={expandedSurveys}
                    currentConversationId={currentConversationId}
                    onToggleSurvey={(id) => toggleSurveyExpansion(id)}
                    onSwitchConversation={switchConversation}
                    onNewConversation={handleNewConversation}
                    onDeleteConversation={deleteConversation}
                  />
                )}
              </TabsContent>

              <TabsContent value="cohort" className="space-y-4 mt-4">
                <CohortPanel
                  surveys={surveys}
                  selectedSurveyId={selectedSurveyId}
                  onSurveyChange={handleSurveyChange}
                  cohorts={cohorts}
                  selectedCohortId={selectedCohortId}
                  onSelectCohort={(id) => setSelectedCohortId(id)}
                  showCohortCreator={showCohortCreator}
                  setShowCohortCreator={setShowCohortCreator}
                  filterRules={filterRules}
                  setFilterRules={setFilterRules}
                  saving={saving}
                  onCreateCohort={async (name, cohortFilterRules) => {
                          setSaving(true);
                          try {
                            const res = await fetch('/api/cohorts', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                name, 
                                filter: cohortFilterRules, 
                                visibility: 'private',
                                surveyId: selectedSurveyId 
                              }),
                            });
                            const data = await res.json();
                            if (data.status) {
                              const newCohort = { 
                                id: data.id, 
                                name, 
                                filter: cohortFilterRules, 
                                visibility: 'private', 
                                description: '', 
                                createdBy: 1, 
                                createdAt: '', 
                                updatedAt: '' 
                              } as any;
                              setCohorts([...cohorts, newCohort]);
                              setSelectedCohortId(data.id);
                              setShowCohortCreator(false);
                              setNewCohortName('');
                              setFilterRules([]);
                        toast.success(`Cohort \"${name}\" created successfully!`);
                            } else {
                              throw new Error(data.message || 'Failed to create cohort');
                            }
                          } catch (error) {
                            console.error('Error creating cohort:', error);
                            toast.error('Failed to create cohort');
                          } finally {
                            setSaving(false);
                          }
                        }}
                  onDeleteCohort={handleDeleteCohort}
                  canDelete={messages.length > 0 && !!selectedCohortId}
                />
              </TabsContent>
              
              <TabsContent value="agent" className="space-y-4 mt-4">
                <ConfigurationPanel
                  selectedModel={selectedModel}
                  onModelChange={handleModelChange}
                  temperature={temperature}
                  onTemperatureChange={handleTemperatureChange}
                  streamingMode={streamingMode}
                  onStreamingModeChange={(value) => { setStreamingMode(value); localStorage.setItem('cohort-chat-streaming-mode', value); }}
                  sources={sources}
                  onSourcesChange={setSources}
                  systemPrompt={systemPrompt}
                  onSystemPromptChange={handleSystemPromptChange}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Conversation Type Selection Dialog */}
      <ConversationTypeDialog
        open={showConversationTypeDialog}
        onClose={() => setShowConversationTypeDialog(false)}
        onSelectType={handleConversationTypeSelect}
        surveyTitle={surveys.find(s => s.id === selectedSurveyId)?.title}
      />
    </div>
  );
}