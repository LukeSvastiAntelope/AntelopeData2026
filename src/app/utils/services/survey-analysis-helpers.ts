import type { SurveyAnalysisResult } from './survey-analysis-types';
import type { QuestionProfile } from '../survey/question-profiler';
import { isProfileInteresting } from '../survey/question-profiler';

interface SurveyMetadata {
  id: number;
  title: string;
  description?: string | null;
  responseCount: number;
  questions: Array<{ id: number }>;
}

const toIdString = (id: number | string) => String(id);

const unique = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

const inferSurveyType = (
  survey: SurveyMetadata,
  profiles: QuestionProfile[]
): string => {
  const title = (survey.title || '').toLowerCase();
  const description = (survey.description || '').toLowerCase();
  const text = `${title} ${description}`;

  if (text.includes('customer') || text.includes('csat')) {
    return 'Customer Feedback';
  }
  if (text.includes('employee') || text.includes('engagement')) {
    return 'Employee Engagement';
  }
  if (text.includes('market') || text.includes('marketing') || text.includes('brand')) {
    return 'Market Research';
  }
  if (text.includes('politic') || text.includes('election')) {
    return 'Political Opinion';
  }
  if (text.includes('product') || text.includes('feature')) {
    return 'Product Research';
  }
  if (profiles.some((profile) => profile.category === 'behavioral')) {
    return 'Behavior & Usage Study';
  }
  if (profiles.some((profile) => profile.category === 'opinion')) {
    return 'Attitudes & Perception Survey';
  }
  return 'General Survey Analysis';
};

const deriveThemes = (profiles: QuestionProfile[]): string[] => {
  const themes = new Set<string>();

  const hasDemographics = profiles.some((profile) => profile.category === 'demographic');
  const hasOpinion = profiles.some((profile) => profile.category === 'opinion');
  const hasBehavior = profiles.some((profile) => profile.category === 'behavioral');
  const hasCategorical = profiles.some((profile) => profile.category === 'categorical');

  if (hasDemographics) themes.add('Audience Demographics');
  if (hasOpinion) themes.add('Attitudes & Opinions');
  if (hasBehavior) themes.add('Behavior & Usage');
  if (hasCategorical) themes.add('Preferences & Segmentation');

  const keywordThemes: Array<{ theme: string; keywords: string[] }> = [
    { theme: 'AI & Technology', keywords: ['ai', 'artificial intelligence', 'technology', 'software'] },
    { theme: 'Health & Wellness', keywords: ['health', 'wellness', 'medical', 'care'] },
    { theme: 'Finance & Spending', keywords: ['finance', 'money', 'budget', 'spend', 'cost'] },
    { theme: 'Education & Learning', keywords: ['education', 'learning', 'school', 'university', 'training'] },
    { theme: 'Workplace Culture', keywords: ['work', 'job', 'employer', 'manager', 'coworker'] }
  ];

  const combinedPrompts = profiles.map((profile) => profile.normalizedPrompt);
  for (const { theme, keywords } of keywordThemes) {
    if (combinedPrompts.some((prompt) => keywords.some((keyword) => prompt.includes(keyword)))) {
      themes.add(theme);
    }
  }

  if (themes.size === 0) {
    themes.add('Key Survey Findings');
  }

  return Array.from(themes).slice(0, 5);
};

const estimateAnalysisComplexity = (
  profiles: QuestionProfile[],
  responseCount: number
): SurveyAnalysisResult['analysisComplexity'] => {
  const questionCount = profiles.length;
  if (questionCount <= 10 && responseCount < 200) return 'simple';
  if (questionCount <= 25 && responseCount < 1000) return 'moderate';
  return 'complex';
};

const estimateAnalysisTime = (
  profiles: QuestionProfile[],
  responseCount: number
): number => {
  const base = profiles.length * 2;
  const responseFactor = Math.min(60, Math.max(5, Math.round(responseCount / 50)));
  const total = Math.round(base + responseFactor);
  return Math.max(5, Math.min(total, 240));
};

const buildQuestionCategories = (
  profiles: QuestionProfile[]
): SurveyAnalysisResult['questionCategories'] => {
  const categories: SurveyAnalysisResult['questionCategories'] = {
    demographic: [],
    opinion: [],
    behavioral: [],
    categorical: []
  };

  for (const profile of profiles) {
    const id = toIdString(profile.id);
    switch (profile.category) {
      case 'demographic':
        categories.demographic.push(id);
        break;
      case 'opinion':
        categories.opinion.push(id);
        break;
      case 'behavioral':
        categories.behavioral.push(id);
        break;
      case 'categorical':
        categories.categorical.push(id);
        break;
      default:
        break;
    }
  }

  return {
    demographic: unique(categories.demographic),
    opinion: unique(categories.opinion),
    behavioral: unique(categories.behavioral),
    categorical: unique(categories.categorical)
  };
};

const suggestDistributions = (
  profiles: QuestionProfile[],
  max = 10
): string[] => {
  const candidates = profiles
    .filter((profile) => isProfileInteresting(profile))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max);

  return candidates.map((profile) => toIdString(profile.id));
};

const suggestCrossTabs = (
  profiles: QuestionProfile[],
  max = 6
): SurveyAnalysisResult['suggestedAnalyses']['crossTabs'] => {
  const demographics = profiles
    .filter((profile) => profile.category === 'demographic')
    .slice(0, 4);
  const opinionOrBehavior = profiles
    .filter(
      (profile) =>
        (profile.category === 'opinion' || profile.category === 'behavioral') &&
        isProfileInteresting(profile)
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  const suggestions: SurveyAnalysisResult['suggestedAnalyses']['crossTabs'] = [];

  for (const demo of demographics) {
    for (const target of opinionOrBehavior) {
      if (demo.id === target.id) continue;
      const rationale = `Understand how ${demo.prompt.toLowerCase()} relates to "${
        target.prompt
      }".`;
      suggestions.push({
        var1: toIdString(demo.id),
        var2: toIdString(target.id),
        rationale
      });
      if (suggestions.length >= max) break;
    }
    if (suggestions.length >= max) break;
  }

  return suggestions;
};

const suggestSegmentations = (
  profiles: QuestionProfile[],
  max = 4
): SurveyAnalysisResult['suggestedAnalyses']['segmentations'] => {
  const demographics = profiles
    .filter((profile) => profile.category === 'demographic')
    .slice(0, 3);
  const interesting = profiles
    .filter(
      (profile) =>
        profile.category !== 'demographic' && isProfileInteresting(profile)
    )
    .sort((a, b) => b.priority - a.priority);

  const segmentations: SurveyAnalysisResult['suggestedAnalyses']['segmentations'] = [];

  for (const demo of demographics) {
    const analyzeVars = interesting
      .filter((profile) => profile.id !== demo.id)
      .slice(0, 3)
      .map((profile) => toIdString(profile.id));

    if (analyzeVars.length === 0) continue;

    segmentations.push({
      segmentBy: toIdString(demo.id),
      analyzeVars,
      rationale: `Segment results by ${demo.prompt.toLowerCase()} to compare key metrics across groups.`
    });

    if (segmentations.length >= max) break;
  }

  return segmentations;
};

const suggestCorrelations = (
  profiles: QuestionProfile[],
  max = 4
): SurveyAnalysisResult['suggestedAnalyses']['correlations'] => {
  const ratingProfiles = profiles
    .filter((profile) => profile.detectedType === 'rating_scale')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  const correlations: SurveyAnalysisResult['suggestedAnalyses']['correlations'] = [];

  for (let i = 0; i < ratingProfiles.length; i++) {
    for (let j = i + 1; j < ratingProfiles.length; j++) {
      const first = ratingProfiles[i];
      const second = ratingProfiles[j];
      correlations.push({
        var1: toIdString(first.id),
        var2: toIdString(second.id),
        rationale: `Test whether responses to "${first.prompt}" align with "${second.prompt}".`
      });
      if (correlations.length >= max) break;
    }
    if (correlations.length >= max) break;
  }

  return correlations;
};

const buildKeyMetrics = (
  profiles: QuestionProfile[],
  max = 6
): string[] => {
  const candidates = profiles
    .filter(
      (profile) =>
        profile.category !== 'demographic' &&
        profile.detectedType !== 'text' &&
        profile.detectedType !== 'skip'
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max);

  return candidates.map((profile) => toIdString(profile.id));
};

const buildDemographicFields = (
  profiles: QuestionProfile[]
): string[] => {
  const fields: string[] = [];
  for (const profile of profiles) {
    if (profile.category === 'demographic') {
      fields.push(profile.demographicField ?? toIdString(profile.id));
    }
  }
  return unique(fields);
};

export const buildAnalysisUserPrompt = (
  survey: SurveyMetadata,
  profiles: QuestionProfile[]
): string => {
  const header = `Analyze this survey data:

Survey Title: ${survey.title}
Description: ${survey.description || 'No description provided'}
Total Questions: ${survey.questions.length}
Total Responses: ${survey.responseCount}

Question Overview (id | type/category | prompt | top options):`;

  const questionSummaries = profiles.slice(0, 40).map((profile, index) => {
    const topOptions = profile.options.slice(0, 4).map((opt) => `"${opt}"`).join(', ');
    const optionSummary = profile.optionCount > 0 ? `Options: ${topOptions}${profile.optionCount > 4 ? ', ...' : ''}` : 'Open-ended';
    return `${index + 1}. Q${profile.id} | ${profile.detectedType}/${profile.category} | ${profile.prompt}\n   ${optionSummary}`;
  });

  const footer = profiles.length > 40
    ? '\nNote: Additional questions omitted from prompt due to length; apply consistent reasoning across all questions.'
    : '';

  const instructions = `
Return a JSON object with this exact structure:
{
  "surveyId": ${survey.id},
  "surveyType": "string - primary category (e.g., 'Customer Satisfaction', 'Political Opinion', 'Employee Engagement')",
  "mainThemes": ["array", "of", "key", "themes"],
  "questionCategories": {
    "demographic": ["question_ids for age, gender, location, etc."],
    "opinion": ["question_ids for opinions, ratings, satisfaction"],
    "behavioral": ["question_ids for actions, frequency, usage"],
    "categorical": ["question_ids for simple categorization"]
  },
  "suggestedAnalyses": {
    "distributions": ["question_ids that need distribution analysis"],
    "crossTabs": [
      {"var1": "question_id", "var2": "question_id", "rationale": "why this cross-tab is meaningful"}
    ],
    "correlations": [
      {"var1": "question_id", "var2": "question_id", "rationale": "why this correlation is interesting"}
    ],
    "segmentations": [
      {"segmentBy": "question_id", "analyzeVars": ["question_ids"], "rationale": "why this segmentation is valuable"}
    ]
  },
  "demographicFields": ["question_ids that can be used for demographic segmentation"],
  "keyMetrics": ["question_ids representing the most important survey outcomes"],
  "analysisComplexity": "simple|moderate|complex",
  "estimatedAnalysisTime": number_in_minutes
}

Focus on meaningful statistical relationships and use the provided hints when appropriate.`;

  return `${header}\n${questionSummaries.join('\n')}${footer}\n\n${instructions}`;
};

export const buildHeuristicAnalysis = (
  survey: SurveyMetadata,
  profiles: QuestionProfile[]
): SurveyAnalysisResult => {
  const categories = buildQuestionCategories(profiles);
  const distributions = suggestDistributions(profiles);
  const crossTabs = suggestCrossTabs(profiles);
  const correlations = suggestCorrelations(profiles);
  const segmentations = suggestSegmentations(profiles);
  const demographicFields = buildDemographicFields(profiles);
  const keyMetrics = buildKeyMetrics(profiles);

  return {
    surveyId: survey.id,
    surveyType: inferSurveyType(survey, profiles),
    mainThemes: deriveThemes(profiles),
    questionCategories: categories,
    suggestedAnalyses: {
      distributions,
      crossTabs,
      correlations,
      segmentations
    },
    demographicFields,
    keyMetrics,
    analysisComplexity: estimateAnalysisComplexity(profiles, survey.responseCount),
    estimatedAnalysisTime: estimateAnalysisTime(profiles, survey.responseCount)
  };
};

const mergeCrossTabArrays = (
  base: SurveyAnalysisResult['suggestedAnalyses']['crossTabs'],
  fallback: SurveyAnalysisResult['suggestedAnalyses']['crossTabs']
) => {
  const map = new Map<string, (typeof base)[number]>();
  for (const item of [...base, ...fallback]) {
    const key = `${item.var1}|${item.var2}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
};

const mergeCorrelationArrays = (
  base: SurveyAnalysisResult['suggestedAnalyses']['correlations'],
  fallback: SurveyAnalysisResult['suggestedAnalyses']['correlations']
) => {
  const map = new Map<string, (typeof base)[number]>();
  for (const item of [...base, ...fallback]) {
    const key = `${item.var1}|${item.var2}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
};

const mergeSegmentationArrays = (
  base: SurveyAnalysisResult['suggestedAnalyses']['segmentations'],
  fallback: SurveyAnalysisResult['suggestedAnalyses']['segmentations']
) => {
  const map = new Map<string, (typeof base)[number]>();
  for (const item of [...base, ...fallback]) {
    const key = `${item.segmentBy}|${item.analyzeVars.sort().join('&')}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
};

export const mergeAnalysisWithHeuristics = (
  aiResult: SurveyAnalysisResult | null,
  heuristic: SurveyAnalysisResult
): SurveyAnalysisResult => {
  if (!aiResult) {
    return heuristic;
  }

  const merged: SurveyAnalysisResult = {
    ...aiResult,
    questionCategories: {
      demographic: unique([
        ...(aiResult.questionCategories?.demographic ?? []),
        ...heuristic.questionCategories.demographic
      ]),
      opinion: unique([
        ...(aiResult.questionCategories?.opinion ?? []),
        ...heuristic.questionCategories.opinion
      ]),
      behavioral: unique([
        ...(aiResult.questionCategories?.behavioral ?? []),
        ...heuristic.questionCategories.behavioral
      ]),
      categorical: unique([
        ...(aiResult.questionCategories?.categorical ?? []),
        ...heuristic.questionCategories.categorical
      ])
    },
    suggestedAnalyses: {
      distributions: unique([
        ...(aiResult.suggestedAnalyses?.distributions ?? []),
        ...heuristic.suggestedAnalyses.distributions
      ]),
      crossTabs: mergeCrossTabArrays(
        aiResult.suggestedAnalyses?.crossTabs ?? [],
        heuristic.suggestedAnalyses.crossTabs
      ),
      correlations: mergeCorrelationArrays(
        aiResult.suggestedAnalyses?.correlations ?? [],
        heuristic.suggestedAnalyses.correlations
      ),
      segmentations: mergeSegmentationArrays(
        aiResult.suggestedAnalyses?.segmentations ?? [],
        heuristic.suggestedAnalyses.segmentations
      )
    },
    demographicFields: unique([
      ...(aiResult.demographicFields ?? []),
      ...heuristic.demographicFields
    ]),
    keyMetrics: unique([
      ...(aiResult.keyMetrics ?? []),
      ...heuristic.keyMetrics
    ]),
    analysisComplexity: aiResult.analysisComplexity || heuristic.analysisComplexity,
    estimatedAnalysisTime: aiResult.estimatedAnalysisTime || heuristic.estimatedAnalysisTime,
    surveyType: aiResult.surveyType || heuristic.surveyType,
    mainThemes:
      aiResult.mainThemes && aiResult.mainThemes.length > 0
        ? unique([...aiResult.mainThemes, ...heuristic.mainThemes])
        : heuristic.mainThemes
  };

  if (!merged.estimatedAnalysisTime || merged.estimatedAnalysisTime <= 0) {
    merged.estimatedAnalysisTime = heuristic.estimatedAnalysisTime;
  }

  return merged;
};
