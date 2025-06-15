import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

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
      const existingAnswers = JSON.parse(existingMetadata?.answers as string || '[]');
      const existingPrinciples = JSON.parse(existingMetadata?.principles as string);

      // Combine existing and new answers
      const allAnswers = [...existingAnswers, ...newAnswers];
      
      // Regenerate principles with accumulated data
      const updatedPrinciples = await this.generatePersonaPrinciples(
        demographics,
        allAnswers,
        `${existingMetadata?.surveyTitle}, ${surveyTitle}`
      );

      // Update the digital twin in Pinecone
      await this.storeInPinecone(agentToken, demographics, updatedPrinciples, allAnswers, 
        `${existingMetadata?.surveyTitle}, ${surveyTitle}`);
      
      console.log(`🔄 Updated existing digital twin ${agentToken} with new survey data`);
    } catch (error) {
      console.error('Error updating digital twin:', error);
      throw new Error('Failed to update digital twin');
    }
  }

  /**
   * Store digital twin in Pinecone for future querying
   */
  static async storeInPinecone(
    agentToken: string,
    demographics: Demographics,
    principles: PersonaPrinciples,
    answers: SurveyAnswer[],
    surveyTitle: string
  ): Promise<void> {
    try {
      const index = pinecone.index('prediction-results');

      // Create a comprehensive text representation for embedding
      const textForEmbedding = `
        Survey: ${surveyTitle}
        
        Demographics:
        Name: ${demographics.name}
        Age: ${demographics.age}
        Location: ${demographics.location}
        Occupation: ${demographics.occupation}
        Education: ${demographics.education}
        Political Views: ${demographics.politicalViews}
        Interests: ${demographics.interests}
        
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
            demographics: JSON.stringify(demographics),
            principles: JSON.stringify(principles),
            answers: JSON.stringify(answers),
            email: demographics.email,
            age: parseInt(demographics.age) || 0,
            location: demographics.location,
            occupation: demographics.occupation,
            politicalViews: demographics.politicalViews,
            education: demographics.education,
            income: demographics.income,
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
   */
  static async getAllDigitalTwins(topK: number = 50): Promise<any[]> {
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
   * Query similar digital twins from Pinecone
   */
  static async findSimilarTwins(
    queryText: string,
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
   * Generate a response as a specific digital twin
   */
  static async queryDigitalTwin(
    agentToken: string,
    question: string
  ): Promise<string> {
    try {
      // First, get the digital twin data from Pinecone
      const index = pinecone.index('prediction-results');
      const fetchResult = await index.fetch([`digital-twin-${agentToken}`]);
      
      if (!fetchResult.records[`digital-twin-${agentToken}`]) {
        throw new Error('Digital twin not found');
      }

      const metadata = fetchResult.records[`digital-twin-${agentToken}`].metadata;
      const demographics = JSON.parse(metadata?.demographics as string);
      const principles = JSON.parse(metadata?.principles as string);

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
} 