import { AnonymityLevel, DemographicCategory, AnonymityConfiguration, CompletionCalculationResult, DemographicsFormConfig } from './interface';

// ===== ANONYMITY LEVEL CONFIGURATIONS =====

export const ANONYMITY_CONFIGURATIONS: Record<AnonymityLevel, AnonymityConfiguration> = {
  full: {
    level: 'full',
    fieldsToCollect: [
      'name', 'email', 'age', 'location', 'occupation', 'education',
      'income', 'politicalViews', 'gender', 'ethnicity', 'interests', 'socialMedia'
    ],
    fieldsToExclude: [],
    description: 'Full demographic profile with personal identification',
    privacyNote: 'Your personal information, including name and email, will be collected and stored. Every field is optional — you can skip anything you prefer not to answer.'
  },
  semi_anonymous: {
    level: 'semi_anonymous',
    fieldsToCollect: [
      'age', 'location', 'gender', 'ethnicity'
    ],
    fieldsToExclude: ['name', 'email', 'occupation', 'education', 'income', 'politicalViews', 'interests', 'socialMedia'],
    description: 'Just age, location, gender, and race — no names, emails, or addresses',
    privacyNote: 'No names, emails, or addresses are collected — only age, location, gender, and race. Every field is optional.'
  },
  anonymous: {
    level: 'anonymous',
    fieldsToCollect: [],
    fieldsToExclude: ['name', 'email', 'age', 'location', 'occupation', 'education', 'income', 'socialMedia', 'interests', 'politicalViews'],
    description: 'No demographic data collection',
    privacyNote: 'This survey is completely anonymous. No demographic or personal information will be collected or stored.'
  }
};

// ===== DEMOGRAPHICS FORM CONFIGURATIONS =====

export const DEMOGRAPHICS_FORM_CONFIGS: Record<AnonymityLevel, DemographicsFormConfig> = {
  full: {
    anonymityLevel: 'full',
    requiredFields: [],
    optionalFields: ['name', 'email', 'age', 'location', 'occupation', 'education', 'income', 'politicalViews', 'gender', 'ethnicity', 'interests', 'socialMedia'],
    excludedFields: [],
    privacyNotice: 'We collect demographic information to build a voter profile for research. Every field is optional — skip anything you prefer not to share or answer "N/A".',
    consentText: 'I consent to providing my information for research purposes and understand it will be used to build a voter profile.'
  },
  semi_anonymous: {
    anonymityLevel: 'semi_anonymous',
    requiredFields: [],
    optionalFields: ['age', 'location', 'gender', 'ethnicity'],
    excludedFields: ['name', 'email', 'occupation', 'education', 'income', 'politicalViews', 'interests', 'socialMedia'],
    privacyNotice: 'We collect only age, location, gender, and race — no names, emails, or addresses. Every field is optional.',
    consentText: 'I consent to providing general demographic information without personal identifiers for research purposes.'
  },
  anonymous: {
    anonymityLevel: 'anonymous',
    requiredFields: [],
    optionalFields: [],
    excludedFields: ['name', 'email', 'age', 'location', 'occupation', 'education', 'income', 'socialMedia', 'interests', 'politicalViews'],
    privacyNotice: 'This survey is completely anonymous. No demographic or personal information will be collected.',
    consentText: 'I understand this survey is completely anonymous and no personal information will be collected.'
  }
};

// ===== COMPLETION PERCENTAGE CALCULATIONS =====

/**
 * Calculate completion percentage and demographic category for a digital twin
 * based on available demographic data and anonymity level
 */
export function calculateCompletionPercentage(
  demographics: Record<string, any>, 
  anonymityLevel: AnonymityLevel
): CompletionCalculationResult {
  const config = ANONYMITY_CONFIGURATIONS[anonymityLevel];
  const expectedFields = config.fieldsToCollect;
  
  // Filter out empty, null, or undefined values
  const availableFields = Object.keys(demographics).filter(key => {
    const value = demographics[key];
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return expectedFields.includes(key);
  });

  const missingFields = expectedFields.filter(field => !availableFields.includes(field));
  const completionRatio = expectedFields.length > 0 ? availableFields.length / expectedFields.length : 0;
  
  // Calculate percentage based on anonymity level constraints
  let percentage: number;
  let category: DemographicCategory;

  switch (anonymityLevel) {
    case 'full':
      percentage = Math.round(completionRatio * 100);
      if (percentage >= 80) category = 'full_profile';
      else if (percentage >= 50) category = 'partial_profile';
      else category = 'minimal_profile';
      break;
      
    case 'semi_anonymous':
      percentage = Math.round(completionRatio * 79); // Cap at 79% for semi-anonymous
      if (percentage >= 60) category = 'partial_profile';
      else if (percentage >= 30) category = 'minimal_profile';
      else category = 'minimal_profile';
      break;
      
    case 'anonymous':
      percentage = 0; // No demographics collected for anonymous surveys
      category = 'anonymous_profile';
      break;
      
    default:
      percentage = 0;
      category = 'minimal_profile';
  }

  return {
    percentage,
    category,
    missingFields,
    availableFields
  };
}

/**
 * Determine demographic category for imported/synthetic digital twins
 */
export function categorizeImportedTwin(demographics: Record<string, any>): DemographicCategory {
  const fieldCount = Object.keys(demographics).filter(key => {
    const value = demographics[key];
    return value !== null && value !== undefined && value !== '';
  }).length;

  const hasPersonalInfo = demographics.name || demographics.email;
  
  if (hasPersonalInfo && fieldCount >= 8) return 'full_profile';
  if (fieldCount >= 5) return 'partial_profile';
  if (fieldCount >= 2) return 'minimal_profile';
  return 'imported_synthetic';
}

/**
 * Get anonymity level description for UI display
 */
export function getAnonymityLevelDescription(level: AnonymityLevel): string {
  return ANONYMITY_CONFIGURATIONS[level].description;
}

/**
 * Get privacy notice for anonymity level
 */
export function getPrivacyNotice(level: AnonymityLevel): string {
  return ANONYMITY_CONFIGURATIONS[level].privacyNote;
}

/**
 * Check if a field should be collected for given anonymity level
 */
export function shouldCollectField(field: string, anonymityLevel: AnonymityLevel): boolean {
  const config = ANONYMITY_CONFIGURATIONS[anonymityLevel];
  return config.fieldsToCollect.includes(field) && !config.fieldsToExclude.includes(field);
}

/**
 * Filter demographics data based on anonymity level
 */
export function filterDemographicsForAnonymity(
  demographics: Record<string, any>, 
  anonymityLevel: AnonymityLevel
): Record<string, any> {
  const config = ANONYMITY_CONFIGURATIONS[anonymityLevel];
  const filtered: Record<string, any> = {};
  
  for (const field of config.fieldsToCollect) {
    if (demographics[field] !== undefined && !config.fieldsToExclude.includes(field)) {
      filtered[field] = demographics[field];
    }
  }
  
  return filtered;
}

/**
 * Validate anonymity level change is allowed
 */
export function canChangeAnonymityLevel(
  currentLevel: AnonymityLevel, 
  newLevel: AnonymityLevel, 
  hasResponses: boolean
): { allowed: boolean; reason?: string } {
  // Allow any change if no responses yet
  if (!hasResponses) {
    return { allowed: true };
  }
  
  // Once responses exist, only allow changes that don't expose more data
  const currentConfig = ANONYMITY_CONFIGURATIONS[currentLevel];
  const newConfig = ANONYMITY_CONFIGURATIONS[newLevel];
  
  // Check if new level would collect more sensitive data
  const wouldCollectMore = newConfig.fieldsToCollect.some(field => 
    !currentConfig.fieldsToCollect.includes(field)
  );
  
  if (wouldCollectMore) {
    return { 
      allowed: false, 
      reason: 'Cannot increase data collection after responses have been submitted. This would violate privacy expectations of existing respondents.' 
    };
  }
  
  return { allowed: true };
}

/**
 * Get recommended anonymity level based on survey topic/content
 */
export function getRecommendedAnonymityLevel(surveyTitle: string, surveyDescription: string): AnonymityLevel {
  const content = `${surveyTitle} ${surveyDescription}`.toLowerCase();
  
  // Keywords that suggest sensitive topics requiring higher privacy
  const sensitiveKeywords = [
    'health', 'medical', 'mental', 'therapy', 'addiction', 'substance',
    'political', 'voting', 'election', 'partisan', 'ideology',
    'sexual', 'gender', 'identity', 'orientation', 'relationship',
    'financial', 'income', 'debt', 'bankruptcy', 'wealth',
    'legal', 'crime', 'arrest', 'lawsuit', 'violation',
    'religion', 'spiritual', 'belief', 'faith', 'worship',
    'controversial', 'sensitive', 'private', 'confidential'
  ];
  
  // Keywords that suggest research requiring detailed profiles
  const detailedResearchKeywords = [
    'market research', 'consumer behavior', 'product feedback',
    'user experience', 'brand perception', 'satisfaction',
    'demographics', 'persona', 'profile', 'segment'
  ];
  
  const hasSensitive = sensitiveKeywords.some(keyword => content.includes(keyword));
  const needsDetailed = detailedResearchKeywords.some(keyword => content.includes(keyword));
  
  if (hasSensitive) return 'anonymous';
  if (needsDetailed) return 'full';
  return 'semi_anonymous';
} 