/**
 * GET /api/python-analysis/dataset-sources?surveyId=
 * Catalog of available analysis sources: surveys, voter lists, prior surveys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';

export async function GET(req: NextRequest) {
  try {
    const auth = requireUserId(req);
    if (typeof auth !== 'string') return auth;
    const userId = Number(auth);

    const surveyIdRaw = req.nextUrl.searchParams.get('surveyId');
    const surveyId =
      surveyIdRaw != null && surveyIdRaw !== ''
        ? Number(surveyIdRaw)
        : null;

    const sources: Array<{
      id: string;
      kind: 'survey' | 'voter' | 'prior_survey';
      label: string;
      subtitle?: string;
      rowEstimate?: number;
      surveyId?: number;
      listId?: number;
    }> = [];

    const db = await openSql();

    // --- This survey's responses ---
    if (surveyId && Number.isFinite(surveyId) && surveyId > 0) {
      try {
        const survey = await SurveyRepo.getSurveyByIdAny(surveyId);
        if (survey) {
          const [countRows]: any = await db.execute(
            `SELECT COUNT(*) AS cnt FROM survey_responses WHERE survey_id = ?`,
            [surveyId]
          );
          const cnt = Number(countRows?.[0]?.cnt || 0);
          sources.push({
            id: `survey-${surveyId}`,
            kind: 'survey',
            label: String((survey as any).title || `Survey #${surveyId}`),
            subtitle: 'This survey’s responses',
            rowEstimate: cnt,
            surveyId,
          });

          const orgId = Number((survey as any).organization_id) || null;
          const ownerId = Number((survey as any).created_by) || null;

          // Prior surveys (same org or creator)
          let priorRows: any[] = [];
          if (orgId) {
            const [rows]: any = await db.execute(
              `SELECT s.id, s.title, s.status,
                      (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
               FROM surveys s
               WHERE s.organization_id = ? AND s.id != ?
               ORDER BY s.created_at DESC
               LIMIT 12`,
              [orgId, surveyId]
            );
            priorRows = rows || [];
          } else if (ownerId) {
            const [rows]: any = await db.execute(
              `SELECT s.id, s.title, s.status,
                      (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
               FROM surveys s
               WHERE s.created_by = ? AND s.id != ?
               ORDER BY s.created_at DESC
               LIMIT 12`,
              [ownerId, surveyId]
            );
            priorRows = rows || [];
          }

          for (const r of priorRows) {
            const id = Number(r.id);
            const responses = Number(r.response_count || 0);
            if (!id || responses <= 0) continue;
            sources.push({
              id: `prior-${id}`,
              kind: 'prior_survey',
              label: String(r.title || `Survey #${id}`),
              subtitle: `Prior survey · ${r.status || 'unknown'} · ${responses.toLocaleString()} responses`,
              rowEstimate: responses,
              surveyId: id,
            });
          }
        }
      } catch (e) {
        console.warn('[dataset-sources] survey/prior lookup failed', e);
      }
    }

    // --- All surveys with responses (if no focal survey, or as extras) ---
    if (!surveyId) {
      try {
        const [rows]: any = await db.execute(
          `SELECT s.id, s.title, s.status,
                  (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
           FROM surveys s
           WHERE s.created_by = ?
             AND (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) > 0
           ORDER BY s.created_at DESC
           LIMIT 20`,
          [userId]
        );
        for (const r of rows || []) {
          const id = Number(r.id);
          sources.push({
            id: `survey-${id}`,
            kind: 'survey',
            label: String(r.title || `Survey #${id}`),
            subtitle: `${Number(r.response_count || 0).toLocaleString()} responses`,
            rowEstimate: Number(r.response_count || 0),
            surveyId: id,
          });
        }
      } catch (e) {
        console.warn('[dataset-sources] survey list failed', e);
      }
    }

    // --- Voter / contact lists ---
    try {
      const [lists]: any = await db.execute(
        `SELECT id, name, contact_count, source_file, created_at
         FROM contact_lists
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      );
      for (const r of lists || []) {
        const id = Number(r.id);
        const count = Number(r.contact_count || 0);
        sources.push({
          id: `voter-${id}`,
          kind: 'voter',
          label: String(r.name || `Contact list #${id}`),
          subtitle: `Voter / contact file · ${count.toLocaleString()} contacts`,
          rowEstimate: count,
          listId: id,
        });
      }
    } catch (e) {
      console.warn('[dataset-sources] voter lists failed', e);
    }

    // Dedupe by id
    const seen = new Set<string>();
    const deduped = sources.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    return NextResponse.json({ status: true, sources: deduped });
  } catch (error) {
    console.error('[python-analysis/dataset-sources]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
