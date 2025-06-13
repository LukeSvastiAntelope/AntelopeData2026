import { NextRequest, NextResponse } from 'next/server';
import { DailyOddsTracker } from '@/app/utils/api/dailyOddsTracker';
import { BetAnalysisResult } from '@/app/utils/api/dailyBetMonitor';

export async function POST(request: NextRequest) {
    try {
        const { predictionId } = await request.json();

        if (!predictionId) {
            return NextResponse.json(
                { error: 'Prediction ID is required' },
                { status: 400 }
            );
        }

        console.log(`🧪 Generating test odds history for prediction ${predictionId}`);

        // Generate sample analysis results for the last 7 days
        const sampleAnalysisResults: BetAnalysisResult[] = [];
        const oddsTracker = new DailyOddsTracker();

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            // Generate 3-5 sample analysis results per day
            const agentCount = Math.floor(Math.random() * 3) + 3; // 3-5 agents
            const dayResults: BetAnalysisResult[] = [];

            for (let j = 0; j < agentCount; j++) {
                // Simulate confidence changes over time
                const baseConfidence = 0.6 + (Math.random() - 0.5) * 0.3; // 0.45 to 0.75
                const confidenceChange = (Math.random() - 0.5) * 0.2; // -0.1 to +0.1
                
                dayResults.push({
                    betId: 1000 + i * 10 + j,
                    predictionId: Number(predictionId),
                    originalConfidence: baseConfidence,
                    currentConfidence: Math.max(0.1, Math.min(0.9, baseConfidence + confidenceChange)),
                    confidenceChange: confidenceChange * 100, // Convert to percentage
                    shouldAdjustPosition: Math.abs(confidenceChange) > 0.05,
                    recommendedAction: confidenceChange > 0.05 ? 'increase' : 
                                     confidenceChange < -0.05 ? 'decrease' : 'hold',
                    newInformation: [],
                    reasoning: `Day ${7-i} analysis: ${confidenceChange > 0 ? 'Positive' : confidenceChange < 0 ? 'Negative' : 'Neutral'} sentiment shift`,
                    riskAssessment: Math.abs(confidenceChange) > 0.08 ? 'High' : 'Moderate'
                });
            }

            sampleAnalysisResults.push(...dayResults);
        }

        // Process the sample data to create odds snapshots
        const snapshots = [];
        
        // Group by day and process each day
        const dayGroups = sampleAnalysisResults.reduce((groups, result) => {
            const dayIndex = Math.floor((result.betId - 1000) / 10);
            if (!groups[dayIndex]) {
                groups[dayIndex] = [];
            }
            groups[dayIndex].push(result);
            return groups;
        }, {} as Record<number, BetAnalysisResult[]>);

        for (const [dayIndex, dayResults] of Object.entries(dayGroups)) {
            try {
                const snapshot = await oddsTracker.processDailyAnalysis(Number(predictionId), dayResults);
                if (snapshot) {
                    snapshots.push(snapshot);
                }
            } catch (error) {
                console.error(`Error processing day ${dayIndex}:`, error);
            }
        }

        console.log(`✅ Generated ${snapshots.length} daily odds snapshots`);

        return NextResponse.json({
            success: true,
            message: `Generated ${snapshots.length} daily odds snapshots for prediction ${predictionId}`,
            snapshots: snapshots.map(s => ({
                date: s.date,
                yesPercentage: s.yesPercentage,
                noPercentage: s.noPercentage,
                agentCount: s.agentCount,
                confidenceChange: s.confidenceChange,
                reasoning: s.metadata.reasoning
            })),
            analysisResults: sampleAnalysisResults.length
        });

    } catch (error) {
        console.error('Error generating test odds history:', error);
        return NextResponse.json(
            { error: 'Failed to generate test data' },
            { status: 500 }
        );
    }
} 