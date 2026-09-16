import { createCompletion } from '@/app/utils/services/ai-service';
import type { CampaignTool } from './types';

type Input = {
  topic: string;
  audience?: string;
  questionCount?: number;
  district?: string;
  office?: string;
};

/**
 * Draft survey questions in-memory (does not persist).
 * Use create_survey_draft to save a draft to the database.
 */
export const draftSurveyTool: CampaignTool<Input> = {
  name: 'draft_survey',
  description:
    'Draft a short political survey (title + questions) for a race or topic without saving it. Private and reversible. Use create_survey_draft to persist.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'What the survey should measure (e.g. baseline issues, name ID).',
      },
      audience: {
        type: 'string',
        description: 'Optional audience framing (likely voters, persuadables, etc.).',
      },
      questionCount: {
        type: 'number',
        description: 'Target number of questions (3–12, default 6).',
      },
      district: { type: 'string', description: 'Optional district context.' },
      office: { type: 'string', description: 'Optional office sought.' },
    },
    required: ['topic'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input) {
    const topic = String(input.topic || '').trim();
    if (!topic) throw new Error('topic is required');

    const count = Math.min(Math.max(Number(input.questionCount) || 6, 3), 12);
    const audience = String(input.audience || 'likely voters').trim();
    const district = input.district ? String(input.district).trim() : '';
    const office = input.office ? String(input.office).trim() : '';

    const completion = await createCompletion({
      model: process.env.ANTHROPIC_API_KEY
        ? 'claude-sonnet-4-20250514'
        : process.env.OPENAI_API_KEY
          ? 'gpt-4o'
          : 'gpt-4o-mini',
      temperature: 0.4,
      maxTokens: 1600,
      messages: [
        {
          role: 'system',
          content: `You draft short, neutral political surveys for hyperlocal/downballot races.
Return ONLY valid JSON (no markdown fences):
{"title": string, "description": string, "questions":[{"type":"single_choice"|"text"|"likert","prompt":string,"options":string[]|null,"isRequired":boolean}]}
Rules: no leading questions, no invented endorsements, keep language plain, include 1–2 demographic questions only if useful.`,
        },
        {
          role: 'user',
          content: [
            `Topic: ${topic}`,
            `Audience: ${audience}`,
            `Question count: ${count}`,
            office && `Office: ${office}`,
            district && `District: ${district}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    const raw = (completion.content || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Model did not return a survey JSON draft.');
    }

    let parsed: {
      title?: string;
      description?: string;
      questions?: Array<{
        type?: string;
        prompt?: string;
        options?: string[] | null;
        isRequired?: boolean;
      }>;
    };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Failed to parse survey draft JSON.');
    }

    const questions = (parsed.questions || [])
      .filter((q) => q && typeof q.prompt === 'string' && q.prompt.trim())
      .map((q, idx) => ({
        type: q.type || 'text',
        prompt: String(q.prompt).trim(),
        options: Array.isArray(q.options) ? q.options.map(String) : null,
        isRequired: q.isRequired !== false,
        order: idx + 1,
      }));

    if (!questions.length) {
      throw new Error('Draft contained no usable questions.');
    }

    const title = String(parsed.title || `${topic} survey`).slice(0, 120);
    const description = String(parsed.description || '').slice(0, 500);

    return {
      summary: [
        '### Survey draft (not saved)',
        `- Title: ${title}`,
        description ? `- Description: ${description}` : null,
        `- Questions: ${questions.length}`,
        '',
        ...questions.map((q, i) => `${i + 1}. (${q.type}) ${q.prompt}`),
        '',
        'Call `create_survey_draft` with this content to save as a draft.',
      ]
        .filter((line) => line !== null)
        .join('\n'),
      data: {
        title,
        description,
        questions,
        persisted: false,
      },
    };
  },
};
