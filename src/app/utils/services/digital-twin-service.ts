import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { 
  AnonymityLevel, 
  DemographicCategory, 
  CompletionCalculationResult 
} from '../interface';
import { 
  calculateCompletionPercentage, 
  filterDemographicsForAnonymity,
  categorizeImportedTwin 
} from '../anonymity-config';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

interface Demographics {
  name: string;
  email: string;
  age: string;
  location: string;
  occupation: string;
  politicalViews: string;
  socialMedia: {
    twitter: string;
    linkedin: string;
    instagram: string;
  };
  interests: string;
  education: string;
  income: string;
}

interface SurveyAnswer {
  questionId: number;
  questionText: string;
  value: string | string[];
}

interface PersonaPrinciples {
  coreValues: string[];
  personalityTraits: string[];
  politicalLeanings: string;
  interests: string[];
  communicationStyle: string;
  decisionMakingStyle: string;
  worldview: string;
  demographicProfile: string;
  responsePatterns: string[];
}

export class DigitalTwinService {
  
  /**
   * Generate persona principles from survey responses
   */
  static async generatePersonaPrinciples(
    demographics: Demographics,
    answers: SurveyAnswer[],
    surveyTitle: string
  ): Promise<PersonaPrinciples> {
    
    const prompt = `You are an expert psychologist and data scientist. Based on the following survey response, create a comprehensive persona profile that captures this person's core principles, values, and response patterns.

Survey: "${surveyTitle}"

Demographics:
- Name: ${demographics.name}
- Age: ${demographics.age}
- Location: ${demographics.location}
- Occupation: ${demographics.occupation}
- Education: ${demographics.education}
- Income: ${demographics.income}
- Political Views: ${demographics.politicalViews}
- Interests: ${demographics.interests}

Survey Responses:
${answers.map(a => `Q: ${a.questionText}\nA: ${Array.isArray(a.value) ? a.value.join(', ') : a.value}`).join('\n\n')}

Based on this information, create a detailed persona profile. Return ONLY a valid JSON object with this structure:

{
  "coreValues": ["value1", "value2", "value3"],
  "personalityTraits": ["trait1", "trait2", "trait3"],
  "politicalLeanings": "detailed political stance",
  "interests": ["interest1", "interest2", "interest3"],
  "communicationStyle": "description of how they communicate",
  "decisionMakingStyle": "how they make decisions",
  "worldview": "their overall perspective on life and society",
  "demographicProfile": "summary of their demographic characteristics",
  "responsePatterns": ["pattern1", "pattern2", "pattern3"]
}

Guidelines:
- Infer deep psychological patterns from their responses
- Consider how demographics influence their worldview
- Identify consistent themes across their answers
- Create actionable insights for predicting future responses
- Be specific and nuanced, not generic
- Focus on what makes this person unique`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert psychologist creating detailed persona profiles from survey data. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      // Clean and parse the response
      const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      const principles = JSON.parse(cleanedResponse) as PersonaPrinciples;
      
      return principles;
    } catch (error) {
      console.error('Error generating persona principles:', error);
      throw new Error('Failed to generate persona principles');
    }
  }

  /**
   * Update existing digital twin with new survey data
   */
  static async updateDigitalTwin(
    agentToken: string,
    demographics: Demographics,
    newAnswers: SurveyAnswer[],
    surveyTitle: string
  ): Promise<void> {
    try {
      const index = pinecone.index('prediction-results');
      
      // Get existing digital twin data
      const fetchResult = await index.fetch([`digital-twin-${agentToken}`]);
      const existingRecord = fetchResult.records[`digital-twin-${agentToken}`];
      
      if (!existingRecord) {
        throw new Error('Digital twin not found for update');
      }

      const existingMetadata = existingRecord.metadata;
      const existingAnswers = typeof existingMetadata?.answers === 'string' 
        ? JSON.parse(existingMetadata.answers) 
        : (existingMetadata?.answers || []);
      const existingPrinciples = typeof existingMetadata?.principles === 'string'
        ? JSON.parse(existingMetadata.principles)
        : existingMetadata?.principles;

      // Combine existing and new answers
      const allAnswers = [...existingAnswers, ...newAnswers];
      
      // Regenerate principles with accumulated data
      const updatedPrinciples = await this.generatePersonaPrinciples(
        demographics,
        allAnswers,
        `${existingMetadata?.surveyTitle}, ${surveyTitle}`
      );

      // Update the digital twin in Pinecone
      const createdBy = String(existingMetadata?.createdBy || 'unknown');
      await this.storeInPinecone(agentToken, demographics, updatedPrinciples, allAnswers, 
        `${existingMetadata?.surveyTitle}, ${surveyTitle}`, createdBy);
      
      console.log(`🔄 Updated existing digital twin ${agentToken} with new survey data`);
    } catch (error) {
      console.error('Error updating digital twin:', error);
      throw new Error('Failed to update digital twin');
    }
  }

  /**
   * Store digital twin in Pinecone for future querying with completion tracking
   */
  static async storeInPinecone(
    agentToken: string,
    demographics: Demographics,
    principles: PersonaPrinciples,
    answers: SurveyAnswer[],
    surveyTitle: string,
    createdBy: string,
    anonymityLevel: AnonymityLevel = 'full',
    completionData?: CompletionCalculationResult
  ): Promise<void> {
    try {
      const index = pinecone.index('prediction-results');

      // Calculate completion data if not provided
      const completion = completionData || calculateCompletionPercentage(demographics, anonymityLevel);
      
      // Filter demographics based on anonymity level
      const filteredDemographics = filterDemographicsForAnonymity(demographics, anonymityLevel);

      // Create a comprehensive text representation for embedding
      const textForEmbedding = `
        Survey: ${surveyTitle}
        Anonymity Level: ${anonymityLevel}
        Completion: ${completion.percentage}%
        Category: ${completion.category}
        
        Demographics:
        ${Object.entries(filteredDemographics).map(([key, value]) => `${key}: ${value}`).join('\n')}
        
        Core Values: ${principles.coreValues.join(', ')}
        Personality: ${principles.personalityTraits.join(', ')}
        Political Leanings: ${principles.politicalLeanings}
        Communication Style: ${principles.communicationStyle}
        Decision Making: ${principles.decisionMakingStyle}
        Worldview: ${principles.worldview}
        
        Survey Responses:
        ${answers.map(a => `${a.questionText}: ${Array.isArray(a.value) ? a.value.join(', ') : a.value}`).join('\n')}
      `.trim();

      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textForEmbedding,
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Store in Pinecone (following betting agent patterns)
      await index.upsert([
        {
          id: `digital-twin-${agentToken}`,
          values: embedding,
          metadata: {
            // Core fields matching betting agent structure
            description: `Digital twin from survey: ${surveyTitle}`,
            choice: 'digital-twin',
            amount: 0,
            status: 'active',
            created_at: new Date().toISOString(),
            agentId: agentToken,
            predictionId: 0,
            confidence: 1.0,
            reasoning: `Digital twin created from ${surveyTitle} survey responses`,
            riskAssessment: 'low',
            result: 'active',
            
            // Digital twin specific fields
            type: 'digital-twin',
            surveyTitle,
            anonymityLevel,
            completionPercentage: completion.percentage,
            demographicCategory: completion.category,
            demographics: JSON.stringify(filteredDemographics),
            principles: JSON.stringify(principles),
            answers: JSON.stringify(answers),
            email: filteredDemographics.email || null,
            age: parseInt(filteredDemographics.age) || 0,
            location: filteredDemographics.location || null,
            occupation: filteredDemographics.occupation || null,
            politicalViews: filteredDemographics.politicalViews || null,
            education: filteredDemographics.education || null,
            income: filteredDemographics.income || null,
            createdBy: createdBy, // CRITICAL SECURITY: User ownership tracking
          }
        }
      ]);

      console.log(`✅ Digital twin ${agentToken} stored in Pinecone`);
    } catch (error) {
      console.error('Error storing in Pinecone:', error);
      throw new Error('Failed to store digital twin in Pinecone');
    }
  }

  /**
   * Get all digital twins from Pinecone
   * @deprecated Use getUserDigitalTwins instead for security
   */
  static async getAllDigitalTwins(topK: number = 50): Promise<any[]> {
    console.warn('🚨 SECURITY WARNING: getAllDigitalTwins is deprecated. Use getUserDigitalTwins instead to prevent cross-user access.');
    
    try {
      const index = pinecone.index('prediction-results');

      // Query with a generic vector to get all digital twins
      // We'll use a zero vector and rely on filtering
      const zeroVector = new Array(1536).fill(0); // text-embedding-3-small dimension

      const searchResults = await index.query({
        vector: zeroVector,
        topK,
        includeMetadata: true,
        filter: {
          type: { $eq: 'digital-twin' }
        }
      });

      return searchResults.matches || [];
    } catch (error) {
      console.error('Error getting all digital twins:', error);
      throw new Error('Failed to get digital twins');
    }
  }

  /**
   * SECURE: Get digital twins for a specific user only
   */
  static async getUserDigitalTwins(userId: string, topK: number = 50): Promise<any[]> {
    try {
      const index = pinecone.index('prediction-results');

      // Query with a generic vector to get all digital twins for this user
      const zeroVector = new Array(1536).fill(0); // text-embedding-3-small dimension

      const searchResults = await index.query({
        vector: zeroVector,
        topK,
        includeMetadata: true,
        filter: {
          type: { $eq: 'digital-twin' },
          createdBy: { $eq: userId }
        }
      });

      // eslint-disable-next-line prefer-const
      let matches = searchResults.matches || [];

      // ---------------------------------------------
      // 🩹 Fallback: existing twins created before `createdBy` metadata was added
      // ---------------------------------------------
      if (matches.length === 0) {
        console.log(`🔍 No digital twins found via createdBy metadata for user ${userId}. Falling back to DB lookup...`);
        try {
          const { openSql } = await import('@/app/utils/database/db');
          const db = await openSql();
          const [agentRows] = await db.execute<any[]>(
            `SELECT ra.agent_token
             FROM responder_agents ra
             LEFT JOIN survey_responses sr ON ra.created_from_response_id = sr.id
             LEFT JOIN surveys s ON sr.survey_id = s.id
             WHERE s.created_by = ?`,
            [userId]
          );

          const agentTokens: string[] = agentRows.map(r => r.agent_token);
          if (agentTokens.length > 0) {
            console.log(`🔍 Fallback DB lookup agent tokens count: ${agentTokens.length}`);
            const CHUNK_SIZE = 100;
            for (let i = 0; i < agentTokens.length; i += CHUNK_SIZE) {
              const chunkIds = agentTokens.slice(i, i + CHUNK_SIZE).map(t => `digital-twin-${t}`);
              const fetched = await index.fetch(chunkIds);
              matches.push(...Object.values(fetched.records));
            }
            console.log(`🔍 Fallback DB lookup fetched ${matches.length} digital twins for user ${userId}`);
          }
        } catch (fallbackErr) {
          console.error('🔍 Fallback DB lookup failed:', fallbackErr);
        }
      }

      return matches;
    } catch (error) {
      console.error('Error getting user digital twins:', error);
      throw new Error('Failed to get user digital twins');
    }
  }

  /**
   * Query similar digital twins from Pinecone
   * @deprecated Use findSimilarTwinsForUser instead for security
   */
  static async findSimilarTwins(
    queryText: string,
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<any[]> {
    console.warn('🚨 SECURITY WARNING: findSimilarTwins is deprecated. Use findSimilarTwinsForUser instead to prevent cross-user access.');
    
    try {
      const index = pinecone.index('prediction-results');

      // Generate embedding for query
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: queryText,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search Pinecone (filter for digital twins only)
      const digitalTwinFilter = {
        type: { $eq: 'digital-twin' },
        ...filter
      };
      
      const searchResults = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter: digitalTwinFilter
      });

      return searchResults.matches || [];
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      throw new Error('Failed to query digital twins');
    }
  }

  /**
   * SECURE: Find similar digital twins for a specific user only
   */
  static async findSimilarTwinsForUser(
    queryText: string,
    userId: string,
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<any[]> {
    try {
      const index = pinecone.index('prediction-results');

      // Generate embedding for query
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: queryText,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search Pinecone (filter for digital twins only AND user ownership)
      const digitalTwinFilter = {
        type: { $eq: 'digital-twin' },
        createdBy: { $eq: userId },
        ...filter
      };
      
      const searchResults = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter: digitalTwinFilter
      });

      return searchResults.matches || [];
    } catch (error) {
      console.error('Error querying user digital twins:', error);
      throw new Error('Failed to query user digital twins');
    }
  }

  /**
   * Generate a response as a specific digital twin
   * @deprecated Use queryDigitalTwinForUser instead for security
   */
  static async queryDigitalTwin(
    agentToken: string,
    question: string
  ): Promise<string> {
    console.warn('🚨 SECURITY WARNING: queryDigitalTwin is deprecated. Use queryDigitalTwinForUser instead to prevent cross-user access.');
    
    try {
      // First, get the digital twin data from Pinecone
      const index = pinecone.index('prediction-results');
      const fetchResult = await index.fetch([`digital-twin-${agentToken}`]);
      
      if (!fetchResult.records[`digital-twin-${agentToken}`]) {
        throw new Error('Digital twin not found');
      }

      const metadata = fetchResult.records[`digital-twin-${agentToken}`].metadata;
      const demographics = typeof metadata?.demographics === 'string'
        ? JSON.parse(metadata.demographics)
        : metadata?.demographics;
      const principles = typeof metadata?.principles === 'string'
        ? JSON.parse(metadata.principles)
        : metadata?.principles;

      // Generate response using the persona
      const prompt = `You are a digital twin representing a real person. Answer the following question as this person would, based on their profile:

Demographics:
- Age: ${demographics.age}
- Location: ${demographics.location}
- Occupation: ${demographics.occupation}
- Education: ${demographics.education}
- Political Views: ${demographics.politicalViews}

Persona Profile:
- Core Values: ${principles.coreValues.join(', ')}
- Personality Traits: ${principles.personalityTraits.join(', ')}
- Political Leanings: ${principles.politicalLeanings}
- Communication Style: ${principles.communicationStyle}
- Decision Making Style: ${principles.decisionMakingStyle}
- Worldview: ${principles.worldview}

Question: ${question}

Instructions:
- Answer as this specific person would, using their communication style
- Reflect their values, personality, and worldview
- Be authentic to their demographic and background
- Keep responses conversational and natural
- Don't mention that you're a digital twin`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a digital twin of a real person. Respond authentically as that person would." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || "I'm not sure how to respond to that.";
    } catch (error) {
      console.error('Error querying digital twin:', error);
      throw new Error('Failed to query digital twin');
    }
  }

  /**
   * SECURE: Generate a response as a specific digital twin with user ownership validation
   */
  static async queryDigitalTwinForUser(
    agentToken: string,
    question: string,
    userId: string
  ): Promise<string> {
    try {
      // First, get the digital twin data from Pinecone
      const index = pinecone.index('prediction-results');
      const fetchResult = await index.fetch([`digital-twin-${agentToken}`]);
      
      if (!fetchResult.records[`digital-twin-${agentToken}`]) {
        throw new Error('Digital twin not found');
      }

      const metadata = fetchResult.records[`digital-twin-${agentToken}`].metadata;
      
      // CRITICAL SECURITY: Validate user ownership
      if (metadata?.createdBy !== userId) {
        throw new Error('Access denied: You can only query your own digital twins');
      }

      const demographics = typeof metadata?.demographics === 'string'
        ? JSON.parse(metadata.demographics)
        : metadata?.demographics;
      const principles = typeof metadata?.principles === 'string'
        ? JSON.parse(metadata.principles)
        : metadata?.principles;

      // Generate response using the persona
      const prompt = `You are a digital twin representing a real person. Answer the following question as this person would, based on their profile:

Demographics:
- Age: ${demographics.age}
- Location: ${demographics.location}
- Occupation: ${demographics.occupation}
- Education: ${demographics.education}
- Political Views: ${demographics.politicalViews}

Persona Profile:
- Core Values: ${principles.coreValues.join(', ')}
- Personality Traits: ${principles.personalityTraits.join(', ')}
- Political Leanings: ${principles.politicalLeanings}
- Communication Style: ${principles.communicationStyle}
- Decision Making Style: ${principles.decisionMakingStyle}
- Worldview: ${principles.worldview}

Question: ${question}

Instructions:
- Answer as this specific person would, using their communication style
- Reflect their values, personality, and worldview
- Be authentic to their demographic and background
- Keep responses conversational and natural
- Don't mention that you're a digital twin`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a digital twin of a real person. Respond authentically as that person would." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || "I'm not sure how to respond to that.";
    } catch (error) {
      console.error('Error querying user digital twin:', error);
      throw new Error('Failed to query digital twin');
    }
  }

  /**
   * Get digital twins filtered by completion percentage and demographic category
   * @deprecated Use getDigitalTwinsWithFiltersForUser instead for security
   */
  static async getDigitalTwinsWithFilters(filters: {
    demographicCategory?: DemographicCategory;
    minCompletion?: number;
    maxCompletion?: number;
    anonymityLevel?: AnonymityLevel;
    topK?: number;
  } = {}): Promise<any[]> {
    console.warn('🚨 SECURITY WARNING: getDigitalTwinsWithFilters is deprecated. Use getDigitalTwinsWithFiltersForUser instead to prevent cross-user access.');
    
    try {
      const index = pinecone.index('prediction-results');
      const zeroVector = new Array(1536).fill(0);

      // Build filter object
      const pineconeFilter: any = {
        type: { $eq: 'digital-twin' }
      };

      if (filters.demographicCategory) {
        pineconeFilter.demographicCategory = { $eq: filters.demographicCategory };
      }

      if (filters.minCompletion !== undefined) {
        pineconeFilter.completionPercentage = { $gte: filters.minCompletion };
      }

      if (filters.maxCompletion !== undefined) {
        if (pineconeFilter.completionPercentage) {
          pineconeFilter.completionPercentage.$lte = filters.maxCompletion;
        } else {
          pineconeFilter.completionPercentage = { $lte: filters.maxCompletion };
        }
      }

      if (filters.anonymityLevel) {
        pineconeFilter.anonymityLevel = { $eq: filters.anonymityLevel };
      }

      const searchResults = await index.query({
        vector: zeroVector,
        topK: filters.topK || 50,
        includeMetadata: true,
        filter: pineconeFilter
      });

      return searchResults.matches || [];
    } catch (error) {
      console.error('Error filtering digital twins:', error);
      throw new Error('Failed to filter digital twins');
    }
  }

  /**
   * SECURE: Get digital twins filtered by completion percentage and demographic category for a specific user
   */
  static async getDigitalTwinsWithFiltersForUser(userId: string, filters: {
    demographicCategory?: DemographicCategory;
    minCompletion?: number;
    maxCompletion?: number;
    anonymityLevel?: AnonymityLevel;
    topK?: number;
  } = {}): Promise<any[]> {
    try {
      const index = pinecone.index('prediction-results');
      const zeroVector = new Array(1536).fill(0);

      // Build filter object with user ownership
      const pineconeFilter: any = {
        type: { $eq: 'digital-twin' },
        createdBy: { $eq: userId }
      };

      if (filters.demographicCategory) {
        pineconeFilter.demographicCategory = { $eq: filters.demographicCategory };
      }

      if (filters.minCompletion !== undefined) {
        pineconeFilter.completionPercentage = { $gte: filters.minCompletion };
      }

      if (filters.maxCompletion !== undefined) {
        if (pineconeFilter.completionPercentage) {
          pineconeFilter.completionPercentage.$lte = filters.maxCompletion;
        } else {
          pineconeFilter.completionPercentage = { $lte: filters.maxCompletion };
        }
      }

      if (filters.anonymityLevel) {
        pineconeFilter.anonymityLevel = { $eq: filters.anonymityLevel };
      }

      const searchResults = await index.query({
        vector: zeroVector,
        topK: filters.topK || 50,
        includeMetadata: true,
        filter: pineconeFilter
      });

      return searchResults.matches || [];
    } catch (error) {
      console.error('Error filtering user digital twins:', error);
      throw new Error('Failed to filter user digital twins');
    }
  }

  /**
   * Get analytics about digital twin completion and categories
   */
  static async getDigitalTwinAnalytics(): Promise<{
    totalTwins: number;
    byCategory: Record<DemographicCategory, number>;
    byAnonymityLevel: Record<AnonymityLevel, number>;
    averageCompletion: number;
    completionDistribution: {
      high: number; // 80%+
      medium: number; // 40-79%
      low: number; // <40%
    };
  }> {
    try {
      const allTwins = await this.getAllDigitalTwins(1000); // Get more for analytics
      
      const analytics = {
        totalTwins: allTwins.length,
        byCategory: {
          full_profile: 0,
          partial_profile: 0,
          minimal_profile: 0,
          imported_synthetic: 0
        } as Record<DemographicCategory, number>,
        byAnonymityLevel: {
          full: 0,
          semi_anonymous: 0,
          anonymous: 0
        } as Record<AnonymityLevel, number>,
        averageCompletion: 0,
        completionDistribution: {
          high: 0,
          medium: 0,
          low: 0
        }
      };

      let totalCompletion = 0;

      for (const twin of allTwins) {
        const metadata = twin.metadata;
        
        // Count by category
        const category = metadata?.demographicCategory as DemographicCategory;
        if (category && analytics.byCategory[category] !== undefined) {
          analytics.byCategory[category]++;
        }

        // Count by anonymity level
        const anonymityLevel = metadata?.anonymityLevel as AnonymityLevel;
        if (anonymityLevel && analytics.byAnonymityLevel[anonymityLevel] !== undefined) {
          analytics.byAnonymityLevel[anonymityLevel]++;
        }

        // Calculate completion distribution
        const completion = metadata?.completionPercentage || 0;
        totalCompletion += completion;
        
        if (completion >= 80) {
          analytics.completionDistribution.high++;
        } else if (completion >= 40) {
          analytics.completionDistribution.medium++;
        } else {
          analytics.completionDistribution.low++;
        }
      }

      analytics.averageCompletion = allTwins.length > 0 ? totalCompletion / allTwins.length : 0;

      return analytics;
    } catch (error) {
      console.error('Error getting digital twin analytics:', error);
      throw new Error('Failed to get digital twin analytics');
    }
  }

  /**
   * Categorize imported digital twin based on available data
   */
  static categorizeImportedDigitalTwin(demographics: Record<string, any>): {
    category: DemographicCategory;
    completionPercentage: number;
  } {
    const category = categorizeImportedTwin(demographics);
    
    // Calculate a basic completion percentage for imported twins
    const fieldCount = Object.keys(demographics).filter(key => {
      const value = demographics[key];
      return value !== null && value !== undefined && value !== '';
    }).length;
    
    const completionPercentage = Math.min(fieldCount * 10, 100); // Rough estimate
    
    return { category, completionPercentage };
  }
} 