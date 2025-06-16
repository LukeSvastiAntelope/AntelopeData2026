import { NextRequest, NextResponse } from 'next/server';
import { DailyOddsTracker, MarketSentimentData } from '@/app/utils/api/dailyOddsTracker';
import { UserRepo } from '@/app/utils/database/user-repo';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const predictionId = parseInt(id);

        if (isNaN(predictionId)) {
            return NextResponse.json(
                { error: 'Invalid prediction ID' },
                { status: 400 }
            );
        }

        // Get query parameters
        const searchParams = request.nextUrl.searchParams;
        const days = parseInt(searchParams.get('days') || '30');
        const includeAnalysis = searchParams.get('includeAnalysis') !== 'false';
        const includeBets = searchParams.get('includeBets') !== 'false';

        console.log(`📊 Fetching odds history for prediction ${predictionId} (${days} days)`);

        // Verify prediction exists
        const prediction = await UserRepo.getPredictionById(id);
        if (!prediction) {
            return NextResponse.json(
                { error: 'Prediction not found' },
                { status: 404 }
            );
        }

        const oddsTracker = new DailyOddsTracker();
        const combinedData: MarketSentimentData[] = [];

        // Get analysis-based odds snapshots if requested
        if (includeAnalysis) {
            try {
                const snapshots = await oddsTracker.getHistoricalSnapshots(predictionId, days);
                const analysisData = oddsTracker.convertSnapshotsToChartData(snapshots);
                combinedData.push(...analysisData);
                console.log(`📈 Found ${analysisData.length} analysis-based data points`);
            } catch (error) {
                console.error('Error fetching analysis snapshots:', error);
            }
        }

        // Get bet-based odds changes if requested
        if (includeBets) {
            try {
                const betBasedData = await getBetBasedOddsHistory(predictionId, days);
                combinedData.push(...betBasedData);
                console.log(`🎯 Found ${betBasedData.length} bet-based data points`);
            } catch (error) {
                console.error('Error fetching bet-based odds:', error);
            }
        }

        // Sort combined data by date
        const sortedData = combinedData.sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Remove duplicates (prefer analysis data over bet data for same date)
        const uniqueData = removeDuplicatesByDate(sortedData);

        console.log(`✅ Returning ${uniqueData.length} total data points for prediction ${predictionId}`);

        return NextResponse.json({
            predictionId,
            prediction: {
                id: prediction.id,
                description: prediction.description,
                category: prediction.category
            },
            oddsHistory: uniqueData,
            metadata: {
                totalDataPoints: uniqueData.length,
                analysisPoints: uniqueData.filter(d => d.dataSource === 'analysis').length,
                betPoints: uniqueData.filter(d => d.dataSource === 'bet').length,
                dateRange: {
                    start: uniqueData[0]?.date,
                    end: uniqueData[uniqueData.length - 1]?.date
                }
            }
        });

    } catch (error) {
        console.error('Error fetching odds history:', error);
        return NextResponse.json(
            { error: 'Failed to fetch odds history' },
            { status: 500 }
        );
    }
}

/**
 * Get bet-based odds history by calculating odds after each bet
 */
async function getBetBasedOddsHistory(predictionId: number, days: number): Promise<MarketSentimentData[]> {
    try {
        // Get all bets for this prediction within the date range
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const bets = await UserRepo.getBetsByPredictionId(predictionId.toString());
        const recentBets = bets.filter(bet => 
            new Date(bet.created_at) >= cutoffDate
        ).sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const oddsHistory: MarketSentimentData[] = [];
        let runningYesAmount = 0;
        let runningNoAmount = 0;

        // Calculate cumulative odds after each bet
        for (const bet of recentBets) {
            if (bet.choice === 'Yes') {
                runningYesAmount += bet.amount;
            } else {
                runningNoAmount += bet.amount;
            }

            const totalAmount = runningYesAmount + runningNoAmount;
            const yesPercentage = totalAmount > 0 ? (runningYesAmount / totalAmount) * 100 : 50;
            const noPercentage = 100 - yesPercentage;

            const yesOdds = yesPercentage > 0 ? 100 / yesPercentage : 999;
            const noOdds = noPercentage > 0 ? 100 / noPercentage : 999;

            const betDate = new Date(bet.created_at);
            oddsHistory.push({
                date: betDate.toISOString().split('T')[0],
                displayDate: betDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                }),
                yesOdds: Number(Math.min(yesOdds, 50).toFixed(2)),
                noOdds: Number(Math.min(noOdds, 50).toFixed(2)),
                yesPercentage: Number(yesPercentage.toFixed(1)),
                noPercentage: Number(noPercentage.toFixed(1)),
                agentCount: 1, // Each bet represents one agent action
                confidenceChange: 0, // Not applicable for bet-based data
                dataSource: 'bet' as const
            });
        }

        return oddsHistory;
    } catch (error) {
        console.error('Error calculating bet-based odds history:', error);
        return [];
    }
}

/**
 * Remove duplicate entries by date, preferring analysis data over bet data
 */
function removeDuplicatesByDate(data: MarketSentimentData[]): MarketSentimentData[] {
    const dateMap = new Map<string, MarketSentimentData>();

    for (const item of data) {
        const existing = dateMap.get(item.date);
        
        if (!existing) {
            dateMap.set(item.date, item);
        } else {
            // Prefer analysis data over bet data
            if (item.dataSource === 'analysis' && existing.dataSource === 'bet') {
                dateMap.set(item.date, item);
            }
            // Keep existing if it's analysis data or if both are the same type
        }
    }

    return Array.from(dateMap.values()).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
} 