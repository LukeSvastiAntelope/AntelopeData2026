import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ConversationView } from '../../python-analysis/components/ConversationView';
import { ChatInput } from '../../python-analysis/components/ChatInput';
import { usePyodide } from '../../python-analysis/hooks/usePyodide';
import { useAnalysisContext } from '../../python-analysis/hooks/useAnalysisContext';
import { useAnalysisAgent } from '../../python-analysis/hooks/useAnalysisAgent';

interface CodeConversationProps {
  surveyId: number | null;
  surveyTitle?: string;
  environmentInitialized?: boolean;
  onEnvironmentReady?: () => void;
  messages: AnalysisMessage[];
  onMessagesChange: (messages: AnalysisMessage[] | ((prev: AnalysisMessage[]) => AnalysisMessage[])) => void;
}

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

export function CodeConversation({ 
  surveyId, 
  surveyTitle, 
  environmentInitialized = false, 
  onEnvironmentReady,
  messages,
  onMessagesChange
}: CodeConversationProps) {
  
  console.log('🔍 CodeConversation render - surveyId:', surveyId, 'messagesCount:', messages.length, 'title:', surveyTitle);
  const [input, setInput] = useState('');
  
  // Helper function to add messages
  const addMessage = (newMessage: AnalysisMessage) => {
    console.log('🔄 Adding single message:', newMessage.type, newMessage.content.substring(0, 50));
    onMessagesChange(prev => [...prev, newMessage]);
  };
  
  const addMessages = (newMessages: AnalysisMessage[]) => {
    console.log('🔄 Adding multiple messages:', newMessages.length, 'total messages will be:', messages.length + newMessages.length);
    onMessagesChange(prev => [...prev, ...newMessages]);
  };
  
  const setMessages = (newMessages: AnalysisMessage[]) => {
    onMessagesChange(newMessages);
  };
  
  // Helper to update messages using callback pattern for real-time updates
  const updateMessages = (updater: (prev: AnalysisMessage[]) => AnalysisMessage[]) => {
    onMessagesChange(updater);
  };
  const [isLoading, setIsLoading] = useState(false);
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

  // Notify parent when Pyodide is ready
  useEffect(() => {
    if (pyodide && onEnvironmentReady) {
      onEnvironmentReady();
    }
  }, [pyodide, onEnvironmentReady]);

  // Load survey data when component mounts (only once)
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const loadSurveyDataSilently = useCallback(async () => {
    if (!surveyId || !pyodide) return;

    try {
      console.log('🔄 Starting silent survey data load for surveyId:', surveyId);
      
      const res = await fetch(`/api/surveys/${surveyId}/data`, { credentials: 'include' });
      
      if (!res.ok) {
        throw new Error(`Failed to load survey data: ${res.status} ${res.statusText}`);
      }
      
      const surveyData = await res.json();

      // Convert to CSV format for analysis
      const csvContent = [
        surveyData.columns.join(','),
        ...surveyData.data.map(row => 
          surveyData.columns.map(col => {
            const value = row[col];
            return value === null || value === undefined ? '' : `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');

      const csvFile = new File([csvContent], `survey_${surveyId}.csv`, { type: 'text/csv' });
      const dataset = await loadDataset(csvFile);

      if (dataset) {
        (dataset as any).surveyId = surveyId;
        dataset.codebookMappings = surveyData.questionMapping || [];
        console.log('✅ Dataset loaded silently for existing conversation');
      }
    } catch (err: any) {
      console.error('❌ Silent data load error:', err);
    }
  }, [surveyId, pyodide, loadDataset]);

  const loadSurveyData = useCallback(async () => {
    if (!surveyId || !pyodide) return;

    try {
      console.log('🔄 Starting survey data load for surveyId:', surveyId);
      console.log('🔄 API URL will be:', `/api/surveys/${surveyId}/data`);
      
      const res = await fetch(`/api/surveys/${surveyId}/data`, { credentials: 'include' });
      console.log('📡 API Response status:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ API Error response:', errorText);
        throw new Error(`Failed to load survey data: ${res.status} ${res.statusText}`);
      }
      
      const surveyData = await res.json();

      console.log('🔍 Raw survey data from API:', {
        dataLength: surveyData.data?.length,
        columnsLength: surveyData.columns?.length,
        firstRow: surveyData.data?.[0],
        columns: surveyData.columns,
        metadata: surveyData.metadata
      });

      if (surveyData.error) {
        throw new Error(`API returned error: ${surveyData.error}`);
      }

      if (!surveyData.data || surveyData.data.length === 0) {
        throw new Error('No survey responses found in database');
      }

      // Build CSV string for loadDataset util
      const header = surveyData.columns.join(',');
      const rows = surveyData.data.map((row: any) => {
        return surveyData.columns.map((col: string) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',');
      });
      const csvText = [header, ...rows].join('\n');
      
      console.log('🔍 Generated CSV preview:', {
        csvLength: csvText.length,
        rowCount: rows.length,
        csvPreview: csvText.substring(0, 300) + '...',
        headerLine: header
      });
      
      const csvFile = new File([csvText], `${surveyTitle || 'survey'}.csv`, { type: 'text/csv' });

      console.log('📁 CSV File created:', {
        name: csvFile.name,
        size: csvFile.size,
        type: csvFile.type
      });

      const dataset = await loadDataset(csvFile);
      console.log('📊 loadDataset result:', {
        hasDataset: !!dataset,
        shape: dataset?.shape,
        columns: dataset?.columns,
        dataLength: dataset?.data?.length,
        sampleRow: dataset?.data?.[0]
      });

      if (dataset) {
        (dataset as any).surveyId = surveyId;
        dataset.codebookMappings = surveyData.questionMapping || [];
        
        console.log('🔍 Final dataset structure:', {
          shape: dataset.shape,
          columns: dataset.columns,
          dataLength: dataset.data?.length,
          sampleRow: dataset.data?.[0],
          codebookMappings: dataset.codebookMappings?.length
        });
      } else {
        console.error('❌ loadDataset returned null/undefined');
        throw new Error('Failed to process CSV data into dataset');
      }

      // welcome message
      const welcome: AnalysisMessage = {
        id: `welcome-${Date.now()}`,
        type: 'system',
        content: `🎯 **Smart Survey Analysis Ready!**

📊 **${surveyData.surveyTitle || surveyTitle}** loaded with **${surveyData.shape?.[0] || dataset.shape[0]}** responses and **${surveyData.shape?.[1] || dataset.shape[1]}** columns.

✨ **🚀 NEW: AI-Powered Smart Data Loading!**
I now use intelligent question analysis to load only relevant data for your questions, making analysis faster and more focused!

**📈 Ask Natural Questions:**
- *"How does education level relate to political views?"*
- *"What demographic factors predict satisfaction?"*
- *"Show me age differences in responses"*
- *"Are there gender disparities in the data?"*

**🧠 Smart Features:**
- **Semantic Analysis**: I understand question meaning, not just keywords
- **Targeted Loading**: Only fetch data columns needed for your specific analysis
- **90% Faster**: Reduced data transfer and processing time
- **Better Insights**: Focused analysis on relevant variables

Ready for intelligent survey analysis!`,
        timestamp: new Date()
      };
      onMessagesChange([welcome]);
    } catch (err: any) {
      console.error('❌ Data load error:', err);
      console.error('❌ Error stack:', err.stack);
      onMessagesChange([{ 
        id: `err-${Date.now()}`, 
        type: 'error', 
        content: `❌ ${err.message || 'Unknown error'}`, 
        timestamp: new Date() 
      }]);
    }
  }, [surveyId, pyodide, loadDataset, surveyTitle]);

  useEffect(() => {
    // Always ensure we have dataset loaded when we have surveyId and pyodide
    if (surveyId && pyodide && !currentDataset && !hasLoadedData) {
      console.log('🔄 Loading survey data - messages count:', messages.length, 'surveyId:', surveyId);
      
      if (messages.length === 0) {
        console.log('🔄 Loading survey data for new conversation');
        loadSurveyData().finally(() => setHasLoadedData(true));
      } else {
        console.log('🔄 Loading dataset silently for existing conversation with', messages.length, 'messages');
        loadSurveyDataSilently().finally(() => setHasLoadedData(true));
      }
    } else if (surveyId && pyodide && currentDataset) {
      console.log('✅ Dataset already loaded for surveyId:', surveyId, 'shape:', currentDataset.shape);
    }
  }, [surveyId, pyodide, currentDataset, hasLoadedData, messages.length, loadSurveyData, loadSurveyDataSilently]);

  // Helper function to generate dtypes based on data
  const generateDtypes = (columns: string[], data: any[]) => {
    const dtypes: Record<string, string> = {};
    
    columns.forEach(col => {
      if (col === 'response_id') {
        dtypes[col] = 'int64';
      } else if (col === 'submitted_at') {
        dtypes[col] = 'datetime64[ns]';
      } else if (col.startsWith('demo_')) {
        dtypes[col] = 'object';
      } else if (col.startsWith('Q')) {
        // Try to infer type from first non-null value
        const sampleValue = data.find(row => row[col] != null)?.[col];
        if (sampleValue !== undefined) {
          if (typeof sampleValue === 'number' || !isNaN(Number(sampleValue))) {
            dtypes[col] = 'int64';
          } else {
            dtypes[col] = 'object';
          }
        } else {
          dtypes[col] = 'object';
        }
      } else {
        dtypes[col] = 'object';
      }
    });
    
    return dtypes;
  };

    // Autonomous Analysis Handler (exactly like python-analysis page)
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
      // Add user message first
      const userMessage: AnalysisMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: question,
        timestamp: new Date()
      };
      updateMessages(prev => [...prev, userMessage]);

      // Initialize the autonomous agent first
      console.log('🤖 Initializing autonomous analysis agent...');
      
      // Convert dataset.data to array of arrays format if it's in object format
      let sampleData = currentDataset.data;
      if (currentDataset.data.length > 0 && typeof currentDataset.data[0] === 'object' && !Array.isArray(currentDataset.data[0])) {
        // Convert from array of objects to array of arrays
        sampleData = currentDataset.data.map(row => 
          currentDataset.columns.map(col => row[col])
        );
        console.log('🔄 Converted data from objects to arrays format for agent');
      }
      
      const { sessionId, initialState } = await initializeAgent(question, {
        columns: currentDataset.columns,
        types: currentDataset.dtypes,
        sample_data: sampleData,
        codebook_mappings: currentDataset.codebookMappings
      });
      console.log('✅ Agent initialized with session:', sessionId);

      // Add agent status message with enhanced codebook context
      const codebookInfo = currentDataset.codebookMappings ? 
        `\n\n📋 **Enhanced with Codebook**: I have access to question text and value labels for ${currentDataset.codebookMappings.length} variables! This enables much better analysis of survey questions and meaningful interpretations.` : 
        `\n\n⚠️  **Limited Context**: Working with raw data only.`;
        
      const agentMessage: AnalysisMessage = {
        id: `agent-start-${Date.now()}`,
        type: 'assistant',
        content: `🤖 **Starting Autonomous Analysis**\n\nI'm planning a comprehensive analysis strategy and will execute multiple steps automatically until I have thoroughly answered your question.${codebookInfo}\n\n*This may take a few minutes as I work through the analysis systematically...*`,
        timestamp: new Date()
      };
      updateMessages(prev => [...prev, agentMessage]);

      // Add a progress message immediately
      const progressMessage: AnalysisMessage = {
        id: `progress-${Date.now()}`,
        type: 'assistant',
        content: '🔄 **Planning Analysis Steps...**\n\nThe agent is determining the best approach to answer your question.',
        timestamp: new Date()
      };
      updateMessages(prev => [...prev, progressMessage]);

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
            updateMessages(prev => [...prev, statusMessage]);
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

            // Use callback pattern to ensure we get the latest messages state
            updateMessages(prev => [...prev, ...stepMessages]);
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
              updateMessages(prev => [...prev, synthesisMessage]);
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
              updateMessages(prev => [...prev, synthesisMessage]);
            }
          }
        }, initialState);
                 console.log('✅ runAutonomousAnalysis completed');
       } catch (agentError) {
         console.error('❌ runAutonomousAnalysis failed:', agentError);
         const errorMessage: AnalysisMessage = {
           id: `agent-error-${Date.now()}`,
           type: 'error',
           content: `❌ **Agent Error**: ${agentError instanceof Error ? agentError.message : 'Unknown error'}`,
           timestamp: new Date()
         };
         updateMessages(prev => [...prev, errorMessage]);
       }
    } catch (error) {
      console.error('Autonomous analysis failed:', error);
      const errorMessage: AnalysisMessage = {
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        content: `❌ **Analysis Error**: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      updateMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!currentDataset) return;

    const trimmed = content.trim();

    // Default to running a real analysis for ANY substantive question (including
    // open-ended ones like "give me some general insights"). Only pure
    // greetings/acknowledgements fall through to guidance. The previous keyword
    // allowlist missed most natural questions and returned a canned reply.
    const isGreetingOnly = /^(hi|hello|hey|yo|thanks|thank you|ty|ok|okay|kk|cool|nice|great|got it|sounds good|help)\b[!.?\s]*$/i.test(trimmed);
    const shouldUseAutonomousAnalysis = trimmed.length >= 3 && !isGreetingOnly;

    if (shouldUseAutonomousAnalysis) {
      // Always analyze the FULL dataset. The previous "smart/targeted" path
      // used a separate LLM to pre-select a subset of question columns, which
      // frequently dropped the columns the user actually meant (e.g. race/flavor)
      // and also discarded the question `type`. Surveys here are small, so we
      // keep every column + the full codebook in context and let the agent map
      // the natural-language question to the right variables itself.
      console.log('🤖 Using full-dataset autonomous analysis');
      return handleAutonomousAnalysis(content);
    }

    // Add user message for non-autonomous analysis
    const userMessage: AnalysisMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date()
    };
    addMessage(userMessage);

    // For simple questions, provide basic response
    const simpleResponse: AnalysisMessage = {
      id: `simple-${Date.now()}`,
      type: 'assistant',
      content: `I can help you analyze your survey data! For the best results with your ${currentDataset.shape[0].toLocaleString()} × ${currentDataset.shape[1]} dataset, try asking questions like:\n\n- "What are some interesting facts?"\n- "Compare responses by demographics"\n- "Find correlations in the data"\n- "Show me response patterns"`,
      timestamp: new Date()
    };
    addMessage(simpleResponse);
  };

  // NEW: Smart Analysis Handler with Targeted Data Loading
  const handleSmartAnalysis = useCallback(async (userQuestion: string) => {
    if (!surveyId || !pyodide) {
      console.error('Cannot start smart analysis: missing surveyId or pyodide');
      return;
    }

    try {
      console.log('🧠 Starting smart analysis for:', userQuestion);

      // Add user message
      const userMessage: AnalysisMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: userQuestion,
        timestamp: new Date()
      };
      addMessage(userMessage);

      // Add loading message
      const loadingMessage: AnalysisMessage = {
        id: `loading-${Date.now()}`,
        type: 'assistant',
        content: `🧠 **Analyzing your question with AI...**

🔍 **Step 1**: Reading complete survey codebook (${surveyTitle})
🎯 **Step 2**: Using semantic analysis to find relevant questions
📊 **Step 3**: Loading only targeted data for your analysis
⚡ **Step 4**: Performing focused statistical analysis

*This intelligent approach is 90% faster and more accurate than loading all data!*`,
        timestamp: new Date()
      };
      addMessage(loadingMessage);

      // Call targeted data API
      const targetedResponse = await fetch(`/api/surveys/${surveyId}/targeted-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: userQuestion,
          includeAllDemographics: true
        })
      });

      if (!targetedResponse.ok) {
        throw new Error(`Targeted analysis failed: ${targetedResponse.status}`);
      }

      const targetedData = await targetedResponse.json();
      console.log('🎯 Received targeted data:', targetedData.data.shape);

      // Convert targeted data to CSV format
      const csvContent = [
        targetedData.data.columns.join(','),
        ...targetedData.data.rows.map(row =>
          row.map(value => {
            return value === null || value === undefined ? '' : `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');

      const csvFile = new File([csvContent], `targeted_survey_${surveyId}.csv`, { type: 'text/csv' });
      const targetedDataset = await loadDataset(csvFile);

      if (targetedDataset) {
        (targetedDataset as any).surveyId = surveyId;
        (targetedDataset as any).isTargeted = true;
        (targetedDataset as any).originalQuery = userQuestion;
        targetedDataset.codebookMappings = targetedData.codebookMappings || [];

        // Add smart analysis result message
        const smartResultMessage: AnalysisMessage = {
          id: `smart-result-${Date.now()}`,
          type: 'assistant',
          content: `✅ **Smart Analysis Complete!**

🎯 **Question Understanding**: *"${userQuestion}"*

📊 **Targeted Data Loaded**:
- **Selected Questions**: ${targetedData.analysisContext.selectedQuestions.length} relevant variables
- **Data Shape**: ${targetedData.data.shape[0].toLocaleString()} responses × ${targetedData.data.shape[1]} columns  
- **Performance Gain**: ${targetedData.data.metadata.performanceGain}
- **Analysis Type**: ${targetedData.analysisContext.suggestedAnalysisType}

🧠 **Selected Survey Questions**:
${targetedData.analysisContext.selectedQuestions.map(q => `• **${q.id}**: ${q.question_text.substring(0, 80)}...`).join('\n')}

${targetedData.analysisContext.selectedDemographics.length > 0 ? `\n👥 **Demographics Included**: ${targetedData.analysisContext.selectedDemographics.join(', ')}` : ''}

${targetedData.analysisContext.reasoning}

🚀 **Ready for AI Analysis!** I now have the perfect targeted dataset to answer your question. Let me run comprehensive analysis...`,
          timestamp: new Date()
        };
        addMessage(smartResultMessage);

        // Now run autonomous analysis on the targeted dataset
        setTimeout(() => {
          handleAutonomousAnalysis(userQuestion);
        }, 1000);
      }

    } catch (err: any) {
      console.error('❌ Smart analysis error:', err);
      const errorMessage: AnalysisMessage = {
        id: `smart-error-${Date.now()}`,
        type: 'assistant',
        content: `❌ **Smart Analysis Failed**

Error: ${err.message}

🔄 **Fallback**: Let me try with the full dataset instead...`,
        timestamp: new Date()
      };
      addMessage(errorMessage);

      // Fallback to traditional analysis
      setTimeout(() => {
        handleAutonomousAnalysis(userQuestion);
      }, 1000);
    }
  }, [surveyId, pyodide, loadDataset, surveyTitle, addMessage, handleAutonomousAnalysis]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSendMessage(input.trim());
        setInput('');
      }
    }
  };

  const handleCodeExecution = async (code: string) => {
    if (!pyodide || !currentDataset) return;

    try {
      setIsLoading(true);
      
      // Add code message first
      const codeMessage: AnalysisMessage = {
        id: `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'code',
        content: code,
        timestamp: new Date(),
        metadata: {
          collapsible: false,
          model: 'user-input'
        }
      };
      addMessage(codeMessage);

      // Execute the code using the same pattern as useAnalysisContext
      await executeCode(code, pyodide);
      
      // Check if any plots were generated and add them as result messages
      const plotResults = await pyodide.runPython(`
        import base64
        from io import BytesIO
        import matplotlib.pyplot as plt
        
        plots = []
        if plt.get_fignums():
          for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buffer = BytesIO()
            fig.savefig(buffer, format='png', bbox_inches='tight', dpi=100)
            buffer.seek(0)
            img_data = base64.b64encode(buffer.getvalue()).decode()
            plots.append(f"data:image/png;base64,{img_data}")
            plt.close(fig)
        plots
      `);

      if (plotResults && plotResults.length > 0) {
        plotResults.forEach((plotData: string, index: number) => {
          const plotMessage: AnalysisMessage = {
            id: `plot-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'result',
            content: plotData,
            timestamp: new Date(),
            metadata: {
              model: 'matplotlib'
            }
          };
          addMessage(plotMessage);
        });
      }

      // Add success message
      const successMessage: AnalysisMessage = {
        id: `success-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'result',
        content: `✅ Code executed successfully${plotResults && plotResults.length > 0 ? ` • Generated ${plotResults.length} plot(s)` : ''}`,
        timestamp: new Date(),
        metadata: {
          model: 'execution-result'
        }
      };
      addMessage(successMessage);

    } catch (error) {
      console.error('Code execution failed:', error);
      const errorMessage: AnalysisMessage = {
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        content: `❌ **Execution Error**: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      addMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendClick = () => {
    if (input.trim()) {
      handleSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {pyodideError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-destructive/10 text-destructive p-6 rounded-lg max-w-md text-center">
            <h2 className="font-semibold mb-2">Python Environment Error</h2>
            <p>{pyodideError}</p>
          </div>
        </div>
      ) : !currentDataset || pyodideLoading || !environmentInitialized ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-lg">
            <h2 className="text-xl font-semibold">
              {!environmentInitialized ? 'Initializing Python Environment' : 
               pyodideLoading ? 'Loading Python Environment' : 
               'Loading Survey Data'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {!environmentInitialized ? 'Preparing code analysis environment...' :
               pyodideLoading ? 'Setting up Python, pandas, matplotlib, and analysis tools...' :
               `Loading survey data for analysis... (Survey ID: ${surveyId})`}
            </p>
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            
            {pyodideLoading && (
              <div className="text-xs text-muted-foreground max-w-md mx-auto">
                <p>This may take 10-30 seconds on first load as we download Python packages...</p>
              </div>
            )}
            
            {/* Debug info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Debug: surveyId={surveyId}, hasDataset={!!currentDataset}, pyodideLoading={pyodideLoading}, envInit={environmentInitialized}</p>
              <p>Messages: {messages.length}, hasLoadedData={hasLoadedData}</p>
            </div>
          </div>
        </div>
      ) : (
        <>


          {/* Conversation Area */}
          <ConversationView 
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onQuickAction={(action) => {
              if (action === 'python-analysis') {
                const lastUserMessage = messages.findLast(m => m.type === 'user');
                if (lastUserMessage) {
                  handleAutonomousAnalysis(lastUserMessage.content);
                }
              } else if (action.startsWith('execute: ')) {
                // Handle code regeneration
                const codeToExecute = action.replace('execute: ', '');
                handleCodeExecution(codeToExecute);
              } else {
                setInput(action);
                handleSendMessage(action);
              }
            }}
          />
          
          {/* Chat Input */}
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={handleSendClick}
            onKeyDown={handleKeyDown}
            isLoading={isLoading}
            placeholder="Ask me to analyze your survey data..."
            disabled={!currentDataset || pyodideLoading}
            onFileUpload={async () => {}} // Not needed for survey data
          />
        </>
      )}
    </div>
  );
} 