import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql } from '@/app/utils/database/db';

export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const session = await auth();
    if (!session?.user?.id) {
      console.log('No session found in reports API');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('Fetching reports for user:', session.user.id);

    // Fetch all reports for the user
    const db = await openSql();
    const [reports] = await db.query(
      `SELECT 
        r.id,
        r.survey_id,
        s.title as survey_title,
        r.query_text as query,
        r.report_type as query_type,
        r.status,
        r.created_at,
        JSON_EXTRACT(r.metadata, '$.complexity_score') as complexity_score,
        JSON_EXTRACT(r.metadata, '$.response_count') as response_count
      FROM reports r
      JOIN surveys s ON r.survey_id = s.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      LIMIT 100`,
      [session.user.id]
    );

    // Format the reports - handle case where reports might be undefined
    const reportsArray = Array.isArray(reports) ? reports : [];
    const formattedReports = reportsArray.map((report: any) => ({
      id: report.id,
      survey_id: report.survey_id,
      survey_title: report.survey_title,
      query: report.query,
      query_type: report.query_type,
      status: report.status,
      created_at: report.created_at,
      metadata: {
        complexity_score: report.complexity_score,
        response_count: report.response_count
      }
    }));

    return NextResponse.json({ 
      status: true,
      reports: formattedReports 
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
} 