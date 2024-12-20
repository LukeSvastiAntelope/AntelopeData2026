import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { IAgentProfile, ILeague } from '../interface';
import { getJson } from 'serpapi';
import { AutomatedPrediction, SportsEvent, PredictionImage, NewsItem, SerpApiNewsResult } from '../interface';
import { AIResponse } from '../types/sports';

export class AIEnhancedPredictionGenerator {
    private agent: IAgentProfile;
    private openai: OpenAI;
    private pinecone: Pinecone;
    private SPORTS_API_KEY = process.env.SPORTS_DB_API_KEY || '3';
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private VECTOR_DIMENSION = 1536;
    private CURRENT_DATE = new Date();

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
        maxEndDate.setDate(maxEndDate.getDate() + this.agent.maxTimelineLimit);
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
            interface SportsDBTeam {
                strTeam: string;
                strTeamBadge: string;
                strTeamLogo: string;
                strTeamFanart1: string;
            }

            interface SportsDBEvent {
                strEvent: string;
                strThumb: string;
                strBanner: string;
            }

            // Extract team names or event names
            const teamSearch = await fetch(
                `https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/searchteams.php?t=${encodeURIComponent(topic)}`
            );
            const teamData = await teamSearch.json();

            if (teamData.teams) {
                return teamData.teams.map((team: SportsDBTeam) => ({
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
                return eventData.events.map((event: SportsDBEvent) => ({
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
            interface GoogleImageResult {
                original: string;
                source: string;
                title: string;
            }

            const result = await getJson({
                engine: "google_images",
                q: topic,
                api_key: this.SERPAPI_API_KEY,
                safe: "active",
                num: 5
            });

            return (result.images_results || [])
                .slice(0, 5)
                .map((img: GoogleImageResult) => ({
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
            if (prediction.category === 'sportDB' && prediction.event) {
                searchTopic = `${prediction.event.strEvent} ${prediction.event.strVenue}`;
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
            const prompt = `Analyze this prediction against these betting principles:
    
    PRINCIPLES:
    ${this.agent.principles.map(p => `- ${p.title}: ${p.description}`).join('\n')}
    
    PREDICTION:
    Question: ${prediction.question}
    Description: ${prediction.description}
    Reasoning: ${prediction.reasoning}
    
    RESPOND WITH ONLY A JSON OBJECT in this exact format:
    {
        "score": 0.8,
        "reasoning": "Brief explanation of score"
    }
    
    Rules:
    1. Score must be between 0 and 1
    2. DO NOT include any explanation or additional text
    3. DO NOT use markdown formatting
    4. ONLY return the JSON object`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a JSON-only response generator. Never include explanations or additional text. Only output valid JSON objects."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3
            });

            const content = completion.choices[0].message.content?.trim() || "{}";

            // Remove any potential markdown formatting or extra text
            const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();

            try {
                const response = JSON.parse(jsonContent);

                // Validate the score is within bounds
                if (typeof response.score !== 'number' || response.score < 0 || response.score > 1) {
                    console.warn('Invalid score received, using default score of 0.5');
                    return 0.5;
                }

                return response.score;
            } catch (jsonError) {
                console.error('Failed to parse AI response:', jsonError);
                console.log('Raw AI response:', content);
                return 0.5; // Default middle score if parsing fails
            }
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
            console.log("isSimilar", isSimilar);
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
                const randomNews = this.shuffleArray(news_results) as SerpApiNewsResult[];

                newsItems.push(...randomNews.map((item: SerpApiNewsResult) => ({
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
        maxEndDate.setDate(maxEndDate.getDate() + this.agent.maxTimelineLimit);

        return `Current date: ${currentDate.toISOString().split('T')[0]}
    
    Based on these recent news items:
    ${news.map(item => `- ${item.title}\n  Context: ${item.snippet}`).join('\n')}
    
    Generate a realistic and verifiable prediction that:
    1. MUST be about events occurring between now and ${maxEndDate.toISOString().split('T')[0]}
    2. MUST be based on current news and ongoing developments
    3. MUST be realistically achievable within ${this.agent.maxTimelineLimit} days
    4. MUST NOT include predictions about:
       - Long-term space missions
       - Major infrastructure projects
       - Product launches more than ${this.agent.maxTimelineLimit} days away
       - Multi-year developments
    
    Good examples:
    - "Will [Company] release their quarterly earnings above [specific target] by [date within ${this.agent.maxTimelineLimit} days]?"
    - "Will [Team] win their next [specific match] against [opponent] on [actual scheduled date]?"
    - "Will [Company] complete their announced [specific short-term milestone] by [date within ${this.agent.maxTimelineLimit} days]?"
    
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
        "question": "Will [specific event] happen by [date within next ${this.agent.maxTimelineLimit} days]?",
        "description": "Detailed context...",
        "category": "Category",
        "reasoning": "Why this prediction is realistic and verifiable...",
        "endDate": [date],
        "sources": ["relevant news links..."],
        "confidence": 0.7
    }`;
    }

    private hasSportsInterest(): boolean {
        const sportsCategories = ['premierleague', 'soccer', 'nba', 'nfl'];

        return sportsCategories.some(category =>
            category == this.agent.category
        );
    }

    private async generateSportsPrediction(): Promise<AutomatedPrediction> {
        try {
            const events = await this.getUpcomingSportsEvents();
            if (events.length === 0) {
                console.log("no events found, retrying...");
                throw new Error("no events found");
            }
            const randomEvents = this.shuffleArray(events).slice(0, 10);
            const prompt = this.createSportsPrompt(randomEvents);
            const prediction = await this.generateWithAI(prompt);

            // Ensure the response matches our interface
            const formattedPrediction: AutomatedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: 'sportDB',
                endDate: new Date(prediction.endDate),
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
            const sportTypes = await this.determineSportTypes();
            console.log("sportTypes", sportTypes);

            if (sportTypes.length === 0) {
                return [];
            }
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
                const eventDate = new Date(event.dateEvent);
                const endDaysFromNow = new Date();
                endDaysFromNow.setDate(endDaysFromNow.getDate() + this.agent.maxTimelineLimit);
                return eventDate <= endDaysFromNow && eventDate >= this.CURRENT_DATE;
            });
        } catch (error) {
            console.error('Failed to fetch sports events:', error);
            return [];
        }
    }

    private async determineSportTypes(): Promise<string[]> {
        // Map interests to league IDs from TheSportsDB
        const response = await fetch(
            `https://www.thesportsdb.com/api/v1/json/3/all_leagues.php`
        );
        const data = await response.json();
        const leagues = data.leagues;
        const matchedLeagues = leagues.filter((league: ILeague) => league.strSport.toLowerCase() == this.agent.category);
        const availableLeagues = await this.generateInterestLeaguesWithAI(matchedLeagues);
        return availableLeagues.map((league: ILeague) => league.idLeague);
    }

    private async generateInterestLeaguesWithAI(matchedLeagues: ILeague[]): Promise<ILeague[]> {
        const interests = this.agent.interests;
        const prompt = `Given these leagues: 
        ${JSON.stringify(matchedLeagues, null, 2)}
        
        And these interests: ${interests.join(', ')}
    
        Return a JSON array containing only the leagues that best match the interests.
        Each league should include only the idLeague and strLeague.
        
        Format your response EXACTLY like this example:
        {
          "leagues": [
            {
              "idLeague": "4328",
              "strLeague": "English Premier League"
            }
          ]
        }
    
        Only include leagues that are actually in the provided leagues list.
        Ensure the response is valid JSON.`;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an AI specialized in matching sports leagues to user interests. 
                    Always return a valid JSON object with a 'leagues' array.
                    Only include leagues from the provided list.
                    Ensure each league has idLeague and strLeague fields.
                    ONLY respond with the JSON object, nothing else.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3, // Lower temperature for more consistent output
            max_tokens: 1000
        });

        try {
            const response = JSON.parse(completion.choices[0].message.content!);

            // Validate that returned leagues exist in matchedLeagues
            const validLeagues = response.leagues.filter((league: ILeague) =>
                matchedLeagues.some(ml => ml.idLeague === league.idLeague)
            );

            if (validLeagues.length === 0) {
                console.warn('No matching leagues found');
                return [];
            }

            return validLeagues;
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            // Fallback to first league if parsing fails
            return [];
        }
    }

    private createSportsPrompt(events: SportsEvent[]): string {
        const eventsContext = events
            .map(event => `
                Event_ID: ${event.idEvent}
            Event: ${event.strEvent}
            Date: ${event.dateEvent}
            Venue: ${event.strVenue}
            League: ${event.strLeague}
            League_ID: ${event.idLeague}
          `).join('\n');

        return `Based on these upcoming sports events:
    
    ${eventsContext}
    
    Generate a prediction with these criteria:
    - Should be about random one of the listed events
    - Should be verifiable within ${this.agent.maxTimelineLimit} days
    - Should be specific and measurable
    - Should include clear win/loss/score prediction
    ${this.agent.principles.map(principle => `- ${principle.title}: ${principle.description}`).join('\n')
            }
    
    Format:
    {
      "question": "[Team] vs [Team] on [Date]",
      "event": {
        "winner": "Team",
        "event_id": "Event_ID",
        "league_id": "League_ID",
        "home_team": "Home_Team",
        "away_team": "Away_Team"
      },
      "endDate": "Date",
      "confidence": 0.7
    }`;
    }

    private async generateWithAI(prompt: string): Promise<AutomatedPrediction> {
        try {
            const currentDate = new Date();
            const maxEndDate = new Date(currentDate);
            maxEndDate.setDate(maxEndDate.getDate() + this.agent.maxTimelineLimit);
            const formattedMaxDate = maxEndDate.toISOString().split('T')[0];

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are an AI specialized in generating predictions. 
                        Today's date is ${currentDate.toISOString().split('T')[0]}. 
                        All predictions MUST end before ${formattedMaxDate}.
                        NEVER generate dates beyond ${formattedMaxDate}.
                        ONLY respond with a valid JSON object.
                        DO NOT include any explanations or additional text.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3
            });

            const content = completion.choices[0].message.content?.trim() || "{}";

            // Remove any potential markdown formatting or extra text
            const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();

            try {
                const response: AIResponse = JSON.parse(jsonContent);

                // Extract date from question
                const dateMatch = response.endDate;
                if (!dateMatch) {
                    throw new Error('No valid date format found in question');
                }

                const questionDate = new Date(dateMatch);
                if (!this.isValidPredictionDate(questionDate)) {
                    throw new Error('Invalid prediction date');
                }

                return {
                    ...response,
                    endDate: questionDate,
                    initialStake: this.calculateStakeBasedOnConfidence(response.confidence)
                };
            } catch (jsonError) {
                console.error('Failed to parse AI response:', jsonError);
                console.log('Raw AI response:', content);
                throw new Error('Failed to generate valid prediction format');
            }
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

    private async checkSimilarity(prediction: AutomatedPrediction): Promise<boolean> {
        try {
            // Special handling for sports predictions
            if (prediction.category === 'Sports' && prediction.event) {
                return await this.checkSportsPredictionSimilarity(prediction);
            }

            // Regular similarity check for non-sports predictions
            return await this.checkGeneralPredictionSimilarity(prediction);
        } catch (error) {
            console.error('Failed to check similarity:', error);
            return false;
        }
    }

    private async checkSportsPredictionSimilarity(prediction: AutomatedPrediction): Promise<boolean> {
        try {
            const predictionEvent = prediction.event;
            if (!predictionEvent) return false;

            // Get recent predictions from Pinecone
            const index = this.pinecone.Index('predictions');
            const queryResponse = await index.query({
                vector: await this.getEmbedding(prediction.question),
                topK: 5,
                includeMetadata: true,
                filter: {
                    category: "Sports"
                }
            });

            if (!queryResponse.matches || queryResponse.matches.length === 0) {
                return false;
            }

            for (const match of queryResponse.matches) {
                if (!match.metadata?.event) continue;

                try {
                    const existingEvent = JSON.parse(match.metadata.event as string);

                    // Check if it's the same event
                    if (existingEvent.idEvent === predictionEvent.idEvent) {
                        console.log('Same event found:', {
                            new: predictionEvent.strEvent,
                            existing: existingEvent.strEvent
                        });
                        return true;
                    }

                    // Check if it's the same teams playing on the same date
                    if (existingEvent.dateEvent === predictionEvent.dateEvent &&
                        existingEvent.strEvent === predictionEvent.strEvent) {
                        console.log('Same match found:', {
                            new: predictionEvent.strEvent,
                            existing: existingEvent.strEvent
                        });
                        return true;
                    }
                } catch (error) {
                    console.error('Error parsing event metadata:', error);
                    continue;
                }
            }

            return false;
        } catch (error) {
            console.error('Failed to check sports prediction similarity:', error);
            return false;
        }
    }

    private async checkGeneralPredictionSimilarity(prediction: AutomatedPrediction): Promise<boolean> {
        try {
            const predictionText = `${prediction.question} ${prediction.description}`.toLowerCase();
            const embedding = await this.getEmbedding(predictionText);

            // Calculate date range for similarity check (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const index = this.pinecone.Index('predictions');
            const queryResponse = await index.query({
                vector: embedding,
                topK: 5,
                includeMetadata: true,
                filter: {
                    timestamp: { $gte: Math.floor(thirtyDaysAgo.getTime() / 1000) },
                    category: prediction.category
                }
            });

            if (!queryResponse.matches || queryResponse.matches.length === 0) {
                return false;
            }

            for (const match of queryResponse.matches) {
                if (!match.metadata) continue;

                const similarityScore = match.score || 0;
                const existingQuestion = match.metadata.question?.toString().toLowerCase() || '';

                // Text-based similarity check
                const questionSimilarity = this.calculateTextSimilarity(
                    prediction.question.toLowerCase(),
                    existingQuestion
                );

                console.log('General prediction similarity check:', {
                    vectorSimilarity: similarityScore,
                    textSimilarity: questionSimilarity,
                    newPrediction: prediction.question,
                    existingPrediction: existingQuestion
                });

                // Stricter thresholds for general predictions
                if (similarityScore > 0.92 || questionSimilarity > 0.9) {
                    console.log('Similar general prediction found:', {
                        new: prediction.question,
                        existing: existingQuestion
                    });
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Failed to check general prediction similarity:', error);
            return false;
        }
    }

    private calculateTextSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) {
            return 1.0;
        }

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];

        // Initialize matrix
        for (let i = 0; i <= str1.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str2.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in the rest of the matrix
        for (let i = 1; i <= str1.length; i++) {
            for (let j = 1; j <= str2.length; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[str1.length][str2.length];
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
            const normalizedText = `${prediction.question} ${prediction.description}`.toLowerCase();
            const embedding = await this.getEmbedding(normalizedText);

            const index = this.pinecone.Index('predictions');
            await index.upsert([{
                id: Date.now().toString(),
                values: embedding,
                metadata: {
                    question: prediction.question,
                    description: prediction.description,
                    category: prediction.category,
                    timestamp: Math.floor(new Date().getTime() / 1000),
                    creator_choice: prediction.choice,
                    event: prediction.event ? JSON.stringify(prediction.event) : ""
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