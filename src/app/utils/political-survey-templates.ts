/**
 * Political Survey Templates
 * 
 * Pre-built survey templates for common political research scenarios.
 * Used by the survey creation wizard to offer quick-start options.
 */

export interface SurveyTemplate {
  id: string;
  title: string;
  description: string;
  category: 'sentiment' | 'candidate' | 'issue' | 'message' | 'event' | 'district';
  icon: string; // lucide icon name
  estimatedTime: string; // e.g., "3-5 minutes"
  questions: Array<{
    type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no';
    prompt: string;
    options?: string[];
    isRequired: boolean;
  }>;
  recommendedAnonymityLevel: 'political' | 'semi_anonymous' | 'anonymous';
  recommendedDemographics: string[];
}

export const POLITICAL_SURVEY_TEMPLATES: SurveyTemplate[] = [
  // =========================================================================
  // VOTER SENTIMENT POLL
  // =========================================================================
  {
    id: 'voter-sentiment',
    title: 'Voter Sentiment Poll',
    description: 'Measure approval ratings, direction of the country, and top voter concerns. The foundational poll for any campaign.',
    category: 'sentiment',
    icon: 'BarChart3',
    estimatedTime: '3-5 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'party_affiliation', 'ideology_spectrum', 'voting_frequency'],
    questions: [
      {
        type: 'single-choice',
        prompt: 'Overall, do you think things in this country are headed in the right direction or the wrong direction?',
        options: ['Right direction', 'Wrong direction', 'Unsure'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How would you rate the current state of the economy?',
        options: ['Excellent', 'Good', 'Fair', 'Poor'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Do you approve or disapprove of the job the President is doing?',
        options: ['Strongly approve', 'Somewhat approve', 'Somewhat disapprove', 'Strongly disapprove', 'No opinion'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Do you approve or disapprove of the job your Governor is doing?',
        options: ['Strongly approve', 'Somewhat approve', 'Somewhat disapprove', 'Strongly disapprove', 'No opinion'],
        isRequired: false
      },
      {
        type: 'multiple-choice',
        prompt: 'Which of the following issues are most important to you personally? (Select up to 3)',
        options: [
          'Economy and jobs', 'Healthcare', 'Immigration', 'Education',
          'Climate and environment', 'Crime and public safety', 'National security',
          'Taxes and government spending', 'Abortion', 'Gun policy',
          'Voting rights', 'Housing costs'
        ],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How enthusiastic are you about voting in the next election?',
        options: ['Extremely enthusiastic', 'Very enthusiastic', 'Somewhat enthusiastic', 'Not very enthusiastic', 'Not at all enthusiastic'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How closely are you following the news about politics and government?',
        options: ['Very closely', 'Fairly closely', 'Not too closely', 'Not at all'],
        isRequired: false
      },
      {
        type: 'text',
        prompt: 'What is the single most important issue facing your community right now?',
        isRequired: false
      }
    ]
  },

  // =========================================================================
  // CANDIDATE COMPARISON
  // =========================================================================
  {
    id: 'candidate-comparison',
    title: 'Candidate Comparison Poll',
    description: 'Head-to-head matchups, favorability ratings, and candidate attributes assessment.',
    category: 'candidate',
    icon: 'Users',
    estimatedTime: '4-6 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'party_affiliation', 'voting_frequency', 'ideology_spectrum'],
    questions: [
      {
        type: 'single-choice',
        prompt: 'If the election were held today, which candidate would you vote for?',
        options: ['Candidate A', 'Candidate B', 'Undecided', 'Would not vote'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'What is your overall opinion of Candidate A?',
        options: ['Very favorable', 'Somewhat favorable', 'Somewhat unfavorable', 'Very unfavorable', 'No opinion / Never heard of'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'What is your overall opinion of Candidate B?',
        options: ['Very favorable', 'Somewhat favorable', 'Somewhat unfavorable', 'Very unfavorable', 'No opinion / Never heard of'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Which candidate do you trust more to handle the economy?',
        options: ['Candidate A', 'Candidate B', 'Both equally', 'Neither'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Which candidate do you trust more to handle healthcare?',
        options: ['Candidate A', 'Candidate B', 'Both equally', 'Neither'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Which candidate better understands the needs of people like you?',
        options: ['Candidate A', 'Candidate B', 'Both equally', 'Neither'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How strongly do you support your chosen candidate?',
        options: ['Strongly support — my mind is made up', 'Lean toward — but could change my mind', 'Truly undecided'],
        isRequired: true
      },
      {
        type: 'text',
        prompt: 'What is the most important quality you look for in a candidate?',
        isRequired: false
      }
    ]
  },

  // =========================================================================
  // ISSUE DEEP DIVE
  // =========================================================================
  {
    id: 'issue-deep-dive',
    title: 'Issue Deep Dive',
    description: 'Explore detailed voter opinions on a single policy area with nuanced questions about priorities and trade-offs.',
    category: 'issue',
    icon: 'Search',
    estimatedTime: '5-8 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'party_affiliation', 'ideology_spectrum', 'education', 'income'],
    questions: [
      {
        type: 'single-choice',
        prompt: 'How important is [POLICY AREA] to you personally?',
        options: ['Extremely important', 'Very important', 'Somewhat important', 'Not very important', 'Not at all important'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How would you rate the current state of [POLICY AREA] policy in this country?',
        options: ['Excellent', 'Good', 'Fair', 'Poor', 'No opinion'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Do you think the government is doing too much, too little, or about the right amount when it comes to [POLICY AREA]?',
        options: ['Too much', 'About the right amount', 'Too little', 'Unsure'],
        isRequired: true
      },
      {
        type: 'multiple-choice',
        prompt: 'Which of the following [POLICY AREA] priorities matter most to you? (Select up to 3)',
        options: ['Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Priority 5', 'Priority 6'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Would you support [SPECIFIC POLICY PROPOSAL]?',
        options: ['Strongly support', 'Somewhat support', 'Somewhat oppose', 'Strongly oppose', 'Need more information'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Would you be willing to pay higher taxes if it meant better [POLICY AREA] outcomes?',
        options: ['Definitely yes', 'Probably yes', 'Probably no', 'Definitely no', 'It depends'],
        isRequired: false
      },
      {
        type: 'text',
        prompt: 'In your own words, what should the government\'s top priority be when it comes to [POLICY AREA]?',
        isRequired: false
      },
      {
        type: 'text',
        prompt: 'Is there anything else you want leaders to know about your views on [POLICY AREA]?',
        isRequired: false
      }
    ]
  },

  // =========================================================================
  // MESSAGE TESTING
  // =========================================================================
  {
    id: 'message-testing',
    title: 'Message Testing Survey',
    description: 'Test how different campaign messages and framings resonate with voters. Compare 2-3 message variants side by side.',
    category: 'message',
    icon: 'MessageSquare',
    estimatedTime: '4-6 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'party_affiliation', 'ideology_spectrum', 'voting_frequency'],
    questions: [
      {
        type: 'text',
        prompt: 'Please read Message A below and share your initial reaction:\n\n"[MESSAGE A TEXT]"\n\nWhat is your first reaction to this message?',
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How convincing did you find Message A?',
        options: ['Very convincing', 'Somewhat convincing', 'Not very convincing', 'Not at all convincing'],
        isRequired: true
      },
      {
        type: 'text',
        prompt: 'Now please read Message B and share your reaction:\n\n"[MESSAGE B TEXT]"\n\nWhat is your first reaction to this message?',
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How convincing did you find Message B?',
        options: ['Very convincing', 'Somewhat convincing', 'Not very convincing', 'Not at all convincing'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Which message resonated with you more?',
        options: ['Message A — much more', 'Message A — somewhat more', 'About the same', 'Message B — somewhat more', 'Message B — much more'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'After reading these messages, how likely are you to support the candidate or cause described?',
        options: ['Much more likely', 'Somewhat more likely', 'No change', 'Somewhat less likely', 'Much less likely'],
        isRequired: true
      },
      {
        type: 'text',
        prompt: 'What specific words or phrases stood out to you (positively or negatively)?',
        isRequired: false
      },
      {
        type: 'text',
        prompt: 'Is there anything missing from these messages that you wish was addressed?',
        isRequired: false
      }
    ]
  },

  // =========================================================================
  // POST-EVENT REACTION
  // =========================================================================
  {
    id: 'post-event-reaction',
    title: 'Post-Event Reaction Survey',
    description: 'Capture immediate voter reactions after debates, rallies, speeches, or major news events.',
    category: 'event',
    icon: 'Zap',
    estimatedTime: '2-4 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'party_affiliation', 'voting_frequency'],
    questions: [
      {
        type: 'single-choice',
        prompt: 'Did you watch or follow the [EVENT]?',
        options: ['Watched live', 'Watched clips/highlights', 'Read about it afterward', 'Did not follow it'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Overall, what was your impression of the [EVENT]?',
        options: ['Very positive', 'Somewhat positive', 'Neutral', 'Somewhat negative', 'Very negative'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Who do you think performed best at the [EVENT]?',
        options: ['Candidate A', 'Candidate B', 'About equal', 'No opinion'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Did the [EVENT] change your opinion of any candidate?',
        options: ['Yes — more favorable toward a candidate', 'Yes — less favorable toward a candidate', 'No — my views are unchanged'],
        isRequired: true
      },
      {
        type: 'text',
        prompt: 'What was the most memorable moment or statement from the [EVENT]?',
        isRequired: false
      },
      {
        type: 'single-choice',
        prompt: 'How likely are you to discuss this [EVENT] with friends, family, or colleagues?',
        options: ['Very likely', 'Somewhat likely', 'Not very likely', 'Not at all likely'],
        isRequired: false
      }
    ]
  },

  // =========================================================================
  // DISTRICT PULSE CHECK
  // =========================================================================
  {
    id: 'district-pulse-check',
    title: 'District Pulse Check',
    description: 'A quick snapshot of local sentiment — ideal for canvassing, town halls, or rapid district-level polling.',
    category: 'district',
    icon: 'MapPin',
    estimatedTime: '2-3 minutes',
    recommendedAnonymityLevel: 'political',
    recommendedDemographics: ['age', 'gender', 'state', 'county', 'congressional_district', 'party_affiliation', 'voting_frequency'],
    questions: [
      {
        type: 'single-choice',
        prompt: 'How would you rate the quality of life in your community?',
        options: ['Excellent', 'Good', 'Fair', 'Poor'],
        isRequired: true
      },
      {
        type: 'multiple-choice',
        prompt: 'What are the biggest challenges facing your community? (Select up to 3)',
        options: [
          'Cost of living', 'Jobs and economy', 'Crime and safety', 'Schools and education',
          'Roads and infrastructure', 'Healthcare access', 'Housing affordability',
          'Environment', 'Immigration', 'Drug and opioid crisis'
        ],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'Do you feel your elected officials listen to people like you?',
        options: ['Yes, definitely', 'Somewhat', 'Not really', 'Not at all'],
        isRequired: true
      },
      {
        type: 'single-choice',
        prompt: 'How likely are you to vote in the next local or state election?',
        options: ['Definitely will vote', 'Probably will vote', 'Might vote', 'Probably will not vote', 'Definitely will not vote'],
        isRequired: true
      },
      {
        type: 'text',
        prompt: 'If you could tell your representative one thing, what would it be?',
        isRequired: false
      }
    ]
  }
];

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): SurveyTemplate | undefined {
  return POLITICAL_SURVEY_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: SurveyTemplate['category']): SurveyTemplate[] {
  return POLITICAL_SURVEY_TEMPLATES.filter(t => t.category === category);
}
