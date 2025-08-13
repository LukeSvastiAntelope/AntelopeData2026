import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { DigitalTwinService } from "@/app/utils/services/digital-twin-service";

// POST /api/surveys/[id]/twins/deploy
// Enqueue a synthetic response job (Phase 2 placeholder; currently returns computed set)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ status: false, message: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 });
    }

    const body = await req.json();
    const threshold = typeof body?.threshold === 'number' ? body.threshold : 0.6;
    const candidates = Array.isArray(body?.candidates) ? body.candidates : [];

    // Verify ownership of survey
    const survey = await SurveyRepo.getSurveyById(surveyId, Number(userId));
    if (!survey) {
      return NextResponse.json({ status: false, message: 'Survey not found or access denied' }, { status: 404 });
    }

    // Filter candidates by readiness threshold
    const eligible = candidates.filter((c: any) => (c.readiness ?? 0) >= threshold).slice(0, 200);

    // If dryRun flag present, only return summary
    if (body?.dryRun === true) {
      return NextResponse.json({ status: true, mode: 'dry-run', surveyId, threshold, eligibleCount: eligible.length });
    }

    // Generate synthetic responses and persist with response_origin='digital_twin'
    const db = await getMySQLConnection();
    const questions = Array.isArray((survey as any).questions) ? (survey as any).questions : [];

    let created = 0; const errors: Array<{ agentToken: string; error: string }> = [];
    for (const twin of eligible) {
      try {
        const answers = await DigitalTwinService.generateSurveyAnswersForUserTwin(
          twin.agentToken,
          String(userId),
          questions.map((q: any) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options || null }))
        );

        // Insert response row
        const [result]: any = await db.execute(
          `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, ip_address, user_agent, source, agent_token, response_origin, twin_version, twin_match_score)
           VALUES (?, JSON_OBJECT(), ?, '127.0.0.1', 'digital-twin', 'native', ?, 'digital_twin', ?, ?)`,
          [surveyId, (survey as any).anonymity_level || 'full', twin.agentToken, 1, Number(twin.readiness || 0)]
        );
        const responseId = result.insertId;

        // Insert answer rows
        for (const a of answers) {
          await db.execute(
            `INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, ?)`,
            [responseId, a.questionId, Array.isArray(a.value) ? JSON.stringify(a.value) : a.value]
          );
        }
        created++;
      } catch (e: any) {
        errors.push({ agentToken: twin.agentToken, error: e.message || 'unknown' });
      }
    }

    return NextResponse.json({ status: true, surveyId, created, attempted: eligible.length, errors });
  } catch (error) {
    console.error('Error in POST /api/surveys/[id]/twins/deploy:', error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
}


