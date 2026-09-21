/**
 * Pre-built voter segment definitions for political analysis / microtargeting.
 *
 * Each preset is a *live filter* — membership is recomputed on resolve via
 * person_records (D2) + tracked attributes (VT2/VT3). Never a frozen list,
 * never a predicted persuasion score.
 */

import type { TrackedAttributeFilter } from '@/app/utils/services/voter-query';

/** Live filter for person_records + tracked attributes (recomputed on resolve). */
export type VoterSegmentDefinition = {
  gender?: string[];
  minAgeYears?: number;
  maxAgeYears?: number;
  ageBucket?: string[];
  party?: string[];
  ownerOccupied?: boolean | null;
  zip?: string[];
  district?: string[];
  voterStatus?: string[];
  canvassStatus?: string[];
  tracked?: TrackedAttributeFilter[];
  hasDonated?: boolean;
  excludeSuppressed?: boolean;
  requireCoordinates?: boolean;
  includeFenceLabels?: string[];
  excludeFenceLabels?: string[];
  limit?: number;
};

export interface VoterSegmentPreset {
  id: string;
  name: string;
  description: string;
  category: 'engagement' | 'partisan' | 'demographic' | 'persuadable' | 'tracked';
  /** Legacy cohort-builder filter rules (still used by DynamicCohortBuilder). */
  filters: Array<{
    field: string;
    op: string;
    value: string;
  }>;
  /**
   * MT1 live definition for person_records + tracked-attribute resolve.
   * When present, segment_list / resolveVoterSegment use this path.
   */
  definition?: VoterSegmentDefinition;
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
      { field: 'voting_frequency', op: 'IN', value: 'Every election,Most elections' },
    ],
  },
  {
    id: 'low-propensity',
    name: 'Low-Propensity Voters',
    description: 'Respondents who rarely or never vote — mobilization targets',
    category: 'engagement',
    filters: [{ field: 'voting_frequency', op: 'IN', value: 'Rarely,Never voted' }],
  },
  {
    id: 'primary-voters',
    name: 'Primary Voters',
    description: 'Respondents who always participate in primary elections',
    category: 'engagement',
    filters: [{ field: 'primary_participation', op: '=', value: 'Always' }],
  },
  {
    id: 'registered-voters',
    name: 'Registered Voters',
    description: 'All respondents who are registered to vote',
    category: 'engagement',
    filters: [{ field: 'voter_registration_status', op: '=', value: 'Registered' }],
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
      {
        field: 'ideology_spectrum',
        op: 'IN',
        value: 'Very Progressive,Progressive,Lean Progressive',
      },
    ],
    definition: { party: ['Democrat'] },
  },
  {
    id: 'base-republicans',
    name: 'Base Republicans',
    description: 'Republican-affiliated voters with conservative ideology',
    category: 'partisan',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Republican' },
      {
        field: 'ideology_spectrum',
        op: 'IN',
        value: 'Very Conservative,Conservative,Lean Conservative',
      },
    ],
    definition: { party: ['Republican'] },
  },
  {
    id: 'independents',
    name: 'Independents',
    description: 'Voters not affiliated with a major party',
    category: 'partisan',
    filters: [{ field: 'party_affiliation', op: '=', value: 'Independent' }],
    definition: { party: ['Independent'] },
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
      {
        field: 'ideology_spectrum',
        op: 'IN',
        value: 'Lean Progressive,Moderate,Lean Conservative',
      },
    ],
    definition: { party: ['Independent'] },
  },
  {
    id: 'moderate-republicans',
    name: 'Moderate Republicans',
    description:
      'Republican voters with moderate or lean-progressive views — potentially persuadable',
    category: 'persuadable',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Republican' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Moderate,Lean Progressive' },
    ],
    definition: { party: ['Republican'] },
  },
  {
    id: 'moderate-democrats',
    name: 'Moderate Democrats',
    description:
      'Democratic voters with moderate or lean-conservative views — potentially persuadable',
    category: 'persuadable',
    filters: [
      { field: 'party_affiliation', op: '=', value: 'Democrat' },
      { field: 'ideology_spectrum', op: 'IN', value: 'Moderate,Lean Conservative' },
    ],
    definition: { party: ['Democrat'] },
  },

  // =========================================================================
  // DEMOGRAPHIC SEGMENTS (person_records collation)
  // =========================================================================
  {
    id: 'gen-z-voters',
    name: 'Gen Z Voters',
    description: 'Voters aged 18-24',
    category: 'demographic',
    filters: [{ field: 'age', op: '=', value: '18-24' }],
    definition: { ageBucket: ['18-24'], minAgeYears: 18, maxAgeYears: 24 },
  },
  {
    id: 'millennial-voters',
    name: 'Millennial Voters',
    description: 'Voters aged 25-34',
    category: 'demographic',
    filters: [{ field: 'age', op: '=', value: '25-34' }],
    definition: { ageBucket: ['25-34'], minAgeYears: 25, maxAgeYears: 34 },
  },
  {
    id: 'gen-x-voters',
    name: 'Gen X Voters',
    description: 'Voters aged 35-54',
    category: 'demographic',
    filters: [{ field: 'age', op: 'IN', value: '35-44,45-54' }],
    definition: { ageBucket: ['35-44', '45-54'], minAgeYears: 35, maxAgeYears: 54 },
  },
  {
    id: 'boomer-voters',
    name: 'Boomer+ Voters',
    description: 'Voters aged 55 and older',
    category: 'demographic',
    filters: [{ field: 'age', op: 'IN', value: '55-64,65+' }],
    definition: { ageBucket: ['55-64', '65+'], minAgeYears: 55 },
  },
  {
    id: 'women-voters',
    name: 'Women Voters',
    description: 'Female respondents',
    category: 'demographic',
    filters: [{ field: 'gender', op: '=', value: 'Female' }],
    definition: { gender: ['woman', 'F', 'Female'] },
  },
  {
    id: 'college-educated',
    name: 'College-Educated Voters',
    description: "Respondents with bachelor's degree or higher",
    category: 'demographic',
    filters: [
      {
        field: 'education',
        op: 'IN',
        value: "Bachelor's degree,Master's degree,Doctorate",
      },
    ],
  },
  {
    id: 'non-college',
    name: 'Non-College Voters',
    description: 'Respondents without a four-year degree',
    category: 'demographic',
    filters: [
      {
        field: 'education',
        op: 'IN',
        value: 'High school or less,Some college,Trade/Vocational school',
      },
    ],
  },

  // =========================================================================
  // TRACKED-ATTRIBUTE SEGMENTS (MT1 — observed survey/canvass/donation state)
  // =========================================================================
  {
    id: 'women-35-public-security-major',
    name: 'Women 35+ · public security = major concern',
    description:
      'Women aged 35+ whose survey-stated public security position is major concern (observed, not predicted)',
    category: 'tracked',
    filters: [
      { field: 'gender', op: '=', value: 'Female' },
      { field: 'age', op: 'IN', value: '35-44,45-54,55-64,65+' },
    ],
    definition: {
      gender: ['woman', 'F', 'Female'],
      minAgeYears: 35,
      tracked: [{ issue: 'public security', equals: 'major concern' }],
    },
  },
  {
    id: 'women-35-homeowners-public-security',
    name: 'Women 35+ homeowners · public security major',
    description:
      'Women, 35+, homeowners whose survey answers mark public security as a major concern',
    category: 'tracked',
    filters: [
      { field: 'gender', op: '=', value: 'Female' },
      { field: 'age', op: 'IN', value: '35-44,45-54,55-64,65+' },
      { field: 'owner_occupied', op: '=', value: 'true' },
    ],
    definition: {
      gender: ['woman', 'F', 'Female'],
      minAgeYears: 35,
      ownerOccupied: true,
      tracked: [{ issue: 'public security', equals: 'major concern' }],
    },
  },
  {
    id: 'public-security-changed-from-neutral',
    name: 'Public security shifted from neutral',
    description:
      'Voters whose observed public-security position changed away from neutral (change-state)',
    category: 'tracked',
    filters: [],
    definition: {
      tracked: [{ issue: 'public security', changed: true, was: 'neutral' }],
    },
  },
  {
    id: 'observed-donors',
    name: 'Observed donors',
    description:
      'Voters with a fundraising/donation capture event (not acquired financial data)',
    category: 'tracked',
    filters: [],
    definition: { hasDonated: true },
  },
  {
    id: 'women-35-donors-public-security',
    name: 'Women 35+ donors · public security major',
    description:
      'Women 35+ who have donated (observed) and stated public security as a major concern',
    category: 'tracked',
    filters: [{ field: 'gender', op: '=', value: 'Female' }],
    definition: {
      gender: ['woman', 'F', 'Female'],
      minAgeYears: 35,
      hasDonated: true,
      tracked: [{ issue: 'public security', equals: 'major concern' }],
    },
  },
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(
  category: VoterSegmentPreset['category']
): VoterSegmentPreset[] {
  return VOTER_SEGMENT_PRESETS.filter((p) => p.category === category);
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): VoterSegmentPreset | undefined {
  return VOTER_SEGMENT_PRESETS.find((p) => p.id === id);
}
