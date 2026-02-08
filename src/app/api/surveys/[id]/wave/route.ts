import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../../utils/database/db';

/**
 * POST /api/surveys/[id]/wave
 * 
 * Create a new wave of a tracking poll. Clones the survey questions
 * and links the new survey to the original as a subsequent wave.
 * 
 * Response: { status: boolean, survey: { id, slug, wave_number } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Get the original survey
    const [surveys]: any = await db.execute(
      'SELECT * FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found or access denied' },
        { status: 404 }
      );
    }

    const original = surveys[0];

    // Determine the parent survey ID and next wave number
    const parentId = original.parent_survey_id || original.id;
    
    // Find the highest wave number for this tracking poll series
    const [waves]: any = await db.execute(
      'SELECT MAX(wave_number) as max_wave FROM surveys WHERE parent_survey_id = ? OR id = ?',
      [parentId, parentId]
    );

    const currentMaxWave = waves[0]?.max_wave || 1;
    const nextWave = currentMaxWave + 1;

    // If the original doesn't have a wave number yet, set it to 1
    if (!original.wave_number) {
      await db.execute(
        'UPDATE surveys SET wave_number = 1, parent_survey_id = NULL WHERE id = ?',
        [parentId]
      );
    }

    // Generate a unique slug for the new wave
    const baseSlug = original.slug.replace(/-wave-\d+$/, '');
    const newSlug = `${baseSlug}-wave-${nextWave}`;

    // Create the new survey (clone)
    const [result]: any = await db.execute(
      `INSERT INTO surveys (title, description, slug, created_by, is_public, anonymity_level, demographics_required, status, parent_survey_id, wave_number, source, source_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, 'native', ?)`,
      [
        `${original.title} (Wave ${nextWave})`,
        original.description,
        newSlug,
        userId,
        original.is_public,
        original.anonymity_level,
        original.demographics_required,
        parentId,
        nextWave,
        JSON.stringify({ cloned_from: original.id, wave: nextWave })
      ]
    );

    const newSurveyId = result.insertId;

    // Clone the questions
    const [questions]: any = await db.execute(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order',
      [original.id]
    );

    for (const q of questions) {
      await db.execute(
        `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newSurveyId, q.type, q.prompt, q.options, q.is_required, q.question_order]
      );
    }

    return NextResponse.json({
      status: true,
      survey: {
        id: newSurveyId,
        slug: newSlug,
        wave_number: nextWave,
        parent_survey_id: parentId,
      },
      message: `Wave ${nextWave} created successfully`,
    });

  } catch (error) {
    console.error('Wave creation error:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to create new wave' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/surveys/[id]/wave
 * 
 * Get all waves in a tracking poll series.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    // Get the survey to find its parent
    const [surveys]: any = await db.execute(
      'SELECT * FROM surveys WHERE id = ? AND created_by = ?',
      [surveyId, userId]
    );

    if (!surveys || surveys.length === 0) {
      return NextResponse.json(
        { status: false, message: 'Survey not found' },
        { status: 404 }
      );
    }

    const survey = surveys[0];
    const parentId = survey.parent_survey_id || survey.id;

    // Get all waves in this series
    const [allWaves]: any = await db.execute(
      `SELECT s.id, s.title, s.slug, s.status, s.wave_number, s.created_at,
              (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as response_count
       FROM surveys s
       WHERE s.id = ? OR s.parent_survey_id = ?
       ORDER BY s.wave_number ASC, s.created_at ASC`,
      [parentId, parentId]
    );

    return NextResponse.json({
      status: true,
      parentSurveyId: parentId,
      waves: allWaves,
      totalWaves: allWaves.length,
    });

  } catch (error) {
    console.error('Wave list error:', error);
    return NextResponse.json(
      { status: false, message: 'Failed to get waves' },
      { status: 500 }
    );
  }
}
