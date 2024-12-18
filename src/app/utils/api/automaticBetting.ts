// src/utils/AutomaticBettingAgent.ts
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { getJson } from 'serpapi';
import { IAgentProfile, Prediction, BetDecision, NewsItem, GroupedPredictions } from '../interface';
import { PineconeRecord } from '@pinecone-database/pinecone';

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
    recommendedChoice: 'Yes' | 'No';
    confidence: number;
    reasoning: string;
    riskAssessment: string;
}

export class AutomaticBettingAgent {
    private agent: IAgentProfile;
    private openai: OpenAI;
    private pinecone: Pinecone;
    private SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
    private newsCache: Map<string, NewsItem[]> = new Map();

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
            const openPredictions = predictions.filter(p => p.creator_id !== this.agent.user_id);
            const isSportsCategory = this.isSportsCategory();
            const categoryPredictions = openPredictions.filter(p => isSportsCategory ? p.source == "sportDB" : p.source == "google_news");
            const interestingPredictions = categoryPredictions.filter(p =>
                this.isInterestingPredictionWithAI(p)
            );

            if (interestingPredictions.length === 0) {
                console.log('No interesting predictions found');
                return [];
            }

            const groupedPredictions = this.groupPredictionsByTopic(interestingPredictions);

            const betDecisionsPromises = Object.entries(groupedPredictions)
                .map(async ([topic, topicPredictions]) => {
                    console.log("Topic: ", topic);
                    // Pass predictions instead of topic string
                    const news = await this.gatherRelevantNews(topicPredictions);
                    const similarPredictions = await this.findSimilarPredictions(topicPredictions);
                    return this.analyzeGroupWithGPT(topicPredictions, news, similarPredictions);
                });

            const groupResults = await Promise.all(betDecisionsPromises);
            return this.validateAndAdjustBets(groupResults.flat());
        } catch (error) {
            console.error('Error in batch prediction analysis:', error);
            return [];
        }
    }

    private isSportsCategory(): boolean {
        const sportsCategories = ['premierleague', 'soccer', 'nba', 'nfl'];

        return sportsCategories.some(category =>
            category == this.agent.category
        );
    }

    private async isInterestingPredictionWithAI(prediction: Prediction): Promise<boolean> {
        const description = prediction.description.toLowerCase();
        const prompt = `
        This is the agents interests:
        ${this.agent.interests.map(interest => interest.toLowerCase()).join(', ')}
        Determine if this prediction is interesting for a betting agent based on the agents interests:
        ${description}
        `;
        const response = await this.openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
        });
        return response.choices[0].message.content?.toLowerCase().includes('yes') || false;
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

    private async findSimilarPredictions(predictions: Prediction[]): Promise<PineconePredictionMatch[]> {
        try {
            const descriptions = predictions.map(p => p.description).join(' ');
            const embedding = await this.getEmbedding(descriptions);
            const index = this.pinecone.Index('prediction-results');

            const queryResponse = await index.query({
                vector: embedding,
                topK: 5,
                includeMetadata: true,
                filter: {
                    status: { $eq: 'resolved' },
                    agent_id: { $eq: this.agent.id }  // Add filter for agent's predictions
                }
            });

            console.log("Similar predictions found: ", queryResponse.matches);

            return queryResponse.matches as PineconePredictionMatch[];
        } catch (error) {
            console.error('Error finding similar predictions:', error);
            return [];
        }
    }

    private async analyzeGroupWithGPT(
        predictions: Prediction[],
        news: NewsItem[],
        similarPredictions: PineconePredictionMatch[]
    ): Promise<BetDecision[]> {
        // Process predictions in smaller batches
        const BATCH_SIZE = 3;
        const allDecisions: BetDecision[] = [];

        for (let i = 0; i < predictions.length; i += BATCH_SIZE) {
            const batchPredictions = predictions.slice(i, i + BATCH_SIZE);

            // Limit news items per batch
            const relevantNews = this.filterRelevantNews(news, batchPredictions, 3);

            // Limit similar predictions
            const relevantSimilar = this.filterSimilarPredictions(similarPredictions, batchPredictions, 2);

            const prompt = `Return ONLY valid JSON in this format:
    {
        "predictions": [
            {
                "id": number,
                "shouldBet": boolean,
                "recommendedChoice": "Yes" or "No",
                "confidence": number (0-1),
                "reasoning": "brief explanation",
                "riskAssessment": "Low/Medium/High"
            }
        ]
    }
    
    Predictions to analyze:
    ${batchPredictions.map(p =>
                `ID: ${p.id}
         Description: ${p.description}
         Creator Choice: ${p.source == "sportDB" ? p.predicted_outcome : p.creator_choice}
         Creator Betting Amount: ${p.bet_amount}
         Match Total Bet Amount: ${p.match_total_amount}
         Not Match Total Bet Amount: ${p.not_match_total_amount}
         You Are Already Bet: ${p.agent_bets ? this.parseAgentBets(p.agent_bets)[this.agent.id] ? `${this.parseAgentBets(p.agent_bets)[this.agent.id].amount} to ${this.parseAgentBets(p.agent_bets)[this.agent.id].choice}` : 'No bets made yet' : 'No bets made yet'}`
            ).join('\n')}
    
    Key News:
    ${relevantNews.map(n => `- ${n.title}`).join('\n')}
    
    Similar History:
    ${relevantSimilar.map(p =>
                `- Description: ${p.metadata?.description?.substring(0, 100) || 'N/A'}
                - Choice: ${p.metadata?.choice || 'N/A'}
                - Amount: ${p.metadata?.amount || 'N/A'}
                - Result: ${p.metadata?.result || 'N/A'}`
            ).join('\n')}
    
    Agent Principles:
    - Betting Strategy:
  1. If no previous bet exists, make initial bet with small amount
  2. If previous bet exists:
     - Only bet additional amount if odds are favorable
     - Ensure total bet doesn't exceed maximum limit
     - Consider adjusting choice if odds significantly changed
- Consider risk/reward ratio based on current betting amounts
- Adjust bet size based on odds discrepancy
    ${this.agent.principles
                    .slice(0, 3)
                    .map(p => `- ${p.title}: ${p.description}`)
                    .join('\n')}`;

            console.log("Prompt: ", prompt);

            try {
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4",
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

        return allDecisions;
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
                    const isValid =
                        typeof p.id === 'number' &&
                        typeof p.shouldBet === 'boolean' &&
                        (p.recommendedChoice === 'Yes' || p.recommendedChoice === 'No') &&
                        typeof p.confidence === 'number' &&
                        p.confidence >= 0 && p.confidence <= 1;

                    if (!isValid) {
                        console.error('Invalid prediction format:', p);
                    }

                    const prediction = predictions.find(pred => pred.id === p.id);
                    const existingBet = prediction?.agent_bets ?
                        this.parseAgentBets(prediction.agent_bets)[this.agent.id] :
                        null;

                    // Validate bet amount doesn't exceed remaining limit
                    if (existingBet) {
                        const totalBetAmount = existingBet.amount + this.calculateBetAmount(p.confidence);
                        if (totalBetAmount > this.agent.maxBetSize) {
                            console.error(`Total bet amount ${totalBetAmount} exceeds max limit ${this.agent.maxBetSize}`);
                            return false;
                        }
                    }

                    return isValid && p.shouldBet && p.confidence > 0;
                })
                .map((p: PredictionAnalysis) => ({
                    predictionId: p.id,
                    agentId: this.agent.id,
                    betAmount: this.calculateBetAmount(p.confidence),
                    choice: p.recommendedChoice as 'Yes' | 'No',
                    confidence: p.confidence,
                    reasoning: p.reasoning || 'No specific reasoning provided',
                    timestamp: new Date(),
                    riskAssessment: p.riskAssessment || 'Moderate risk',
                    userId: this.agent.user_id
                }));
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
        
        Return only the terms as a JSON array of strings.
        Example: ["bitcoin price", "crypto market"]
        
        Rules:
        1. Make terms specific and relevant for news search
        2. Remove any dates or time references
        3. Focus on key entities and actions
        4. Keep terms between 2-4 words each`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "Extract key search terms for news gathering. Return only JSON array."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3
            });

            const terms = JSON.parse(completion.choices[0].message.content!);
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

    private async analyzeWithGPT(
        prediction: Prediction,
        news: NewsItem[],
        similarPredictions: PineconePredictionMatch[]
    ): Promise<{
        shouldBet: boolean;
        recommendedChoice: 'Yes' | 'No';
        confidence: number;
        reasoning: string;
        riskAssessment: string;
    }> {
        const prompt = `
        Analyze this prediction based on available data:
        
        Prediction: ${prediction.description}
        Creator's Choice: ${prediction.creator_choice}
        Bet Amount: ${prediction.bet_amount}
        
        Recent News:
        ${news.map(n => `- ${n.title}: ${n.snippet}`).join('\n')}
        
        Similar Past Predictions:
        ${similarPredictions.map(p =>
            `- ${p.metadata?.description} (Result: ${p.metadata?.result})`
        ).join('\n')}
        
        Agent's Principles:
        ${this.agent.principles.map(p =>
            `- ${p.title}: ${p.description}`
        ).join('\n')}
        
        Provide analysis in this JSON format:
        {
            "shouldBet": boolean,
            "recommendedChoice": "Yes" or "No",
            "confidence": number (0-1),
            "reasoning": "string",
            "riskAssessment": "string"
        }`;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are an AI specialized in analyzing predictions and making betting decisions."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3
        });

        return JSON.parse(completion.choices[0].message.content!);
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

    private validateAndAdjustBets(decisions: BetDecision[]): BetDecision[] {
        const totalBetAmount = decisions.reduce((sum, d) => sum + d.betAmount, 0);
        const maxTotalBet = this.agent.maxBetSize * 2; // Adjust this multiplier as needed

        if (totalBetAmount > maxTotalBet) {
            const ratio = maxTotalBet / totalBetAmount;
            return decisions.map(decision => ({
                ...decision,
                betAmount: Math.floor(decision.betAmount * ratio)
            }));
        }

        return decisions;
    }

    private parseAgentBets(agentBetsStr: string | null): Record<string, { amount: number, choice: string }> {
        if (!agentBetsStr) return {};

        const result: Record<string, { amount: number, choice: string }> = {};
        agentBetsStr.split(',').forEach(bet => {
            const [agentId, amount, choice] = bet.split(':');
            result[agentId] = { amount: Number(amount), choice };
        });
        return result;
    }
}

export async function automaticBettingOnList(agent: IAgentProfile, predictions: Prediction[]): Promise<BetDecision[]> {
    const betAgent = new AutomaticBettingAgent(agent);
    await betAgent.initialize();
    return betAgent.analyzePredictions(predictions);
}
