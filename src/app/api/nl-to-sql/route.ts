import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { openSql } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Basic safeguard to ensure no destructive SQL commands
function isSafeQuery(sql: string): boolean {
  const forbiddenPatterns = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];
  const upperSql = sql.toUpperCase();
  return !forbiddenPatterns.some((fp) => upperSql.includes(fp));
}

/**
 * A naive approach to enforce that only the requesting user's bets are shown.
 * If "FROM bets" is present in the query, we inject a "WHERE" or "AND" clause for user_id.
 * 
 * Note: This is a basic string manipulation. For a complex query (e.g., with JOINs, aliases, etc.),
 * you might need a real SQL parser or a safer approach.
 */
function enforceUserBetsOnly(rawSql: string, userId: number): string {
  let sql = rawSql;
  // Check if user references the bets table
  const upperSql = sql.toUpperCase();
  if (upperSql.includes("FROM BETS")) {
    const whereIndex = upperSql.indexOf(" WHERE ");
    if (whereIndex >= 0) {
      // There's already a WHERE -> add an AND
      sql = sql.replace(/where/i, `WHERE bets.user_id=${userId} AND`);
    } else {
      // No WHERE clause -> add one
      sql = sql.replace(/(from\\s+bets)/i, `$1 WHERE bets.user_id=${userId}`);
    }
  }
  return sql;
}

interface FilteredRow {
  [key: string]: string | number | boolean | null; // Adjust types as necessary
}

/**
 * Filter out any "password"-like columns if they appear in query results,
 * so they are never exposed to the client.
 */
function removeSensitiveColumns(rows: RowDataPacket[]): { columns: string[]; results: FilteredRow[] } {
  if (rows.length === 0) {
    return { columns: [], results: [] };
  }
  
  // Determine columns, excluding any that look like "password"
  const columns = Object.keys(rows[0]).filter((col) => !col.toLowerCase().includes("password"));

  // Filter the rows so the password columns are removed from each row
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
    // Example user ID from auth or session
    const userId = 123; // Replace with real user identification

    const { query } = await req.json();

    // 1) Use OpenAI to convert natural language to SQL
    const systemPrompt = `
      You are a helpful assistant that converts natural language to EXACT and VALID SQL queries.
      The schema is known to you. ONLY produce SELECT statements or safe read-only queries.
      Return only the SQL, no extra text or explanation.
    `;

    const userPrompt = `Natural Language Query:\n"${query}"\n\nSQL:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    let generatedSql = completion.choices[0].message?.content?.trim() || "";

    // Quick check for safety
    if (!isSafeQuery(generatedSql)) {
      return NextResponse.json({
        message: "Refusing to run dangerous query.",
        status: false,
      });
    }

    // 2) Enforce user can only see their own bets
    generatedSql = enforceUserBetsOnly(generatedSql, userId);

    // 3) Run query against your MySQL
    const db = await openSql();
    const [rows] = await db.query<RowDataPacket[]>(generatedSql);

    // 4) Remove password columns
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