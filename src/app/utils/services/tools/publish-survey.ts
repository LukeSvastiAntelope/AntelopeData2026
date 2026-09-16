import { SurveyRepo } from '@/app/utils/database/survey-repo';
import type { CampaignTool } from './types';

type Input = {
  surveyId: number;
  title?: string;
  questions?: Array<{
    type?: string;
    prompt: string;
    options?: string[] | null;
    isRequired?: boolean;
  }>;
  startAt?: string | null;
  endAt?: string | null;
  anonymityLevel?: string;
};

/**
 * Publish (or schedule) a survey — public / irreversible relative to draft.
 * Executor requires human approval before this runs.
 */
export const publishSurveyTool: CampaignTool<Input> = {
  name: 'publish_survey',
  description:
    'Publish or schedule an existing survey. Public-facing and effectively irreversible for respondents — requires human approval.',
  inputSchema: {
    type: 'object',
    properties: {
      surveyId: { type: 'number' },
      title: { type: 'string', description: 'Optional title override used at publish time' },
      questions: {
        type: 'array',
        description: 'Optional questions payload; if omitted, existing survey questions are used when available via title-only publish paths',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            prompt: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            isRequired: { type: 'boolean' },
          },
          required: ['prompt'],
        },
      },
      startAt: { type: ['string', 'null'] },
      endAt: { type: ['string', 'null'] },
      anonymityLevel: { type: 'string' },
    },
    required: ['surveyId'],
    additionalProperties: false,
  },
  risk: 'approval',
  async execute(input, ctx) {
    const surveyId = Number(input.surveyId);
    if (!Number.isFinite(surveyId) || surveyId <= 0) {
      throw new Error('surveyId must be a positive number');
    }

    const existing = await SurveyRepo.getSurveyById(surveyId, ctx.userId);
    if (!existing) {
      throw new Error(`Survey ${surveyId} not found or not accessible.`);
    }

    const title = String(input.title || (existing as any).title || '').trim();
    const questions =
      Array.isArray(input.questions) && input.questions.length
        ? input.questions
        : Array.isArray((existing as any).questions)
          ? (existing as any).questions
          : [];

    if (!title) throw new Error('title is required to publish');
    if (!questions.length) throw new Error('questions are required to publish');

    const ok = await SurveyRepo.publishSurvey(
      surveyId,
      {
        title,
        description: (existing as any).description || '',
        questions,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        anonymityLevel: input.anonymityLevel || (existing as any).anonymity_level || 'full',
        isPublic: (existing as any).is_public !== false && (existing as any).isPublic !== false,
      },
      ctx.userId
    );

    if (!ok) {
      throw new Error(`Failed to publish survey ${surveyId}.`);
    }

    const updated = await SurveyRepo.getSurveyById(surveyId, ctx.userId);

    return {
      summary: [
        `### Survey #${surveyId} published`,
        `- Title: ${(updated as any)?.title || title}`,
        `- Status: ${(updated as any)?.status || 'published'}`,
        `- Slug: ${(updated as any)?.slug || 'n/a'}`,
      ].join('\n'),
      data: {
        id: surveyId,
        status: (updated as any)?.status || 'published',
        slug: (updated as any)?.slug || null,
      },
    };
  },
};
