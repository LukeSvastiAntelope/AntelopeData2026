import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import {
  PoliticalModelingEngine,
  type SurveyResponseRow,
} from '@/app/utils/api/politicalModeling';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/surveys/[id]/predict
 *
 * Run predictive modeling on a survey (or set of tracking poll waves).
 *
 * Body:
 *  - candidateQuestion: string   (question key or substring to identify the head-to-head Q)
 *  - candidates: string[]        (candidate names, e.g. ["Biden", "Trump"])
 *  - includeWaves?: boolean      (if true, also analyze previous waves for trend data)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { candidateQuestion, candidates, includeWaves } = body as {
      candidateQuestion: string;
      candidates: string[];
      includeWaves?: boolean;
    };

    if (!candidateQuestion || !candidates || candidates.length < 2) {
      return NextResponse.json(
        {
          status: false,
          message:
            'candidateQuestion and candidates (at least 2) are required',
        },
        { status: 400 }
      );
    }

    const db = await openSql();

    // Verify survey ownership
    const [surveys]: any = await db.execute(
      'SELECT id, title, parent_survey_id, wave_number FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found' },
        { status: 404 }
      );
    }

    const survey = surveys[0];

    // Gather survey IDs to include
    const surveyIds: number[] = [Number(surveyId)];
    let waveData: Array<{ waveNumber: number; surveyId: number; title: string }> = [];

    if (includeWaves) {
      // Find all waves in this tracking poll series
      const parentId = survey.parent_survey_id || survey.id;

      const [waves]: any = await db.execute(
        `SELECT id, title, wave_number FROM surveys 
         WHERE (id = ? OR parent_survey_id = ?) AND created_by = ?
         ORDER BY wave_number ASC`,
        [parentId, parentId, userId]
      );

      waveData = waves.map((w: any) => ({
        waveNumber: w.wave_number || 1,
        surveyId: w.id,
        title: w.title,
      }));

      for (const w of waves) {
        if (!surveyIds.includes(w.id)) surveyIds.push(w.id);
      }
    }

    // Fetch responses for the primary survey
    const responses = await fetchSurveyResponses(db, Number(surveyId));
    const prediction = PoliticalModelingEngine.predict(
      responses,
      candidateQuestion,
      candidates
    );

    // If tracking poll, also compute per-wave predictions for trend data
    let waveTrends: Array<{
      waveNumber: number;
      surveyId: number;
      title: string;
      candidates: Array<{
        name: string;
        likelyVoterSupport: number;
        winProbability: number;
      }>;
      sampleSize: number;
    }> = [];

    if (includeWaves && waveData.length > 1) {
      for (const wave of waveData) {
        const waveResponses = await fetchSurveyResponses(db, wave.surveyId);
        const wavePrediction = PoliticalModelingEngine.predict(
          waveResponses,
          candidateQuestion,
          candidates
        );
        waveTrends.push({
          waveNumber: wave.waveNumber,
          surveyId: wave.surveyId,
          title: wave.title,
          candidates: wavePrediction.candidates.map((c) => ({
            name: c.name,
            likelyVoterSupport: c.likelyVoterSupport,
            winProbability: c.winProbability,
          })),
          sampleSize: wavePrediction.totalSampleSize,
        });
      }
    }

    return NextResponse.json({
      status: true,
      prediction,
      waveTrends: waveTrends.length > 0 ? waveTrends : undefined,
    });
  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error ? error.message : 'Failed to run prediction',
      },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------
// Helper: fetch and parse survey responses into the engine format
// -----------------------------------------------------------------------

async function fetchSurveyResponses(
  db: any,
  surveyId: number
): Promise<SurveyResponseRow[]> {
  const [rows]: any = await db.execute(
    'SELECT demographics, answers FROM survey_responses WHERE survey_id = ?',
    [surveyId]
  );

  return rows.map((row: any) => {
    let demographics: Record<string, string> = {};
    let answers: Record<string, string | string[]> = {};

    try {
      demographics =
        typeof row.demographics === 'string'
          ? JSON.parse(row.demographics)
          : row.demographics || {};
    } catch {
      demographics = {};
    }

    try {
      answers =
        typeof row.answers === 'string'
          ? JSON.parse(row.answers)
          : row.answers || {};
    } catch {
      answers = {};
    }

    return { demographics, answers };
  });
}
