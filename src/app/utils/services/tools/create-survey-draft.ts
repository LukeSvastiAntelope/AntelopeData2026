import { SurveyRepo } from '@/app/utils/database/survey-repo';
import type { CampaignTool } from './types';

type QuestionInput = {
  type?: string;
  prompt: string;
  options?: string[] | null;
  isRequired?: boolean;
};

type Input = {
  title: string;
  description?: string;
  questions: Array<string | QuestionInput>;
  organizationId?: number;
};

/**
 * Persist a survey as draft (never auto-publishes).
 * Shared by consultant tools and cohort chat survey tools.
 */
export const createSurveyDraftTool: CampaignTool<Input> = {
  name: 'create_survey_draft',
  description:
    'Create a survey in draft status from a title and questions. Does not publish. Reversible private write.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Survey title' },
      description: { type: 'string', description: 'Optional description' },
      questions: {
        type: 'array',
        description: 'Question prompts (strings) or objects with type/prompt/options',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                type: { type: 'string' },
                prompt: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                isRequired: { type: 'boolean' },
              },
              required: ['prompt'],
            },
          ],
        },
      },
      organizationId: { type: 'number', description: 'Optional organization id' },
    },
    required: ['title', 'questions'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const title = String(input.title || '').trim();
    const rawQuestions = Array.isArray(input.questions) ? input.questions : [];

    if (!title) throw new Error('title is required');
    if (!rawQuestions.length) throw new Error('at least one question is required');

    const questions = rawQuestions
      .map((q, idx) => {
        if (typeof q === 'string') {
          const prompt = q.trim();
          if (!prompt) return null;
          return {
            type: 'text',
            prompt,
            options: null,
            isRequired: true,
            order: idx + 1,
          };
        }
        const prompt = String(q?.prompt || '').trim();
        if (!prompt) return null;
        return {
          type: q.type || 'text',
          prompt,
          options: Array.isArray(q.options) ? q.options : null,
          isRequired: q.isRequired !== false,
          order: idx + 1,
        };
      })
      .filter(Boolean);

    if (!questions.length) throw new Error('at least one valid question is required');

    const organizationId =
      input.organizationId !== undefined && Number.isFinite(Number(input.organizationId))
        ? Number(input.organizationId)
        : ctx.organizationId || undefined;

    const createdId = await SurveyRepo.createSurvey(
      {
        title,
        description: typeof input.description === 'string' ? input.description.trim() : '',
        questions,
        organizationId,
        isPublic: false,
        autoPublish: false,
      },
      ctx.userId
    );

    const created = await SurveyRepo.getSurveyById(Number(createdId), ctx.userId);

    return {
      summary: [
        '### Survey draft created',
        `- ID: ${Number(createdId)}`,
        `- Slug: ${(created as any)?.slug || 'n/a'}`,
        `- Status: ${(created as any)?.status || 'draft'}`,
        `- Questions: ${questions.length}`,
        '',
        'Publishing requires `publish_survey` (approval-gated).',
      ].join('\n'),
      data: {
        id: Number(createdId),
        slug: (created as any)?.slug || null,
        status: (created as any)?.status || 'draft',
        questionCount: questions.length,
      },
    };
  },
};
