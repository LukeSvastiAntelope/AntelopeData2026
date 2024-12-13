import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { IAgentProfile } from '../interface';
import { getJson } from 'serpapi';
import { AutomatedPrediction, SportsEvent, PredictionImage, NewsItem } from '../interface';

export class AIEnhancedPredictionGenerator {
    private agent: IAgentProfile;
    private openai: OpenAI;
    private pinecone: Pinecone;
    private SPORTS_API_KEY = process.env.SPORTS_DB_API_KEY || '3';
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private VECTOR_DIMENSION = 1536;

    constructor(agent: IAgentProfile) {
        this.agent = agent;
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });
    }

    async init() {
        // Check if index exists, if not create it
        // const indexName = 'predictions';
        // await this.pinecone.deleteIndex(indexName);
        // const indexesList = await this.pinecone.listIndexes();
        // console.log(indexesList);
        // const indexExists = indexesList.indexes?.some(
        //     index => index.name === 'predictions'
        // );

        // if (!indexExists) {
        //     await this.pinecone.createIndex({
        //         name: indexName,
        //         dimension: this.VECTOR_DIMENSION,
        //         metric: 'cosine',
        //         spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
        //     });
        // }
    }

    private async validatePrediction(prediction: AutomatedPrediction): Promise<boolean> {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setMonth(currentDate.getMonth() + 3);
        const predictionDate = new Date(prediction.endDate);

        // Check date validity
        if (predictionDate <= currentDate || predictionDate > maxEndDate) {
            console.log('Invalid prediction date:', predictionDate);
            return false;
        }

        // Check for unrealistic keywords
        const unrealisticKeywords = [
            'mars', 'moon', 'space colony', 'flying car', 'cure all', 'stadium complete',
            'infrastructure', 'eradicate', 'solve world', 'eliminate all', 'revolutionary'
        ];

        const predictionText = `${prediction.question} ${prediction.description}`.toLowerCase();
        const hasUnrealisticTerms = unrealisticKeywords.some(keyword =>
            predictionText.includes(keyword.toLowerCase())
        );

        if (hasUnrealisticTerms) {
            console.log('Prediction contains unrealistic terms');
            return false;
        }

        return true;
    }

    private async getImagesForPrediction(topic: string): Promise<PredictionImage[]> {
        try {
            // Try SportsDB first if it's a sports prediction
            const sportsImages = await this.getSportsDBImages(topic);
            if (sportsImages.length > 0) {
                return sportsImages;
            }

            // Fallback to Google Images via SerpAPI
            return await this.getGoogleImages(topic);
        } catch (error) {
            console.error('Failed to fetch images:', error);
            return [];
        }
    }

    private async getSportsDBImages(topic: string): Promise<PredictionImage[]> {
        try {
            // Extract team names or event names
            const teamSearch = await fetch(
                `https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/searchteams.php?t=${encodeURIComponent(topic)}`
            );
            const teamData = await teamSearch.json();

            if (teamData.teams) {
                return teamData.teams.map((team: any) => ({
                    url: team.strTeamBadge || team.strTeamLogo || team.strTeamFanart1,
                    source: 'TheSportsDB',
                    title: team.strTeam
                })).filter((img: PredictionImage) => img.url);
            }

            // Try event images if team search fails
            const eventSearch = await fetch(
                `https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/searchevents.php?e=${encodeURIComponent(topic)}`
            );
            const eventData = await eventSearch.json();

            if (eventData.events) {
                return eventData.events.map((event: any) => ({
                    url: event.strThumb || event.strBanner,
                    source: 'TheSportsDB',
                    title: event.strEvent
                })).filter((img: PredictionImage) => img.url);
            }

            return [];
        } catch (error) {
            console.error('Failed to fetch SportsDB images:', error);
            return [];
        }
    }

    private async getGoogleImages(topic: string): Promise<PredictionImage[]> {
        try {
            const result = await getJson({
                engine: "google_images",
                q: topic,
                api_key: this.SERPAPI_API_KEY,
                safe: "active",
                num: 5
            });

            return (result.images_results || [])
                .slice(0, 5)
                .map((img: any) => ({
                    url: img.original,
                    source: img.source,
                    title: img.title
                }));
        } catch (error) {
            console.error('Failed to fetch Google images:', error);
            return [];
        }
    }

    private async enrichPredictionWithImages(prediction: AutomatedPrediction): Promise<AutomatedPrediction> {
        try {
            // Determine search topic based on prediction type
            let searchTopic = prediction.question;
            if (prediction.category === 'Sports' && prediction.event) {
                searchTopic = `${prediction.event.name} ${prediction.event.venue}`;
            }

            const images = await this.getImagesForPrediction(searchTopic);

            return {
                ...prediction,
                images: images.slice(0, 3)
            };
        } catch (error) {
            console.error('Failed to enrich prediction with images:', error);
            return prediction;
        }
    }

    // private createPromptWithPrinciples(news: NewsItem[]): string {
    //     const newsContext = news.map(item =>
    //         `${item.title}\nContext: ${item.snippet}\n`
    //     ).join('\n');

    //     // Include agent's principles in the prompt
    //     const principlesContext = this.agent.principles
    //         .map(p => `${p.title}: ${p.description}`)
    //         .join('\n');

    //     return `Following these betting principles:
    // ${principlesContext}

    // And based on the following recent news:
    // ${newsContext}

    // Generate a prediction about ${this.agent.interests.join(' or ')} that:
    // - Aligns with the stated betting principles
    // - Is verifiable within 3 months
    // - Is specific and measurable
    // - Includes a clear yes/no outcome
    // - Considers market trends and developments

    // Format:
    // {
    //   "question": "Will X happen by Y date?",
    //   "description": "Detailed context...",
    //   "category": "Category",
    //   "reasoning": "Why this prediction matters and how it aligns with our principles...",
    //   "sources": ["relevant news links..."],
    //   "confidence": 0.7,
    //   "principlesApplied": ["List which principles were applied in making this prediction"]
    // }`;
    // }

    private async evaluatePredictionAgainstPrinciples(prediction: AutomatedPrediction): Promise<number> {
        try {
            const prompt = `
    Given these betting principles:
    ${this.agent.principles.map(p => `- ${p.title}: ${p.description}`).join('\n')}
    
    And this prediction:
    Question: ${prediction.question}
    Description: ${prediction.description}
    Reasoning: ${prediction.reasoning}
    
    Rate how well this prediction aligns with our principles on a scale of 0-1.
    Provide a JSON response with:
    {
      "score": 0.8,
      "reasoning": "Explanation of how the prediction aligns with each principle..."
    }`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an AI specialized in evaluating predictions against betting principles."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3
            });

            const response = JSON.parse(completion.choices[0].message.content!);
            return response.score;
        } catch (error) {
            console.error('Failed to evaluate prediction against principles:', error);
            return 0.5; // Default middle score if evaluation fails
        }
    }

    private calculateStakeBasedOnConfidence(confidence: number): number {
        // Consider both confidence and risk level from principles
        const riskMultiplier = this.getRiskMultiplierFromPrinciples();

        if (confidence >= 0.8) {
            return Math.min(this.agent.aggressiveBetSize * riskMultiplier, this.agent.maxBetSize);
        } else if (confidence >= 0.6) {
            return Math.min(this.agent.moderateBetSize * riskMultiplier, this.agent.maxBetSize);
        } else {
            return Math.min(this.agent.conservativeBetSize * riskMultiplier, this.agent.maxBetSize);
        }
    }

    private getRiskMultiplierFromPrinciples(): number {
        // Check if any principles mention risk management
        const riskPrinciples = this.agent.principles.filter(p =>
            p.title.toLowerCase().includes('risk') ||
            p.description.toLowerCase().includes('risk')
        );

        if (riskPrinciples.length > 0) {
            // Conservative multiplier if risk management is emphasized
            return 0.8;
        }
        return 1.0;
    }

    // Update the main generation method
    async generatePrediction(): Promise<AutomatedPrediction> {
        let prediction: AutomatedPrediction;
        let isValid = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        do {
            if (this.hasSportsInterest()) {
                prediction = await this.generateSportsPrediction();
            } else {
                prediction = await this.generateGeneralPrediction();
            }

            isValid = await this.validatePrediction(prediction);
            attempts++;

            if (!isValid && attempts < MAX_ATTEMPTS) {
                console.log('Generated prediction was invalid, retrying...');
            }
        } while (!isValid && attempts < MAX_ATTEMPTS);

        if (!isValid) {
            throw new Error('Failed to generate valid prediction after maximum attempts');
        }

        // Continue with principle evaluation and image enrichment
        const principleScore = await this.evaluatePredictionAgainstPrinciples(prediction);
        prediction.confidence *= principleScore;
        prediction.initialStake = this.calculateStakeBasedOnConfidence(prediction.confidence);
        prediction.principlesApplied = this.agent.principles.map(p => p.title);
        prediction.principleScore = principleScore;

        const enrichedPrediction = await this.enrichPredictionWithImages(prediction);
        await this.storePrediction(enrichedPrediction);

        return enrichedPrediction;
    }

    private async generateGeneralPrediction(): Promise<AutomatedPrediction> {
        // Similar structure but without sports-specific fields
        try {
            const news = await this.gatherRecentNews();
            const prompt = await this.createPromptWithNews(news);
            const prediction = await this.generateWithAI(prompt);

            const formattedPrediction: AutomatedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: prediction.category,
                endDate: new Date(prediction.endDate),
                initialStake: this.calculateStakeBasedOnConfidence(prediction.confidence),
                choice: prediction.choice || 'Yes',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                sources: prediction.sources || []
            };
            const isSimilar = await this.checkSimilarity(formattedPrediction);
            if (isSimilar) {
                console.log('Similar prediction found, retrying...');
                return this.generateGeneralPrediction();
            }

            return formattedPrediction;
        } catch (error) {
            console.error('Failed to generate general prediction:', error);
            throw error;
        }
    }

    private async gatherRecentNews(): Promise<NewsItem[]> {
        try {
            const newsItems: NewsItem[] = [];
            const randomInterests = this.shuffleArray([...this.agent.interests])
                .slice(0, 2); // Randomly select 2 interests

            for (const interest of randomInterests) {
                const result = await getJson({
                    engine: "google_news",
                    q: interest,
                    api_key: this.SERPAPI_API_KEY,
                    time: "7d", // Last 7 days
                    num: 10 // Increase number of results
                });

                const news_results = result.news_results || [];
                // Randomly select 3 news items from the results
                const randomNews = this.shuffleArray(news_results).slice(0, 3);

                newsItems.push(...randomNews.map((item: any) => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet,
                    date: item.date
                })));
            }

            return newsItems;
        } catch (error) {
            console.error('Failed to gather news:', error);
            return [];
        }
    }

    private shuffleArray<T>(array: T[]): T[] {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    private createPromptWithNews(news: NewsItem[]): string {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setMonth(currentDate.getMonth() + 3);

        return `Current date: ${currentDate.toISOString().split('T')[0]}
    
    Based on these recent news items:
    ${news.map(item => `- ${item.title}\n  Context: ${item.snippet}`).join('\n')}
    
    Generate a realistic and verifiable prediction that:
    1. MUST be about events occurring between now and ${maxEndDate.toISOString().split('T')[0]}
    2. MUST be based on current news and ongoing developments
    3. MUST be realistically achievable within 3 months
    4. MUST NOT include predictions about:
       - Long-term space missions
       - Major infrastructure projects
       - Product launches more than 3 months away
       - Multi-year developments
    
    Good examples:
    - "Will [Company] release their quarterly earnings above [specific target] by [date within 3 months]?"
    - "Will [Team] win their next [specific match] against [opponent] on [actual scheduled date]?"
    - "Will [Company] complete their announced [specific short-term milestone] by [date within 3 months]?"
    
    Bad examples:
    - "Will SpaceX launch a Mars mission by [date]?" (too long-term)
    - "Will the new stadium be completed by [date]?" (infrastructure projects take years)
    - "Will flying cars be available by [date]?" (unrealistic timeframe)
    5. MUST NOT be similar to predictions about the same metric with different numbers
       Bad examples:
       - "Will X reach $400 billion?" vs "Will X reach $450 billion?"
       - "Will stock price reach $100?" vs "Will stock price reach $110?"
    
    Format the response as:
    {
        "question": "Will [specific event] happen by [date within next 3 months]?",
        "description": "Detailed context...",
        "category": "Category",
        "reasoning": "Why this prediction is realistic and verifiable...",
        "sources": ["relevant news links..."],
        "confidence": 0.7
    }`;
    }

    private hasSportsInterest(): boolean {
        const sportsKeywords = ['sports', 'football', 'soccer', 'basketball', 'baseball', 'nba', 'nfl', 'mlb'];
        return this.agent.interests.some(interest =>
            sportsKeywords.some(keyword =>
                interest.toLowerCase().includes(keyword)
            )
        );
    }

    private async generateSportsPrediction(): Promise<AutomatedPrediction> {
        try {
            const events = await this.getUpcomingSportsEvents();
            const prompt = this.createSportsPrompt(events);
            const prediction = await this.generateWithAI(prompt);

            // Ensure the response matches our interface
            const formattedPrediction: AutomatedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: 'Sports',
                endDate: new Date(prediction.event?.date || ''),
                initialStake: this.calculateStakeBasedOnConfidence(prediction.confidence),
                choice: prediction.choice || 'Yes',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                event: prediction.event,
                sources: prediction.sources || []
            };

            const isSimilar = await this.checkSimilarity(formattedPrediction);
            if (isSimilar) {
                return this.generateSportsPrediction();
            }

            return formattedPrediction;
        } catch (error) {
            console.error('Failed to generate sports prediction:', error);
            throw error;
        }
    }

    private async getUpcomingSportsEvents(): Promise<SportsEvent[]> {
        try {
            const sportTypes = this.determineSportTypes();
            const events: SportsEvent[] = [];

            for (const sport of sportTypes) {
                const response = await fetch(
                    `https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/eventsnextleague.php?id=${sport}`
                );
                const data = await response.json();
                if (data.events) {
                    events.push(...data.events);
                }
            }

            return events.filter(event => {
                const eventDate = new Date(event.date);
                const threeDaysFromNow = new Date();
                threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
                return eventDate <= threeDaysFromNow;
            });
        } catch (error) {
            console.error('Failed to fetch sports events:', error);
            return [];
        }
    }

    private determineSportTypes(): string[] {
        // Map interests to league IDs from TheSportsDB
        const sportLeagueMap: Record<string, string> = {
            'nba': '4387',
            'nfl': '4391',
            'mlb': '4424',
            'soccer': '4328',  // Premier League
            'football': '4328',
            'basketball': '4387'
        };

        return this.agent.interests
            .map(interest => sportLeagueMap[interest.toLowerCase()])
            .filter(Boolean);
    }

    private createSportsPrompt(events: SportsEvent[]): string {
        const eventsContext = events
            .map(event => `
            Event: ${event.name}
            Date: ${event.date}
            Venue: ${event.venue}
            League: ${event.league}
          `).join('\n');

        return `Based on these upcoming sports events:
    
    ${eventsContext}
    
    Generate a prediction with these criteria:
    - Should be about one of the listed events
    - Should be verifiable within 3 days
    - Should be specific and measurable
    - Should include clear win/loss/score prediction
    - Should consider team performance history
    
    Format:
    {
      "question": "Will [Team] win against [Team] on [Date]?",
      "description": "Detailed analysis...",
      "category": "Sports",
      "event": {
        "name": "Event name",
        "date": "Event date",
        "venue": "Venue"
      },
      "reasoning": "Analysis of team performance, history...",
      "confidence": 0.7
    }`;
    }

    private async generateWithAI(prompt: string): Promise<AutomatedPrediction> {
        try {
            const currentDate = new Date();
            const maxEndDate = new Date(currentDate);
            maxEndDate.setMonth(currentDate.getMonth() + 3);
            const formattedMaxDate = maxEndDate.toISOString().split('T')[0];

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are an AI specialized in generating predictions. 
                        Today's date is ${currentDate.toISOString().split('T')[0]}. 
                        All predictions MUST end before ${formattedMaxDate}.
                        NEVER generate dates beyond ${formattedMaxDate}.
                        Use date format YYYY-MM-DD in the question.
                        The endDate in the response must match exactly with the date in the question.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            });

            const response = JSON.parse(completion.choices[0].message.content!);

            // Extract date from question
            const dateMatch = response.question.match(/by\s+([\d]{4}-[\d]{2}-[\d]{2})/);
            if (!dateMatch) {
                throw new Error('No valid date format found in question');
            }

            const questionDate = new Date(dateMatch[1]);
            if (!this.isValidPredictionDate(questionDate)) {
                throw new Error('Invalid prediction date');
            }

            return {
                ...response,
                endDate: questionDate,
                initialStake: this.calculateStakeBasedOnConfidence(response.confidence)
            };
        } catch (error) {
            console.error('Failed to generate prediction with OpenAI:', error);
            throw error;
        }
    }

    private calculateValidEndDate(question: string): Date {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setMonth(currentDate.getMonth() + 3);

        // Try to extract date from question
        const dateMatch = question.match(/by\s+([\w\s,]+\d{4})/i);
        if (dateMatch) {
            const extractedDate = new Date(dateMatch[1]);
            if (this.isValidPredictionDate(extractedDate)) {
                return extractedDate;
            }
        }

        // If no valid date found or date is invalid, generate a date within 3 months
        const randomDays = Math.floor(Math.random() * 90) + 1; // 1 to 90 days
        const randomDate = new Date(currentDate);
        randomDate.setDate(currentDate.getDate() + randomDays);

        // Ensure date doesn't exceed maxEndDate
        return randomDate > maxEndDate ? maxEndDate : randomDate;
    }

    private isValidPredictionDate(date: Date): boolean {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setMonth(currentDate.getMonth() + 3);

        // Add time buffer to ensure date is within range
        currentDate.setHours(0, 0, 0, 0);
        maxEndDate.setHours(23, 59, 59, 999);

        return date >= currentDate &&
            date <= maxEndDate &&
            !isNaN(date.getTime());
    }

    private async enrichWithTeamStats(prediction: any): Promise<any> {
        try {
            // Extract team names from the prediction
            const teamNames = prediction.event.name.split(' vs ');
            const stats = await Promise.all(
                teamNames.map((team: any) =>
                    fetch(`https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/searchteams.php?t=${team}`)
                        .then(res => res.json())
                )
            );

            return {
                ...prediction,
                teamStats: stats
            };
        } catch (error) {
            console.error('Failed to enrich with team stats:', error);
            return prediction;
        }
    }

    private async checkSimilarity(prediction: AutomatedPrediction): Promise<boolean> {
        try {
            // Normalize the prediction text for comparison
            const normalizedText = this.normalizePredictionText(prediction.question);

            // Get embedding for the normalized prediction
            const embedding = await this.getEmbedding(normalizedText);

            // Calculate date range for similarity check
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const minTimestamp = Math.floor(thirtyDaysAgo.getTime() / 1000);

            // Query Pinecone
            const index = this.pinecone.Index('predictions');
            const queryResponse = await index.query({
                vector: embedding,
                topK: 5, // Increased to check more predictions
                includeMetadata: true,
                filter: {
                    createdAt: {
                        $gte: minTimestamp
                    }
                }
            });

            // Check for similar predictions
            if (queryResponse.matches && queryResponse.matches.length > 0) {
                for (const match of queryResponse.matches) {
                    const similarityScore = match.score!;
                    const metadata = match.metadata;

                    // Check for numeric patterns
                    const currentNumbers = this.extractNumbers(normalizedText);
                    const existingNumbers = this.extractNumbers(metadata?.question.toString() || '');

                    // Calculate numeric similarity
                    const numericSimilarity = this.calculateNumericSimilarity(
                        currentNumbers,
                        existingNumbers
                    );

                    // Log for debugging
                    console.log('Similarity check:', {
                        current: normalizedText,
                        existing: metadata?.question,
                        vectorSimilarity: similarityScore,
                        numericSimilarity,
                        currentNumbers,
                        existingNumbers
                    });

                    // Consider both vector similarity and numeric patterns
                    if (similarityScore > 0.90 || numericSimilarity > 0.85) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('Failed to check similarity:', error);
            return false;
        }
    }

    private normalizePredictionText(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s\d]/g, '') // Remove special characters
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .trim();
    }

    private extractNumbers(text: string): number[] {
        const matches = text.match(/\d+(?:\.\d+)?/g);
        return matches ? matches.map(Number) : [];
    }

    private calculateNumericSimilarity(nums1: number[], nums2: number[]): number {
        if (!nums1.length || !nums2.length) return 0;

        let similarities = 0;
        let comparisons = 0;

        for (const num1 of nums1) {
            for (const num2 of nums2) {
                comparisons++;
                // Calculate percentage difference
                const diff = Math.abs(num1 - num2) / Math.max(num1, num2);
                if (diff < 0.15) { // Numbers within 15% of each other
                    similarities++;
                }
            }
        }

        return similarities / comparisons;
    }

    private async getEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text
        });

        return response.data[0].embedding;
    }

    private async storePrediction(prediction: AutomatedPrediction) {
        try {
            const embedding = await this.getEmbedding(
                `${prediction.question} ${prediction.description}`
            );

            const index = this.pinecone.Index('predictions');
            await index.upsert([{
                id: Date.now().toString(),
                values: embedding,
                metadata: {
                    question: prediction.question,
                    description: prediction.description,
                    category: prediction.category,
                    createdAt: new Date().toISOString(),
                    creator_choice: prediction.choice,
                    created_timestamp: new Date().getTime() / 1000,
                }
            }]);
        } catch (error) {
            console.error('Failed to store prediction in Pinecone:', error);
        }
    }

    // private calculateEndDate(): Date {
    //     const endDate = new Date();
    //     endDate.setMonth(endDate.getMonth() + 3);
    //     return endDate;
    // }
}

// Usage example:
export const createAIPrediction = async (agent: IAgentProfile) => {
    try {
        const generator = new AIEnhancedPredictionGenerator(agent);
        await generator.init();
        const prediction = await generator.generatePrediction();
        return prediction;
    } catch (error) {
        console.error('Failed to create AI prediction:', error);
        throw error;
    }
};