import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';
import { createCompletion } from '@/app/utils/services/ai-service';
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage';

export const dynamic = 'force-dynamic';

// Basic safeguard to ensure no destructive SQL commands
function isSafeQuery(sql: string): boolean {
  const forbiddenPatterns = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER ", "INSERT ", "UPDATE "];
  const upperSql = sql.toUpperCase();
  return !forbiddenPatterns.some((fp) => upperSql.includes(fp));
}

interface FilteredRow {
  [key: string]: string | number | boolean | null;
}

/**
 * Filter out any "password"-like columns if they appear in query results,
 * so they are never exposed to the client.
 */
function removeSensitiveColumns(rows: RowDataPacket[]): { columns: string[]; results: FilteredRow[] } {
  if (rows.length === 0) {
    return { columns: [], results: [] };
  }
  
  const columns = Object.keys(rows[0]).filter((col) => !col.toLowerCase().includes("password"));

  const results = rows.map((row) => {
    const copy: FilteredRow = { ...row };
    for (const col of Object.keys(copy)) {
      if (col.toLowerCase().includes("password")) {
        delete copy[col];
      }
    }
    return copy;
  });

  return { columns, results };
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    const headerUserId = req.headers.get('x-user-id');

    const systemPrompt = `
      You are a helpful assistant that converts natural language to EXACT and VALID SQL queries.
      The database contains tables for surveys, survey_responses, survey_questions, survey_answers,
      responder_agents, users, agents, cohorts, organizations, and reports.
      ONLY produce SELECT statements or safe read-only queries.
      Return only the SQL, no extra text or explanation.
    `;

    const userPrompt = `Natural Language Query:\n"${query}"\n\nSQL:`;

    const completion = await withUserOrgAiUsage(
      headerUserId,
      'nl_to_sql',
      () =>
        createCompletion({
          tier: 'cheap',
          maxTokens: 400,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })
    );

    let generatedSql = (completion.content || "").trim();
    // Strip markdown fences if present
    generatedSql = generatedSql.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Quick check for safety
    if (!isSafeQuery(generatedSql)) {
      return NextResponse.json({
        message: "Refusing to run dangerous query.",
        status: false,
      });
    }

    // 2) Run query against MySQL
    const db = await openSql();
    const [rows] = await db.query<RowDataPacket[]>(generatedSql);

    // 3) Remove password columns
    const { columns, results } = removeSensitiveColumns(rows);

    return NextResponse.json({
      status: true,
      generated_sql: generatedSql,
      columns,
      results,
    });
  } catch (error) {
    console.error("Error in nl-to-sql route:", error);
    return NextResponse.json({
      status: false,
      message: "Failed to convert or execute query",
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
