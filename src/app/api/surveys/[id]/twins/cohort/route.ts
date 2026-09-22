import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/surveys/[id]/twins/cohort - load saved cohort config
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = auth;

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 });

    const survey = await SurveyRepo.getSurveyById(surveyId, Number(userId));
    if (!survey) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

    const cfg = (survey as any).source_metadata?.twinCohortConfig || null;
    return NextResponse.json({ status: true, cohort: cfg });
  } catch (e) {
    console.error('GET cohort error:', e);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/surveys/[id]/twins/cohort - save cohort config (merged into surveys.source_metadata)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = auth;

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 });

    const body = await req.json();
    const cohort = body?.cohort;
    if (!cohort || typeof cohort !== 'object') return NextResponse.json({ status: false, message: 'Invalid cohort payload' }, { status: 400 });

    // Verify ownership
    const survey = await SurveyRepo.getSurveyById(surveyId, Number(userId));
    if (!survey) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

    // Merge into source_metadata JSON
    const db = await getMySQLConnection();
    const currentMeta = (survey as any).source_metadata || {};
    const newMeta = { ...currentMeta, twinCohortConfig: cohort };
    await db.execute(`UPDATE surveys SET source_metadata = ? WHERE id = ? AND created_by = ?`, [JSON.stringify(newMeta), surveyId, Number(userId)]);

    return NextResponse.json({ status: true });
  } catch (e) {
    console.error('POST cohort error:', e);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
  }
}


