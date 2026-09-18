import { AIAnalyticsOrchestrator } from '@/app/utils/services/ai-analytics-orchestrator';
import { SurveyRepo } from '@/app/utils/database/survey-repo';
import type { CampaignTool } from './types';

type Input = {
  surveyId: number;
  forceRegenerate?: boolean;
};

export const runAnalyticsTool: CampaignTool<Input> = {
  name: 'run_analytics',
  description:
    'Run AI analytics for a survey the user owns (insights + dashboard pipeline). Private; does not publish or send.',
  inputSchema: {
    type: 'object',
    properties: {
      surveyId: { type: 'number', description: 'Survey id to analyze' },
      forceRegenerate: {
        type: 'boolean',
        description: 'If true, bypass analytics cache',
      },
    },
    required: ['surveyId'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const surveyId = Number(input.surveyId);
    if (!Number.isFinite(surveyId) || surveyId <= 0) {
      throw new Error('surveyId must be a positive number');
    }

    const survey = await SurveyRepo.getSurveyById(surveyId, ctx.userId);
    if (!survey) {
      throw new Error(`Survey ${surveyId} not found or not accessible.`);
    }

    const orchestrator = new AIAnalyticsOrchestrator();
    const result = await orchestrator.generateCompleteAnalytics(surveyId, {
      forceRegenerate: Boolean(input.forceRegenerate),
      userId: ctx.userId,
      organizationId:
        ctx.organizationId ?? (survey as { organization_id?: number | null }).organization_id ?? null,
    });

    const insightPreview =
      typeof result.insights === 'object' && result.insights
        ? JSON.stringify(result.insights).slice(0, 800)
        : String(result.insights || '').slice(0, 800);

    return {
      summary: [
        `### Analytics for survey #${surveyId}`,
        `- Status: ${result.status}`,
        `- Responses: ${result.dataQuality?.responseCount ?? 'n/a'}`,
        `- Completeness: ${result.dataQuality?.completenessScore ?? 'n/a'}`,
        `- Reliability: ${result.dataQuality?.reliabilityAssessment ?? 'n/a'}`,
        `- Total time: ${result.performance?.totalTimeMs ?? 'n/a'} ms`,
        '',
        insightPreview ? `Insight preview:\n${insightPreview}` : 'No insight payload returned.',
      ].join('\n'),
      data: {
        surveyId,
        status: result.status,
        dataQuality: result.dataQuality,
        performance: result.performance,
        insightKeys:
          result.insights && typeof result.insights === 'object'
            ? Object.keys(result.insights)
            : [],
        generatedAt: result.metadata?.generatedAt,
      },
    };
  },
};
