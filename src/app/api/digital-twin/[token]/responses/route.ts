import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";

// GET /api/digital-twin/[token]/responses – list surveys answered by this responder
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ status: false, message: 'Missing token' }, { status: 400 });
    }

    const db = await getMySQLConnection();
    
    // Get all survey responses for this digital twin using the new agent_token relationship
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
       WHERE sr.agent_token = ?
       ORDER BY sr.submitted_at DESC`,
      [token]
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