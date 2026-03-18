'use client';

import { useState, useEffect, useRef } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Upload, MessageCircle, Code, PlayCircle, Plus, Download } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { ConversationView } from './components/ConversationView';
import { ChatInput } from './components/ChatInput';
import { SurveyLoader } from './components/SurveyLoader';
import { CodebookUpload } from './components/CodebookUpload';
import { usePyodide } from './hooks/usePyodide';
import { useAnalysisContext } from './hooks/useAnalysisContext';
import { useAnalysisAgent } from './hooks/useAnalysisAgent';

interface AnalysisMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'code' | 'result' | 'error';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    analysisType?: string;
    executionTime?: number;
    code?: string;
    explanation?: string;
    fileName?: string;
    fileSize?: number;
    originalError?: string;
    collapsible?: boolean;
    previewLines?: number;
    quickActions?: Array<{
      text: string;
      action: string;
    }>;
    debug?: {
      model?: string;
      codeLength?: number;
      timestamp?: string;
      originalCode?: string;
      errorType?: string;
      step?: string;
      agentStatus?: string;
      stepIndex?: number;
      totalSteps?: number;
      findingsCount?: number;
    };
  };
}

export default function PythonAnalysisPage() {
  const [messages, setMessages] = useState<AnalysisMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const processedStepsRef = useRef<Set<string>>(new Set());
  const lastStatusRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { pyodide, isLoading: pyodideLoading, error: pyodideError } = usePyodide();
  const { 
    currentDataset, 
    analysisHistory, 
    executionState,
    loadDataset,
    executeCode,
    addAnalysis,
    applyCodebook,
    getCodebookContext
  } = useAnalysisContext();
  const {
    agentState,
    isRunning: agentRunning,
    initializeAgent,
    runAutonomousAnalysis,
    pauseAgent,
    resumeAgent
  } = useAnalysisAgent();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add welcome message when Pyodide loads
  useEffect(() => {
    if (pyodide && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        type: 'system',
        content: '🐍 **Python Analysis Environment Ready**\n\nUpload a dataset (CSV/TSV/TXT/Excel/Word .docx) then ask segmentation questions like:\n- "Isolate women aged 35+ without college degrees"\n- "Filter to ZIPs in my district"\n\nAfter you transform/filter `df`, use Export to download the current dataframe.',
        timestamp: new Date()
      }]);
    }
  }, [pyodide, messages.length]);

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    if (!pyodide) return;
    setExporting(true);
    try {
      const csv = pyodide.runPython(`
import pandas as pd
__antelope_csv = ""
try:
  __antelope_csv = df.to_csv(index=False)
except Exception as e:
  __antelope_csv = f"__ERROR__:{e}"
__antelope_csv
`);
      const out = String(csv || '');
      if (out.startsWith('__ERROR__:')) throw new Error(out.replace('__ERROR__:', ''));
      downloadFile('fundraising_export.csv', out, 'text/csv;charset=utf-8');
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: `export-error-${Date.now()}`,
        type: 'error',
        content: `❌ **Export failed**: ${e?.message || e}`,
        timestamp: new Date()
      }]);
    } finally {
      setExporting(false);
    }
  };

  const handleExportDoc = async () => {
    if (!pyodide) return;
    setExporting(true);
    try {
      const csv = pyodide.runPython(`
import pandas as pd
__antelope_csv = ""
try:
  __antelope_csv = df.to_csv(index=False)
except Exception as e:
  __antelope_csv = f"__ERROR__:{e}"
__antelope_csv
`);
      const out = String(csv || '');
      if (out.startsWith('__ERROR__:')) throw new Error(out.replace('__ERROR__:', ''));
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><pre>${out
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre></body></html>`;
      downloadFile('fundraising_export.doc', html, 'application/msword');
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: `export-error-${Date.now()}`,
        type: 'error',
        content: `❌ **Export failed**: ${e?.message || e}`,
        timestamp: new Date()
      }]);
    } finally {
      setExporting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Add file upload message with just metadata, no text content
    const uploadMessage: AnalysisMessage = {
      id: `upload-${Date.now()}`,
      type: 'user',
      content: '', // Empty content - will only show file component
      timestamp: new Date(),
      metadata: {
        fileName: file.name,
        fileSize: file.size
      }
    };
    setMessages(prev => [...prev, uploadMessage]);

    try {
      const loadedDataset = await loadDataset(file);
      
      // Add success message with dataset info using the returned dataset
      let codebookSuggestion = '';
      if (loadedDataset?.autoCodebookApplied) {
        const { AutoCodebookGenerator } = await import('@/app/utils/survey/auto-codebook-generator');
        codebookSuggestion = `\n${AutoCodebookGenerator.getAutoCodebookSummary(
          loadedDataset.autoCodebookApplied.standardName,
          loadedDataset.autoCodebookApplied.entriesCount
        )}`;
      } else if (loadedDataset?.suggestCodebook) {
        codebookSuggestion = `\n🔍 **Recommended**: This appears to be survey/research data. Upload a codebook file (.xlsx, .xls, .csv) to:\n- Map numeric codes to meaningful labels (1=Male, 2=Female)\n- Add question text for variables\n- Get better, more interpretable analysis results`;
      } else {
        codebookSuggestion = `\n💡 **Optional**: Upload a codebook file (.xlsx, .xls, .csv) to add question text and value labels for better analysis.`;
      }

      // Show success message immediately with the loaded dataset info
      const largeDatasetNote = loadedDataset.shape[0] > 10000 
        ? `\n\n📈 **Large Dataset Detected** (${loadedDataset.shape[0].toLocaleString()} rows)\n- All ${loadedDataset.shape[0].toLocaleString()} rows are loaded and available for analysis\n- For complex operations, consider using sampling or aggregation for faster results\n- Memory usage: ~${(file.size / (1024 * 1024)).toFixed(1)} MB in browser`
        : '';

      const successMessage: AnalysisMessage = {
        id: `dataset-loaded-${Date.now()}`,
        type: 'assistant',
        content: `✅ **Dataset loaded successfully!**\n\n📊 **${file.name}**\n- **Rows**: ${loadedDataset.shape[0].toLocaleString()}\n- **Columns**: ${loadedDataset.shape[1]}\n- **Size**: ${(file.size / (1024 * 1024)).toFixed(2)} MB${largeDatasetNote}\n${codebookSuggestion}\n\nI'm ready to analyze your data! Try asking:\n- "Show me basic statistics"\n- "Create a correlation matrix"\n- "Find missing values"\n- "Plot the first few columns"`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, successMessage]);
    } catch (error) {
      const errorMessage: AnalysisMessage = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `❌ **Upload failed**: ${error}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleCodebookProcessed = (mappings: any[], coverage: any) => {
    applyCodebook(mappings, coverage);
    
    // Check if there were previous analysis attempts about questions
    const hasQuestionAnalysis = messages.some(msg => 
      msg.content.toLowerCase().includes('questions') && 
      (msg.content.includes('No columns were identified') || msg.content.includes('lacks explicit question'))
    );

    const codebookMessage: AnalysisMessage = {
      id: `codebook-processed-${Date.now()}`,
      type: 'assistant',
      content: `✅ **Codebook processed successfully!**\n\n📋 **Coverage**: ${coverage.percentage}% of variables mapped (${coverage.mapped}/${coverage.total})\n\nThe analysis now includes:\n- **Question text** for variables\n- **Value labels** (e.g., 1=Male, 2=Female)\n- **Better interpretations** in results\n\n${hasQuestionAnalysis ? 
        '🔄 **Ready to re-analyze**: Since you previously asked about questions, I can now provide much better results with the codebook data!\n\n' : 
        ''
      }Try asking questions like:\n- "List the questions asked"\n- "What's the gender distribution?"\n- "Show me education levels by age"\n- "How do political views correlate with demographics?"`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, codebookMessage]);

    // If there was a previous failed question analysis, suggest re-running
    if (hasQuestionAnalysis) {
      setTimeout(() => {
        const suggestionMessage: AnalysisMessage = {
          id: `rerun-suggestion-${Date.now()}`,
          type: 'assistant',
          content: `💡 **Ready for Re-analysis**: Now that the codebook is loaded, the autonomous analysis agent can access:\n\n✅ **Full question text** for each variable\n✅ **Value labels** (1=Male, 2=Female, etc.)\n✅ **Better contextual understanding**\n\n🔄 **Try asking again**: "List the questions asked" - I'll run a fresh analysis with the codebook context!`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, suggestionMessage]);

        // Add quick action buttons after a short delay
        setTimeout(() => {
          const actionMessage: AnalysisMessage = {
            id: `quick-actions-${Date.now()}`,
            type: 'system',
            content: `**🚀 Quick Actions with Codebook:**`,
            timestamp: new Date(),
            metadata: {
              quickActions: [
                { text: "List the questions asked", action: "List the questions asked" },
                { text: "Show survey demographics", action: "What demographic questions are in this survey?" },
                { text: "Analyze response patterns", action: "Analyze the response patterns in this survey data" }
              ]
            }
          };
          setMessages(prev => [...prev, actionMessage]);
        }, 2000);
      }, 1000);
    }
  };

  const handleCodebookError = (error: string) => {
    const errorMessage: AnalysisMessage = {
      id: `codebook-error-${Date.now()}`,
      type: 'error',
      content: `❌ **Codebook processing failed**: ${error}`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, errorMessage]);
  };

  // Handle file uploads from chat input
  const handleChatFileUpload = async (file: File, type: 'dataset' | 'codebook') => {
    if (type === 'dataset') {
      await handleFileUpload(file);
    } else if (type === 'codebook') {
      // Handle codebook upload
      if (!currentDataset) {
        const errorMessage: AnalysisMessage = {
          id: `codebook-error-${Date.now()}`,
          type: 'error',
          content: `❌ **Please upload a dataset first** before uploading a codebook.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      // Add codebook upload message
      const uploadMessage: AnalysisMessage = {
        id: `upload-codebook-${Date.now()}`,
        type: 'user',
        content: '', // Empty content - will only show file component
        timestamp: new Date(),
        metadata: {
          fileName: file.name,
          fileSize: file.size
        }
      };
      setMessages(prev => [...prev, uploadMessage]);

      try {
        const formData = new FormData();
        formData.append('codebook', file);
        formData.append('originalColumns', JSON.stringify(currentDataset.columns));
        
        const response = await fetch('/api/python-analysis/process-codebook', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        if (result.status) {
          handleCodebookProcessed(result.mappings, result.coverage);
        } else {
          handleCodebookError(result.message || 'Failed to process codebook');
        }
      } catch (error) {
        handleCodebookError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // Handle survey loading from database
  const handleSurveyLoad = async (surveyData: any, codebook: any) => {
    try {
      // Convert CSV text to File-like object for existing pipeline
      const csvBlob = new Blob([surveyData.csvData], { type: 'text/csv' });
      const file = new File([csvBlob], `${surveyData.name}.csv`, { type: 'text/csv' });

      // Load the dataset
      const loadedDataset = await loadDataset(file);

      // Store survey ID and metadata for smart routing - this is a DATABASE survey, not a CSV upload
      if (loadedDataset && surveyData.surveyId) {
        (loadedDataset as any).surveyId = surveyData.surveyId;
        (loadedDataset as any).surveyMetadata = codebook;
        // Mark this as having built-in codebook (database schema)
        loadedDataset.codebookMappings = codebook.codebookMappings || [];
      }

      // Add success message
      const successMessage: AnalysisMessage = {
        id: `survey-loaded-${Date.now()}`,
        type: 'assistant',
        content: `✅ **Survey loaded successfully!**\n\n📊 **${surveyData.name}**\n- **Source**: Database (Survey ID: ${surveyData.surveyId})\n- **Rows**: ${loadedDataset.shape[0].toLocaleString()}\n- **Columns**: ${loadedDataset.shape[1]}\n- **Questions**: ${codebook?.totalQuestions || 'Unknown'} (metadata included)\n- **Schema**: Direct database access (no codebook needed)\n- **Token limits**: None - smart routing to database or Python\n\n🎯 **Perfect for**: Survey analysis, correlation studies, demographic breakdowns\n\n**Try asking:**\n- "What questions are in this survey?" ← **Instant database response**\n- "How many responses do we have?" ← **Instant database response**\n- "Show demographic breakdown" ← **Python analysis**\n- "Find correlations between responses" ← **Python analysis**`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, successMessage]);

    } catch (error) {
      console.error('Error loading survey:', error);
      const errorMessage: AnalysisMessage = {
        id: `survey-error-${Date.now()}`,
        type: 'assistant',
        content: `❌ **Failed to load survey data**\n\nPlease try again or contact support if the issue persists.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // NEW: Autonomous Analysis Handler
  const handleAutonomousAnalysis = async (question: string) => {
    if (!pyodide || !currentDataset || agentRunning) {
      console.error('Cannot start analysis:', { 
        pyodide: !!pyodide, 
        currentDataset: !!currentDataset, 
        agentRunning 
      });
      return;
    }

    try {
      // Add user message
      const userMessage: AnalysisMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: question,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Initialize the autonomous agent
      console.log('🤖 Initializing autonomous analysis agent...');
      const { sessionId, initialState } = await initializeAgent(question, {
        columns: currentDataset.columns,
        types: currentDataset.dtypes,
        sample_data: currentDataset.data, // Use full dataset instead of sampleData
        codebook_mappings: currentDataset.codebookMappings
      });
      console.log('✅ Agent initialized with session:', sessionId);

      // Add agent status message with enhanced codebook context
      const codebookInfo = currentDataset.codebookMappings ? 
        `\n\n📋 **Enhanced with Codebook**: I have access to question text and value labels for ${currentDataset.codebookMappings.length} variables! This enables much better analysis of survey questions and meaningful interpretations.` : 
        `\n\n⚠️  **Limited Context**: Working with raw data only. Upload a codebook for better survey question analysis.`;
        
      const agentMessage: AnalysisMessage = {
        id: `agent-start-${Date.now()}`,
        type: 'assistant',
        content: `🤖 **Starting Autonomous Analysis**\n\nI\'m planning a comprehensive analysis strategy and will execute multiple steps automatically until I have thoroughly answered your question.${codebookInfo}\n\n*This may take a few minutes as I work through the analysis systematically...*`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, agentMessage]);

      // Add a progress message immediately
      const progressMessage: AnalysisMessage = {
        id: `progress-${Date.now()}`,
        type: 'assistant',
        content: '🔄 **Planning Analysis Steps...**\n\nThe agent is determining the best approach to answer your question.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, progressMessage]);

      // Start autonomous analysis with the initial state
      console.log('🚀 About to call runAutonomousAnalysis with initial state');
      
      // Reset duplicate tracking for new analysis
      processedStepsRef.current = new Set();
      lastStatusRef.current = '';
      
      try {
        await runAutonomousAnalysis(pyodide, (updatedState) => {
          console.log('🔄 Agent state update:', updatedState.status, updatedState.current_step_index);
          
          // Create a unique identifier for this status
          const statusId = `${updatedState.status}-${updatedState.current_step_index}-${updatedState.context.key_findings.length}`;
          
          // Only add status message if it's different from the last one
          if (statusId !== lastStatusRef.current) {
            const statusMessage: AnalysisMessage = {
              id: `status-${Date.now()}-${Math.random()}`,
              type: 'assistant',
              content: `🤖 **Agent Status: ${updatedState.status.toUpperCase()}** • Step ${updatedState.current_step_index + 1}/${Math.max(updatedState.planned_steps.length, 1)} • ${updatedState.context.key_findings.length} insights\n\n**Current:** ${updatedState.planned_steps[updatedState.current_step_index]?.description || 'Planning next steps'}`,
              timestamp: new Date(),
              metadata: {
                debug: {
                  agentStatus: updatedState.status,
                  stepIndex: updatedState.current_step_index,
                  totalSteps: updatedState.planned_steps.length,
                  findingsCount: updatedState.context.key_findings.length,
                  timestamp: new Date().toISOString()
                }
              }
            };
            setMessages(prev => [...prev, statusMessage]);
            lastStatusRef.current = statusId;
          }

          // Add executed step results to messages (only if not already processed)
          const latestStep = updatedState.executed_steps[updatedState.executed_steps.length - 1];
          if (latestStep && !processedStepsRef.current.has(latestStep.id)) {
            console.log('📋 Adding step results for:', latestStep.step.description);
            
            const timestamp = Date.now();
            const stepMessages: AnalysisMessage[] = [
              {
                id: `step-desc-${latestStep.id}-${timestamp}`,
                type: 'assistant',
                content: `**📋 Step ${updatedState.executed_steps.length}: ${latestStep.step.description}** (${latestStep.execution_time_ms}ms)${latestStep.insights.length > 0 ? ' • **Insights:** ' + latestStep.insights.join('; ') : ''}`,
                timestamp: new Date()
              },
              {
                id: `step-code-${latestStep.id}-${timestamp}`,
                type: 'code',
                content: latestStep.code,
                timestamp: new Date(),
                metadata: {
                  collapsible: true,
                  previewLines: 3
                }
              },
              {
                id: `step-result-${latestStep.id}-${timestamp}`,
                type: latestStep.success ? 'result' : 'error',
                content: latestStep.success ? latestStep.output : `❌ Error: ${latestStep.error}`,
                timestamp: new Date(),
                metadata: {
                  executionTime: latestStep.execution_time_ms,
                  collapsible: true,
                  previewLines: 4
                }
              }
            ];

            // Add plot messages if any plots were generated
            if (latestStep.success && (latestStep as any).plots && (latestStep as any).plots.length > 0) {
              const plots = (latestStep as any).plots as string[];
              plots.forEach((plotData, index) => {
                stepMessages.push({
                  id: `step-plot-${latestStep.id}-${index}-${timestamp}`,
                  type: 'result',
                  content: plotData,
                  timestamp: new Date(),
                  metadata: {
                    executionTime: latestStep.execution_time_ms
                  }
                });
              });
            }

            setMessages(prev => [...prev, ...stepMessages]);
            processedStepsRef.current.add(latestStep.id);
          }

          // Final synthesis - always show when completed, even if synthesis failed
          if (updatedState.status === 'completed') {
            console.log('🎯 Analysis completed, checking for synthesis...');
            const finalSynthesis = updatedState.context.key_findings.find(f => f.startsWith('FINAL SYNTHESIS:'));
            
            if (finalSynthesis) {
              console.log('✅ Found synthesis, displaying...');
              const synthesisMessage: AnalysisMessage = {
                id: `synthesis-${Date.now()}`,
                type: 'assistant',
                content: `🎯 **Analysis Complete**\n\n${finalSynthesis.replace('FINAL SYNTHESIS: ', '')}\n\n**📊 Summary:**\n- Total Steps Executed: ${updatedState.executed_steps.length}\n- Key Insights Found: ${updatedState.context.key_findings.length - 1}\n- Analysis Duration: ${Math.round((Date.now() - updatedState.start_time.getTime()) / 1000)}s`,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, synthesisMessage]);
            } else {
              console.log('⚠️ No synthesis found, showing summary of insights...');
              // Fallback: show insights summary if no synthesis was generated
              const nonSynthesisFindings = updatedState.context.key_findings.filter(f => !f.startsWith('FINAL SYNTHESIS:'));
              const synthesisMessage: AnalysisMessage = {
                id: `synthesis-${Date.now()}`,
                type: 'assistant',
                content: `🎯 **Analysis Complete**\n\n**Key Findings:**\n${nonSynthesisFindings.slice(0, 5).map((finding, i) => `${i + 1}. ${finding}`).join('\n')}\n\n**📊 Summary:**\n- Total Steps Executed: ${updatedState.executed_steps.length}\n- Key Insights Found: ${nonSynthesisFindings.length}\n- Analysis Duration: ${Math.round((Date.now() - updatedState.start_time.getTime()) / 1000)}s`,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, synthesisMessage]);
            }
          }
        }, initialState);
        console.log('✅ runAutonomousAnalysis completed');
      } catch (agentError) {
        console.error('❌ runAutonomousAnalysis failed:', agentError);
        const errorMessage: AnalysisMessage = {
          id: `agent-exec-error-${Date.now()}`,
          type: 'error',
          content: `Agent execution failed: ${String(agentError)}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }

    } catch (error) {
      console.error('Autonomous analysis failed:', error);
      
      const errorMessage: AnalysisMessage = {
        id: `agent-error-${Date.now()}`,
        type: 'error',
        content: `🤖 Autonomous analysis failed: ${String(error)}`,
        timestamp: new Date(),
        metadata: {
          originalError: String(error),
          debug: {
            step: 'autonomous_analysis_init',
            timestamp: new Date().toISOString()
          }
        }
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

    // Enhanced routing for all analysis questions
  const handleSendMessage = async (content: string) => {
    const lowerContent = content.toLowerCase();
    
    // NEW: Check if this is a survey loaded from database - try direct query first
    if (currentDataset && (currentDataset as any).surveyId) {
      const surveyId = (currentDataset as any).surveyId;
      
      // ONLY use direct database query for very simple metadata questions
      const shouldTryDirectQuery = (
        (lowerContent.includes('questions') && (lowerContent.includes('list') || lowerContent.includes('what') || lowerContent.includes('show'))) ||
        lowerContent.includes('how many responses') ||
        lowerContent.includes('response count') ||
        (lowerContent.includes('survey') && lowerContent.includes('info')) ||
        lowerContent.includes('status') ||
        lowerContent.includes('when created') ||
        lowerContent.includes('metadata')
      );

      // For complex questions like "womens vs mens opinion", skip direct query and go straight to Python analysis
      const isComplexAnalysis = (
        lowerContent.includes('vs') ||
        lowerContent.includes('versus') ||
        lowerContent.includes('compare') ||
        lowerContent.includes('opinion') ||
        lowerContent.includes('breakdown') ||
        lowerContent.includes('distribution') ||
        lowerContent.includes('demographic') ||
        lowerContent.includes('analysis') ||
        lowerContent.includes('correlation') ||
        lowerContent.includes('relationship') ||
        lowerContent.includes('pattern')
      );

      if (shouldTryDirectQuery && !isComplexAnalysis) {
        try {
          // Add user message
          const userMessage: AnalysisMessage = {
            id: `user-${Date.now()}`,
            type: 'user',
            content,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, userMessage]);

          // Query database directly
          const response = await fetch(`/api/surveys/${surveyId}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: content })
          });

          if (response.ok) {
            const result = await response.json();
            
            // If the API recommends Python analysis, automatically trigger it
            if (result.data?.recommendPythonAnalysis) {
              console.log('🔄 Database query recommends Python analysis, auto-triggering...');
              return handleAutonomousAnalysis(content);
            }
            
            const assistantMessage: AnalysisMessage = {
              id: `assistant-${Date.now()}`,
              type: 'assistant',
              content: `📊 **Direct Database Query** (No token limits)\n\n${result.answer}`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMessage]);
            return;
          }
        } catch (error) {
          console.error('Direct query failed, falling back to Python analysis:', error);
        }
      }
    }
    
    // Check if user is asking for questions but it's a CSV upload without codebook
    const isAskingForQuestions = lowerContent.includes('questions') || 
                                lowerContent.includes('what questions') ||
                                lowerContent.includes('list questions') ||
                                lowerContent.includes('survey questions');
    
    // Only suggest codebook for CSV uploads (not database surveys)
    if (isAskingForQuestions && currentDataset && !currentDataset.codebookMappings && !(currentDataset as any).surveyId) {
      const userMessage: AnalysisMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      const codebookSuggestion: AnalysisMessage = {
        id: `codebook-suggestion-${Date.now()}`,
        type: 'assistant',
        content: `🔍 **To see the actual survey questions**, I need the codebook file that contains the question text.\n\n📋 **Your dataset has ${currentDataset.shape[1]} columns** with names like \`${currentDataset.columns.slice(0, 3).join('`, `')}\`...\n\n**Without a codebook, I can only see:**\n- Column names (variable names)\n- Response codes (1, 2, 3, etc.)\n\n**With a codebook, I can show:**\n- Full question text\n- Value labels (1=Yes, 2=No, etc.)\n- Meaningful analysis\n\n💡 **Upload your codebook** using the + button below, or I can analyze the column structure as-is.\n\n**Note**: For database surveys loaded via "Load Survey Data", no codebook is needed - the question metadata is included automatically!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, codebookSuggestion]);
      return;
    }
    
    // Route most questions to autonomous analysis, especially for survey data
    const shouldUseAutonomousAnalysis = 
      // Explicit analysis terms
      lowerContent.includes('correlation') || 
      lowerContent.includes('relationship') ||
      lowerContent.includes('analysis') ||
      lowerContent.includes('compare') ||
      lowerContent.includes('pattern') ||
      lowerContent.includes('vs') ||
      lowerContent.includes('versus') ||
      lowerContent.includes('opinion') ||
      lowerContent.includes('breakdown') ||
      lowerContent.includes('demographic') ||
      lowerContent.includes('difference') ||
      lowerContent.includes('differences') ||
      lowerContent.includes('between') ||
      lowerContent.includes('how') ||
      lowerContent.includes('look at') ||
      lowerContent.includes('feel about') ||
      lowerContent.includes('think about') ||
      // Survey-specific terms (but exclude simple "list questions" for DB surveys)
      (lowerContent.includes('questions') && !(currentDataset && (currentDataset as any).surveyId && (lowerContent.includes('list') || lowerContent.includes('what') || lowerContent.includes('show')))) ||
      lowerContent.includes('variables') ||
      lowerContent.includes('columns') ||
      (lowerContent.includes('survey') && !lowerContent.includes('info')) ||
      lowerContent.includes('responses') ||
      // Data exploration terms
      lowerContent.includes('find') ||
      lowerContent.includes('identify') ||
      lowerContent.includes('explore') ||
      lowerContent.includes('describe') ||
      lowerContent.includes('summarize') ||
      // Statistical terms
      lowerContent.includes('statistics') ||
      lowerContent.includes('distribution') ||
      lowerContent.includes('frequency') ||
      lowerContent.includes('count') ||
      lowerContent.includes('plot') ||
      lowerContent.includes('chart') ||
      lowerContent.includes('graph') ||
      // For datasets with many columns/rows, most questions should be autonomous
      (currentDataset && (currentDataset.shape[1] > 20 || currentDataset.shape[0] > 1000)) ||
      // For database surveys, automatically use Python for any complex analysis
      (currentDataset && (currentDataset as any).surveyId && (
        lowerContent.includes('womens') ||
        lowerContent.includes('mens') ||
        lowerContent.includes('male') ||
        lowerContent.includes('female') ||
        lowerContent.includes('gender') ||
        lowerContent.includes('age') ||
        lowerContent.includes('group') ||
        lowerContent.includes('segment')
      ));

    if (shouldUseAutonomousAnalysis) {
      return handleAutonomousAnalysis(content);
    }

    // Very basic questions only (rare)
    if (!pyodide || !currentDataset) return;

    const userMessage: AnalysisMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // For the rare truly simple questions
    const simpleResponse: AnalysisMessage = {
      id: `simple-${Date.now()}`,
      type: 'assistant',
      content: `I can help you analyze your data! For the best results with your ${currentDataset.shape[0].toLocaleString()} × ${currentDataset.shape[1]} dataset, I'll run a comprehensive autonomous analysis. Try rephrasing your question or I can start a full analysis automatically.`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, simpleResponse]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim()) {
          handleSendMessage(input.trim());
          setInput('');
              }
    }
  };

  const handleSendClick = () => {
    if (input.trim()) {
      handleSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* Main Content */}
      <div className="flex-1 p-1">
        <div className="h-full rounded-lg bg-card text-card-foreground shadow-lg">
          {/* Header */}
          <div className="px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
                <div className="h-4 border-l border-border mx-4" />
                <h1 className="text-base font-medium text-card-foreground">Python Analysis</h1>
                {pyodideLoading && (
                  <div className="ml-4 text-sm text-muted-foreground">
                    Loading Python environment...
                  </div>
                )}
                {currentDataset && (
                  <div className="ml-4 text-sm text-muted-foreground">
                    📊 {currentDataset.name} ({currentDataset.shape[0].toLocaleString()} × {currentDataset.shape[1]} • {currentDataset.data.length > 0 ? 'Data loaded' : 'No data'})
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {currentDataset && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={!pyodide || exporting}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportDoc} disabled={!pyodide || exporting}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Word
                    </Button>
                  </>
                )}
                {!currentDataset && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => document.getElementById('file-upload-trigger')?.click()}
                    disabled={pyodideLoading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Data
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-border" />

          <div className="p-2">
            <div className="flex flex-col h-full">
              {pyodideError ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="bg-destructive/10 text-destructive p-6 rounded-lg max-w-md text-center">
                    <h2 className="font-semibold mb-2">Python Environment Error</h2>
                    <p>{pyodideError}</p>
                  </div>
                </div>
              ) : !currentDataset ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4 max-w-lg">
                    <h2 className="text-xl font-semibold">Upload your data</h2>
                    <p className="text-muted-foreground text-sm">
                      CSV file or database survey for Python analysis
                    </p>
                    
                    <div className="grid grid-rows-2 gap-4">
                      <FileUpload 
                        onFileUploaded={handleFileUpload}
                        disabled={pyodideLoading || !pyodide}
                      />
                      
                      <SurveyLoader 
                        onSurveyLoad={handleSurveyLoad}
                        disabled={pyodideLoading || !pyodide}
                      />
                    </div>
                    
                    {pyodideLoading && (
                      <div className="text-center text-muted-foreground">
                        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                        <p className="text-sm">Setting up Python environment with pandas, matplotlib, and more...</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Agent Control Panel */}
                  {currentDataset && pyodide && (
                    <div className="mx-6 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                          🤖 Autonomous Analysis Agent
                        </h3>
                        <div className="flex items-center gap-2 text-xs">
                          {agentRunning && (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              Running
                            </span>
                          )}
                          {agentState && (
                            <span className="text-blue-600 dark:text-blue-400">
                              Status: {agentState.status}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {agentState && (
                        <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                          Steps: {agentState.current_step_index}/{agentState.planned_steps.length} | 
                          Findings: {agentState.context.key_findings.length} | 
                          Errors: {agentState.error_count}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        {agentRunning ? (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={pauseAgent}
                            className="text-xs"
                          >
                            ⏸️ Pause Agent
                          </Button>
                        ) : agentState?.status === 'paused' ? (
                          <Button 
                            size="sm" 
                            onClick={() => resumeAgent(pyodide, () => {})}
                            className="text-xs"
                          >
                            ▶️ Resume Agent
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => handleAutonomousAnalysis("Perform a comprehensive analysis of this dataset")}
                            className="text-xs"
                            disabled={agentRunning}
                          >
                            🚀 Start Full Analysis
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAutonomousAnalysis("Find correlations between education and healthcare opinions")}
                          className="text-xs"
                          disabled={agentRunning}
                        >
                          🩺 Education & Healthcare Analysis
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Conversation Area */}
                  <ConversationView 
                    messages={messages}
                    isLoading={isLoading}
                    messagesEndRef={messagesEndRef}
                    onQuickAction={(action) => {
                      if (action === 'python-analysis') {
                        // Use the last user message for Python analysis
                        const lastUserMessage = messages.findLast(m => m.type === 'user');
                        if (lastUserMessage) {
                          handleAutonomousAnalysis(lastUserMessage.content);
                        }
                      } else {
                        setInput(action);
                        handleSendMessage(action);
                      }
                    }}
                  />
                  
                  {/* Codebook Upload - Show when CSV dataset is loaded and no codebook yet (not for database surveys) */}
                  {currentDataset && !currentDataset.codebookMappings && !(currentDataset as any).surveyId && (
                    <div className="p-4 border-t border-border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && currentDataset) {
                              try {
                                const formData = new FormData();
                                formData.append('codebook', file);
                                formData.append('originalColumns', JSON.stringify(currentDataset.columns));
                                
                                const response = await fetch('/api/python-analysis/process-codebook', {
                                  method: 'POST',
                                  body: formData
                                });
                                
                                const result = await response.json();
                                if (result.status) {
                                  handleCodebookProcessed(result.mappings, result.coverage);
                                } else {
                                  handleCodebookError(result.message || 'Failed to process codebook');
                                }
                              } catch (error) {
                                handleCodebookError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                              }
                            }
                          }}
                          className="text-sm"
                          id="codebook-upload"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => document.getElementById('codebook-upload')?.click()}
                          className="text-xs"
                        >
                          📋 Upload Codebook
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {currentDataset.suggestCodebook 
                            ? "🔍 Recommended: Add question text and value labels"
                            : "Optional: Enhance analysis with variable labels"
                          }
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Chat Input - Fixed at bottom */}
                  <ChatInput
                    input={input}
                    setInput={setInput}
                    onSend={handleSendClick}
                    onKeyDown={handleKeyDown}
                    isLoading={isLoading}
                    placeholder="Ask me to analyze your data..."
                    disabled={!currentDataset || pyodideLoading}
                    onFileUpload={handleChatFileUpload}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        id="file-upload-trigger"
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
        className="hidden"
      />
    </div>
  );
} 