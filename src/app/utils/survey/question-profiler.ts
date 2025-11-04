import { detectDemographicField } from './import-utils';

export type DetectedQuestionType =
  | 'yes_no'
  | 'rating_scale'
  | 'multiple_choice'
  | 'text'
  | 'numeric'
  | 'skip';

export type QuestionCategory =
  | 'demographic'
  | 'opinion'
  | 'behavioral'
  | 'categorical'
  | 'open_text'
  | 'metadata';

export interface RawSurveyQuestion {
  id: number;
  prompt: string;
  type: string;
  options?: any;
  question_order?: number;
  is_required?: boolean | number;
  metadata?: unknown;
}

export interface QuestionProfile {
  id: number;
  prompt: string;
  rawType: string;
  normalizedPrompt: string;
  options: string[];
  detectedType: DetectedQuestionType;
  category: QuestionCategory;
  demographicField?: string;
  tags: string[];
  priority: number;
  isMetadata: boolean;
  optionCount: number;
}

const METADATA_PATTERNS = [
  'respondent id',
  'interview start',
  'interview end',
  'start time',
  'end time',
  'duration',
  'device used',
  'language of interview',
  'form assignment',
  'panelist',
  'quota',
  'sample id',
  'token',
  'collector',
  'progress',
  'status',
  'weight',
  'qa score'
];

const DEMOGRAPHIC_KEYWORDS = [
  'age',
  'gender',
  'sex',
  'income',
  'salary',
  'education',
  'degree',
  'occupation',
  'employment',
  'job title',
  'marital',
  'household',
  'children',
  'zipcode',
  'zip code',
  'postal',
  'state',
  'province',
  'country',
  'region',
  'ethnicity',
  'race',
  'demographic'
];

const OPINION_KEYWORDS = [
  'satisfied',
  'satisfaction',
  'important',
  'importance',
  'how likely',
  'likelihood',
  'agree',
  'disagree',
  'confidence',
  'confident',
  'trust',
  'concerned',
  'support',
  'oppose',
  'approval',
  'rate',
  'rating',
  'recommend',
  'feel',
  'perception',
  'perceive',
  'attitude'
];

const BEHAVIOR_KEYWORDS = [
  'how often',
  'frequency',
  'times per',
  'last time',
  'do you',
  'have you',
  'how many times',
  'usage',
  'use of',
  'spend',
  'spent',
  'visit',
  'visited',
  'purchase',
  'bought',
  'consider',
  'participate',
  'attend',
  'experience'
];

const TEXT_INDICATORS = [
  'please describe',
  'in your own words',
  'tell us',
  'comments',
  'open-ended',
  'open ended',
  'explain',
  'why or why not',
  'please elaborate'
];

const RATING_KEYWORDS = [
  'very',
  'somewhat',
  'not very',
  'not at all',
  'extremely',
  'moderately',
  'slightly',
  'always',
  'often',
  'sometimes',
  'rarely',
  'never',
  'strongly agree',
  'agree',
  'disagree',
  'strongly disagree',
  'definitely',
  'probably',
  'probably not',
  'definitely not',
  'excellent',
  'good',
  'fair',
  'poor',
  'likely',
  'unlikely'
];

const HIGH_PRIORITY_TERMS = [
  'trust',
  'opinion',
  'believe',
  'feel',
  'important',
  'comfortable',
  'effective',
  'threat',
  'satisfaction',
  'experience',
  'recommend',
  'priority',
  'concern',
  'confident',
  'confidence'
];

const YES_SYNONYMS = ['yes', 'y', 'true', 'agree', 'support', 'approve'];
const NO_SYNONYMS = ['no', 'n', 'false', 'disagree', 'oppose', 'disapprove'];

const normalizeSingleOption = (option: any): string | null => {
  if (option === null || option === undefined) return null;
  if (typeof option === 'string') return option.trim();
  if (typeof option === 'number') return String(option);

  if (typeof option === 'object') {
    const candidate =
      (option as any).label ??
      (option as any).text ??
      (option as any).value ??
      (option as any).name;
    if (candidate !== undefined && candidate !== null) {
      return String(candidate).trim();
    }
    return JSON.stringify(option);
  }

  return String(option);
};

export const normalizeQuestionOptions = (value: any): string[] => {
  if (Array.isArray(value)) {
    const flattened = value
      .map((option) => normalizeSingleOption(option))
      .filter((opt): opt is string => Boolean(opt && opt.length > 0));
    return Array.from(new Set(flattened));
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeQuestionOptions(parsed);
      }
    } catch {
      // Not JSON, fall through to comma-separated parsing
    }

    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((opt) => opt.length > 0);
  }

  // Fallback for other shapes (numbers, objects, etc.)
  return normalizeQuestionOptions([value]);
};

const hasTextIndicator = (normalizedPrompt: string): boolean =>
  TEXT_INDICATORS.some((phrase) => normalizedPrompt.includes(phrase));

const containsAny = (source: string, keywords: string[]): boolean =>
  keywords.some((keyword) => source.includes(keyword));

const looksLikeYesNo = (options: string[]): boolean => {
  if (options.length === 0 || options.length > 3) return false;
  const lowerOptions = options.map((opt) => opt.toLowerCase());
  const hasYes = lowerOptions.some((opt) => YES_SYNONYMS.includes(opt));
  const hasNo = lowerOptions.some((opt) => NO_SYNONYMS.includes(opt));
  return hasYes && hasNo;
};

const looksLikeRatingScale = (options: string[]): boolean =>
  options.some((opt) =>
    RATING_KEYWORDS.some((keyword) => opt.toLowerCase().includes(keyword))
  );

const looksNumericOptions = (options: string[]): boolean => {
  if (options.length === 0) return false;
  let numericCount = 0;
  for (const opt of options) {
    const normalized = opt.replace(/[^0-9.\-]/g, '').trim();
    if (!normalized) continue;
    if (!Number.isNaN(Number(normalized))) {
      numericCount += 1;
    }
  }
  return numericCount >= options.length * 0.8;
};

const determineDetectedType = (
  question: RawSurveyQuestion,
  options: string[],
  normalizedPrompt: string,
  isMetadata: boolean
): DetectedQuestionType => {
  if (isMetadata) return 'skip';

  const lowerType = (question.type || '').toLowerCase();

  if (hasTextIndicator(normalizedPrompt) || lowerType.includes('text')) {
    return 'text';
  }

  if (looksLikeYesNo(options)) {
    return 'yes_no';
  }

  if (looksLikeRatingScale(options)) {
    return 'rating_scale';
  }

  if (looksNumericOptions(options) || lowerType.includes('number')) {
    return 'numeric';
  }

  if (options.length >= 3 && options.length <= 10) {
    return 'multiple_choice';
  }

  if (options.length === 0) {
    return 'text';
  }

  return 'multiple_choice';
};

const determineCategory = (
  detectedType: DetectedQuestionType,
  normalizedPrompt: string,
  options: string[],
  demographicField?: string,
  isMetadata?: boolean
): QuestionCategory => {
  if (isMetadata) return 'metadata';
  if (detectedType === 'text') return 'open_text';
  if (demographicField) return 'demographic';
  if (containsAny(normalizedPrompt, DEMOGRAPHIC_KEYWORDS)) return 'demographic';
  if (containsAny(normalizedPrompt, OPINION_KEYWORDS) || detectedType === 'rating_scale') {
    return 'opinion';
  }
  if (containsAny(normalizedPrompt, BEHAVIOR_KEYWORDS)) {
    return 'behavioral';
  }
  if (detectedType === 'yes_no' || detectedType === 'multiple_choice') {
    return 'categorical';
  }
  return 'categorical';
};

const calculatePriority = (
  normalizedPrompt: string,
  category: QuestionCategory,
  detectedType: DetectedQuestionType,
  optionCount: number
): number => {
  let priority = 1;

  if (category === 'opinion' || category === 'behavioral') {
    priority += 2;
  } else if (category === 'demographic') {
    priority += 1;
  }

  if (detectedType === 'rating_scale') {
    priority += 1;
  } else if (detectedType === 'yes_no') {
    priority += 0.5;
  }

  if (optionCount >= 3 && optionCount <= 7) {
    priority += 1;
  }

  if (containsAny(normalizedPrompt, HIGH_PRIORITY_TERMS)) {
    priority += 2;
  }

  return Math.round(priority);
};

const buildTags = (
  profile: QuestionProfile,
  demographicField?: string
): string[] => {
  const tags = new Set<string>();
  tags.add(`category:${profile.category}`);
  tags.add(`type:${profile.detectedType}`);
  if (profile.detectedType === 'rating_scale') tags.add('likert');
  if (profile.detectedType === 'yes_no') tags.add('binary');
  if (profile.detectedType === 'numeric') tags.add('numeric');
  if (demographicField) tags.add(`demographic:${demographicField}`);
  if (profile.optionCount > 5) tags.add('multi_option');
  if (profile.optionCount === 2) tags.add('two_option');
  return Array.from(tags);
};

export const profileQuestion = (question: RawSurveyQuestion): QuestionProfile => {
  const options = normalizeQuestionOptions(question.options);
  const normalizedPrompt = (question.prompt || '').replace(/\s+/g, ' ').trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const isMetadata = METADATA_PATTERNS.some((pattern) => lowerPrompt.includes(pattern));
  const demographicMatch = detectDemographicField(question.prompt || '');
  const detectedType = determineDetectedType(question, options, lowerPrompt, isMetadata);
  const category = determineCategory(
    detectedType,
    lowerPrompt,
    options,
    demographicMatch?.field,
    isMetadata
  );

  const profile: QuestionProfile = {
    id: question.id,
    prompt: question.prompt,
    rawType: question.type,
    normalizedPrompt,
    options,
    detectedType,
    category,
    demographicField: demographicMatch?.field,
    tags: [],
    priority: 1,
    isMetadata,
    optionCount: options.length
  };

  profile.priority = calculatePriority(
    lowerPrompt,
    profile.category,
    profile.detectedType,
    profile.optionCount
  );
  profile.tags = buildTags(profile, profile.demographicField);

  return profile;
};

export const profileQuestions = (questions: RawSurveyQuestion[]): QuestionProfile[] =>
  questions.map((question) => profileQuestion(question));

export const isProfileInteresting = (profile: QuestionProfile): boolean => {
  if (profile.isMetadata) return false;
  if (profile.detectedType === 'skip') return false;
  if (profile.category === 'open_text') return false;
  if (profile.optionCount === 0) return false;
  if (profile.optionCount > 12) return false;
  return true;
};
