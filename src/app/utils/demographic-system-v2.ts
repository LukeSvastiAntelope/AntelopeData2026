export type DemographicField = 
  | 'name' 
  | 'email' 
  | 'age' 
  | 'gender' 
  | 'location' 
  | 'occupation' 
  | 'education' 
  | 'income' 
  | 'political_views' 
  | 'interests' 
  | 'social_media'
  | 'ethnicity'
  | 'marital_status'
  | 'household_size'
  | 'phone_number'
  // Political-specific fields
  | 'party_affiliation'
  | 'voter_registration_status'
  | 'voting_frequency'
  | 'primary_participation'
  | 'congressional_district'
  | 'state'
  | 'county'
  | 'ideology_spectrum'
  | 'issue_priorities'
  | 'news_sources';

export type AnonymityLevel = 'full' | 'semi_anonymous' | 'anonymous' | 'political';

export interface DemographicFieldConfig {
  field: DemographicField;
  label: string;
  type: 'text' | 'select' | 'multi-select' | 'number' | 'email';
  required: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  category: 'personal' | 'professional' | 'social' | 'contact' | 'political';
  sensitivityLevel: 'low' | 'medium' | 'high'; // For privacy recommendations
}

export interface AnonymityLevelConfig {
  level: AnonymityLevel;
  title: string;
  description: string;
  privacyNote: string;
  requiredFields: DemographicField[];
  availableFields: DemographicField[]; // Fields that CAN be selected
  recommendedFields: DemographicField[]; // Fields recommended for this level
  excludedFields: DemographicField[]; // Fields that CANNOT be selected
  maxFields?: number; // Limit for semi-anonymous
  queryCompatible: boolean; // Can be used for demographic filtering
}

export interface SurveyDemographicConfig {
  anonymityLevel: AnonymityLevel;
  selectedFields: DemographicField[];
  customFieldLabels?: Record<DemographicField, string>; // Override default labels
  consentText?: string;
  isRequired: boolean; // Whether demographics collection is mandatory
}

// =============================================================================
// DEMOGRAPHIC FIELD DEFINITIONS
// =============================================================================

export const DEMOGRAPHIC_FIELDS: Record<DemographicField, DemographicFieldConfig> = {
  name: {
    field: 'name',
    label: 'Full Name',
    type: 'text',
    required: false,
    category: 'contact',
    sensitivityLevel: 'high'
  },
  email: {
    field: 'email',
    label: 'Email Address',
    type: 'email',
    required: false,
    category: 'contact',
    sensitivityLevel: 'high'
  },
  age: {
    field: 'age',
    label: 'Age',
    type: 'select',
    required: false,
    options: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
    category: 'personal',
    sensitivityLevel: 'low'
  },
  gender: {
    field: 'gender',
    label: 'Gender',
    type: 'select',
    required: false,
    options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    category: 'personal',
    sensitivityLevel: 'medium'
  },
  location: {
    field: 'location',
    label: 'Location',
    type: 'select',
    required: false,
    options: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Lithuania', 'Other'],
    category: 'personal',
    sensitivityLevel: 'medium'
  },
  occupation: {
    field: 'occupation',
    label: 'Occupation',
    type: 'select',
    required: false,
    options: [
      'Technology', 'Healthcare', 'Education', 'Finance', 'Retail', 
      'Manufacturing', 'Government', 'Non-profit', 'Student', 'Retired', 'Other'
    ],
    category: 'professional',
    sensitivityLevel: 'low'
  },
  education: {
    field: 'education',
    label: 'Education Level',
    type: 'select',
    required: false,
    options: [
      'High school or less', 'Some college', 'Bachelor\'s degree', 
      'Master\'s degree', 'Doctorate', 'Trade/Vocational school'
    ],
    category: 'professional',
    sensitivityLevel: 'low'
  },
  income: {
    field: 'income',
    label: 'Household Income',
    type: 'select',
    required: false,
    options: [
      'Under $25,000', '$25,000-$49,999', '$50,000-$74,999', 
      '$75,000-$99,999', '$100,000-$149,999', '$150,000+', 'Prefer not to say'
    ],
    category: 'personal',
    sensitivityLevel: 'high'
  },
  political_views: {
    field: 'political_views',
    label: 'Political Views',
    type: 'select',
    required: false,
    options: ['Very liberal', 'Liberal', 'Moderate', 'Conservative', 'Very conservative', 'Prefer not to say'],
    category: 'social',
    sensitivityLevel: 'high'
  },
  interests: {
    field: 'interests',
    label: 'Interests',
    type: 'multi-select',
    required: false,
    options: [
      'Technology', 'Sports', 'Arts', 'Travel', 'Food', 'Music', 
      'Reading', 'Gaming', 'Fitness', 'Politics', 'Science', 'Other'
    ],
    category: 'social',
    sensitivityLevel: 'low'
  },
  social_media: {
    field: 'social_media',
    label: 'Social Media Usage',
    type: 'multi-select',
    required: false,
    options: ['Facebook', 'Twitter/X', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Reddit', 'None'],
    category: 'social',
    sensitivityLevel: 'medium'
  },
  ethnicity: {
    field: 'ethnicity',
    label: 'Ethnicity',
    type: 'select',
    required: false,
    options: [
      'White/Caucasian', 'Black/African American', 'Hispanic/Latino', 
      'Asian', 'Native American', 'Mixed race', 'Other', 'Prefer not to say'
    ],
    category: 'personal',
    sensitivityLevel: 'high'
  },
  marital_status: {
    field: 'marital_status',
    label: 'Marital Status',
    type: 'select',
    required: false,
    options: ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'],
    category: 'personal',
    sensitivityLevel: 'medium'
  },
  household_size: {
    field: 'household_size',
    label: 'Household Size',
    type: 'select',
    required: false,
    options: ['1', '2', '3', '4', '5+'],
    category: 'personal',
    sensitivityLevel: 'low'
  },
  phone_number: {
    field: 'phone_number',
    label: 'Phone Number',
    type: 'text',
    required: false,
    validation: { pattern: '^[+]?[0-9\s\-\(\)]+$' },
    category: 'contact',
    sensitivityLevel: 'high'
  },

  // =========================================================================
  // POLITICAL DEMOGRAPHIC FIELDS
  // =========================================================================
  party_affiliation: {
    field: 'party_affiliation',
    label: 'Party Affiliation',
    type: 'select',
    required: false,
    options: ['Democrat', 'Republican', 'Independent', 'Libertarian', 'Green', 'Other', 'Prefer not to say'],
    category: 'political',
    sensitivityLevel: 'medium'
  },
  voter_registration_status: {
    field: 'voter_registration_status',
    label: 'Voter Registration Status',
    type: 'select',
    required: false,
    options: ['Registered', 'Not registered', 'Unsure'],
    category: 'political',
    sensitivityLevel: 'medium'
  },
  voting_frequency: {
    field: 'voting_frequency',
    label: 'Voting Frequency',
    type: 'select',
    required: false,
    options: ['Every election', 'Most elections', 'Occasionally', 'Rarely', 'Never voted'],
    category: 'political',
    sensitivityLevel: 'low'
  },
  primary_participation: {
    field: 'primary_participation',
    label: 'Primary Election Participation',
    type: 'select',
    required: false,
    options: ['Always', 'Sometimes', 'Never'],
    category: 'political',
    sensitivityLevel: 'low'
  },
  congressional_district: {
    field: 'congressional_district',
    label: 'Congressional District',
    type: 'text',
    required: false,
    category: 'political',
    sensitivityLevel: 'low'
  },
  state: {
    field: 'state',
    label: 'State',
    type: 'select',
    required: false,
    options: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
      'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
      'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
      'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
      'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
      'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
      'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
      'Wisconsin', 'Wyoming', 'District of Columbia'
    ],
    category: 'political',
    sensitivityLevel: 'low'
  },
  county: {
    field: 'county',
    label: 'County',
    type: 'text',
    required: false,
    category: 'political',
    sensitivityLevel: 'low'
  },
  ideology_spectrum: {
    field: 'ideology_spectrum',
    label: 'Political Ideology',
    type: 'select',
    required: false,
    options: [
      'Very Progressive', 'Progressive', 'Lean Progressive',
      'Moderate',
      'Lean Conservative', 'Conservative', 'Very Conservative'
    ],
    category: 'political',
    sensitivityLevel: 'medium'
  },
  issue_priorities: {
    field: 'issue_priorities',
    label: 'Top Issue Priorities',
    type: 'multi-select',
    required: false,
    options: [
      'Economy & Jobs', 'Healthcare', 'Immigration', 'Education', 'Climate & Environment',
      'National Security', 'Crime & Public Safety', 'Taxes & Government Spending',
      'Abortion & Reproductive Rights', 'Gun Policy', 'Voting Rights & Democracy',
      'Housing & Cost of Living', 'Social Security & Medicare', 'Foreign Policy',
      'Civil Rights & Racial Justice', 'Technology & Privacy'
    ],
    category: 'political',
    sensitivityLevel: 'low'
  },
  news_sources: {
    field: 'news_sources',
    label: 'Primary News Sources',
    type: 'multi-select',
    required: false,
    options: [
      'CNN', 'Fox News', 'MSNBC', 'NPR', 'ABC News', 'CBS News', 'NBC News',
      'The New York Times', 'The Washington Post', 'The Wall Street Journal',
      'AP News / Reuters', 'Local newspapers', 'Local TV news',
      'Social media (Facebook, X, TikTok)', 'Podcasts', 'Other online sources',
      'None / I don\'t follow news'
    ],
    category: 'political',
    sensitivityLevel: 'low'
  }
};

// =============================================================================
// ANONYMITY LEVEL CONFIGURATIONS  
// =============================================================================

export const ANONYMITY_LEVELS: Record<AnonymityLevel, AnonymityLevelConfig> = {
  full: {
    level: 'full',
    title: 'Full Demographics',
    description: 'Comprehensive demographic profile with personal identification',
    privacyNote: 'Your personal information including name and email will be collected. This enables detailed research insights and digital twin creation.',
    requiredFields: ['name', 'email', 'age'],
    availableFields: [
      'name', 'email', 'age', 'gender', 'location', 'occupation', 
      'education', 'income', 'political_views', 'interests', 'social_media',
      'ethnicity', 'marital_status', 'household_size', 'phone_number'
    ],
    recommendedFields: ['name', 'email', 'age', 'gender', 'location', 'occupation', 'education'],
    excludedFields: [],
    queryCompatible: true
  },
  
  semi_anonymous: {
    level: 'semi_anonymous',
    title: 'Semi-Anonymous',
    description: 'Selected demographic data without personal identification',
    privacyNote: 'No personally identifiable information will be collected. Only selected demographic and preference data will be stored.',
    requiredFields: ['age'], // Minimum for basic analysis
    availableFields: [
      'age', 'gender', 'location', 'occupation', 'education', 
      'political_views', 'interests', 'ethnicity', 'marital_status', 'household_size'
    ],
    recommendedFields: ['age', 'gender', 'location', 'occupation'],
    excludedFields: ['name', 'email', 'phone_number', 'social_media'],
    maxFields: 8,
    queryCompatible: true
  },
  
  anonymous: {
    level: 'anonymous',
    title: 'Anonymous',
    description: 'No demographic data collection',
    privacyNote: 'This survey is completely anonymous. No demographic or personal information will be collected.',
    requiredFields: [],
    availableFields: [],
    recommendedFields: [],
    excludedFields: [
      'name', 'email', 'age', 'gender', 'location', 'occupation', 
      'education', 'income', 'political_views', 'interests', 'social_media',
      'ethnicity', 'marital_status', 'household_size', 'phone_number',
      'party_affiliation', 'voter_registration_status', 'voting_frequency',
      'primary_participation', 'congressional_district', 'state', 'county',
      'ideology_spectrum', 'issue_priorities', 'news_sources'
    ],
    queryCompatible: false
  },

  political: {
    level: 'political',
    title: 'Political Survey',
    description: 'Political demographics without personal identification — optimized for voter research',
    privacyNote: 'No personally identifiable information (name, email, phone) will be collected. Only political demographics, geographic, and opinion data will be stored to enable voter profile analysis.',
    requiredFields: ['state', 'party_affiliation'],
    availableFields: [
      'age', 'gender', 'state', 'county', 'congressional_district',
      'education', 'income', 'ethnicity',
      'party_affiliation', 'voter_registration_status', 'voting_frequency',
      'primary_participation', 'ideology_spectrum', 'issue_priorities',
      'news_sources', 'political_views', 'marital_status', 'household_size',
      'occupation'
    ],
    recommendedFields: [
      'age', 'gender', 'state', 'party_affiliation', 'voter_registration_status',
      'voting_frequency', 'ideology_spectrum', 'issue_priorities'
    ],
    excludedFields: ['name', 'email', 'phone_number', 'social_media'],
    maxFields: 15,
    queryCompatible: true
  }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get available fields for a specific anonymity level
 */
export function getAvailableFields(level: AnonymityLevel): DemographicFieldConfig[] {
  const config = ANONYMITY_LEVELS[level];
  return config.availableFields.map(field => DEMOGRAPHIC_FIELDS[field]);
}

/**
 * Get recommended fields for a specific anonymity level
 */
export function getRecommendedFields(level: AnonymityLevel): DemographicFieldConfig[] {
  const config = ANONYMITY_LEVELS[level];
  return config.recommendedFields.map(field => DEMOGRAPHIC_FIELDS[field]);
}

/**
 * Validate demographic configuration for a survey
 */
export function validateDemographicConfig(config: SurveyDemographicConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const levelConfig = ANONYMITY_LEVELS[config.anonymityLevel];

  // Check if all required fields are included
  for (const required of levelConfig.requiredFields) {
    if (!config.selectedFields.includes(required)) {
      errors.push(`Required field '${DEMOGRAPHIC_FIELDS[required].label}' is missing`);
    }
  }

  // Check if any excluded fields are included
  for (const excluded of levelConfig.excludedFields) {
    if (config.selectedFields.includes(excluded)) {
      errors.push(`Field '${DEMOGRAPHIC_FIELDS[excluded].label}' is not allowed for ${levelConfig.title}`);
    }
  }

  // Check field limits for semi-anonymous
  if (config.anonymityLevel === 'semi_anonymous' && levelConfig.maxFields) {
    if (config.selectedFields.length > levelConfig.maxFields) {
      errors.push(`Too many fields selected (${config.selectedFields.length}/${levelConfig.maxFields})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create default demographic configuration for an anonymity level
 */
export function createDefaultDemographicConfig(level: AnonymityLevel): SurveyDemographicConfig {
  const levelConfig = ANONYMITY_LEVELS[level];
  
  return {
    anonymityLevel: level,
    selectedFields: [...levelConfig.requiredFields, ...levelConfig.recommendedFields],
    isRequired: level !== 'anonymous'
  };
}

/**
 * Calculate completion percentage for demographic data
 */
export function calculateDemographicCompletion(
  demographicData: Record<string, any>,
  config: SurveyDemographicConfig
): {
  percentage: number;
  missingFields: DemographicField[];
  completedFields: DemographicField[];
} {
  const completedFields: DemographicField[] = [];
  const missingFields: DemographicField[] = [];

  for (const field of config.selectedFields) {
    const value = demographicData[field];
    if (value && value !== '' && value !== null && value !== undefined) {
      if (Array.isArray(value) && value.length > 0) {
        completedFields.push(field);
      } else if (!Array.isArray(value)) {
        completedFields.push(field);
      } else {
        missingFields.push(field);
      }
    } else {
      missingFields.push(field);
    }
  }

  const percentage = config.selectedFields.length > 0 
    ? Math.round((completedFields.length / config.selectedFields.length) * 100)
    : 0;

  return {
    percentage,
    missingFields,
    completedFields
  };
} 