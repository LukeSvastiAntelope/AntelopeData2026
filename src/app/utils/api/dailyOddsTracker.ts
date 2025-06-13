import { BetAnalysisResult } from './dailyBetMonitor';
import { UserRepo } from '@/app/utils/database/user-repo';
import { Pinecone } from '@pinecone-database/pinecone';

export interface DailyOddsSnapshot {
    predictionId: number;
    date: string; // YYYY-MM-DD format
    yesPercentage: number;
    noPercentage: number;
    yesOdds: number;
    noOdds: number;
    agentCount: number;
    totalConfidence: number;
    averageConfidence: number;
    confidenceChange: number; // Change from previous day
    analysisBasedChange: boolean; // True if change was from analysis, false if from new bets
    metadata: {
        analysisResults: BetAnalysisResult[];
        dailyChange: number;
        significantChange: boolean;
        reasoning: string;
    };
}

export interface MarketSentimentData {
    date: string;
    displayDate: string;
    yesOdds: number;
    noOdds: number;
    yesPercentage: number;
    noPercentage: number;
    agentCount: number;
    confidenceChange: number;
    dataSource: 'bet' | 'analysis';
    reasoning?: string;
}

export class DailyOddsTracker {
    private pinecone: Pinecone;
    private indexName: string = 'daily-odds-snapshots';

    constructor() {
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY as string
        });
    }

    /**
     * Process daily analysis results and create odds snapshots
     */
    async processDailyAnalysis(predictionId: number, analysisResults: BetAnalysisResult[]): Promise<DailyOddsSnapshot | null> {
        try {
            console.log(`📊 Processing daily analysis for prediction ${predictionId}`);

            if (analysisResults.length === 0) {
                console.log(`No analysis results for prediction ${predictionId}`);
                return null;
            }

            // Get current prediction data
            const prediction = await UserRepo.getPredictionById(predictionId.toString());
            if (!prediction) {
                console.error(`Prediction ${predictionId} not found`);
                return null;
            }

            // Calculate new market sentiment based on analysis
            const sentimentData = this.calculateMarketSentiment(analysisResults);
            
            // Get previous day's snapshot for comparison
            const previousSnapshot = await this.getPreviousSnapshot(predictionId);
            
            // Calculate confidence change
            const confidenceChange = previousSnapshot 
                ? sentimentData.averageConfidence - previousSnapshot.averageConfidence
                : 0;

            // Create today's snapshot
            const today = new Date().toISOString().split('T')[0];
            const snapshot: DailyOddsSnapshot = {
                predictionId,
                date: today,
                yesPercentage: sentimentData.yesPercentage,
                noPercentage: sentimentData.noPercentage,
                yesOdds: sentimentData.yesOdds,
                noOdds: sentimentData.noOdds,
                agentCount: analysisResults.length,
                totalConfidence: sentimentData.totalConfidence,
                averageConfidence: sentimentData.averageConfidence,
                confidenceChange,
                analysisBasedChange: true,
                metadata: {
                    analysisResults,
                    dailyChange: confidenceChange,
                    significantChange: Math.abs(confidenceChange) >= 5, // 5% threshold
                    reasoning: this.generateChangeReasoning(analysisResults, confidenceChange)
                }
            };

            // Store the snapshot
            await this.storeSnapshot(snapshot);
            
            console.log(`✅ Stored daily odds snapshot for prediction ${predictionId}: ${sentimentData.yesPercentage}% Yes, ${sentimentData.noPercentage}% No`);
            
            return snapshot;
        } catch (error) {
            console.error('Error processing daily analysis:', error);
            return null;
        }
    }

    /**
     * Calculate market sentiment based on analysis results
     */
    private calculateMarketSentiment(analysisResults: BetAnalysisResult[]): {
        yesPercentage: number;
        noPercentage: number;
        yesOdds: number;
        noOdds: number;
        averageConfidence: number;
        totalConfidence: number;
    } {
        let totalYesConfidence = 0;
        let totalNoConfidence = 0;
        let totalConfidence = 0;

        // Weight analysis results by their confidence levels
        analysisResults.forEach(result => {
            const confidence = result.currentConfidence * 100; // Convert to percentage
            totalConfidence += confidence;

            // Determine which side this confidence favors
            if (confidence > 50) {
                // High confidence = favor Yes
                totalYesConfidence += confidence;
            } else {
                // Low confidence = favor No
                totalNoConfidence += (100 - confidence);
            }
        });

        const totalWeight = totalYesConfidence + totalNoConfidence;
        const averageConfidence = totalConfidence / analysisResults.length;

        let yesPercentage = 50;
        let noPercentage = 50;

        if (totalWeight > 0) {
            yesPercentage = (totalYesConfidence / totalWeight) * 100;
            noPercentage = (totalNoConfidence / totalWeight) * 100;
        }

        // Calculate odds
        const yesOdds = yesPercentage > 0 ? 100 / yesPercentage : 999;
        const noOdds = noPercentage > 0 ? 100 / noPercentage : 999;

        return {
            yesPercentage: Number(yesPercentage.toFixed(1)),
            noPercentage: Number(noPercentage.toFixed(1)),
            yesOdds: Number(Math.min(yesOdds, 50).toFixed(2)),
            noOdds: Number(Math.min(noOdds, 50).toFixed(2)),
            averageConfidence,
            totalConfidence
        };
    }

    /**
     * Generate reasoning for confidence changes
     */
    private generateChangeReasoning(analysisResults: BetAnalysisResult[], confidenceChange: number): string {
        const positiveChanges = analysisResults.filter(r => r.confidenceChange > 0).length;
        const negativeChanges = analysisResults.filter(r => r.confidenceChange < 0).length;
        const noChanges = analysisResults.filter(r => Math.abs(r.confidenceChange) < 1).length;

        if (Math.abs(confidenceChange) < 1) {
            return `Market sentiment stable. ${analysisResults.length} agents analyzed with minimal changes.`;
        } else if (confidenceChange > 0) {
            return `Market sentiment increased by ${confidenceChange.toFixed(1)}%. ${positiveChanges} agents more confident, ${negativeChanges} less confident.`;
        } else {
            return `Market sentiment decreased by ${Math.abs(confidenceChange).toFixed(1)}%. ${negativeChanges} agents less confident, ${positiveChanges} more confident.`;
        }
    }

    /**
     * Store daily odds snapshot in Pinecone
     */
    private async storeSnapshot(snapshot: DailyOddsSnapshot): Promise<void> {
        try {
            const index = this.pinecone.index(this.indexName);
            
            const id = `prediction_${snapshot.predictionId}_${snapshot.date}`;
            const vector = await this.generateSnapshotEmbedding(snapshot);

            await index.upsert([{
                id,
                values: vector,
                metadata: {
                    predictionId: snapshot.predictionId,
                    date: snapshot.date,
                    yesPercentage: snapshot.yesPercentage,
                    noPercentage: snapshot.noPercentage,
                    yesOdds: snapshot.yesOdds,
                    noOdds: snapshot.noOdds,
                    agentCount: snapshot.agentCount,
                    averageConfidence: snapshot.averageConfidence,
                    confidenceChange: snapshot.confidenceChange,
                    analysisBasedChange: snapshot.analysisBasedChange,
                    reasoning: snapshot.metadata.reasoning,
                    significantChange: snapshot.metadata.significantChange
                }
            }]);
        } catch (error) {
            console.error('Error storing snapshot in Pinecone:', error);
            throw error;
        }
    }

    /**
     * Get previous day's snapshot
     */
    private async getPreviousSnapshot(predictionId: number): Promise<DailyOddsSnapshot | null> {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            const index = this.pinecone.index(this.indexName);
            const id = `prediction_${predictionId}_${yesterdayStr}`;
            
            const response = await index.fetch([id]);
            const record = response.records[id];
            
            if (record && record.metadata) {
                return {
                    predictionId: record.metadata.predictionId as number,
                    date: record.metadata.date as string,
                    yesPercentage: record.metadata.yesPercentage as number,
                    noPercentage: record.metadata.noPercentage as number,
                    yesOdds: record.metadata.yesOdds as number,
                    noOdds: record.metadata.noOdds as number,
                    agentCount: record.metadata.agentCount as number,
                    totalConfidence: 0, // Not stored in metadata for simplicity
                    averageConfidence: record.metadata.averageConfidence as number,
                    confidenceChange: record.metadata.confidenceChange as number,
                    analysisBasedChange: record.metadata.analysisBasedChange as boolean,
                    metadata: {
                        analysisResults: [], // Not retrieved for comparison
                        dailyChange: record.metadata.confidenceChange as number,
                        significantChange: record.metadata.significantChange as boolean,
                        reasoning: record.metadata.reasoning as string
                    }
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error fetching previous snapshot:', error);
            return null;
        }
    }

    /**
     * Get historical snapshots for a prediction
     */
    async getHistoricalSnapshots(predictionId: number, days: number = 30): Promise<DailyOddsSnapshot[]> {
        try {
            const index = this.pinecone.index(this.indexName);
            const snapshots: DailyOddsSnapshot[] = [];
            
            // Query for the last 30 days
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                const id = `prediction_${predictionId}_${dateStr}`;
                
                try {
                    const response = await index.fetch([id]);
                    const record = response.records[id];
                    
                    if (record && record.metadata) {
                        snapshots.push({
                            predictionId: record.metadata.predictionId as number,
                            date: record.metadata.date as string,
                            yesPercentage: record.metadata.yesPercentage as number,
                            noPercentage: record.metadata.noPercentage as number,
                            yesOdds: record.metadata.yesOdds as number,
                            noOdds: record.metadata.noOdds as number,
                            agentCount: record.metadata.agentCount as number,
                            totalConfidence: 0,
                            averageConfidence: record.metadata.averageConfidence as number,
                            confidenceChange: record.metadata.confidenceChange as number,
                            analysisBasedChange: record.metadata.analysisBasedChange as boolean,
                            metadata: {
                                analysisResults: [],
                                dailyChange: record.metadata.confidenceChange as number,
                                significantChange: record.metadata.significantChange as boolean,
                                reasoning: record.metadata.reasoning as string
                            }
                        });
                    }
                } catch (fetchError) {
                    // Snapshot doesn't exist for this date, continue
                    continue;
                }
            }
            
            // Sort by date (newest first)
            return snapshots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } catch (error) {
            console.error('Error fetching historical snapshots:', error);
            return [];
        }
    }

    /**
     * Convert snapshots to chart data format
     */
    convertSnapshotsToChartData(snapshots: DailyOddsSnapshot[]): MarketSentimentData[] {
        return snapshots
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(snapshot => ({
                date: snapshot.date,
                displayDate: new Date(snapshot.date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                }),
                yesOdds: snapshot.yesOdds,
                noOdds: snapshot.noOdds,
                yesPercentage: snapshot.yesPercentage,
                noPercentage: snapshot.noPercentage,
                agentCount: snapshot.agentCount,
                confidenceChange: snapshot.confidenceChange,
                dataSource: 'analysis' as const,
                reasoning: snapshot.metadata.reasoning
            }));
    }

    /**
     * Generate embedding for snapshot storage
     */
    private async generateSnapshotEmbedding(snapshot: DailyOddsSnapshot): Promise<number[]> {
        // Create a text representation of the snapshot for embedding
        const text = `Prediction ${snapshot.predictionId} daily analysis: ${snapshot.yesPercentage}% Yes, ${snapshot.noPercentage}% No. Agent confidence: ${snapshot.averageConfidence.toFixed(1)}%. Change: ${snapshot.confidenceChange.toFixed(1)}%. ${snapshot.metadata.reasoning}`;
        
        // For simplicity, return a dummy vector. In production, you'd use OpenAI embeddings
        return new Array(1536).fill(0).map(() => Math.random() - 0.5);
    }
}

/**
 * Helper function to process daily analysis for all predictions
 */
export async function processDailyOddsForAllPredictions(allAnalysisResults: { predictionId: number, results: BetAnalysisResult[] }[]): Promise<DailyOddsSnapshot[]> {
    const tracker = new DailyOddsTracker();
    const snapshots: DailyOddsSnapshot[] = [];

    for (const { predictionId, results } of allAnalysisResults) {
        try {
            const snapshot = await tracker.processDailyAnalysis(predictionId, results);
            if (snapshot) {
                snapshots.push(snapshot);
            }
        } catch (error) {
            console.error(`Error processing daily odds for prediction ${predictionId}:`, error);
        }
    }

    return snapshots;
} 