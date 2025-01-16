import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { IAgentProfile, ILeague } from '../interface';
import { getJson } from 'serpapi';
import { AutomatedPrediction, SportsEvent, PredictionImage, NewsItem, SerpApiNewsResult } from '../interface';
import { AIResponse } from '../types/sports';
import axios from 'axios';

interface CryptoMarketData {
    name: string;
    symbol: string;
    price: number;
    market_cap: number;
    percent_change_24h: number;
}

interface CryptoTrendData {
    term: string;
    trends: string; // Update this type based on actual Google Trends response
}

interface CombinedCryptoData {
    marketData: CryptoMarketData[];
    news: NewsItem[];
    trends: CryptoTrendData[];
}

interface FinancialMarketData {
    title: string;
    ticker: string;
    price: string;
    price_movement: string;
    percentage_change: string;
    market_cap: string;
    exchange: string;
}

interface GoogleImageResult {
    original: string;
    source: string;
    title: string;
}

// Add this interface to define the CoinMarketCap API response structure
interface CoinMarketCapInfo {
    name: string;
    symbol: string;
    quote: {
        USD: {
            price: number;
            market_cap: number;
            percent_change_24h: number;
        };
    };
}

export class AIEnhancedPredictionGenerator {
    private agent: IAgentProfile;
    private openai: OpenAI;
    private pinecone: Pinecone;
    private SPORTS_API_KEY = process.env.SPORTS_DB_API_KEY || '3';
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private VECTOR_DIMENSION = 1536;
    private CURRENT_DATE = new Date();
    private MAX_SIMILAR_ATTEMPTS = 5;
    private COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY!;

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
    }

    private async getImagesForPrediction(topic: string): Promise<PredictionImage[]> {
        try {
            // Fallback to Google Images via SerpAPI
            return await this.getGoogleImages(topic);
        } catch (error) {
            console.error('Failed to fetch images:', error);
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
            if (prediction.images && prediction.images.length > 0 && prediction.images[0].url) {
                return prediction;
            }
            const searchTopic = prediction.question;

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
                console.error('3Failed to parse AI response:', jsonError);
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
    async generatePrediction(): Promise<AutomatedPrediction | undefined> {
        let prediction: AutomatedPrediction | undefined;

        if (this.hasSportsInterest()) {
            prediction = await this.generateSportsPrediction();
            if (!prediction) {
                return undefined;
            }
        } else if (this.agent.category == "general") {
            prediction = await this.generateGeneralPrediction();
            if (!prediction) {
                return undefined;
            }
        } else if (this.agent.category == "crypto") {
            prediction = await this.generateCryptoPrediction();
            if (!prediction) {
                return undefined;
            }
        } else {
            prediction = await this.generateFinancePrediction();
            if (!prediction) {
                return undefined;
            }
        }

        const principleScore = await this.evaluatePredictionAgainstPrinciples(prediction);
        prediction.confidence *= principleScore;
        prediction.initialStake = this.calculateStakeBasedOnConfidence(prediction.confidence);
        prediction.principlesApplied = this.agent.principles.map(p => p.title);
        prediction.principleScore = principleScore;

        const enrichedPrediction = await this.enrichPredictionWithImages(prediction);
        // const pineconeId = await this.storePrediction(enrichedPrediction);
        // enrichedPrediction.pineconeId = pineconeId;

        return enrichedPrediction;
    }

    private async generateCryptoPrediction(attempt = 0): Promise<AutomatedPrediction | undefined> {
        try {
            // Add attempt count check
            if (attempt >= this.MAX_SIMILAR_ATTEMPTS) {
                console.log("Max attempts reached for crypto prediction");
                return undefined;
            }

            // Get data from multiple sources
            const data = await this.getCombinedCryptoData(this.agent.interests);

            if (!data || !data.marketData || data.marketData.length === 0) {
                console.error('No valid crypto market data found');
                return undefined;
            }

            const prompt = this.createEnhancedCryptoPrompt(data);
            const prediction = await this.generateWithAI(prompt);

            // Format the prediction
            const formattedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: 'coinmarketcap',
                endDate: new Date(prediction.endDate),
                choice: prediction.choice || 'Yes',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                sources: prediction.sources || [],
                initialStake: 0
            };
            console.log("formattedPrediction", formattedPrediction);

            // Check for similar predictions
            const isSimilar = await this.checkSimilarity(formattedPrediction);
            if (isSimilar) {
                return this.generateCryptoPrediction(attempt + 1);
            }

            return formattedPrediction;

        } catch (error) {
            console.error('Failed to create crypto prediction:', error);
            return undefined;
        }
    }

    private createEnhancedCryptoPrompt(data: CombinedCryptoData) {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setDate(maxEndDate.getDate() + 360);

        return `Based on this comprehensive crypto market data:
    
    MARKET DATA:
    ${data.marketData.map((crypto: CryptoMarketData) => `
    ${crypto.name} (${crypto.symbol}):
    - Price: $${crypto.price.toFixed(2)}
    - Market Cap: $${(crypto.market_cap / 1e9).toFixed(2)}B
    - 24h Change: ${crypto.percent_change_24h.toFixed(2)}%
    `).join('\n')}
    
    RECENT NEWS:
    ${data.news.map((item: NewsItem) => `- ${item.title}`).join('\n')}
    
    MARKET TRENDS:
    ${data.trends.map((trend: CryptoTrendData) => `- ${trend.term}: ${trend.trends}`).join('\n')}
    
    Generate an interesting cryptocurrency prediction that falls into one of these categories:
    
    1. MARKET DYNAMICS:
       - Price correlations between different cryptocurrencies
       - Market dominance shifts
       - Trading volume milestones
    
    2. ADOPTION & INTEGRATION:
       - Institutional adoption
       - Integration with traditional finance
       - New partnership announcements
    
    3. TECHNICAL DEVELOPMENTS:
       - Network upgrades
       - Protocol improvements
       - New feature launches
    
    4. MARKET SENTIMENT:
       - Trading volume patterns
       - Social media impact
       - Community growth metrics
    
    Requirements:
    - Must be verifiable by ${maxEndDate.toISOString().split('T')[0]}
    - Must include specific, measurable metrics
    - Must be based on current trends and data
    - Must avoid overly speculative predictions
    - Must include realistic price targets or adoption metrics
    - Try to generate a prediction which can resolve within short time period : not essential part
    
    Format the response as:
    {
        "question": "Will [specific event] happen by [date]?",
        "description": "Detailed context including current market conditions...",
        "category": "crypto",
        "reasoning": "Analysis based on market data, news, and trends...",
        "endDate": "YYYY-MM-DD",
        "sources": ["relevant links..."],
        "confidence": 0.7
    }`;
    }

    private async getCombinedCryptoData(interests: string[]): Promise<CombinedCryptoData> {
        try {
            const [cryptoMarketData, newsData, trendData] = await Promise.all([
                this.getBasicCryptoData(interests),
                this.getCryptoNews(interests),
                this.getCryptoTrends(interests)
            ]);

            return {
                marketData: cryptoMarketData,
                news: newsData,
                trends: trendData
            };
        } catch (error) {
            console.error('Error fetching combined crypto data:', error);
            return {
                marketData: [],
                news: [],
                trends: []
            };
        }
    }

    private async getBasicCryptoData(interests: string[]): Promise<CryptoMarketData[]> {
        try {
            const cryptoSymbols = interests
                .map(interest => this.extractCryptoSymbol(interest))
                .filter((symbol): symbol is string => symbol !== null); // Filter out null values

            if (cryptoSymbols.length === 0) {
                throw new Error('No valid crypto symbols found');
            }

            const response = await axios.get(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest`, {
                headers: {
                    'X-CMC_PRO_API_KEY': this.COINMARKETCAP_API_KEY,
                },
                params: {
                    symbol: cryptoSymbols.join(','),
                    convert: 'USD'
                }
            });

            const data = response.data;
            console.log("coinmarketcap data", data);
            if (!data?.data) {
                throw new Error('No data received from CoinMarketCap');
            }

            const cryptoData: CryptoMarketData[] = [];

            // Safely process each crypto entry
            Object.entries(data.data as Record<string, CoinMarketCapInfo>).forEach(([symbol, cryptoInfo]) => {
                try {
                    if (cryptoInfo && cryptoInfo.quote?.USD) {
                        cryptoData.push({
                            name: cryptoInfo.name || symbol,
                            symbol: cryptoInfo.symbol || symbol,
                            price: cryptoInfo.quote.USD.price || 0,
                            market_cap: cryptoInfo.quote.USD.market_cap || 0,
                            percent_change_24h: cryptoInfo.quote.USD.percent_change_24h || 0
                        });
                    }
                } catch (err) {
                    console.error(`Error processing crypto data for ${symbol}:`, err);
                }
            });

            return cryptoData;

        } catch (error) {
            console.error('Error fetching basic crypto data:', error);
            return [];
        }
    }

    private extractCryptoSymbol(description: string): string | null {
        // Improved crypto symbol extraction
        // Look for common patterns: (BTC), BTC/USD, $BTC, etc.
        const patterns = [
            /\(([A-Z]{3,})\)/, // (BTC)
            /([A-Z]{3,})\/USD/, // BTC/USD
            /\$([A-Z]{3,})/, // $BTC
            /#([A-Z]{3,})/, // #BTC
            /\b(BTC|ETH|USDT|BNB|XRP|ADA|SOL|DOT|DOGE|SHIB)\b/ // Common crypto symbols
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    private async getCryptoNews(interests: string[]): Promise<NewsItem[]> {
        try {
            const newsItems = [];
            const shuffledInterests = this.shuffleArray(interests).slice(0, 2);

            for (const interest of shuffledInterests) {
                const result = await getJson({
                    engine: "google_news",
                    q: `${interest} cryptocurrency crypto`,
                    api_key: process.env.SERPAPI_API_KEY,
                    time: "1d"
                });

                if (result.news_results) {
                    newsItems.push(...result.news_results.slice(0, 3));
                }
            }

            return newsItems;
        } catch (error) {
            console.error('Error fetching crypto news:', error);
            return [];
        }
    }

    private async getCryptoTrends(interests: string[]): Promise<CryptoTrendData[]> {
        try {
            const trendData = [];
            const shuffledInterests = this.shuffleArray(interests).slice(0, 2);

            for (const interest of shuffledInterests) {
                const result = await getJson({
                    engine: "google_trends",
                    q: `${interest} crypto`,
                    api_key: process.env.SERPAPI_API_KEY
                });

                if (result.interest_over_time) {
                    trendData.push({
                        term: interest,
                        trends: result.interest_over_time
                    });
                }
            }

            return trendData;
        } catch (error) {
            console.error('Error fetching crypto trends:', error);
            return [];
        }
    }

    private async generateFinancePrediction(attemptCount = 0): Promise<AutomatedPrediction | undefined> {
        try {
            // Add attempt count check
            if (attemptCount >= this.MAX_SIMILAR_ATTEMPTS) {
                console.log("Max attempts reached for markets prediction");
                return undefined;
            }

            // Get financial data for random interests
            const shuffledInterests = this.shuffleArray(this.agent.interests).slice(0, 3);
            const marketData = [];

            for (const interest of shuffledInterests) {
                const result = await getJson({
                    engine: "google_finance",
                    q: interest,
                    api_key: process.env.SERPAPI_API_KEY
                });

                if (result.financial_results) {
                    marketData.push(...result.financial_results.map((item: FinancialMarketData) => ({
                        title: item.title,
                        ticker: item.ticker,
                        price: item.price,
                        price_movement: item.price_movement,
                        percentage_change: item.percentage_change,
                        market_cap: item.market_cap,
                        exchange: item.exchange
                    })));
                }
            }

            if (marketData.length === 0) {
                throw new Error("No market data found");
            }

            const prompt = this.createMarketsPrompt(marketData);
            const prediction = await this.generateWithAI(prompt);

            // Format the prediction
            const formattedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: 'google_finance',
                endDate: new Date(prediction.endDate),
                choice: prediction.choice || 'Yes',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                sources: prediction.sources || [],
                initialStake: 0
            };

            // Check for similar predictions
            const isSimilar = await this.checkSimilarity(formattedPrediction);
            if (isSimilar) {
                return this.generateFinancePrediction(attemptCount + 1);
            }

            return formattedPrediction;

        } catch (error) {
            console.error('Failed to create markets prediction:', error);
            return undefined;
        }
    }

    private createMarketsPrompt(marketData: FinancialMarketData[]) {
        const currentDate = new Date();
        const maxEndDate = new Date(currentDate);
        maxEndDate.setDate(maxEndDate.getDate() + 360);

        return `Based on this market data:
    ${marketData.map((item: FinancialMarketData) => `
    Stock: ${item.title} (${item.ticker})
    Current Price: ${item.price}
    Movement: ${item.price_movement} (${item.percentage_change})
    Market Cap: ${item.market_cap}
    Exchange: ${item.exchange}
    `).join('\n')}
    
    Generate a financial market prediction that:
    1. Must be about specific price targets, market events, or company milestones
    2. Must be verifiable by ${maxEndDate.toISOString().split('T')[0]}
    3. Must be based on current market trends and company performance
    4. Must include specific numbers or measurable outcomes
    5. Must avoid vague or general predictions
    
    Good examples:
    - "Will [Stock] reach [specific price target] by [date]?"
    - "Will [Company] achieve [specific revenue/profit target] in Q[X] [year]?"
    - "Will [Company] complete their announced [specific milestone] by [date]?"
    
    Format the response as:
    {
        "question": "Will [specific event] happen by [date]?",
        "description": "Detailed market context...",
        "category": "markets",
        "reasoning": "Analysis based on current market data...",
        "endDate": "YYYY-MM-DD",
        "sources": ["relevant links..."],
        "confidence": 0.7
    }`;
    }

    private async generateGeneralPrediction(attemptCount = 0): Promise<AutomatedPrediction | undefined> {
        // Similar structure but without sports-specific fields
        try {
            if (attemptCount >= this.MAX_SIMILAR_ATTEMPTS) {
                console.log("Max attempts reached for general prediction");
                return undefined;
            }
            const news = await this.gatherRecentNews();
            const prompt = await this.createPromptWithNews(news);
            const prediction = await this.generateWithAI(prompt);
            const formattedPrediction: AutomatedPrediction = {
                question: prediction.question,
                description: prediction.description,
                category: 'google_news',
                endDate: new Date(prediction.endDate),
                initialStake: 0,
                choice: prediction.choice || 'Yes',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                sources: prediction.sources || []
            };
            const isSimilar = await this.checkSimilarity(formattedPrediction);
            console.log("isSimilar", isSimilar);
            if (isSimilar) {
                console.log('Similar prediction found, retrying...');
                return this.generateGeneralPrediction(attemptCount + 1);
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
                    time: "7d",
                    num: 10
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
        const sportsCategories = ['english premier league', 'soccer', 'nba', 'nfl'];

        return sportsCategories.some(category =>
            category == this.agent.category
        );
    }

    private async generateSportsPrediction(attempts = 0): Promise<AutomatedPrediction | undefined> {
        try {
            const usedEventIds: Set<string> = new Set();
            const events = await this.getUpcomingSportsEvents();
            if (events.length === 0) {
                throw new Error("No events found");
            }
            let predictionResult: AutomatedPrediction | undefined;

            while (attempts < this.MAX_SIMILAR_ATTEMPTS) {
                // Filter out already used events
                const unusedEvents = events.filter(event => !usedEventIds.has(event.idEvent));

                if (unusedEvents.length === 0) {
                    break;
                }

                const randomEvents = this.shuffleArray(unusedEvents).slice(0, 10);

                const prompt = this.createSportsPrompt(randomEvents);
                const prediction = await this.generateWithAI(prompt);

                if (prediction.event?.event_id) {
                    usedEventIds.add(prediction.event.event_id);
                }

                const strThumb = randomEvents.find(event => event.idEvent === prediction.event?.event_id)?.strThumb || '';
                const homeTeam = randomEvents.find(event => event.idEvent === prediction.event?.event_id)?.strHomeTeam || '';
                const awayTeam = randomEvents.find(event => event.idEvent === prediction.event?.event_id)?.strAwayTeam || '';
                if (prediction.event) {
                    prediction.event.home_team = homeTeam;
                    prediction.event.away_team = awayTeam;
                }

                // Ensure the response matches our interface
                const formattedPrediction: AutomatedPrediction = {
                    question: prediction.question,
                    description: prediction.description,
                    category: 'sportDB',
                    endDate: new Date(prediction.endDate),
                    initialStake: this.calculateStakeBasedOnConfidence(prediction.confidence),
                    choice: prediction.event?.winner || 'Yes',
                    confidence: prediction.confidence,
                    reasoning: prediction.reasoning,
                    event: prediction.event,
                    sources: prediction.sources || [],
                    images: [{ url: strThumb, source: 'sportsdb', title: prediction.question }]
                };

                const isSimilar = await this.checkSimilarity(formattedPrediction);
                if (!isSimilar) {
                    predictionResult = formattedPrediction;
                    break;
                } else {
                    attempts++;
                    console.log("similar prediction found, retrying...");
                }
            }
            return predictionResult;
        } catch (error) {
            console.error('Failed to generate sports prediction:', error);
            throw error;
        }
    }

    private async getUpcomingSportsEvents(): Promise<SportsEvent[]> {
        try {
            const sportTypes = await this.determineSportTypes();

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
            `https://www.thesportsdb.com/api/v1/json/${this.SPORTS_API_KEY}/all_leagues.php`
        );
        const data = await response.json();
        const leagues = data.leagues;
        const matchedLeagues = leagues.filter((league: ILeague) => (league.strSport.toLowerCase() == this.agent.category || league.strLeague.toLowerCase() == this.agent.category));
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

        const content = completion.choices[0].message.content || '{"leagues": []}';

        // Remove markdown code blocks and clean up the response
        const cleanContent = content
            .replace(/```json\n?/g, '')  // Remove opening code block
            .replace(/\n?```/g, '')      // Remove closing code block
            .trim();                     // Remove extra whitespace

        try {
            const response = JSON.parse(cleanContent);

            // Validate that returned leagues exist in matchedLeagues
            const validLeagues = response.leagues.filter((league: ILeague) =>
                matchedLeagues.some(ml => ml.idLeague === league.idLeague)
            );

            if (validLeagues.length === 0) {
                console.warn('No matching leagues found');
                return matchedLeagues.slice(0, 3); // Fallback to first 3 leagues
            }

            return validLeagues;
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return matchedLeagues.slice(0, 3); // Fallback to first 3 leagues
        }
    }

    private createSportsPrompt(events: SportsEvent[]): string {
        const eventsContext = events
            .map(event => `
                Event_ID: ${event.idEvent}
            Event: ${event.strEvent}
            Home Team: ${event.strHomeTeam}
            Away Team: ${event.strAwayTeam}
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
        "question": "[Home_Team] vs [Away_Team] on [Date]",
        "event": {
            "winner": "Home_Team or Away_Team or 'Draw'",
            "event_id": "Event_ID",
            "league_id": "League_ID",
            "home_team": "Home_Team",
            "away_team": "Away_Team"
        },
        "endDate": "Date",
        "confidence": 0.7,
        "reasoning": "Why this prediction is realistic and verifiable...",
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
                        Dates MUST be in ISO format (YYYY-MM-DD).
                        DO NOT include any explanations or additional text.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7 // Increased temperature for more variety
            });

            const content = completion.choices[0].message.content?.trim() || "{}";
            const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();

            const response: AIResponse = JSON.parse(jsonContent);
            try {

                // Ensure endDate exists and is in the correct format
                if (!response.endDate) {
                    throw new Error('No end date provided in response');
                }

                // Parse and validate the date
                const questionDate = new Date(response.endDate);
                if (isNaN(questionDate.getTime())) {
                    // If date is invalid, generate a valid date
                    questionDate.setDate(currentDate.getDate() + Math.floor(Math.random() * this.agent.maxTimelineLimit));
                }

                // Ensure date is within valid range
                if (questionDate <= currentDate || questionDate > maxEndDate) {
                    // Adjust date to be within valid range
                    const daysToAdd = Math.floor(Math.random() * this.agent.maxTimelineLimit) + 1;
                    questionDate.setDate(currentDate.getDate() + daysToAdd);
                }

                return {
                    ...response,
                    endDate: questionDate,
                    initialStake: this.calculateStakeBasedOnConfidence(response.confidence)
                };
            } catch (jsonError) {
                console.error('Failed to parse AI response:', jsonError);
                // Generate a fallback prediction with a valid date
                const fallbackDate = new Date(currentDate);
                fallbackDate.setDate(currentDate.getDate() + Math.floor(Math.random() * this.agent.maxTimelineLimit) + 1);

                return {
                    ...response,
                    endDate: fallbackDate,
                    initialStake: this.calculateStakeBasedOnConfidence(response.confidence || 0.5)
                };
            }
        } catch (error) {
            console.error('Failed to generate prediction with OpenAI:', error);
            throw error;
        }
    }

    private async checkSimilarity(prediction: AutomatedPrediction): Promise<boolean> {
        try {
            // Special handling for sports predictions
            if (prediction.category === 'sportDB' && prediction.event) {
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

            const index = this.pinecone.Index('prediction-results');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const queryResponse = await index.query({
                vector: await this.getEmbedding(prediction.question),
                topK: 5,
                includeMetadata: true,
                filter: {
                    category: "sportDB",
                    agent_id: this.agent.id,
                    timestamp: { $gte: Math.floor(thirtyDaysAgo.getTime() / 1000) }
                }
            });

            if (!queryResponse.matches || queryResponse.matches.length === 0) {
                return false;
            }

            for (const match of queryResponse.matches) {
                if (!match.metadata?.event) continue;

                try {
                    const existingEvent = JSON.parse(match.metadata.event as string);
                    // Check if it's exactly the same event (same teams on same date)
                    if (existingEvent.event_id === predictionEvent.event_id ||
                        (existingEvent.home_team === predictionEvent.home_team &&
                            existingEvent.away_team === predictionEvent.away_team &&
                            existingEvent.endDate === match.metadata.end_date)) {
                        console.log('Same match found:', {
                            new: {
                                home: predictionEvent.home_team,
                                away: predictionEvent.away_team,
                                date: prediction.endDate
                            },
                            existing: {
                                home: existingEvent.home_team,
                                away: existingEvent.away_team,
                                date: match.metadata.end_date
                            }
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

            const index = this.pinecone.Index('prediction-results');
            const queryResponse = await index.query({
                vector: embedding,
                topK: 5,
                includeMetadata: true,
                filter: {
                    category: prediction.category,
                    agent_id: this.agent.id
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

    private async getEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text
        });

        return response.data[0].embedding;
    }

    private async storePrediction(prediction: AutomatedPrediction): Promise<string> {
        try {
            const normalizedText = `${prediction.question} ${prediction.description}`.toLowerCase();
            const embedding = await this.getEmbedding(normalizedText);
            const id = `prediction-${Date.now()}`;

            const newIndex = this.pinecone.Index('prediction-results');
            await newIndex.upsert([{
                id: id,
                values: embedding,
                metadata: {
                    description: prediction.description,
                    choice: prediction.choice,
                    amount: prediction.initialStake,
                    status: 'pending',  // Will need to be updated when prediction resolves
                    created_at: new Date().toISOString(),
                    agent_id: this.agent.id,
                    prediction_id: id,
                    confidence: prediction.confidence,
                    reasoning: prediction.reasoning,
                    result: 'pending',
                }
            }]);

            return id;
        } catch (error) {
            console.error('Failed to store prediction in Pinecone:', error);
            return '';
        }
    }
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