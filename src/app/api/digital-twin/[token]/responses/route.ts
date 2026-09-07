import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { auth } from "@/auth";

// GET /api/digital-twin/[token]/responses – list surveys answered by this responder (for surveys created by current user)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ status: false, message: 'Missing token' }, { status: 400 });
    }

    // Get current user session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getMySQLConnection();
    
    // Get survey responses for this digital twin, but only for surveys created by the current user
    const [rows] = await db.execute<any[]>(
      `SELECT 
        s.id, 
        s.title, 
        s.description,
        sr.id as response_id,
        sr.submitted_at,
        sr.demographics
       FROM survey_responses sr
       JOIN surveys s ON sr.survey_id = s.id
       WHERE sr.agent_token = ? AND s.created_by = ?
       ORDER BY sr.submitted_at DESC`,
      [token, session.user.id]
    );

    return NextResponse.json({ 
      status: true, 
      surveys: rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        response_id: row.response_id,
        submitted_at: row.submitted_at,
        demographics: row.demographics
      }))
    });
  } catch (error) {
    console.error('Error in GET /api/digital-twin/[token]/responses', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
} 