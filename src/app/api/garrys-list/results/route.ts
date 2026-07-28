import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '@/app/utils/database/db';
import { createCompletion } from '@/app/utils/services/ai-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

function parseOptions(raw: any): string[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * POST /api/garrys-list/results
 *
 * Token-gated results dashboard (no login) — the access token generated at
 * survey creation is the only key until the publisher logs in.
 * Public — no auth required; gated by the token itself.
 *
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim().toUpperCase();
    if (!token) {
      return NextResponse.json({ status: false, message: 'Enter your survey token' }, { status: 400 });
    }

    const db = await openSql();
    const [surveys]: any = await db.execute(
      `SELECT id, title, slug, source_metadata FROM surveys
       WHERE source = 'garrys_list' AND source_metadata->>'$.accessToken' = ? LIMIT 1`,
      [token]
    );
    const survey = surveys?.[0];
    if (!survey) {
      return NextResponse.json({ status: false, message: "That token doesn't match a survey. Check for typos." }, { status: 404 });
    }

    const metadata = typeof survey.source_metadata === 'string' ? JSON.parse(survey.source_metadata) : survey.source_metadata || {};

    const [questions]: any = await db.execute(
      `SELECT id, type, prompt, options, question_order FROM survey_questions
       WHERE survey_id = ? ORDER BY question_order ASC`,
      [survey.id]
    );

    const [responseCountRows]: any = await db.execute(
      'SELECT COUNT(*) as n FROM survey_responses WHERE survey_id = ?',
      [survey.id]
    );
    const totalResponses = Number(responseCountRows?.[0]?.n || 0);

    // Per-question tallies.
    const questionResults = [];
    for (const q of questions) {
      const options = parseOptions(q.options);
      const [tally]: any = await db.execute(
        `SELECT sa.answer_value, COUNT(*) as n
         FROM survey_answers sa JOIN survey_responses sr ON sr.id = sa.response_id
         WHERE sa.question_id = ? AND sr.survey_id = ?
         GROUP BY sa.answer_value`,
        [q.id, survey.id]
      );
      const answered = tally.reduce((s: number, r: any) => s + Number(r.n), 0);
      const split = options.map((label) => {
        const row = tally.find((r: any) => r.answer_value === label);
        const n = row ? Number(row.n) : 0;
        return { label, count: n, pct: answered > 0 ? Math.round((n / answered) * 100) : 0 };
      });
      questionResults.push({
        id: q.id,
        type: q.type === 'single-choice' && q.question_order > (metadata.numQuestions || 3) ? 'demographic' : 'opinion',
        prompt: q.prompt,
        answered,
        split,
      });
    }

    // Crosstab: headline (first opinion question's top option) by each demographic breakdown.
    const opinionQs = questionResults.filter((q) => q.type === 'opinion');
    const demoQs = questionResults.filter((q) => q.type === 'demographic');
    const headline = opinionQs[0];
    const headlineOption = headline?.split?.[0]?.label;

    const breakdownCharts = [];
    if (headline && headlineOption) {
      for (const demoQ of demoQs) {
        const [rows]: any = await db.execute(
          `SELECT demo.answer_value as bucket, SUM(CASE WHEN main.answer_value = ? THEN 1 ELSE 0 END) as hits, COUNT(*) as n
           FROM survey_answers demo
           JOIN survey_answers main ON main.response_id = demo.response_id AND main.question_id = ?
           JOIN survey_responses sr ON sr.id = demo.response_id
           WHERE demo.question_id = ? AND sr.survey_id = ?
           GROUP BY demo.answer_value
           ORDER BY n DESC`,
          [headlineOption, headline.id, demoQ.id, survey.id]
        );
        const bars = rows
          .map((r: any) => ({ bucket: r.bucket, pct: Number(r.n) > 0 ? Math.round((Number(r.hits) / Number(r.n)) * 100) : 0, n: Number(r.n) }))
          .filter((b: any) => b.n > 0);
        if (bars.length) {
          breakdownCharts.push({ questionPrompt: demoQ.prompt, headlineOption, bars });
        }
      }
    }

    // AI "what stands out" narrative — grounded strictly in the computed numbers above.
    // Only questions with at least one real answer are included: an unanswered
    // question (0 responses) is missing data, not evidence of disbelief, and
    // must never be described as if readers "don't think" or "don't believe" it.
    let insight = '';
    const answeredOpinionQs = opinionQs.filter((q) => q.answered > 0);
    if (totalResponses > 0 && headline && headline.answered > 0) {
      try {
        const dataSummary = {
          totalResponses,
          opinionQuestions: answeredOpinionQs.map((q) => ({ prompt: q.prompt, sampleSize: q.answered, split: q.split })),
          breakdowns: breakdownCharts.map((b) => ({ prompt: b.questionPrompt, headlineOption: b.headlineOption, bars: b.bars })),
        };
        const completion = await createCompletion({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          maxTokens: 200,
          messages: [
            {
              role: 'system',
              content:
                'You write a 2-3 sentence "what stands out" insight for a newsletter publisher\'s reader-survey dashboard. ' +
                'Use ONLY the numbers in the JSON provided — never invent or round from memory. Every question included has ' +
                'sampleSize > 0, meaning it has real answers; only discuss questions actually present in the JSON — never ' +
                'mention or imply anything about a question that is not in the data (silence about it is missing data, not a ' +
                'reader opinion). Note the sample size when it is small (under 20). Point out the most notable real gap, ' +
                'contrast, or pattern, and suggest what story angle it opens up. Plain language.',
            },
            { role: 'user', content: JSON.stringify(dataSummary) },
          ],
        });
        insight = completion.content.trim();
      } catch {
        insight = '';
      }
    }

    return NextResponse.json({
      status: true,
      survey: { id: survey.id, title: survey.title, slug: survey.slug },
      totalResponses,
      methodologyNote: metadata.methodologyNote || '',
      storyUrl: metadata.storyUrl || '',
      questions: questionResults,
      breakdownCharts,
      insight,
    });
  } catch (error) {
    console.error('garrys-list results error:', error);
    return NextResponse.json(
      { status: false, message: error instanceof Error ? error.message : 'Failed to load results' },
      { status: 500 }
    );
  }
}
