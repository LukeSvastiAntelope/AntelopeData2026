/**
 * Pre-built voter segment definitions for political analysis.
 * 
 * Each preset defines a set of filter rules that can be applied
 * to the cohort builder for quick voter segmentation.
 */

export interface VoterSegmentPreset {
  id: string;
  name: string;
  description: string;
  category: 'engagement' | 'partisan' | 'demographic' | 'persuadable';
  filters: Array<{
    field: string;
    op: string;
    value: string;
  }>;
}

export const VOTER_SEGMENT_PRESETS: VoterSegmentPreset[] = [
  // =========================================================================
  // ENGAGEMENT-BASED SEGMENTS
  // =========================================================================
  {
    id: 'likely-voters',
    name: 'Likely Voters',
    description: 'Respondents who vote in every or most elections',
    category: 'engagement',
    filters: [
      { field: 'voting_frequency', op: 'IN', value: 'Every election,Most elections' }
    ]
  },
  {
    id: 'low-propensity',
    name: 'Low-Propensity Voters',
    description: 'Respondents who rarely or never vote — mobilization targets',
    category: 'engagement',
    filters: [
      { field: 'voting_frequency', op: 'IN', value: 'Rarely,Never voted' }
    ]
  },
  {
    id: 'primary-voters',
    name: 'Primary Voters',
    description: 'Respondents who always participate in primary elections',
    category: 'engagement',
    filters: [
      { field: 'primary_participation', op: '=', value: 'Always' }
    ]
  },
  {
    id: 'registered-voters',
    name: 'Registered Voters',
    description: 'All respondents who are registered to vote',
    category: 'engagement',
    filters: [
      { field: 'voter_registration_status', op: '=', value: 'Registered' }
    ]
  },

  // =========================================================================
  // PARTISAN SEGMENTS
  // =========================================================================
  {
    id: 'base-democrats',
    name: 'Base Democrats',
    description: 'Democratic-affiliated voters with progressive ideology',
    category: 'partisan',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Democrat' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Very Progressive,Progressive,Lean Progressive' }
    ]
  },
  {
    id: 'base-republicans',
    name: 'Base Republicans',
    description: 'Republican-affiliated voters with conservative ideology',
    category: 'partisan',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Republican' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Very Conservative,Conservative,Lean Conservative' }
    ]
  },
  {
    id: 'independents',
    name: 'Independents',
    description: 'Voters not affiliated with a major party',
    category: 'partisan',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Independent' }
    ]
  },

  // =========================================================================
  // PERSUADABLE SEGMENTS
  // =========================================================================
  {
    id: 'swing-voters',
    name: 'Swing Voters',
    description: 'Independent voters with moderate ideology — the classic swing segment',
    category: 'persuadable',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Independent' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Lean Progressive,Moderate,Lean Conservative' }
    ]
  },
  {
    id: 'moderate-republicans',
    name: 'Moderate Republicans',
    description: 'Republican voters with moderate or lean-progressive views — potentially persuadable',
    category: 'persuadable',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Republican' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Moderate,Lean Progressive' }
    ]
  },
  {
    id: 'moderate-democrats',
    name: 'Moderate Democrats',
    description: 'Democratic voters with moderate or lean-conservative views — potentially persuadable',
    category: 'persuadable',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Democrat' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Moderate,Lean Conservative' }
    ]
  },

  // =========================================================================
  // DEMOGRAPHIC SEGMENTS
  // =========================================================================
  {
    id: 'gen-z-voters',
    name: 'Gen Z Voters',
    description: 'Voters aged 18-24',
    category: 'demographic',
    filters: [
      { field: 'age', op: '=', value: '18-24' }
    ]
  },
  {
    id: 'millennial-voters',
    name: 'Millennial Voters',
    description: 'Voters aged 25-34',
    category: 'demographic',
    filters: [
      { field: 'age', op: '=', value: '25-34' }
    ]
  },
  {
    id: 'gen-x-voters',
    name: 'Gen X Voters',
    description: 'Voters aged 35-54',
    category: 'demographic',
    filters: [
      { field: 'age', op: 'IN', value: '35-44,45-54' }
    ]
  },
  {
    id: 'boomer-voters',
    name: 'Boomer+ Voters',
    description: 'Voters aged 55 and older',
    category: 'demographic',
    filters: [
      { field: 'age', op: 'IN', value: '55-64,65+' }
    ]
  },
  {
    id: 'women-voters',
    name: 'Women Voters',
    description: 'Female respondents',
    category: 'demographic',
    filters: [
      { field: 'gender', op: '=', value: 'Female' }
    ]
  },
  {
    id: 'college-educated',
    name: 'College-Educated Voters',
    description: "Respondents with bachelor's degree or higher",
    category: 'demographic',
    filters: [
      { field: 'education', op: 'IN', value: "Bachelor's degree,Master's degree,Doctorate" }
    ]
  },
  {
    id: 'non-college',
    name: 'Non-College Voters',
    description: 'Respondents without a four-year degree',
    category: 'demographic',
    filters: [
      { field: 'education', op: 'IN', value: 'High school or less,Some college,Trade/Vocational school' }
    ]
  }
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: VoterSegmentPreset['category']): VoterSegmentPreset[] {
  return VOTER_SEGMENT_PRESETS.filter(p => p.category === category);
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): VoterSegmentPreset | undefined {
  return VOTER_SEGMENT_PRESETS.find(p => p.id === id);
}
