import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { getJson } from 'serpapi';
import { IAgentProfile, BetDecision, NewsItem, GroupedPredictions, Prediction, MarketData } from '../interface';
import { PineconeRecord } from '@pinecone-database/pinecone';
import axios from 'axios';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';

interface SimilarPredictionMetadata {
    description: string;
    choice: string;
    amount: number;
    result: string;
    created_at: string;
    [key: string]: string | number;
}

type PineconePredictionMatch = PineconeRecord<SimilarPredictionMetadata>;

interface NewsSearchResult {
    news_results: {
        title: string;
        link: string;
        snippet: string;
        source: string;
        date: string;
    }[];
}

interface SerpApiNewsResult {
    title: string;
    link: string;
    snippet: string;
    source: string;
    date: string;
}

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
    private pinecone: Pinecone;
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private newsCache: Map<string, NewsItem[]> = new Map();
    private COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY!;
    private COINMARKETCAP_BASE_URL = 'https://pro-api.coinmarketcap.com/v2';

    constructor(agent: IAgentProfile) {
        this.agent = agent;
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });
    }

    async initialize() {
        // Initialize any necessary resources or configurations
        console.log('AutomaticBettingAgent initialized');
        // await this.pinecone.createIndex({
        //     name: 'prediction-results',
        //     dimension: 1536,
        //     metric: 'cosine',
        //     spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
        // });
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
            }
            
            return allDecisions;
        } catch (error) {
            console.error('Error in batch prediction analysis:', error);
            return [];
        }
    }

    private async processChunk(predictions: Prediction[]): Promise<BetDecision[]> {
        const openPredictions = predictions.filter(p => p.creator_id !== this.agent.user_id);
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
                
                // Store each bet decision in Pinecone and update with pineconeId
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
        
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are an inclusive analyst who looks for any possible connections between topics. Err on the side of finding relationships rather than dismissing them."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.4  // Slightly higher temperature to allow for more creative connections
        });

        const content = response.choices[0].message.content || '';
        const shouldBet = content.trim().toUpperCase().startsWith('YES:');
        const reasoning = content.substring(content.indexOf(':') + 1).trim();
        console.log("interesting ai:", prediction.id, ": bet:", shouldBet, ": reason:", reasoning);

        return {
            shouldBet,
            reasoning: reasoning || null
        };
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

        for (let i = 0; i < predictions.length; i += BATCH_SIZE) {
            const batchPredictions = predictions.slice(i, i + BATCH_SIZE);
            
            // Get relevant news for this batch
            const relevantNews = this.filterRelevantNews(news, batchPredictions, 3);
            const relevantSimilar = this.filterSimilarPredictions(similarPredictions, batchPredictions, 2);

            // Add news analysis reason
            if (relevantNews.length > 0) {
                batchPredictions.forEach(prediction => {
                    prediction.betReason = prediction.betReason || [];
                    prediction.betReason.push({
                        step: "newsAnalysis",
                        reasoning: `Analyzed ${relevantNews.length} relevant news articles: ${
                            relevantNews.map(n => n.title.substring(0, 50)).join('; ')
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
                        reasoning: `Found ${relevantSimilar.length} similar predictions with ${
                            relevantSimilar.filter(p => p.metadata?.result === 'win').length
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
            "shouldBet": boolean,
            "recommendedChoice": "string (for sports: use 'draw' or exact team name from team_a or team_b, for others: 'Yes' or 'No')",
            "confidence": number (0-1),
            "reasoning": "detailed explanation",
            "riskAssessment": "Low/Medium/High"
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
            : `${p.creator_choice}: 50.0% vs No: 50.0%`; // Default for binary

    return `ID: ${p.id}
     Description: ${p.description}
     ${p.source === "sportDB" ? 
        `Team A: ${p.team_a}
     Team B: ${p.team_b}
     Predicted Winner: ${p.predicted_outcome}` :
        `Creator Choice: ${p.creator_choice}`}
     Creator Betting Amount: ${p.bet_amount}
     Market Odds: ${oddsDisplay}
     Total Bet Amount: ${totalAmount}
     You Are Already Bet: ${p.agent_bets ? this.parseAgentBets(p.agent_bets)[this.agent.id] ? 
        `${this.parseAgentBets(p.agent_bets)[this.agent.id].amount} to ${this.parseAgentBets(p.agent_bets)[this.agent.id].choice}` : 
        'No bets made yet' : 'No bets made yet'}`
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
    
    Agent Principles:
    - Betting Strategy:
  1. If no your previous bet exists, make initial bet with a bit confidence for making odds
  2. If your previous bet exists:
     - Only bet additional amount if odds are favorable
     - Consider adjusting choice if odds significantly changed
- Consider risk/reward ratio based on current betting amounts
- Adjust bet size based on odds discrepancy
    ${this.agent.principles
                    .slice(0, 3)
                    .map(p => `- ${p.title}: ${p.description}`)
                    .join('\n')}`;

            try {
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: "You are a JSON-only response bot. Return only valid JSON."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.3
                });

                const batchDecisions = this.parseAnalysisResponse(
                    completion.choices[0].message.content!,
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

        // Consider recency if timestamp available
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
                        typeof p.shouldBet === 'boolean' &&
                        typeof p.confidence === 'number' &&
                        p.confidence >= 0 && p.confidence <= 1;

                    if (!isValid) {
                        console.error('Invalid prediction format:', p);
                        return false;
                    }

                    const existingBet = prediction?.agent_bets ?
                        this.parseAgentBets(prediction.agent_bets)[this.agent.id] :
                        null;

                    // Check if agent has already bet twice
                    if (existingBet && existingBet.betCount && existingBet.betCount >= 2) {
                        console.log(`Agent ${this.agent.id} has already bet twice on prediction ${p.id}`);
                        return false;
                    }

                    return isValid && p.shouldBet && p.confidence > 0;
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
                const result = await getJson({
                    engine: "google_news",
                    q: term,
                    api_key: this.SERPAPI_API_KEY,
                    time: "1d",
                    num: 3
                }) as NewsSearchResult;

                if (result.news_results) {
                    const news: NewsItem[] = result.news_results.map((item: SerpApiNewsResult) => ({
                        title: item.title,
                        link: item.link,
                        snippet: item.snippet,
                        source: item.source,
                        date: item.date
                    }));
                    newsResults.push(...news);
                }

                // Add delay to respect API rate limits
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Remove duplicates
            const uniqueNews = this.removeDuplicateNews(newsResults);

            // Cache the results
            this.newsCache.set(cacheKey, uniqueNews);

            // Set cache expiration (1 hour)
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
            const key = item.title.toLowerCase();
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
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a JSON-only response bot. Return only a valid JSON array of strings without any explanation or additional text."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3
            });

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
                    agent_id: { $eq: this.agent.id },
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
            console.log("bet", prediction.betReason);

            await index.upsert([{
                id: id,
                values: embedding,
                metadata: {
                    description: description,
                    choice: bet.choice,
                    amount: bet.betAmount,
                    status: 'pending',  // Will need to be updated when prediction resolves
                    created_at: new Date().toISOString(),
                    agent_id: bet.agentId,
                    prediction_id: bet.predictionId,
                    confidence: bet.confidence,
                    reasoning: bet.reasoning,
                    risk_assessment: bet.riskAssessment,
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
                        reasoning: `Current price: $${marketData.price.toFixed(2)}${
                            marketData.change24h ? `, 24h change: ${marketData.change24h.toFixed(2)}%` : ''
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
            const symbol = this.extractCryptoSymbol(prediction.description);
            if (!symbol) return null;

            // Using CoinMarketCap Basic plan endpoints
            const response = await axios.get(`${this.COINMARKETCAP_BASE_URL}/cryptocurrency/quotes/latest`, {
                headers: {
                    'X-CMC_PRO_API_KEY': this.COINMARKETCAP_API_KEY,
                },
                params: {
                    symbol: symbol,
                    convert: 'USD'
                }
            });
            
            // Safely access nested properties
            const cryptoData = response.data?.data?.[symbol]?.[0] || response.data?.data?.[symbol];
            if (!cryptoData?.quote?.USD) {
                console.error('Invalid data structure from CoinMarketCap:', cryptoData);
                return null;
            }

            return {
                symbol,
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

    private extractStockSymbol(description: string): string | null {
        // Improved stock symbol extraction
        // Look for common patterns: $AAPL, (AAPL), AAPL stock, etc.
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

    public async handleUserQuestion(question: string): Promise<string> {
        try {
            // 1) Create embeddings for the question
            const embeddingResponse = await this.openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: question
            });
            const questionEmbedding = embeddingResponse.data[0].embedding;

            // 2) Perform a real Pinecone query to find relevant prior predictions/bets
            //    The actual filter or topK can be adjusted to suit your domain logic
            const index = this.pinecone.Index('prediction-results');
            const pineconeResponse = await index.query({
                vector: questionEmbedding,
                topK: 5,
                includeMetadata: true,
                filter: {
                    agent_id: { $eq: this.agent.id }
                }
            });

            // 3) Summarize the relevant results
            let relevantSummaries = "";
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

            // 4) Build your system prompt with the agent’s context,
            //    explicitly telling the model how to respond about its name.
            const systemPrompt = `
                You are a specialized betting agent with the following details:
                Name: ${this.agent.name}

                Category: ${this.agent.category}
                Risk Level: ${this.agent.riskLevel}
                Principles: ${this.agent.principles.map((p) => p.title).join(", ")}
                
                If the user asks who you are or your name, respond: "I am ${this.agent.name}."
                If referencing prior bets, highlight how risk strategy or prior results inform your answer.

                Here are some of your relevant prior results from Pinecone:
                ${relevantSummaries}
            `;

            const messages = [
                { role: "system" as const, content: systemPrompt },
                { role: "user" as const, content: `User question: ${question}` }
            ];

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: messages as ChatCompletionMessageParam[],
                temperature: 0.4
            });

            return response.choices[0].message.content?.trim() 
                || "No detailed answer available.";
        } catch (error) {
            console.error("Error in handleUserQuestion:", error);
            return "An error occurred while processing your question. Please try again.";
        }
    }
}

export async function automaticBettingOnList(agent: unknown, predictions: Prediction[]): Promise<BetDecision[]> {
    const betAgent = new AutomaticBettingAgent(agent as IAgentProfile);
    await betAgent.initialize();
    return betAgent.analyzePredictions(predictions);
}
