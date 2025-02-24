import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { getJson } from 'serpapi';
import { IAgentProfile, BetDecision, NewsItem, GroupedPredictions, Prediction, MarketData } from '../interface';
import { PineconeRecord } from '@pinecone-database/pinecone';
import axios from 'axios';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { GPT_MODELS } from '@/app/utils/const';
import { isAfter, subDays } from 'date-fns';

interface SimilarPredictionMetadata {
    description: string;
    choice: string;
    amount: number;
    result: string;
    created_at: string;
    [key: string]: string | number;
}

type PineconePredictionMatch = PineconeRecord<SimilarPredictionMetadata>;


interface PredictionAnalysis {
    id: number;
    shouldBet: boolean;
    recommendedChoice: string;
    confidence: number;
    reasoning: string;
    riskAssessment: string;
}

interface SerpFinanceResult {
    knowledge_graph?: {
        stock_price?: string;
        price_change?: string;
        volume?: string;
    };
    financial_results?: {
        price: string;
        change: string;
        volume: string;
    }[];
}

export class AutomaticBettingAgent {
    private agent: IAgentProfile;
    private openai: OpenAI;
    private agentai: OpenAI;
    private model: string;
    private pinecone: Pinecone;
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private newsCache: Map<string, NewsItem[]> = new Map();
    private COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY!;
    private COINMARKETCAP_BASE_URL = 'https://pro-api.coinmarketcap.com/v2';

    constructor(agent: IAgentProfile) {
        this.agent = agent;
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.agentai = new OpenAI({
            apiKey: process.env.AGENT_AI_API_KEY,
        });
        this.model = "o3-mini";
    }

    async initialize() {
        // Initialize any necessary resources or configurations
        const model = GPT_MODELS.find(m => m.key == this.agent.model);
        this.model = model?.model ?? "o3-mini";
        if (model?.type == "openai") {
            this.agentai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });
        } else if (model?.type == "deepseek") {
            this.agentai = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY!,
                baseURL: 'https://api.deepseek.com'
            });
        } else if (model?.type == "gemini") {
            this.agentai = new OpenAI({
                apiKey: process.env.GEMINI_API_KEY!,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
            });
        }

        await this.pinecone.createIndex({
            name: "google_engine",
            dimension: 1536,
            metric: 'cosine',
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
        });
    }

    async analyzePredictions(predictions: Prediction[]): Promise<BetDecision[]> {
        try {
            // Process predictions in smaller chunks
            const CHUNK_SIZE = 5;
            const allDecisions: BetDecision[] = [];

            // Process predictions in chunks
            for (let i = 0; i < predictions.length; i += CHUNK_SIZE) {
                const chunk = predictions.slice(i, i + CHUNK_SIZE);

                // Process this chunk
                const chunkResults = await this.processChunk(chunk);
                allDecisions.push(...chunkResults);

                // Add a small delay between chunks to prevent overload
                if (i + CHUNK_SIZE < predictions.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                console.log(`Processed ${i + CHUNK_SIZE} predictions`);
            }

            return allDecisions;
        } catch (error) {
            console.error('Error in batch prediction analysis:', error);
            return [];
        }
    }

    private async processChunk(predictions: Prediction[]): Promise<BetDecision[]> {
        const openPredictions = predictions.filter(p => p.user_id !== this.agent.user_id);
        const predictionSource = this.getPredictionSource();
        const categoryPredictions = openPredictions.filter(p => p.source === predictionSource);

        // Add market data enrichment if needed
        if (predictionSource === 'google_finance' || predictionSource === 'coinmarketcap') {
            await this.enrichPredictionsWithMarketData(categoryPredictions);
        }

        const interestingPredictions = (
            await Promise.all(
                categoryPredictions.map(async p => {
                    const { shouldBet, reasoning } = await this.isInterestingPredictionWithAI(p);
                    p.betReason = [];
                    if (reasoning) {
                        p.betReason.push({
                            step: "interesting",
                            reasoning: reasoning
                        });
                    }
                    return { prediction: p, shouldBet };
                })
            )
        ).filter(result => result.shouldBet)
            .map(result => result.prediction);

        if (interestingPredictions.length === 0) {
            return [];
        }

        const groupedPredictions = this.groupPredictionsByTopic(interestingPredictions);
        const decisions = await Promise.all(
            Object.entries(groupedPredictions).map(async ([, topicPredictions]) => {
                const news = await this.gatherRelevantNews(topicPredictions);
                const similarPredictions = await this.findSimilarPredictions(topicPredictions);
                const { decision } = await this.analyzeGroupWithGPT(
                    topicPredictions,
                    news,
                    similarPredictions
                );
                const updatedDecisions = await Promise.all(decision.map(async bet => {
                    const prediction = topicPredictions.find(p => p.id === bet.predictionId);
                    if (prediction) {
                        const pineconeId = await this.storeBetInPinecone(bet, prediction);
                        return { ...bet, pineconeId };
                    }
                    return bet;
                }));

                return updatedDecisions;
            })
        );

        return decisions.flat();
    }

    private isSportsCategory(): boolean {
        const sportsCategories = ['english premier league', 'soccer', 'nba', 'nfl'];

        return sportsCategories.some(category =>
            category == this.agent.category
        );
    }

    private async isInterestingPredictionWithAI(prediction: Prediction): Promise<{ shouldBet: boolean; reasoning: string | null }> {
        try {
            const prompt = `
            Analyze the prediction's relevance to the agent's interests:
    
            AGENT INTERESTS: ${this.agent.interests.map(interest => interest.toLowerCase()).join(', ')}
            AGENT CATEGORY: ${this.agent.category}
            PREDICTION: ${prediction.description}
            ${prediction.marketData ? `
            MARKET DATA:
            - Current Price: ${prediction.marketData.price}
            - 24h Change: ${prediction.marketData.change24h || prediction.marketData.change}%
            - Volume: ${prediction.marketData.volume24h || prediction.marketData.volume}
            ` : ''}
    
            Rules:
            - For markets/crypto predictions, consider current market data and trends
            - For sports predictions, only consider if they match agent's category
            - Consider both direct matches and indirect connections
            - Include related industries, topics, and potential impacts
            - ANY reasonable connection warrants a positive response
    
            Required format:
            YES: [1-2 sentence explanation]
            or
            NO: [1-2 sentence explanation]
            `;

            const response = await this.agentai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: "You are an inclusive analyst who looks for any possible connections between topics. Err on the side of finding relationships rather than dismissing them."
                    },
                    { role: "user", content: prompt }
                ],
            });

            const content = response.choices[0].message.content || '';
            const shouldBet = content.trim().toUpperCase().startsWith('YES:');
            const reasoning = content.substring(content.indexOf(':') + 1).trim();

            return {
                shouldBet,
                reasoning: reasoning || null
            };
        } catch (error) {
            console.error('Error in isInterestingPredictionWithAI:', error);
            return { shouldBet: false, reasoning: null };
        }
    }

    private groupPredictionsByTopic(predictions: Prediction[]): GroupedPredictions {
        const groups: GroupedPredictions = {};

        for (const prediction of predictions) {
            const topic = this.identifyTopic(prediction);
            if (!groups[topic]) {
                groups[topic] = [];
            }
            groups[topic].push(prediction);
        }

        return groups;
    }

    private async analyzeGroupWithGPT(
        predictions: Prediction[],
        news: NewsItem[],
        similarPredictions: PineconePredictionMatch[]
    ): Promise<{ decision: BetDecision[], relevantNews: NewsItem[], relevantSimilar: PineconePredictionMatch[] }> {
        const BATCH_SIZE = 3;
        const allDecisions: BetDecision[] = [];
        const allNews: NewsItem[] = [];
        const allSimilar: PineconePredictionMatch[] = [];
        const relevantTraining = await this.filterTrainingPredictions();

        for (let i = 0; i < predictions.length; i += BATCH_SIZE) {
            const batchPredictions = predictions.slice(i, i + BATCH_SIZE);

            // Get relevant news for this batch
            const relevantNews = this.filterRelevantNews(news, batchPredictions, 3);
            const relevantSimilar = this.filterSimilarPredictions(similarPredictions, batchPredictions, 5);

            // Add news analysis reason
            if (relevantNews.length > 0) {
                batchPredictions.forEach(prediction => {
                    prediction.betReason = prediction.betReason || [];
                    prediction.betReason.push({
                        step: "newsAnalysis",
                        reasoning: `Analyzed ${relevantNews.length} relevant news articles: ${relevantNews.map(n => n.title.substring(0, 50)).join('; ')
                            }`
                    });
                });
            }

            // Add similar predictions analysis
            if (relevantSimilar.length > 0) {
                batchPredictions.forEach(prediction => {
                    prediction.betReason = prediction.betReason || [];
                    prediction.betReason.push({
                        step: "similarPredictions",
                        reasoning: `Found ${relevantSimilar.length} similar predictions with ${relevantSimilar.filter(p => p.metadata?.result === 'win').length
                            } successful outcomes`
                    });
                });
            }

            allSimilar.push(...relevantSimilar);
            allNews.push(...relevantNews);

            const prompt = `Return ONLY valid JSON in this format:
{
     "predictions": [
        {
            "id": number,
            "recommendedChoice": "string (e.g., 'draw', team name, or available choice)",
            "confidence": number (0-1),
            "reasoning": "detailed explanation",
            "riskAssessment": "Low/Medium/High"
        }
    ]
}

Example:
{
    "predictions": [
        {
            "id": 123,
            "recommendedChoice": "Real Madrid",
            "confidence": 0.85,
            "reasoning": "Real Madrid has a strong track record against similar opponents.",
            "riskAssessment": "Low"
        }
    ]
}

Predictions to analyze:
${batchPredictions.map(p => {
                // Parse all bets to calculate odds
                const bets = p.agent_bets ? p.agent_bets.split(',').map(bet => {
                    const [, , amount, choice] = bet.split(':');
                    return { amount: Number(amount), choice };
                }) : [];

                const choices = p.choices ? JSON.parse(p.choices) : [];

                // Group and sum bets by choice
                const betsByChoice = bets.reduce((acc, bet) => {
                    acc[bet.choice] = (acc[bet.choice] || 0) + bet.amount;
                    return acc;
                }, {} as Record<string, number>);

                const totalAmount = Object.values(betsByChoice).reduce((sum, amount) => sum + amount, 0);

                // Calculate odds for each unique choice made by betters
                const oddsDisplay = totalAmount > 0
                    ? Object.entries(betsByChoice)
                        .map(([choice, amount]) => {
                            const percentage = (amount / totalAmount * 100).toFixed(1);
                            return `${choice}: ${percentage}%`;
                        })
                        .join(' vs ')
                    : p.source === "sportDB"
                        ? `${p.team_a}: 33.3% vs ${p.team_b}: 33.3% vs draw: 33.3%` // Default for sports
                        : `${choices.join(' vs ')}`; // Default for binary

                return `ID: ${p.id}
     Description: ${p.description}
     ${p.source === "sportDB" ? `Team A: ${p.team_a} Team B: ${p.team_b} Predicted Winner: ${p.predicted_outcome}` : `Creator Choice: ${p.creator_choice}`}
     Creator Betting Amount: ${p.bet_amount}
     Context: ${p.context || 'No context provided'}
     Market Odds: ${oddsDisplay}
     Available Choices: ${choices.join(', ')}
     Total Bet Amount: ${totalAmount}
     Existing Bets: ${p.agent_bets ? this.parseAgentBets(p.agent_bets)[this.agent.id] ?
                        `${this.parseAgentBets(p.agent_bets)[this.agent.id].amount} to ${this.parseAgentBets(p.agent_bets)[this.agent.id].choice}` :
                        'No bets made yet' : 'No bets made yet'}
    ${p.marketData ? `
        MARKET DATA:
        - Current Price: ${p.marketData.price}
        - 24h Change: ${p.marketData.change24h || p.marketData.change}%
        - Volume: ${p.marketData.volume24h || p.marketData.volume}
        ` : ''}`
            }).join('\n')}
Key News:
${relevantNews.map(n => `- ${n.title}`).join('\n')}

Similar History with Agent Comments:
${relevantSimilar.map(p => `
- Description: ${p.metadata?.description?.substring(0, 100) || 'N/A'}
- Choice: ${p.metadata?.choice || 'N/A'}
- Amount: ${p.metadata?.amount || 'N/A'}
- Result: ${p.metadata?.result || 'N/A'}
${p.metadata?.comment ? `- Agent Controller Comment: ${p.metadata.comment}` : ''}`
            ).join('\n')}

Agent Training Predictions:
${relevantTraining.map(p => `
- Question: ${p.description}
- Choice: ${p.creator_choice}
- Amount: ${p.bet_amount}
- Reasoning: ${p.betReason}`
            ).join('\n')}

Agent Principles:
- Betting Strategy:
  1. If no previous bet exists, make an initial bet with moderate confidence.
  2. If a previous bet exists:
     - Bet additional amounts only if odds are favorable.
     - Consider adjusting choice if odds have significantly changed.
- Consider risk/reward ratio based on current betting amounts.
- Adjust bet size based on odds discrepancy.
- User-defined Betting Principles:
${this.agent.principles}`;

            try {
                const completion = await this.agentai.chat.completions.create({
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are specialized in analyzing predictions and making betting decisions. You are a JSON-only response bot. Return only valid JSON."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    response_format: { type: 'json_object' }
                });
                const content = completion?.choices[0].message.content;
                const cleanContent = content
                    ? content
                        .replace(/```json\n?/g, '')  // Remove opening code block
                        .replace(/\n?```/g, '')      // Remove closing code block
                        .trim()
                    : '';

                const batchDecisions = this.parseAnalysisResponse(
                    cleanContent,
                    batchPredictions
                );

                allDecisions.push(...batchDecisions);

                // Add delay between batches
                if (i + BATCH_SIZE < predictions.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Error analyzing batch ${i / BATCH_SIZE + 1}:`, error);
            }
        }

        return { decision: allDecisions, relevantNews: allNews, relevantSimilar: allSimilar };
    }

    private async filterTrainingPredictions(): Promise<Prediction[]> {
        const index = this.pinecone.index("prediction-results");
        const indexList = this.agent.train_index ? this.agent.train_index.split(',') : [];
        if (indexList.length == 0) {
            return [];
        }

        try {
            // Use fetch operation instead of query
            const response = await index.fetch(indexList);

            // Transform the records into Predictions with metadata
            return Object.values(response.records).map(record => ({
                id: parseInt(record.id),
                user_id: this.agent.id,
                description: record.metadata?.description as string || '',
                source: '',
                status: 'resolved',
                bet_amount: record.metadata?.amount as number || 0,
                creator_choice: record.metadata?.choice as string || '',
                predicted_outcome: '',
                created_at: record.metadata?.created_at as string || new Date().toISOString(),
                resolution_date: '',
                outcome: '',
                reasoning: record.metadata?.reasoning as string || ''
            } as Prediction));

        } catch (error) {
            console.error('Error fetching from Pinecone:', error);
            return [];
        }
    }

    private filterSimilarPredictions(
        similar: PineconePredictionMatch[],
        predictions: Prediction[],
        limit: number
    ): PineconePredictionMatch[] {
        // Sort by relevance and recency
        return similar
            .sort((a, b) => {
                const scoreA = this.calculateRelevanceScore(a, predictions);
                const scoreB = this.calculateRelevanceScore(b, predictions);
                return scoreB - scoreA;
            })
            .slice(0, limit);
    }

    private calculateRelevanceScore(similar: PineconePredictionMatch, predictions: Prediction[]): number {
        let score = 0;
        const description = similar.metadata?.description?.toLowerCase() || '';

        predictions.forEach(prediction => {
            const keywords = this.extractKeywords(prediction.description);
            keywords.forEach(keyword => {
                if (description.includes(keyword.toLowerCase())) {
                    score += 1;
                }
            });
        });

        if (similar.metadata?.created_at) {
            const daysAgo = (Date.now() - new Date(similar.metadata.created_at).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - daysAgo) / 10; // Higher score for more recent predictions
        }

        return score;
    }

    private filterRelevantNews(
        news: NewsItem[],
        predictions: Prediction[],
        limit: number
    ): NewsItem[] {
        const keywords = predictions
            .map(p => this.extractKeywords(p.description))
            .flat();

        return news
            .filter(item =>
                keywords.some(keyword =>
                    item.title.toLowerCase().includes(keyword.toLowerCase())
                )
            )
            .slice(0, limit);
    }

    private parseAnalysisResponse(content: string, predictions: Prediction[]): BetDecision[] {
        try {
            const jsonStr = content.substring(
                content.indexOf('{'),
                content.lastIndexOf('}') + 1
            );
            const analysis = JSON.parse(jsonStr);

            if (!analysis?.predictions || !Array.isArray(analysis.predictions)) {
                console.error('Invalid analysis structure:', analysis);
                return [];
            }

            return analysis.predictions
                .filter((p: PredictionAnalysis) => {
                    const prediction = predictions.find(pred => pred.id === p.id);
                    const isValid =
                        typeof p.id === 'number' &&
                        typeof p.confidence === 'number' &&
                        p.confidence >= 0 && p.confidence <= 1;

                    if (!isValid) {
                        console.error('Invalid prediction format:', p);
                        return false;
                    }

                    const existingBet = prediction?.agent_bets ?
                        this.parseAgentBets(prediction.agent_bets)[this.agent.id] :
                        null;

                    if (existingBet && existingBet.betCount && existingBet.betCount >= 2) {
                        console.error(`Agent ${this.agent.id} has already bet twice on prediction ${p.id}`);
                        return false;
                    }

                    return isValid && p.confidence > 0;
                })
                .map((p: PredictionAnalysis) => {
                    const prediction = predictions.find(pred => pred.id === p.id);
                    if (prediction) {
                        prediction.betReason = prediction.betReason || [];
                        prediction.betReason.push({
                            step: "finalDecision",
                            reasoning: p.reasoning || 'No specific reasoning provided'
                        });
                    }

                    return {
                        predictionId: p.id,
                        agentId: this.agent.id,
                        betAmount: this.calculateBetAmount(p.confidence),
                        choice: p.recommendedChoice,
                        confidence: p.confidence,
                        reasoning: p.reasoning || 'No specific reasoning provided',
                        timestamp: new Date(),
                        riskAssessment: p.riskAssessment || 'Moderate risk',
                        userId: this.agent.user_id
                    };
                });
        } catch (error) {
            console.error('Error parsing analysis response:', error);
            return [];
        }
    }

    private extractKeywords(text: string): string[] {
        const words = text.toLowerCase().split(' ');
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        return words
            .filter(word => !stopWords.has(word))
            .slice(0, 5);
    }

    private async getNewsData(terms: string[]): Promise<NewsItem[]> {
        const newsData: NewsItem[] = [];
        const twentyFourHoursAgo = subDays(new Date(), 1);

        for (const interest of terms) {
            try {
                const result = await getJson({
                    engine: "google_news",
                    q: interest,
                    api_key: process.env.SERPAPI_API_KEY,
                    hl: "en"
                });

                if (result.news_results) {
                    for (const item of result.news_results) {
                        if (item.stories) {
                            for (const story of item.stories) {
                                const storyDate = this.parseCustomDateString(story.date);
                                if (storyDate && isAfter(storyDate, twentyFourHoursAgo)) {
                                    const newData = {
                                        title: story.title,
                                        link: story.link,
                                        date: storyDate.toISOString(),
                                        image: story.thumbnail
                                    }
                                    newsData.push(newData);
                                    try {
                                        await this.insertUniqueTitle(newData.title, newData.link, newData.date, newData.image, 'google_news');
                                    } catch (error) {
                                        console.log("error saving newData error:", error);
                                    }
                                }
                            }
                        } else {
                            const date = this.parseCustomDateString(item.date);
                            if (date && isAfter(date, twentyFourHoursAgo)) {
                                const newData = {
                                    title: item.title,
                                    link: item.link,
                                    date: date.toISOString(),
                                    image: item.thumbnail
                                }
                                newsData.push(newData);
                                try {
                                    await this.insertUniqueTitle(newData.title, newData.link, newData.date, newData.image, 'google_news');
                                } catch (error) {
                                    console.log("error saving newData", error);
                                }
                            }
                        }
                    }
                } else {
                    console.log("no news data found", result);
                }
            } catch (error) {
                console.log("error getting news data", error);
            }
        }
        return newsData;
    }

    private parseCustomDateString(dateString: string) {
        try {
            // Split the string into date and time components
            const [datePart, timePart] = dateString.split(', ');

            // Convert the date part to a format that the Date constructor can understand
            const [month, day, year] = datePart.split('/');
            const formattedDate = `${year}-${month}-${day}`;

            // Convert 12-hour time format to 24-hour format
            const [time, period] = timePart.split(' ');
            const timer = time.split(':');
            let hours = timer[0];
            const minutes = timer[1];
            if (period === 'PM' && hours !== '12') {
                hours = (parseInt(hours, 10) + 12).toString();
            } else if (period === 'AM' && hours === '12') {
                hours = '00';
            }

            const dateTimeString = `${formattedDate}T${hours}:${minutes}:00Z`;

            const date = new Date(dateTimeString);
            return date;
        } catch (error) {
            console.log("error parsing custom date string", error);
        }
    }

    private async gatherRelevantNews(predictions: Prediction[]): Promise<NewsItem[]> {
        try {
            const newsResults: NewsItem[] = [];
            const searchTermsSet = new Set<string>();

            // Extract key terms from all predictions in the group
            for (const prediction of predictions) {
                const terms = await this.extractKeyTerms(prediction.description);
                terms.forEach(term => searchTermsSet.add(term));
            }

            // Convert Set to Array for iteration
            const searchTerms = Array.from(searchTermsSet);

            // Use cached news if available
            const cacheKey = searchTerms.sort().join('|');
            if (this.newsCache.has(cacheKey)) {
                return this.newsCache.get(cacheKey)!;
            }

            // Gather news for each unique search term
            for (const term of searchTerms) {
                const newsData = await this.getNewsDataFromDB(term, 3);
                if (newsData.length > 0) {
                    newsResults.push(...newsData.map(item => item as unknown as NewsItem));
                } else {
                    console.log("No news found from DB for term:", term);
                    await this.getNewsData([term]);
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Remove duplicates
            const uniqueNews = this.removeDuplicateNews(newsResults);

            this.newsCache.set(cacheKey, uniqueNews);

            setTimeout(() => {
                this.newsCache.delete(cacheKey);
            }, 3600000);

            return uniqueNews;
        } catch (error) {
            console.error('Error gathering news:', error);
            return [];
        }
    }

    private removeDuplicateNews(news: NewsItem[]): NewsItem[] {
        const seen = new Map<string, NewsItem>();

        news.forEach(item => {
            const key = item.title?.toLowerCase() || '';
            if (!seen.has(key) ||
                new Date(item.date) > new Date(seen.get(key)!.date)) {
                seen.set(key, item);
            }
        });

        return Array.from(seen.values());
    }

    private async extractKeyTerms(text: string): Promise<string[]> {
        const prompt = `
        Extract 2-3 key search terms from this prediction:
        "${text}"
        
        Return ONLY a JSON array of strings without any additional text or explanation.
        Example: ["bitcoin price", "crypto market"]
        
        Rules:
        1. Make terms specific and relevant for news search
        2. Remove any dates or time references
        3. Focus on key entities and actions
        4. Keep terms between 2-4 words each`;

        try {
            const completion = await this.agentai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: `You are specialized in extracting key terms from predictions. 
                        You are a JSON-only response bot. 
                        Return only a valid JSON array of strings without any explanation or additional text.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            console.log("Key terms:", completion.choices[0].message.content);
            const content = completion.choices[0].message.content || '[]';
            // Extract JSON array if response contains any non-JSON text
            const jsonMatch = content.match(/\[.*\]/);
            const jsonStr = jsonMatch ? jsonMatch[0] : content;

            const terms = JSON.parse(jsonStr);
            return Array.isArray(terms) ? terms : [text];
        } catch (error) {
            console.error('Error extracting key terms:', error);
            return [text];
        }
    }

    private async getEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text
        });

        return response.data[0].embedding;
    }

    private calculateBetAmount(confidence: number): number {
        try {
            let baseAmount;

            if (confidence >= 0.8) {
                baseAmount = this.agent.aggressiveBetSize || 100;
            } else if (confidence >= 0.6) {
                baseAmount = this.agent.moderateBetSize || 50;
            } else {
                baseAmount = this.agent.conservativeBetSize || 25;
            }

            // Apply confidence multiplier
            const adjustedAmount = Math.floor(baseAmount * confidence);

            // Ensure within limits
            return Math.min(
                Math.max(adjustedAmount, this.agent.conservativeBetSize || 10),
                this.agent.maxBetSize || 1000
            );
        } catch (error) {
            console.error('Error calculating bet amount:', error);
            return this.agent.conservativeBetSize || 10;
        }
    }

    private identifyTopic(prediction: Prediction): string {
        const description = prediction.description.toLowerCase();

        // Map of topics to their keywords
        const topicKeywords: Record<string, string[]> = {
            'crypto': ['bitcoin', 'ethereum', 'crypto', 'blockchain'],
            'stocks': ['stock', 'market', 'nasdaq', 'dow'],
            'sports': ['game', 'match', 'team', 'player'],
            'politics': ['election', 'government', 'policy'],
            'technology': ['ai', 'tech', 'software', 'app']
        };

        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => description.includes(keyword))) {
                return topic;
            }
        }

        return 'general';
    }

    private parseAgentBets(agentBetsStr: string | null): Record<string, { id: number, amount: number, choice: string, betCount?: number }> {
        if (!agentBetsStr) return {};

        const result: Record<string, { id: number, amount: number, choice: string, betCount: number }> = {};
        const betsPerAgent: Record<string, number> = {};

        agentBetsStr.split(',').forEach(bet => {
            const [id, agentId, amount, choice] = bet.split(':');
            betsPerAgent[agentId] = (betsPerAgent[agentId] || 0) + 1;
            result[agentId] = {
                id: Number(id),
                amount: Number(amount),
                choice,
                betCount: betsPerAgent[agentId]
            };
        });
        return result;
    }

    private async findSimilarPredictions(predictions: Prediction[]): Promise<PineconePredictionMatch[]> {
        try {
            const descriptions = predictions.map(p => p.description).join(' ');
            const embedding = await this.getEmbedding(descriptions);
            const index = this.pinecone.Index('prediction-results');

            // Add category-based filtering
            const category = this.getPredictionSource();
            const queryResponse = await index.query({
                vector: embedding,
                topK: 5,
                includeMetadata: true,
                filter: {
                    status: { $eq: 'resolved' },
                    agentId: { $eq: this.agent.id },
                    category: { $eq: category }  // Add category filter
                }
            });

            // Additional relevance check
            const matches = queryResponse.matches as PineconePredictionMatch[];
            return matches.filter(match => {
                const description = match.metadata?.description?.toLowerCase() || '';
                // For crypto predictions, ensure they contain relevant terms
                if (category === 'coinmarketcap') {
                    return description.includes('bitcoin') ||
                        description.includes('crypto') ||
                        description.includes('btc') ||
                        description.includes('eth') ||
                        description.includes('cryptocurrency');
                }
                return true;
            });
        } catch (error) {
            console.error('Error finding similar predictions:', error);
            return [];
        }
    }

    private async storeBetInPinecone(bet: BetDecision, prediction: Prediction): Promise<string> {
        try {
            const description = prediction.description;
            const embedding = await this.getEmbedding(description);
            const index = this.pinecone.Index('prediction-results');
            const id = `bet-${bet.predictionId}-${bet.agentId}-${Date.now()}`;

            await index.upsert([{
                id: id,
                values: embedding,
                metadata: {
                    description: description,
                    choice: bet.choice,
                    amount: bet.betAmount,
                    status: 'pending',  // Will need to be updated when prediction resolves
                    created_at: new Date().toISOString(),
                    agentId: bet.agentId,
                    predictionId: bet.predictionId,
                    confidence: bet.confidence,
                    reasoning: bet.reasoning,
                    riskAssessment: bet.riskAssessment,
                    result: 'pending',
                    log: prediction.betReason ? JSON.stringify(prediction.betReason) : ""
                }
            }]);

            return id;
        } catch (error) {
            console.error('Error storing bet in Pinecone:', error);
            return '';
        }
    }

    private getPredictionSource(): string {
        const category = this.agent.category.toLowerCase();
        if (category === 'markets') return 'google_finance';
        if (category === 'crypto') return 'coinmarketcap';
        if (this.isSportsCategory()) return 'sportDB';
        return 'google_news';
    }

    private async enrichPredictionsWithMarketData(predictions: Prediction[]): Promise<void> {
        const source = this.getPredictionSource();

        for (const prediction of predictions) {
            try {
                let marketData: MarketData | null = null;

                if (source === 'coinmarketcap') {
                    marketData = await this.getCryptoMarketData(prediction);
                } else if (source === 'google_finance') {
                    marketData = await this.getStockMarketData(prediction);
                }

                if (marketData) {
                    prediction.marketData = marketData;
                    prediction.betReason = prediction.betReason || [];
                    prediction.betReason.push({
                        step: "marketData",
                        reasoning: `Current price: $${marketData.price.toFixed(2)}${marketData.change24h ? `, 24h change: ${marketData.change24h.toFixed(2)}%` : ''
                            }`
                    });
                }
            } catch (error) {
                console.error(`Error enriching prediction ${prediction.id} with market data:`, error);
            }

            // Add delay between API calls to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2s delay
        }
    }

    private async getCryptoMarketData(prediction: Prediction): Promise<MarketData | null> {
        try {
            const symbols = await this.getCryptoSymbols(prediction.description);
            if (!symbols) return null;

            // Using CoinMarketCap Basic plan endpoints
            const response = await axios.get(`${this.COINMARKETCAP_BASE_URL}/cryptocurrency/quotes/latest`, {
                headers: {
                    'X-CMC_PRO_API_KEY': this.COINMARKETCAP_API_KEY,
                },
                params: {
                    symbol: symbols,
                    convert: 'USD'
                }
            });

            // Safely access nested properties
            const cryptoData = response.data?.data?.[symbols[0]]?.[0] || response.data?.data?.[symbols[0]];
            if (!cryptoData?.quote?.USD) {
                console.error('Invalid data structure from CoinMarketCap:', cryptoData);
                return null;
            }

            return {
                symbol: symbols[0],
                price: cryptoData.quote.USD.price || 0,
                change24h: cryptoData.quote.USD.percent_change_24h || 0,
                volume24h: cryptoData.quote.USD.volume_24h || 0,
                lastUpdated: cryptoData.quote.USD.last_updated || new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching crypto market data:', error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('CoinMarketCap API error details:', {
                    status: error.response.status,
                    data: error.response.data
                });
            }
            return null;
        }
    }

    private async getCryptoSymbols(description: string): Promise<string[]> {
        try {
            const prompt = `Extract the crypto symbols which can use to search in coinmarketcap from the following prediction: ${description}`;

            const response = await this.agentai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: "You are a crypto expert. Extract only valid cryptocurrency symbols from the given prediction. Return them in a JSON object mapping symbols to their full names."
                    },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });

            const content = response.choices[0].message.content;

            if (!content) {
                console.warn('No content received from OpenAI');
                return [];
            }

            try {
                // Parse the JSON response
                const parsedResponse = JSON.parse(content);

                // Extract keys (symbols) from the object
                const symbols = Object.keys(parsedResponse);

                // Validate and clean symbols
                return symbols
                    .filter(symbol =>
                        typeof symbol === 'string' &&
                        symbol.length > 0 &&
                        symbol.length <= 10 &&
                        // Additional validation if needed
                        /^[A-Za-z0-9]+$/.test(symbol) // Only allow alphanumeric symbols
                    )
                    .map(symbol => symbol.toUpperCase().trim());

            } catch (parseError) {
                console.error('Failed to parse OpenAI response:', parseError);
                return [];
            }
        } catch (error) {
            console.error('Error in getCryptoSymbols:', error);
            return [];
        }
    }

    private async getStockMarketData(prediction: Prediction): Promise<MarketData | null> {
        try {
            const symbol = this.extractStockSymbol(prediction.description);
            if (!symbol) return null;

            const result = await getJson({
                engine: "google_finance",
                q: symbol,
                api_key: this.SERPAPI_API_KEY
            }) as SerpFinanceResult;

            // Try to get data from knowledge graph first, then fall back to financial results
            let price: number = 0;
            let change: number = 0;
            let volume: string = '';

            if (result.knowledge_graph) {
                price = parseFloat(result.knowledge_graph.stock_price?.replace(/[^0-9.-]/g, '') || '0');
                change = parseFloat(result.knowledge_graph.price_change?.replace(/[^0-9.-]/g, '') || '0');
                volume = result.knowledge_graph.volume || '';
            } else if (result.financial_results?.[0]) {
                price = parseFloat(result.financial_results[0].price.replace(/[^0-9.-]/g, '') || '0');
                change = parseFloat(result.financial_results[0].change.replace(/[^0-9.-]/g, '') || '0');
                volume = result.financial_results[0].volume || '';
            }

            if (!price) return null;

            return {
                symbol,
                price,
                change24h: change,
                volume24h: parseFloat(volume.replace(/[^0-9.-]/g, '') || '0'),
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching stock market data:', error);
            return null;
        }
    }

    private extractCryptoSymbol(description: string): string | null {
        // Improved crypto symbol extraction
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

    private extractStockSymbol(description: string): string | null {
        // Improved stock symbol extraction
        const patterns = [
            /\$([A-Z]{1,5})\b/, // $AAPL
            /\(([A-Z]{1,5})\)/, // (AAPL)
            /\b([A-Z]{1,5})\s+(?:stock|share)/i, // AAPL stock
            /\b([A-Z]{1,5})\b(?=.*(?:price|market|trading|nasdaq|nyse))/i // AAPL ... price/market/etc
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    public async handleUserQuestion(question: string): Promise<ChatCompletionMessageParam[]> {
        try {
            const intent = await this.detectQuestionIntent(question);
            let relevantSummaries = "";
            const index = this.pinecone.Index('prediction-results');
            if (intent === 'training') {
                const train_index = this.agent.train_index ? this.agent.train_index.split(',') : [];
                const pineconeResponse = await index.fetch(train_index);
                if (pineconeResponse.records) {
                    relevantSummaries = Object.values(pineconeResponse.records).map(record => {
                        const meta = record.metadata || {};
                        return `- Description: ${meta.description || "N/A"} | Choice: ${meta.choice} | Reasoning: ${meta.reasoning}`;
                    }).join("\n");
                } else {
                    relevantSummaries = "No training data found.";
                }

            } else {
                // 1) Create embeddings for the question
                const embeddingResponse = await this.openai.embeddings.create({
                    model: "text-embedding-ada-002",
                    input: question
                });
                const questionEmbedding = embeddingResponse.data[0].embedding;

                const pineconeResponse = await index.query({
                    vector: questionEmbedding,
                    topK: 5,
                    includeMetadata: true,
                    filter: {
                        agentId: { $eq: this.agent.id }
                    }
                });

                // 3) Summarize the relevant results
                if (pineconeResponse.matches && pineconeResponse.matches.length > 0) {
                    relevantSummaries = pineconeResponse.matches
                        .map((match) => {
                            const meta = match.metadata || {};
                            // Feel free to refine these strings to be more descriptive
                            return `- Description: ${meta.description || "N/A"} | Choice: ${meta.choice} | Result: ${meta.result}`;
                        })
                        .join("\n");
                } else {
                    relevantSummaries = "No similar prior predictions or bets found.";
                }
            }

            const systemPrompt = `
                You are a specialized betting agent with the following details:
                Name: ${this.agent.name}
                Category: ${this.agent.category}
                Risk Level: ${this.agent.riskLevel}
                Principles: ${this.agent.principles}

                Your job is to help the user understand your predictions and bets.

                Always look in the Pinecone index for prior bets and predictions or any other relevant information.
                
                If referencing prior bets, highlight how risk strategy or prior results inform your answer.

                Here are some of your relevant prior results from Pinecone:
                ${relevantSummaries}
            `;

            const messages = [
                { role: "system" as const, content: systemPrompt },
                { role: "user" as const, content: `User question: ${question}` }
            ];

            return messages as ChatCompletionMessageParam[];
        } catch (error) {
            console.error("Error in handleUserQuestion:", error);
            throw new Error("Error in handleUserQuestion");
        }
    }

    private async detectQuestionIntent(question: string): Promise<'training' | 'general'> {
        const prompt = `
        Analyze if this question is asking about training data/examples or is a general question.
        Question: "${question}"

        Return ONLY one of these exact words:
        - "training" - if asking about training data, training examples, learning process, or how the agent was trained
        - "general" - for any other type of question

        Examples:
        "What did you learn from your training?" -> "training"
        "Can you show me your training examples?" -> "training"
        "How were you trained?" -> "training"
        "What's your prediction for Bitcoin?" -> "general"
        "Why did you make that bet?" -> "general"
        `;

        try {
            const response = await this.agentai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: "You are a classifier that only responds with one word: either 'training' or 'general'" },
                    { role: "user", content: prompt }
                ],
            });

            const intent = response.choices[0].message.content?.toLowerCase();
            return intent === 'training' ? 'training' : 'general';
        } catch (error) {
            console.error('Error detecting question intent:', error);
            return 'general'; // Default to general on error
        }
    }

    private async insertUniqueTitle(title: string, link: string, date: string, image: string, engine: string) {
        try {
            const index = this.pinecone.Index('google_engine');
            const existing = await index.query({
                vector: await this.getEmbedding(title),
                topK: 1,
                includeMetadata: true
            });

            if (
                existing.matches &&
                existing.matches.length > 0 &&
                existing.matches[0].score &&
                existing.matches[0].score > 0.9
            ) {
                console.log(`Title "${title}" already exists in Pinecone. Skipping insertion.`);
                return;
            }

            const vector = await this.getEmbedding(title);

            await index.upsert([{
                id: title, // Use a unique identifier
                values: vector,
                metadata: { title, link, date, image, engine }
            }]);

            console.log(`Title "${title}" inserted successfully into Pinecone.`);
        } catch (error) {
            console.error('Error inserting title into Pinecone:', error);
        }
    }

    private async getNewsDataFromDB(interest: string, limit = 5) {
        try {
            const index = this.pinecone.Index('google_engine');
            const interestVector = await this.getEmbedding(interest);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const queryResponse = await index.query({
                vector: interestVector,
                topK: limit,
                includeMetadata: true,
                filter: {
                    engine: 'google_news',
                    date: {
                        $gt: twentyFourHoursAgo
                    }
                }
            });

            return queryResponse.matches.map(match => match.metadata);
        } catch (error) {
            console.error('Error fetching news data from Pinecone:', error);
            throw error;
        }
    }
}

export async function automaticBettingOnList(agent: unknown, predictions: Prediction[]): Promise<BetDecision[]> {
    const betAgent = new AutomaticBettingAgent(agent as IAgentProfile);
    await betAgent.initialize();
    return betAgent.analyzePredictions(predictions);
}
