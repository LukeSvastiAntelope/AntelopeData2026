import { NextRequest, NextResponse } from 'next/server'
import { openSql as getMySQLConnection } from '@/app/utils/database/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(request: NextRequest) {
  try {
    // Get user ID from the request (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const db = await getMySQLConnection()
    
    // Get overview statistics
    const [overviewRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        COUNT(DISTINCT s.id) as total_surveys,
        COUNT(DISTINCT CASE WHEN s.status = 'published' THEN s.id END) as published_surveys,
        COUNT(DISTINCT CASE WHEN s.status = 'draft' THEN s.id END) as draft_surveys,
        COUNT(DISTINCT sr.id) as total_responses,
        COUNT(DISTINCT ra.id) as total_digital_twins
      FROM surveys s
      LEFT JOIN survey_responses sr ON s.id = sr.survey_id
      LEFT JOIN responder_agents ra ON sr.id = ra.created_from_response_id
      WHERE s.created_by = ?`,
      [userId]
    )

    // Get response trends (last 30 days)
    const [trendsRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        DATE(sr.submitted_at) as date,
        COUNT(*) as responses
      FROM survey_responses sr
      JOIN surveys s ON sr.survey_id = s.id
      WHERE s.created_by = ? 
        AND sr.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(sr.submitted_at)
      ORDER BY date ASC`,
      [userId]
    )

    // Get top performing surveys
    const [topSurveysRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        s.id,
        s.title,
        s.status,
        s.created_at,
        COUNT(sr.id) as response_count,
        COUNT(DISTINCT sr.agent_token) as digital_twins_count
      FROM surveys s
      LEFT JOIN survey_responses sr ON s.id = sr.survey_id
      WHERE s.created_by = ?
      GROUP BY s.id, s.title, s.status, s.created_at
      ORDER BY response_count DESC
      LIMIT 10`,
      [userId]
    )

    // Get demographics breakdown
    const [demographicsRows] = await db.execute<RowDataPacket[]>(
      `SELECT sr.demographics
      FROM survey_responses sr
      JOIN surveys s ON sr.survey_id = s.id
      WHERE s.created_by = ?`,
      [userId]
    )

    // Process demographics data
    const ageGroups = { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0 }
    const locations: { [key: string]: number } = {}
    const occupations: { [key: string]: number } = {}
    const educationLevels: { [key: string]: number } = {}

    demographicsRows.forEach((row: any) => {
      const demographics = row.demographics
      
      // Age groups
      if (demographics.age) {
        const age = parseInt(demographics.age)
        if (age >= 18 && age <= 25) ageGroups['18-25']++
        else if (age >= 26 && age <= 35) ageGroups['26-35']++
        else if (age >= 36 && age <= 45) ageGroups['36-45']++
        else if (age >= 46 && age <= 55) ageGroups['46-55']++
        else if (age >= 56) ageGroups['56+']++
      }
      
      // Locations
      if (demographics.location) {
        locations[demographics.location] = (locations[demographics.location] || 0) + 1
      }
      
      // Occupations
      if (demographics.occupation) {
        occupations[demographics.occupation] = (occupations[demographics.occupation] || 0) + 1
      }
      
      // Education
      if (demographics.education) {
        educationLevels[demographics.education] = (educationLevels[demographics.education] || 0) + 1
      }
    })

    // Get recent activity
    const [recentActivityRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        'response' as type,
        s.title as survey_title,
        sr.demographics->>'$.name' as respondent_name,
        sr.submitted_at as timestamp
      FROM survey_responses sr
      JOIN surveys s ON sr.survey_id = s.id
      WHERE s.created_by = ?
      ORDER BY sr.submitted_at DESC
      LIMIT 10`,
      [userId]
    )

    // Get digital twin creation stats over time
    const [digitalTwinTrendsRows] = await db.execute<RowDataPacket[]>(
      `SELECT 
        DATE(sr.submitted_at) as date,
        COUNT(DISTINCT sr.agent_token) as digital_twins_created
      FROM survey_responses sr
      JOIN surveys s ON sr.survey_id = s.id
      WHERE s.created_by = ? 
        AND sr.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND sr.agent_token IS NOT NULL
      GROUP BY DATE(sr.submitted_at)
      ORDER BY date ASC`,
      [userId]
    )

    const dashboardData = {
      overview: overviewRows[0],
      responseTrends: trendsRows,
      digitalTwinTrends: digitalTwinTrendsRows,
      topSurveys: topSurveysRows,
      demographics: {
        ageGroups: Object.entries(ageGroups).map(([range, count]) => ({ range, count })),
        topLocations: Object.entries(locations)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([location, count]) => ({ location, count })),
        topOccupations: Object.entries(occupations)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([occupation, count]) => ({ occupation, count })),
        educationLevels: Object.entries(educationLevels)
          .map(([level, count]) => ({ level, count }))
      },
      recentActivity: recentActivityRows
    }

    return NextResponse.json(dashboardData)

  } catch (error) {
    console.error('Error in GET /api/surveys/dashboard:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 