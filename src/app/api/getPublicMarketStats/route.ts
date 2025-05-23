import { NextResponse } from 'next/server'
import { openSql as getMySQLConnection } from '@/app/utils/database/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET() {
  try {
    const db = await getMySQLConnection()

    // Get total bets and trend
    const [betsResult] = await db.execute<RowDataPacket[]>(`
      SELECT 
        COALESCE(
          (
            SELECT COUNT(*) 
            FROM bets 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as current_period_bets,
        COALESCE(
          (
            SELECT COUNT(*) 
            FROM bets 
            WHERE created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as previous_period_bets,
        COALESCE(
          (
            SELECT AVG(amount) 
            FROM bets 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as current_avg_bet_size,
        COALESCE(
          (
            SELECT AVG(amount) 
            FROM bets 
            WHERE created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as previous_avg_bet_size
    `)

    // Get total predictions and trend
    const [predictionsResult] = await db.execute<RowDataPacket[]>(`
      SELECT 
        COALESCE(
          (
            SELECT COUNT(*) 
            FROM predictions 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as current_period_predictions,
        COALESCE(
          (
            SELECT COUNT(*) 
            FROM predictions 
            WHERE created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as previous_period_predictions
    `)

    // Get success rate and trend
    const [successRateResult] = await db.execute<RowDataPacket[]>(`
      SELECT
        COALESCE(
          (
            SELECT ROUND(
              (COUNT(CASE WHEN choice = outcome THEN 1 END) / NULLIF(COUNT(*), 0) * 100), 1
            )
            FROM bets b
            JOIN predictions p ON b.prediction_id = p.id
            WHERE p.status = 'resolved'
            AND b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as current_success_rate,
        COALESCE(
          (
            SELECT ROUND(
              (COUNT(CASE WHEN choice = outcome THEN 1 END) / NULLIF(COUNT(*), 0) * 100), 1
            )
            FROM bets b
            JOIN predictions p ON b.prediction_id = p.id
            WHERE p.status = 'resolved'
            AND b.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
          ), 0
        ) as previous_success_rate
    `)

    // Calculate percentage changes
    const calculateTrend = (current: number, previous: number): number => {
      if (!previous) return 0
      return Number(((current - previous) / previous * 100).toFixed(1))
    }

    const currentBets = parseInt(betsResult[0].current_period_bets.toString()) || 0
    const previousBets = parseInt(betsResult[0].previous_period_bets.toString()) || 0
    const currentPredictions = parseInt(predictionsResult[0].current_period_predictions.toString()) || 0
    const previousPredictions = parseInt(predictionsResult[0].previous_period_predictions.toString()) || 0
    const currentSuccessRate = parseFloat(successRateResult[0].current_success_rate?.toString() || '0') || 0
    const previousSuccessRate = parseFloat(successRateResult[0].previous_success_rate?.toString() || '0') || 0
    const currentAvgBetSize = Math.round(parseFloat(betsResult[0].current_avg_bet_size?.toString() || '0')) || 0
    const previousAvgBetSize = Math.round(parseFloat(betsResult[0].previous_avg_bet_size?.toString() || '0')) || 0

    const stats = {
      total_bets: currentBets,
      total_predictions: currentPredictions,
      avg_success_rate: currentSuccessRate,
      avg_bet_size: currentAvgBetSize,
      trends: {
        bets: calculateTrend(currentBets, previousBets),
        predictions: calculateTrend(currentPredictions, previousPredictions),
        success_rate: calculateTrend(currentSuccessRate, previousSuccessRate),
        bet_size: calculateTrend(currentAvgBetSize, previousAvgBetSize)
      }
    }

    return NextResponse.json({
      status: true,
      stats
    })
  } catch (error) {
    console.error('Error fetching public market stats:', error)
    return NextResponse.json({
      status: false,
      message: 'Failed to fetch market statistics'
    }, { status: 500 })
  }
} 