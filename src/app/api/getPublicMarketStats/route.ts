import { NextResponse } from 'next/server'
import { openSql as getMySQLConnection } from '@/app/utils/database/db'
import { RowDataPacket } from 'mysql2/promise'

// Simple in-memory cache
let cachedStats: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds

export async function GET() {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedStats && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        status: true,
        stats: cachedStats,
        cached: true
      });
    }

    const db = await getMySQLConnection()

    // Single optimized query to get all stats at once
    const [result] = await db.execute<RowDataPacket[]>(`
      SELECT 
        -- Current period (last 30 days)
        COUNT(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as current_bets,
        COUNT(CASE WHEN p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as current_predictions,
        AVG(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN b.amount END) as current_avg_bet,
        
        -- Previous period (30-60 days ago)
        COUNT(CASE WHEN b.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as previous_bets,
        COUNT(CASE WHEN p.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as previous_predictions,
        AVG(CASE WHEN b.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY) THEN b.amount END) as previous_avg_bet,
        
        -- Success rates
        COUNT(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND p.status = 'resolved' AND b.choice = p.outcome THEN 1 END) as current_wins,
        COUNT(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND p.status = 'resolved' THEN 1 END) as current_resolved_bets,
        COUNT(CASE WHEN b.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY) AND p.status = 'resolved' AND b.choice = p.outcome THEN 1 END) as previous_wins,
        COUNT(CASE WHEN b.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY) AND p.status = 'resolved' THEN 1 END) as previous_resolved_bets
      FROM predictions p
      LEFT JOIN bets b ON p.id = b.prediction_id
    `);

    const row = result[0];
    
    // Calculate percentage changes safely
    const calculateTrend = (current: number, previous: number): number => {
      if (!previous || previous === 0) return 0;
      return Number(((current - previous) / previous * 100).toFixed(1));
    }

    // Parse results with fallbacks
    const currentBets = parseInt(row.current_bets?.toString() || '0') || 0;
    const previousBets = parseInt(row.previous_bets?.toString() || '0') || 0;
    const currentPredictions = parseInt(row.current_predictions?.toString() || '0') || 0;
    const previousPredictions = parseInt(row.previous_predictions?.toString() || '0') || 0;
    const currentAvgBet = Math.round(parseFloat(row.current_avg_bet?.toString() || '0')) || 0;
    const previousAvgBet = Math.round(parseFloat(row.previous_avg_bet?.toString() || '0')) || 0;
    
    // Calculate success rates
    const currentWins = parseInt(row.current_wins?.toString() || '0') || 0;
    const currentResolvedBets = parseInt(row.current_resolved_bets?.toString() || '0') || 0;
    const previousWins = parseInt(row.previous_wins?.toString() || '0') || 0;
    const previousResolvedBets = parseInt(row.previous_resolved_bets?.toString() || '0') || 0;
    
    const currentSuccessRate = currentResolvedBets > 0 ? 
      Number((currentWins / currentResolvedBets * 100).toFixed(1)) : 0;
    const previousSuccessRate = previousResolvedBets > 0 ? 
      Number((previousWins / previousResolvedBets * 100).toFixed(1)) : 0;

    const stats = {
      total_bets: currentBets,
      total_predictions: currentPredictions,
      avg_success_rate: currentSuccessRate,
      avg_bet_size: currentAvgBet,
      trends: {
        bets: calculateTrend(currentBets, previousBets),
        predictions: calculateTrend(currentPredictions, previousPredictions),
        success_rate: calculateTrend(currentSuccessRate, previousSuccessRate),
        bet_size: calculateTrend(currentAvgBet, previousAvgBet)
      }
    };

    // Cache the result
    cachedStats = stats;
    cacheTimestamp = now;

    return NextResponse.json({
      status: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching public market stats:', error);
    return NextResponse.json({
      status: false,
      message: 'Failed to fetch market statistics'
    }, { status: 500 });
  }
} 