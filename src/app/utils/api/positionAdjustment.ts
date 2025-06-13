import { IAgentProfile } from "@/app/utils/interface";
import { UserRepo } from "@/app/utils/database/user-repo";
import { BetAnalysisResult } from "./dailyBetMonitor";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

export interface PositionAdjustmentResult {
    betId: number;
    predictionId: number;
    action: 'increase' | 'decrease' | 'hold' | 'hedge';
    executed: boolean;
    newBetId?: number;
    newBetAmount?: number;
    newChoice?: string;
    reasoning: string;
    error?: string;
}

export interface AdjustmentSummary {
    totalAdjustments: number;
    successful: number;
    failed: number;
    totalAmountBet: number;
    adjustmentDetails: PositionAdjustmentResult[];
}

export class PositionAdjustmentService {
    private agent: IAgentProfile;
    private pinecone: Pinecone;
    private openai: OpenAI;

    constructor(agent: IAgentProfile) {
        this.agent = agent;
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY as string
        });
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY as string
        });
    }

    /**
     * Execute position adjustments based on daily analysis results
     */
    async executeAdjustments(analysisResults: BetAnalysisResult[]): Promise<AdjustmentSummary> {
        console.log(`🔧 Starting position adjustments for agent ${this.agent.id}`);
        
        const adjustmentDetails: PositionAdjustmentResult[] = [];
        let totalAmountBet = 0;
        let successful = 0;
        let failed = 0;

        // Filter for results that need position adjustments
        const adjustmentsNeeded = analysisResults.filter(result => result.shouldAdjustPosition);
        
        console.log(`📊 Found ${adjustmentsNeeded.length} positions that need adjustment`);

        if (adjustmentsNeeded.length === 0) {
            return {
                totalAdjustments: 0,
                successful: 0,
                failed: 0,
                totalAmountBet: 0,
                adjustmentDetails: []
            };
        }

        // Execute each adjustment
        for (const analysis of adjustmentsNeeded) {
            try {
                const result = await this.executeIndividualAdjustment(analysis);
                adjustmentDetails.push(result);
                
                if (result.executed) {
                    successful++;
                    totalAmountBet += result.newBetAmount || 0;
                } else {
                    failed++;
                }

                // Add delay between adjustments to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Error adjusting position for bet ${analysis.betId}:`, error);
                adjustmentDetails.push({
                    betId: analysis.betId,
                    predictionId: analysis.predictionId,
                    action: analysis.recommendedAction,
                    executed: false,
                    reasoning: analysis.reasoning,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                failed++;
            }
        }

        return {
            totalAdjustments: adjustmentsNeeded.length,
            successful,
            failed,
            totalAmountBet,
            adjustmentDetails
        };
    }

    /**
     * Execute a single position adjustment
     */
    private async executeIndividualAdjustment(analysis: BetAnalysisResult): Promise<PositionAdjustmentResult> {
        console.log(`🎯 Executing ${analysis.recommendedAction} for bet ${analysis.betId}`);

        // Check if agent has sufficient balance
        const currentBalance = this.agent.wallet_balance;
        if (currentBalance <= 0) {
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: analysis.recommendedAction,
                executed: false,
                reasoning: analysis.reasoning,
                error: 'Insufficient wallet balance'
            };
        }

        // Get the original bet details
        const originalBet = await UserRepo.getBetById(analysis.betId.toString());
        if (!originalBet) {
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: analysis.recommendedAction,
                executed: false,
                reasoning: analysis.reasoning,
                error: 'Original bet not found'
            };
        }

        // Check if agent has already bet twice on this prediction (limit)
        const prediction = await UserRepo.getPredictionById(analysis.predictionId.toString());
        if (!prediction) {
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: analysis.recommendedAction,
                executed: false,
                reasoning: analysis.reasoning,
                error: 'Prediction not found'
            };
        }

        const existingBets = await this.getAgentBetsOnPrediction(analysis.predictionId);
        if (existingBets.length >= 2) {
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: analysis.recommendedAction,
                executed: false,
                reasoning: analysis.reasoning,
                error: 'Maximum bet limit reached (2 bets per prediction)'
            };
        }

        // Execute the specific action
        switch (analysis.recommendedAction) {
            case 'increase':
                return await this.executeIncrease(analysis, originalBet);
            case 'hedge':
                return await this.executeHedge(analysis, originalBet);
            case 'decrease':
                // For decrease, we don't place new bets, just log the recommendation
                return {
                    betId: analysis.betId,
                    predictionId: analysis.predictionId,
                    action: 'decrease',
                    executed: true,
                    reasoning: `Recommended to decrease exposure. ${analysis.reasoning}`,
                };
            case 'hold':
            default:
                return {
                    betId: analysis.betId,
                    predictionId: analysis.predictionId,
                    action: 'hold',
                    executed: true,
                    reasoning: `Position maintained. ${analysis.reasoning}`,
                };
        }
    }

    /**
     * Execute an increase position (place additional bet with same choice)
     */
    private async executeIncrease(analysis: BetAnalysisResult, originalBet: any): Promise<PositionAdjustmentResult> {
        try {
            // Calculate bet amount based on confidence increase
            const confidenceIncrease = Math.abs(analysis.confidenceChange);
            const baseBetAmount = this.calculateAdjustmentAmount(confidenceIncrease, 'increase');
            
            // Ensure we don't exceed balance or bet limits
            const betAmount = Math.min(
                baseBetAmount,
                this.agent.wallet_balance,
                this.agent.maxBetSize || 1000
            );

            if (betAmount < (this.agent.conservativeBetSize || 10)) {
                return {
                    betId: analysis.betId,
                    predictionId: analysis.predictionId,
                    action: 'increase',
                    executed: false,
                    reasoning: analysis.reasoning,
                    error: 'Calculated bet amount too small'
                };
            }

            // Create the new bet
            const newBetReason = `Daily analysis adjustment: ${analysis.reasoning}`;
            const pineconeId = await this.storeBetInPinecone(
                analysis.predictionId,
                originalBet.choice,
                betAmount,
                newBetReason,
                analysis
            );

            // Place the bet in database
            await UserRepo.createBet(
                analysis.predictionId,
                this.agent.id,
                originalBet.choice,
                betAmount,
                newBetReason,
                this.agent.user_id,
                pineconeId
            );

            console.log(`✅ Increased position: ${betAmount} ANML on ${originalBet.choice}`);

            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: 'increase',
                executed: true,
                newBetAmount: betAmount,
                newChoice: originalBet.choice,
                reasoning: `Increased position by ${betAmount} ANML. ${analysis.reasoning}`
            };

        } catch (error) {
            console.error('Error executing increase:', error);
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: 'increase',
                executed: false,
                reasoning: analysis.reasoning,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Execute a hedge position (place bet with opposite choice)
     */
    private async executeHedge(analysis: BetAnalysisResult, originalBet: any): Promise<PositionAdjustmentResult> {
        try {
            // Calculate hedge amount based on confidence decrease
            const confidenceDecrease = Math.abs(analysis.confidenceChange);
            const baseBetAmount = this.calculateAdjustmentAmount(confidenceDecrease, 'hedge');
            
            // For hedging, use a smaller amount to partially offset risk
            const hedgeAmount = Math.min(
                baseBetAmount * 0.7, // Hedge with 70% of calculated amount
                this.agent.wallet_balance,
                this.agent.moderateBetSize || 500
            );

            if (hedgeAmount < (this.agent.conservativeBetSize || 10)) {
                return {
                    betId: analysis.betId,
                    predictionId: analysis.predictionId,
                    action: 'hedge',
                    executed: false,
                    reasoning: analysis.reasoning,
                    error: 'Calculated hedge amount too small'
                };
            }

            // Determine opposite choice
            const oppositeChoice = originalBet.choice.toLowerCase() === 'yes' ? 'No' : 'Yes';
            
            // Create the hedge bet
            const hedgeReason = `Daily analysis hedge: ${analysis.reasoning}`;
            const pineconeId = await this.storeBetInPinecone(
                analysis.predictionId,
                oppositeChoice,
                hedgeAmount,
                hedgeReason,
                analysis
            );

            // Place the hedge bet in database
            await UserRepo.createBet(
                analysis.predictionId,
                this.agent.id,
                oppositeChoice,
                hedgeAmount,
                hedgeReason,
                this.agent.user_id,
                pineconeId
            );

            console.log(`🛡️ Hedged position: ${hedgeAmount} ANML on ${oppositeChoice}`);

            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: 'hedge',
                executed: true,
                newBetAmount: hedgeAmount,
                newChoice: oppositeChoice,
                reasoning: `Hedged with ${hedgeAmount} ANML on ${oppositeChoice}. ${analysis.reasoning}`
            };

        } catch (error) {
            console.error('Error executing hedge:', error);
            return {
                betId: analysis.betId,
                predictionId: analysis.predictionId,
                action: 'hedge',
                executed: false,
                reasoning: analysis.reasoning,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Calculate adjustment amount based on confidence change
     */
    private calculateAdjustmentAmount(confidenceChange: number, action: 'increase' | 'hedge'): number {
        // Base the bet size on the magnitude of confidence change
        let baseAmount: number;

        if (confidenceChange >= 0.3) {
            baseAmount = this.agent.aggressiveBetSize || 100;
        } else if (confidenceChange >= 0.2) {
            baseAmount = this.agent.moderateBetSize || 50;
        } else {
            baseAmount = this.agent.conservativeBetSize || 25;
        }

        // Apply confidence multiplier
        const multiplier = Math.min(confidenceChange * 2, 1); // Cap at 1x
        return Math.floor(baseAmount * multiplier);
    }

    /**
     * Get existing bets by this agent on a specific prediction
     */
    private async getAgentBetsOnPrediction(predictionId: number): Promise<any[]> {
        try {
            const bets = await UserRepo.getBetHistoryByAgentId(this.agent.id, 100, 0);
            return bets.filter(bet => bet.prediction_id === predictionId);
        } catch (error) {
            console.error('Error getting agent bets:', error);
            return [];
        }
    }

    /**
     * Store bet information in Pinecone for future analysis
     */
    private async storeBetInPinecone(
        predictionId: number,
        choice: string,
        amount: number,
        reason: string,
        analysis: BetAnalysisResult
    ): Promise<string> {
        try {
            const prediction = await UserRepo.getPredictionById(predictionId.toString());
            if (!prediction) {
                throw new Error('Prediction not found for Pinecone storage');
            }

            const embedding = await this.getEmbedding(prediction.description);
            const index = this.pinecone.Index('prediction-results');
            const id = `adjustment-${predictionId}-${this.agent.id}-${Date.now()}`;

            await index.upsert([{
                id: id,
                values: embedding,
                metadata: {
                    description: prediction.description,
                    choice: choice,
                    amount: amount,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    agentId: this.agent.id,
                    predictionId: predictionId,
                    confidence: analysis.currentConfidence,
                    reasoning: reason,
                    riskAssessment: analysis.riskAssessment,
                    result: 'pending',
                    adjustmentType: analysis.recommendedAction,
                    originalBetId: analysis.betId,
                    confidenceChange: analysis.confidenceChange,
                    log: JSON.stringify([{
                        step: 'dailyAdjustment',
                        reasoning: `${analysis.recommendedAction}: ${reason}`
                    }])
                }
            }]);

            return id;
        } catch (error) {
            console.error('Error storing adjustment in Pinecone:', error);
            return '';
        }
    }

    /**
     * Get embedding for text using OpenAI
     */
    private async getEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: text
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error getting embedding:', error);
            // Return a default embedding if API fails
            return new Array(1536).fill(0);
        }
    }
}

/**
 * Main function to execute position adjustments for an agent
 */
export async function executePositionAdjustments(
    agent: IAgentProfile,
    analysisResults: BetAnalysisResult[]
): Promise<AdjustmentSummary> {
    const adjustmentService = new PositionAdjustmentService(agent);
    return await adjustmentService.executeAdjustments(analysisResults);
} 