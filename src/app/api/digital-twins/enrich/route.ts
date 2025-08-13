import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

interface EnrichBody {
  agentToken?: string;
  agentTokens?: string[];
}

async function userOwnsTwin(db: any, agentToken: string, userId: string): Promise<boolean> {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM responder_agents ra
     JOIN survey_responses sr ON sr.id = ra.created_from_response_id
     JOIN surveys s ON s.id = sr.survey_id
     WHERE ra.agent_token = ? AND s.created_by = ?`,
    [agentToken, userId]
  );
  return (rows?.[0]?.cnt || 0) > 0;
}

async function fetchLatestDemographicsAndTitle(db: any, agentToken: string): Promise<{ demographics: any, surveyTitle: string } | null> {
  const [rows] = await db.execute(
    `SELECT sr.demographics, s.title
     FROM survey_responses sr
     JOIN surveys s ON s.id = sr.survey_id
     WHERE sr.agent_token = ?
     ORDER BY sr.submitted_at DESC
     LIMIT 1`,
    [agentToken]
  );
  if (!rows?.[0]) return null;
  return {
    demographics: rows[0].demographics,
    surveyTitle: rows[0].title || 'Multiple Surveys'
  };
}

async function fetchAggregatedAnswers(db: any, agentToken: string): Promise<{ questionId: number, questionText: string, value: any }[]> {
  const [rows] = await db.execute(
    `SELECT sq.prompt AS question_text, sa.answer_value
     FROM survey_responses sr
     JOIN survey_answers sa ON sa.response_id = sr.id
     JOIN survey_questions sq ON sq.id = sa.question_id
     WHERE sr.agent_token = ?
     ORDER BY sr.submitted_at ASC, sa.id ASC`,
    [agentToken]
  );
  const answers: { questionId: number, questionText: string, value: any }[] = [];
  let idx = 1;
  for (const row of rows) {
    answers.push({ questionId: idx++, questionText: row.question_text, value: row.answer_value });
  }
  return answers;
}

// POST /api/digital-twins/enrich - Regenerate persona/capability + vector for one or more twins (ownership enforced)
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Authentication required' }, { status: 401 });
    }

    const body = (await req.json()) as EnrichBody;
    const tokens = body.agentTokens && Array.isArray(body.agentTokens)
      ? body.agentTokens
      : (body.agentToken ? [body.agentToken] : []);

    if (!tokens.length) {
      return NextResponse.json({ status: false, message: 'Missing agentToken(s)' }, { status: 400 });
    }

    const db = await getMySQLConnection();
    const results: Array<{ agentToken: string, status: 'updated' | 'skipped' | 'error', reason?: string }> = [];

    for (const agentToken of tokens) {
      try {
        const owns = await userOwnsTwin(db, agentToken, userId);
        if (!owns) {
          results.push({ agentToken, status: 'skipped', reason: 'not_owner' });
          continue;
        }

        const latest = await fetchLatestDemographicsAndTitle(db, agentToken);
        if (!latest) {
          results.push({ agentToken, status: 'skipped', reason: 'no_responses' });
          continue;
        }

        const answers = await fetchAggregatedAnswers(db, agentToken);
        if (answers.length === 0) {
          results.push({ agentToken, status: 'skipped', reason: 'no_answers' });
          continue;
        }

        // Generate persona and re-store vector + persona snapshot
        const principles = await DigitalTwinService.generatePersonaPrinciples(
          latest.demographics,
          answers,
          latest.surveyTitle
        );

        await DigitalTwinService.storeInPinecone(
          agentToken,
          latest.demographics,
          principles,
          answers,
          latest.surveyTitle,
          String(userId)
        );

        results.push({ agentToken, status: 'updated' });
      } catch (err) {
        console.error('Enrich error for', agentToken, err);
        results.push({ agentToken, status: 'error', reason: err instanceof Error ? err.message : 'unknown_error' });
      }
    }

    return NextResponse.json({ status: true, results });
  } catch (error) {
    console.error('Error in POST /api/digital-twins/enrich:', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
}


