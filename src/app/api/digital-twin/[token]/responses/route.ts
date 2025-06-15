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
    const [rows] = await db.execute<any[]>(
      `SELECT s.id, s.title, sr.submitted_at
       FROM responder_agents ra
       JOIN survey_responses sr ON ra.created_from_response_id = sr.id
       JOIN surveys s ON sr.survey_id = s.id
       WHERE ra.agent_token = ?
       ORDER BY sr.submitted_at DESC`,
      [token]
    );

    return NextResponse.json({ status: true, surveys: rows });
  } catch (error) {
    console.error('Error in GET /api/digital-twin/[token]/responses', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
} 