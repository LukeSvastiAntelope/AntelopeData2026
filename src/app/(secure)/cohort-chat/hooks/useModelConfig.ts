import { useState, useCallback, useEffect } from 'react';
import { StreamingMode, DataSources } from '../types';

const DEFAULT_SYSTEM_PROMPT = `You are an expert survey analyst and data scientist specializing in extracting meaningful insights from survey responses. Your role is to help users understand their survey data through comprehensive analysis and clear communication.

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

Remember: You are not just summarizing data - you are providing expert interpretation that helps users make informed decisions based on their survey insights.`;

export function useModelConfig() {
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.0);
  const [streamingMode, setStreamingMode] = useState<StreamingMode>('smart');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [sources, setSources] = useState<DataSources>({
    survey: true, 
    twins: true, 
    web: false
  });

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem('cohort-chat-selected-model');
    const savedTemperature = localStorage.getItem('cohort-chat-temperature');
    const savedStreamingMode = localStorage.getItem('cohort-chat-streaming-mode');
    const savedSystemPrompt = localStorage.getItem('cohort-chat-system-prompt');
    const savedSources = localStorage.getItem('cohort-chat-sources');

    if (savedModel) setSelectedModel(savedModel);
    if (savedTemperature) setTemperature(parseFloat(savedTemperature));
    if (savedStreamingMode) setStreamingMode(savedStreamingMode as StreamingMode);
    if (savedSystemPrompt) setSystemPrompt(savedSystemPrompt);
    if (savedSources) setSources(JSON.parse(savedSources));
  }, []);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem('cohort-chat-selected-model', model);
  }, []);

  const handleTemperatureChange = useCallback((temp: number) => {
    setTemperature(temp);
    localStorage.setItem('cohort-chat-temperature', temp.toString());
  }, []);

  const handleStreamingModeChange = useCallback((mode: StreamingMode) => {
    setStreamingMode(mode);
    localStorage.setItem('cohort-chat-streaming-mode', mode);
  }, []);

  const handleSystemPromptChange = useCallback((prompt: string) => {
    setSystemPrompt(prompt);
    localStorage.setItem('cohort-chat-system-prompt', prompt);
  }, []);

  const handleSourcesChange = useCallback((newSources: DataSources) => {
    setSources(newSources);
    localStorage.setItem('cohort-chat-sources', JSON.stringify(newSources));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    localStorage.setItem('cohort-chat-system-prompt', DEFAULT_SYSTEM_PROMPT);
  }, []);

  return {
    selectedModel,
    temperature,
    streamingMode,
    systemPrompt,
    sources,
    handleModelChange,
    handleTemperatureChange,
    handleStreamingModeChange,
    handleSystemPromptChange,
    handleSourcesChange,
    resetToDefaults,
    setStreamingMode
  };
} 