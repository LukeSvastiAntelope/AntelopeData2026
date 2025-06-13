import { IBet, IAgentProfile, NewsItem } from "@/app/utils/interface";
import { UserRepo } from "@/app/utils/database/user-repo";
import { AutomaticBettingAgent } from "./automaticBetting";
import { executePositionAdjustments, AdjustmentSummary } from "./positionAdjustment";
import { DailyOddsTracker, processDailyOddsForAllPredictions } from "./dailyOddsTracker";

export interface BetAnalysisResult {
    betId: number;
    predictionId: number;
    originalConfidence: number;
    currentConfidence: number;
    confidenceChange: number;
    shouldAdjustPosition: boolean;
    recommendedAction: 'increase' | 'decrease' | 'hold' | 'hedge';
    newInformation: NewsItem[];
    reasoning: string;
    riskAssessment: string;
}

export interface PositionAdjustment {
    betId: number;
    action: 'increase' | 'decrease' | 'hold' | 'hedge';
    amount: number;
    newChoice?: string;
    reasoning: string;
}

export class DailyBetMonitor {
    private agent: IAgentProfile;
    private bettingAgent: AutomaticBettingAgent;

    constructor(agent: IAgentProfile) {
        this.agent = agent;
        this.bettingAgent = new AutomaticBettingAgent(agent);
    }

    async initialize(): Promise<void> {
        await this.bettingAgent.initialize();
    }

    /**
     * Analyze all active bets for the agent
     */
    async analyzeActiveBets(): Promise<BetAnalysisResult[]> {
        try {
            console.log(`🔍 Starting daily analysis for agent ${this.agent.id}`);
            
            // Get all active bets for this agent
            const activeBets = await this.getActiveBets();
            console.log(`📊 Found ${activeBets.length} active bets to analyze`);

            if (activeBets.length === 0) {
                return [];
            }

            const analysisResults: BetAnalysisResult[] = [];

            // Analyze each bet individually
            for (const bet of activeBets) {
                try {
                    const analysis = await this.analyzeSingleBet(bet);
                    analysisResults.push(analysis);
                    
                    // Add small delay to avoid overwhelming APIs
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Error analyzing bet ${bet.id}:`, error);
                }
            }

            return analysisResults;
        } catch (error) {
            console.error('Error in analyzeActiveBets:', error);
            return [];
        }
    }

    /**
     * Get all active bets for the agent (bets on unresolved predictions)
     */
    private async getActiveBets(): Promise<any[]> {
        try {
            // Get bet history for the agent (limit to last 50 for performance)
            const bets = await UserRepo.getBetHistoryByAgentId(this.agent.id, 50, 0);
            
            // Filter for active bets (predictions that are still open)
            const activeBets = bets.filter(bet => 
                bet.prediction?.status === 'open' && 
                bet.prediction?.outcome === null
            );

            // Limit to last 10 active bets for testing/performance
            return activeBets.slice(0, 10);
        } catch (error) {
            console.error('Error getting active bets:', error);
            return [];
        }
    }

    /**
     * Analyze a single bet to determine if position adjustment is needed
     */
    private async analyzeSingleBet(bet: any): Promise<BetAnalysisResult> {
        console.log(`🔍 Analyzing bet ${bet.id} on prediction: ${bet.prediction?.description?.substring(0, 100)}...`);

        try {
            // Gather new information since the bet was placed
            const newInformation = await this.gatherNewInformation(bet);
            
            // Re-analyze the prediction with current information
            const currentAnalysis = await this.reAnalyzePrediction(bet, newInformation);
            
            // Compare with original confidence (if available)
            const originalConfidence = this.extractOriginalConfidence(bet);
            const confidenceChange = currentAnalysis.confidence - originalConfidence;
            
            // Determine if position adjustment is needed
            const shouldAdjustPosition = this.shouldAdjustPosition(confidenceChange, newInformation.length);
            const recommendedAction = this.getRecommendedAction(confidenceChange, currentAnalysis.confidence);

            return {
                betId: Number(bet.id),
                predictionId: Number(bet.prediction_id),
                originalConfidence,
                currentConfidence: currentAnalysis.confidence,
                confidenceChange,
                shouldAdjustPosition,
                recommendedAction,
                newInformation,
                reasoning: currentAnalysis.reasoning,
                riskAssessment: currentAnalysis.riskAssessment
            };
        } catch (error) {
            console.error(`Error analyzing bet ${bet.id}:`, error);
            
            // Return default analysis on error
            return {
                betId: Number(bet.id),
                predictionId: Number(bet.prediction_id),
                originalConfidence: 0.5,
                currentConfidence: 0.5,
                confidenceChange: 0,
                shouldAdjustPosition: false,
                recommendedAction: 'hold',
                newInformation: [],
                reasoning: `Error during analysis: ${error}`,
                riskAssessment: 'Unable to assess'
            };
        }
    }

    /**
     * Gather new information relevant to the bet since it was placed
     */
    private async gatherNewInformation(bet: any): Promise<NewsItem[]> {
        try {
            if (!bet.prediction?.description) {
                return [];
            }

            // Extract key terms from the prediction description
            const keyTerms = await this.extractKeyTerms(bet.prediction.description);
            
            // Get news since the bet was created
            const betDate = new Date(bet.created_at);
            const newInformation: NewsItem[] = [];

            // Gather news for each key term
            for (const term of keyTerms.slice(0, 3)) { // Limit to 3 terms to avoid API overload
                try {
                    const newsData = await this.getNewsDataSince(term, betDate);
                    newInformation.push(...newsData);
                } catch (error) {
                    console.error(`Error getting news for term ${term}:`, error);
                }
            }

            // Remove duplicates and limit results
            const uniqueNews = this.removeDuplicateNews(newInformation);
            return uniqueNews.slice(0, 10); // Limit to 10 most relevant articles
        } catch (error) {
            console.error('Error gathering new information:', error);
            return [];
        }
    }

    /**
     * Re-analyze the prediction with current information
     */
    private async reAnalyzePrediction(bet: any, newInformation: NewsItem[]): Promise<{
        confidence: number;
        reasoning: string;
        riskAssessment: string;
    }> {
        try {
            // Use the existing betting agent's analysis capabilities
            const prompt = this.createReAnalysisPrompt(bet, newInformation);
            
            // Get AI analysis
            const response = await this.bettingAgent['agentai'].chat.completions.create({
                model: this.bettingAgent['model'],
                messages: [
                    {
                        role: "system",
                        content: "You are analyzing a prediction for position adjustment. Return only valid JSON with confidence (0-1), reasoning, and riskAssessment."
                    },
                    { role: "user", content: prompt }
                ],
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content || '{}';
            const analysis = JSON.parse(content);

            return {
                confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
                reasoning: analysis.reasoning || 'No specific reasoning provided',
                riskAssessment: analysis.riskAssessment || 'Moderate risk'
            };
        } catch (error) {
            console.error('Error in re-analysis:', error);
            return {
                confidence: 0.5,
                reasoning: 'Error during re-analysis',
                riskAssessment: 'Unable to assess'
            };
        }
    }

    /**
     * Create prompt for re-analyzing a prediction
     */
    private createReAnalysisPrompt(bet: any, newInformation: NewsItem[]): string {
        return `
Re-analyze this prediction with new information:

ORIGINAL BET:
- Prediction: ${bet.prediction?.description}
- Your Choice: ${bet.choice}
- Amount: ${bet.amount} ANML
- Original Reasoning: ${bet.reason}
- Bet Date: ${bet.created_at}

NEW INFORMATION SINCE BET:
${newInformation.length > 0 ? 
    newInformation.map(news => `- ${news.title} (${news.date})`).join('\n') :
    '- No significant new information found'
}

AGENT PROFILE:
- Interests: ${this.agent.interests?.join(', ')}
- Category: ${this.agent.category}

Please provide a JSON response with:
{
    "confidence": 0.7,  // 0-1 scale for your current confidence in the original choice
    "reasoning": "Based on new information...",
    "riskAssessment": "Low/Moderate/High risk"
}

Consider:
1. How does the new information affect the original prediction?
2. Has the likelihood of your chosen outcome changed?
3. Are there new risks or opportunities?
4. Should you maintain, increase, or adjust your position?
        `;
    }

    /**
     * Extract original confidence from bet metadata (if available)
     */
    private extractOriginalConfidence(bet: IBet): number {
        // Try to extract from reasoning or default to moderate confidence
        // In future, this could come from stored metadata
        return 0.6; // Default moderate confidence for existing bets
    }

    /**
     * Determine if position adjustment is warranted
     */
    private shouldAdjustPosition(confidenceChange: number, newInfoCount: number): boolean {
        // Adjust if confidence changed significantly OR if there's substantial new information
        const significantConfidenceChange = Math.abs(confidenceChange) > 0.15; // 15% change
        const substantialNewInfo = newInfoCount > 3;
        
        return significantConfidenceChange || substantialNewInfo;
    }

    /**
     * Get recommended action based on confidence change
     */
    private getRecommendedAction(confidenceChange: number, currentConfidence: number): 'increase' | 'decrease' | 'hold' | 'hedge' {
        if (confidenceChange > 0.2) return 'increase';
        if (confidenceChange < -0.2) return 'hedge';
        if (confidenceChange < -0.1) return 'decrease';
        return 'hold';
    }

    /**
     * Extract key terms from prediction description
     */
    private async extractKeyTerms(description: string): Promise<string[]> {
        // Simple keyword extraction - could be enhanced with NLP
        const words = description.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        // Remove common words and return unique terms
        const stopWords = ['will', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those'];
        const keyTerms = words.filter(word => !stopWords.includes(word));
        
        return [...new Set(keyTerms)].slice(0, 5); // Return up to 5 unique terms
    }

    /**
     * Get news data since a specific date
     */
    private async getNewsDataSince(term: string, sinceDate: Date): Promise<NewsItem[]> {
        try {
            // Use the existing news gathering method from AutomaticBettingAgent
            const newsData = await this.bettingAgent['getNewsDataFromDB'](term, 5);
            
            // Filter for news after the bet date
            return newsData.filter(item => {
                const newsDate = new Date(item.date);
                return newsDate > sinceDate;
            }).map(item => item as unknown as NewsItem);
        } catch (error) {
            console.error(`Error getting news for term ${term}:`, error);
            return [];
        }
    }

    /**
     * Remove duplicate news items
     */
    private removeDuplicateNews(newsItems: NewsItem[]): NewsItem[] {
        const seen = new Set();
        return newsItems.filter(item => {
            const key = item.title.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}

/**
 * Main function to run daily analysis for a specific agent
 */
export async function runDailyAnalysisForAgent(agentId: number): Promise<BetAnalysisResult[]> {
    try {
        const agent = await UserRepo.getAgentById(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Ensure interests is an array
        if (typeof agent.interests === 'string') {
            agent.interests = agent.interests.split(',');
        }

        const monitor = new DailyBetMonitor(agent as IAgentProfile);
        await monitor.initialize();
        
        return await monitor.analyzeActiveBets();
    } catch (error) {
        console.error(`Error running daily analysis for agent ${agentId}:`, error);
        return [];
    }
}

/**
 * Run daily analysis and execute position adjustments
 */
export async function runDailyAnalysisWithAdjustments(agentId: number): Promise<{
    analysis: BetAnalysisResult[];
    adjustments: AdjustmentSummary;
}> {
    try {
        const agent = await UserRepo.getAgentById(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Ensure interests is an array
        if (typeof agent.interests === 'string') {
            agent.interests = agent.interests.split(',');
        }

        const monitor = new DailyBetMonitor(agent as IAgentProfile);
        await monitor.initialize();
        
        // Run the analysis
        const analysisResults = await monitor.analyzeActiveBets();
        
        // Execute position adjustments if any are recommended
        const adjustmentSummary = await executePositionAdjustments(agent as IAgentProfile, analysisResults);
        
        // Process daily odds snapshots for predictions this agent analyzed
        await processOddsSnapshotsForAgent(analysisResults);
        
        return {
            analysis: analysisResults,
            adjustments: adjustmentSummary
        };
    } catch (error) {
        console.error(`Error running daily analysis with adjustments for agent ${agentId}:`, error);
        return {
            analysis: [],
            adjustments: {
                totalAdjustments: 0,
                successful: 0,
                failed: 0,
                totalAmountBet: 0,
                adjustmentDetails: []
            }
        };
    }
}

/**
 * Process odds snapshots for predictions analyzed by an agent
 */
async function processOddsSnapshotsForAgent(analysisResults: BetAnalysisResult[]): Promise<void> {
    try {
        // Group analysis results by prediction ID
        const predictionGroups = analysisResults.reduce((groups, result) => {
            const predictionId = result.predictionId;
            if (!groups[predictionId]) {
                groups[predictionId] = [];
            }
            groups[predictionId].push(result);
            return groups;
        }, {} as Record<number, BetAnalysisResult[]>);

        // Process odds for each prediction
        const oddsTracker = new DailyOddsTracker();
        for (const [predictionId, results] of Object.entries(predictionGroups)) {
            try {
                await oddsTracker.processDailyAnalysis(Number(predictionId), results);
            } catch (error) {
                console.error(`Error processing odds for prediction ${predictionId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error processing odds snapshots:', error);
    }
} 