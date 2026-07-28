import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import {
  generateSurveyFromStory,
  generateMethodologyNote,
  getOrCreateSystemUserId,
  generateAccessToken,
  generateShortCode,
  questionStyleToDbType,
  type QuestionStyle,
  type Breakdown,
  type RevealMode,
} from '@/app/utils/services/garrys-list';

export const runtime = 'nodejs';
export const maxDuration = 45;

const BREAKDOWN_LABELS: Record<Breakdown, string> = {
  district: 'District',
  occupation: 'Occupation',
  income: 'Household income',
  age: 'Age',
};

/**
 * POST /api/garrys-list/generate
 *
 * Step 2 of the no-login flow: confirmed Setup Screen fields -> AI-generated
 * neutral survey + methodology note -> a real, locked, published survey.
 * Public — no auth required.
 *
 * Body: { url, storyText, title, topic, numQuestions, questionStyle,
 *         breakdowns, revealMode, contextInstructions }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body?.url || '').trim();
    const storyText = String(body?.storyText || '').trim();
    const title = String(body?.title || '').trim();
    const topic = String(body?.topic || title).trim();
    const numQuestions = ([1, 3, 5].includes(body?.numQuestions) ? body.numQuestions : 3) as 1 | 3 | 5;
    const questionStyle: QuestionStyle = ['yes_no_unsure', 'multiple_choice', 'scale_1_5'].includes(body?.questionStyle)
      ? body.questionStyle
      : 'yes_no_unsure';
    const breakdowns: Breakdown[] = Array.isArray(body?.breakdowns)
      ? body.breakdowns.filter((b: any) => ['district', 'occupation', 'income', 'age'].includes(b))
      : [];
    const revealMode: RevealMode = ['percentage_split', 'hide_count', 'unlock_at_50'].includes(body?.revealMode)
      ? body.revealMode
      : 'percentage_split';
    const contextInstructions = String(body?.contextInstructions || '').trim();

    if (!storyText || storyText.length < 100) {
      return NextResponse.json({ status: false, message: 'Missing story text — go back and re-enter the URL.' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ status: false, message: 'Give the survey a short subject.' }, { status: 400 });
    }

    const generated = await generateSurveyFromStory({
      storyText,
      topic,
      numQuestions,
      questionStyle,
      breakdowns,
      revealMode,
      contextInstructions,
    });
    if (generated.error || !generated.questions?.length) {
      return NextResponse.json(
        { status: false, message: generated.error || 'Could not generate a neutral survey for this story.' },
        { status: 422 }
      );
    }

    const publisherName = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return "Garry's List";
      }
    })();

    const methodologyNote = await generateMethodologyNote({
      publisherName,
      storyTitle: title,
      hasBreakdowns: breakdowns.length > 0,
    });

    const dbQuestionType = questionStyleToDbType(questionStyle);
    const questions = generated.questions.map((q, i) => ({
      type: q.type === 'demographic' ? 'single-choice' : dbQuestionType,
      prompt: q.prompt,
      options: (q.options || []).map((o) => o.label),
      isRequired: false,
      order: i + 1,
    }));

    const accessToken = generateAccessToken();
    const shortCode = generateShortCode();
    const systemUserId = await getOrCreateSystemUserId();

    const surveyId = await SurveyRepo.createSurvey(
      {
        title: generated.title || title,
        description: `Reader survey generated from: ${url}`,
        isPublic: true,
        anonymityLevel: 'anonymous',
        demographicsRequired: false,
        autoPublish: true,
        source: 'garrys_list',
        sourceMetadata: {
          storyUrl: url,
          topic,
          questionStyle,
          numQuestions,
          breakdowns,
          revealMode,
          methodologyNote,
          accessToken,
          shortCode,
          publisherName,
        },
        questions,
      },
      systemUserId
    );

    // Rewrite the slug to end in our short code so /s/<code> resolves cleanly
    // and the public URL matches the "title-shortcode" format readers see.
    const db = await openSql();
    const [rows]: any = await db.execute('SELECT slug FROM surveys WHERE id = ?', [surveyId]);
    const baseSlug = String(rows?.[0]?.slug || 'survey').split('-').slice(0, -1).join('-') || 'survey';
    const finalSlug = `${baseSlug}-${shortCode}`;
    await db.execute('UPDATE surveys SET slug = ? WHERE id = ?', [finalSlug, surveyId]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://antelopedata.org';
    const publicUrl = `${baseUrl}/s/${shortCode}`;
    const embedSnippet = `<script src="${baseUrl}/embed/${shortCode}.js"></script>`;

    return NextResponse.json({
      status: true,
      surveyId,
      slug: finalSlug,
      shortCode,
      token: accessToken,
      publicUrl,
      embedSnippet,
      title: generated.title || title,
      previewQuestion: generated.questions[0],
      allQuestions: generated.questions,
      breakdownsSummary: breakdowns.map((b) => BREAKDOWN_LABELS[b]),
      methodologyNote,
    });
  } catch (error) {
    console.error('garrys-list generate error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to generate survey' },
      { status: 500 }
    );
  }
}
