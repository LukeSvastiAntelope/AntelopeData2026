import { useState, useCallback, useEffect } from 'react';
import { Survey, SurveyField, SurveyData } from '../types';
import { toast } from '@/components/ui/sonner';

export function useSurveyManagement() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [selectedSurveyData, setSelectedSurveyData] = useState<any>(null);
  const [availableFields, setAvailableFields] = useState<SurveyField[]>([]);
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<number>>(new Set());

  const fetchSurveys = useCallback(async () => {
    try {
      const response = await fetch('/api/surveys');
      if (response.ok) {
        const data = await response.json();
        setSurveys(data.surveys || []);
      }
    } catch (error) {
      console.error('Error fetching surveys:', error);
      toast.error('Failed to load surveys');
    }
  }, []);

  const loadSurveyData = useCallback(async (surveyId: number) => {
    try {
      const response = await fetch(`/api/surveys/${surveyId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedSurveyData(data);
        
        // Extract available fields from survey data
        const fields: SurveyField[] = [];
        if (data.demographics) {
          Object.entries(data.demographics).forEach(([key, label]) => {
            fields.push({ name: key, label: label as string, type: 'demographic' });
          });
        }
        if (data.questions) {
          data.questions.forEach((q: any) => {
            if (q.type !== 'text') {
              fields.push({ name: q.variable_name || q.text, label: q.text, type: 'question' });
            }
          });
        }
        setAvailableFields(fields);
      }
    } catch (error) {
      console.error('Error loading survey data:', error);
      toast.error('Failed to load survey data');
    }
  }, []);

  const handleSurveySelect = useCallback(async (surveyId: number) => {
    setSelectedSurveyId(surveyId);
    await loadSurveyData(surveyId);
  }, [loadSurveyData]);

  const toggleSurveyExpansion = useCallback((surveyId: number) => {
    setExpandedSurveys(prev => {
      const next = new Set(prev);
      if (next.has(surveyId)) {
        next.delete(surveyId);
      } else {
        next.add(surveyId);
      }
      return next;
    });
  }, []);

  // Initialize surveys on mount
  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  return {
    surveys,
    selectedSurveyId,
    selectedSurveyData,
    availableFields,
    dynamicPrompts,
    expandedSurveys,
    fetchSurveys,
    handleSurveySelect,
    toggleSurveyExpansion,
    setDynamicPrompts,
    setSelectedSurveyId
  };
} 