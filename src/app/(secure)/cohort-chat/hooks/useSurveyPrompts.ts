"use client";

import { useEffect, useState } from 'react';

type SurveyData = any;

function computePrompts(surveyData: SurveyData): string[] {
  if (!surveyData || !surveyData.questions) return [];

  const questions = surveyData.questions;
  const prompts: string[] = [];

  const hasRatingQuestions = questions.some((q: any) => q.type === 'rating' || q.type === 'scale');
  const hasChoiceQuestions = questions.some((q: any) => q.type === 'single-choice' || q.type === 'multiple-choice');
  const hasTextQuestions = questions.some((q: any) => q.type === 'text');

  if (hasRatingQuestions) prompts.push('What are the average ratings across different demographics?');
  if (hasChoiceQuestions) prompts.push('Show the distribution of responses for multiple choice questions');
  if (hasTextQuestions) prompts.push('What are the common themes in open-ended responses?');

  const sampleQuestions = questions.slice(0, 3);
  if (sampleQuestions.length > 0) {
    const first = sampleQuestions[0];
    if (first.prompt) {
      const snippet = first.prompt.length > 50 ? first.prompt.substring(0, 50) + '...' : first.prompt;
      prompts.push(`Analyze responses to: "${snippet}"`);
    }
  }

  prompts.push(`Summarize key insights from "${surveyData.title}"`);
  prompts.push('Compare responses across age groups');

  return prompts.slice(0, 3);
}

export function useSurveyPrompts(surveyData: SurveyData | null) {
  const [prompts, setPrompts] = useState<string[]>([]);

  const refresh = (force = false) => {
    if (!surveyData) {
      setPrompts([]);
      return;
    }

    const cacheKey = `survey-prompts-${surveyData.id}`;
    const cacheTsKey = `${cacheKey}-timestamp`;

    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(cacheTsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts);
        if (age < 60 * 60 * 1000) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPrompts(parsed);
              return;
            }
          } catch {}
        }
      }
    }

    const computed = computePrompts(surveyData);
    setPrompts(computed);
    localStorage.setItem(`survey-prompts-${surveyData.id}`, JSON.stringify(computed));
    localStorage.setItem(`survey-prompts-${surveyData.id}-timestamp`, Date.now().toString());
  };

  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyData?.id]);

  return { prompts, refresh };
}



