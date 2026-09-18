/**
 * Assembles campaign/district/survey context for analytics insights (Phase B).
 * Reuses shared tool execute handlers — does not duplicate their logic.
 * Missing sources are omitted; never throws for empty context.
 */

import { openSql } from '@/app/utils/database/db';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import { getDistrictDataTool } from '@/app/utils/services/tools/get-district-data';
import { readVoterFileTool } from '@/app/utils/services/tools/read-voter-file';

export type AnalyticsContextBundle = {
  surveyId: number;
  campaignId: number | null;
  sourcesIncluded: string[];
  sourcesMissing: string[];
  districtProfile: Record<string, unknown> | null;
  districtSummary: string | null;
  voterFileSummary: Record<string, unknown> | null;
  priorSurveys: Array<{
    id: number;
    title: string;
    status: string;
    responseCount: number;
    createdAt: string | null;
  }>;
  surveyIntent: {
    title: string;
    description: string | null;
    status: string | null;
    questions: Array<{ order: number; type: string; prompt: string }>;
  } | null;
  organization: {
    id: number;
    name: string;
    officeType: string | null;
    state: string | null;
    districtCode: string | null;
    candidateName: string | null;
    party: string | null;
    electionYear: number | null;
  } | null;
};

function isContextInjectionEnabled(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const raw = (process.env.ANALYTICS_CONTEXT_INJECTION || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export { isContextInjectionEnabled };

/**
 * Build analytics context. Never throws for missing data sources.
 */
export async function buildAnalyticsContext(
  surveyId: number,
  campaignId?: number | null
): Promise<AnalyticsContextBundle> {
  const sourcesIncluded: string[] = [];
  const sourcesMissing: string[] = [];

  const bundle: AnalyticsContextBundle = {
    surveyId,
    campaignId: campaignId ?? null,
    sourcesIncluded,
    sourcesMissing,
    districtProfile: null,
    districtSummary: null,
    voterFileSummary: null,
    priorSurveys: [],
    surveyIntent: null,
    organization: null,
  };

  // --- Current survey intent ---
  try {
    const survey = await SurveyRepo.getSurveyByIdAny(surveyId);
    if (survey) {
      const questions = Array.isArray((survey as any).questions)
        ? (survey as any).questions.map((q: any, idx: number) => ({
            order: Number(q.question_order ?? q.order ?? idx + 1),
            type: String(q.type || 'text'),
            prompt: String(q.prompt || '').trim(),
          }))
        : [];
      bundle.surveyIntent = {
        title: String((survey as any).title || `Survey ${surveyId}`),
        description: (survey as any).description ? String((survey as any).description) : null,
        status: (survey as any).status ? String((survey as any).status) : null,
        questions,
      };
      sourcesIncluded.push('survey_intent');

      if (!bundle.campaignId && (survey as any).organization_id) {
        bundle.campaignId = Number((survey as any).organization_id);
      }

      // Voter-file summary for survey owner (reuse read_voter_file tool)
      const ownerId = Number((survey as any).created_by);
      if (Number.isFinite(ownerId) && ownerId > 0) {
        try {
          const voter = await readVoterFileTool.execute({ limit: 20 }, { userId: ownerId });
          bundle.voterFileSummary = {
            summary: voter.summary,
            ...(voter.data || {}),
          };
          const total = Number((voter.data as any)?.total ?? 0);
          if (total > 0 || (Array.isArray((voter.data as any)?.lists) && (voter.data as any).lists.length)) {
            sourcesIncluded.push('voter_file_summary');
          } else {
            sourcesMissing.push('voter_file_summary');
          }
        } catch {
          sourcesMissing.push('voter_file_summary');
        }
      } else {
        sourcesMissing.push('voter_file_summary');
      }

      // Prior surveys for same campaign (org) or same creator
      try {
        const db = await openSql();
        const orgId = bundle.campaignId;
        let priorRows: any[] = [];
        if (orgId) {
          const [rows]: any = await db.execute(
            `SELECT s.id, s.title, s.status, s.created_at,
                    (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
             FROM surveys s
             WHERE s.organization_id = ? AND s.id != ?
             ORDER BY s.created_at DESC
             LIMIT 8`,
            [orgId, surveyId]
          );
          priorRows = rows || [];
        } else if (ownerId) {
          const [rows]: any = await db.execute(
            `SELECT s.id, s.title, s.status, s.created_at,
                    (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
             FROM surveys s
             WHERE s.created_by = ? AND s.id != ?
             ORDER BY s.created_at DESC
             LIMIT 8`,
            [ownerId, surveyId]
          );
          priorRows = rows || [];
        }
        bundle.priorSurveys = priorRows.map((r) => ({
          id: Number(r.id),
          title: String(r.title || 'Untitled'),
          status: String(r.status || 'unknown'),
          responseCount: Number(r.response_count || 0),
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        }));
        if (bundle.priorSurveys.length) sourcesIncluded.push('prior_surveys');
        else sourcesMissing.push('prior_surveys');
      } catch {
        sourcesMissing.push('prior_surveys');
      }
    } else {
      sourcesMissing.push('survey_intent');
    }
  } catch {
    sourcesMissing.push('survey_intent');
  }

  // --- Organization / district ---
  try {
    const orgId = bundle.campaignId;
    if (orgId) {
      const db = await openSql();
      const [rows]: any = await db.execute(
        `SELECT id, name, office_type, state, district_code, candidate_name, party, election_year
         FROM organizations WHERE id = ? LIMIT 1`,
        [orgId]
      );
      const org = rows?.[0];
      if (org) {
        bundle.organization = {
          id: Number(org.id),
          name: String(org.name || ''),
          officeType: org.office_type ?? null,
          state: org.state ?? null,
          districtCode: org.district_code ?? null,
          candidateName: org.candidate_name ?? null,
          party: org.party ?? null,
          electionYear: org.election_year != null ? Number(org.election_year) : null,
        };
        sourcesIncluded.push('organization');

        if (org.district_code) {
          try {
            const district = await getDistrictDataTool.execute(
              { districtCode: String(org.district_code) },
              { userId: 0 }
            );
            bundle.districtSummary = district.summary;
            bundle.districtProfile = district.data || null;
            sourcesIncluded.push('district_profile');
          } catch {
            sourcesMissing.push('district_profile');
          }
        } else {
          sourcesMissing.push('district_profile');
        }
      } else {
        sourcesMissing.push('organization', 'district_profile');
      }
    } else {
      sourcesMissing.push('organization');
      // Soft infer: try a House district code from survey title/description (e.g. NJ-5)
      const blob = `${bundle.surveyIntent?.title || ''} ${bundle.surveyIntent?.description || ''}`;
      const match = blob.toUpperCase().match(/\b([A-Z]{2})\s*-?\s*(\d{1,2})\b/);
      if (match) {
        const code = `${match[1]}-${parseInt(match[2], 10)}`;
        try {
          const district = await getDistrictDataTool.execute({ districtCode: code }, { userId: 0 });
          bundle.districtSummary = district.summary;
          bundle.districtProfile = district.data || null;
          sourcesIncluded.push('district_profile');
        } catch {
          sourcesMissing.push('district_profile');
        }
      } else {
        sourcesMissing.push('district_profile');
      }
    }
  } catch {
    sourcesMissing.push('organization', 'district_profile');
  }

  // Dedupe missing/included
  bundle.sourcesIncluded = [...new Set(sourcesIncluded)];
  bundle.sourcesMissing = [...new Set(sourcesMissing)].filter(
    (s) => !bundle.sourcesIncluded.includes(s)
  );

  return bundle;
}

/** Compact text block for LLM prompts. */
export function formatAnalyticsContextForPrompt(bundle: AnalyticsContextBundle): string {
  const sections: string[] = [];
  sections.push(`Sources included: ${bundle.sourcesIncluded.join(', ') || 'none'}`);
  sections.push(`Sources missing: ${bundle.sourcesMissing.join(', ') || 'none'}`);

  if (bundle.organization) {
    const o = bundle.organization;
    sections.push(
      [
        '### Campaign / organization',
        `- Name: ${o.name}`,
        o.candidateName ? `- Candidate: ${o.candidateName}` : null,
        o.officeType ? `- Office: ${o.officeType}` : null,
        o.state ? `- State: ${o.state}` : null,
        o.districtCode ? `- District: ${o.districtCode}` : null,
        o.party ? `- Party: ${o.party}` : null,
        o.electionYear ? `- Election year: ${o.electionYear}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (bundle.districtSummary) {
    sections.push(`### District profile\n${bundle.districtSummary}`);
  }

  if (bundle.voterFileSummary) {
    sections.push(
      `### Voter-file / contact-list summary\n${
        typeof bundle.voterFileSummary.summary === 'string'
          ? bundle.voterFileSummary.summary
          : JSON.stringify(bundle.voterFileSummary, null, 2)
      }`
    );
  }

  if (bundle.priorSurveys.length) {
    sections.push(
      [
        '### Prior surveys (same campaign/creator)',
        ...bundle.priorSurveys.map(
          (s) =>
            `- #${s.id} | ${s.title} | ${s.status} | ${s.responseCount} responses | ${s.createdAt || 'n/a'}`
        ),
      ].join('\n')
    );
  }

  if (bundle.surveyIntent) {
    const q = bundle.surveyIntent.questions
      .slice(0, 40)
      .map((item) => `${item.order}. (${item.type}) ${item.prompt}`)
      .join('\n');
    sections.push(
      [
        '### Current survey intent',
        `- Title: ${bundle.surveyIntent.title}`,
        bundle.surveyIntent.description
          ? `- Description: ${bundle.surveyIntent.description}`
          : null,
        bundle.surveyIntent.status ? `- Status: ${bundle.surveyIntent.status}` : null,
        'Questions:',
        q || '(no questions)',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return sections.join('\n\n');
}
