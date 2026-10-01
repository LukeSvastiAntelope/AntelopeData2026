import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { GPT_MODELS } from '@/app/utils/const';
import { SURVEY_SYSTEM_PROMPT } from '@/app/utils/survey/survey-generation-prompt';
import { auth } from '@/auth';
import {
  aiComplete,
  getModelForTier,
  resolveModelTier,
} from '@/app/utils/services/ai-service';
import { withUserOrgAiUsage } from '@/app/utils/services/with-org-ai-usage';

// Allow longer processing time during generation
export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getRequestId() {
    try {
        // Node 18+ / modern runtimes
        // eslint-disable-next-line no-undef
        return crypto.randomUUID();
    } catch {
        return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function safeErrorMeta(err: any) {
    const status = err?.status ?? err?.response?.status;
    const code = err?.code;
    const name = err?.name;
    const message = typeof err?.message === 'string' ? err.message : undefined;
    return { status, code, name, message };
}

function classifyUpstreamError(err: any): {
    httpStatus: number;
    clientMessage: string;
    retryable: boolean;
} {
    const meta = safeErrorMeta(err);
    const msg = (meta.message || '').toLowerCase();
    const isTimeoutLike =
        meta.name === 'AbortError' ||
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        meta.code === 'ETIMEDOUT';

    if (meta.status === 401 || meta.status === 403) {
        return {
            httpStatus: 503,
            clientMessage: 'AI provider authentication failed (server configuration issue).',
            retryable: false,
        };
    }
    if (meta.status === 404) {
        return {
            httpStatus: 400,
            clientMessage: 'Selected AI model is not available. Please switch models and try again.',
            retryable: false,
        };
    }
    if (meta.status === 400 || meta.status === 422) {
        return {
            httpStatus: 502,
            clientMessage: 'AI provider rejected the request format. Please retry or switch models.',
            retryable: false,
        };
    }
    if (meta.status === 429) {
        return {
            httpStatus: 429,
            clientMessage:
                'Anthropic rate limit (requests or tokens per minute for this key/model). Wait 1–2 minutes, switch to Cheap (Haiku), or check Anthropic rate limits — then try again.',
            retryable: true,
        };
    }
    if (isTimeoutLike) {
        return {
            httpStatus: 504,
            clientMessage: 'AI request timed out. Please retry or switch to a faster model.',
            retryable: true,
        };
    }
    if (typeof meta.status === 'number' && meta.status >= 500 && meta.status < 600) {
        return {
            httpStatus: 503,
            clientMessage: 'AI provider temporarily unavailable. Please retry.',
            retryable: true,
        };
    }
    if (meta.code === 'ENOTFOUND' || meta.code === 'ECONNRESET') {
        return {
            httpStatus: 503,
            clientMessage: 'Temporary network error contacting AI provider. Please retry.',
            retryable: true,
        };
    }
    // Fallback: internal server error
    return {
        httpStatus: 500,
        clientMessage: 'Internal server error',
        retryable: false,
    };
}

function stripMarkdownFences(text: string) {
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

function tryParseJsonFromText(text: string) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = stripMarkdownFences(text);
    // First: direct parse
    try {
        return JSON.parse(cleaned);
    } catch {}
    // Second: heuristic extraction (largest {...} block)
    try {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            const candidate = cleaned.slice(start, end + 1);
            return JSON.parse(candidate);
        }
    } catch {}
    return null;
}

function normalizeGeneratedSurveyShape(raw: any, prompt: string, mode?: string) {
    // Some models/providers wrap the payload (e.g. { survey: {...} }).
    // Normalize to the expected shape { title, description, questions }.
    let data = raw;
    if (data && typeof data === 'object') {
        if (data.survey && typeof data.survey === 'object') data = data.survey;
        if (data.quiz && typeof data.quiz === 'object') data = data.quiz;
        if (data.data && typeof data.data === 'object') data = data.data;
        if (data.result && typeof data.result === 'object') data = data.result;
    }

    // If questions are nested (rare but seen), unwrap.
    if (data?.questions && !Array.isArray(data.questions) && Array.isArray((data.questions as any)?.questions)) {
        data = { ...data, questions: (data.questions as any).questions };
    }

    // Provide reasonable defaults to avoid hard failures when only title/description are missing.
    if (data && typeof data === 'object') {
        if (!data.title || typeof data.title !== 'string') {
            data.title = mode === 'quiz' ? 'AI Quiz' : 'AI Survey';
        }
        if (!data.description || typeof data.description !== 'string') {
            const trimmed = (prompt || '').trim();
            data.description = trimmed ? trimmed.slice(0, 180) : (mode === 'quiz' ? 'AI-generated quiz' : 'AI-generated survey');
        }
    }

    return data;
}

// POST /api/ai/generate-survey - Generate survey using AI
export async function POST(req: NextRequest) {
    console.log('Generating survey using AI...');
    const requestId = getRequestId();
    try {
        let userId = '';
        {
            const authResult = requireUserId(req);
            if (typeof authResult === 'string') userId = authResult;
        }
        if (!userId) {
            const session = await auth();
            const sid = session?.user && 'id' in session.user ? (session.user as { id?: string }).id : undefined;
            if (sid) userId = String(sid);
        }
        if (!userId) {
            return NextResponse.json(
                {
                    error: 'User not authenticated',
                    message: 'Sign in again, refresh the page, then try generating the survey.',
                },
                { status: 401 }
            );
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({
                error: 'Invalid JSON body',
            }, { status: 400 });
        }

        const { prompt, model = 'workhorse', mode } = body || {};
        const t0 = Date.now();
        
        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ 
                error: 'Prompt is required' 
            }, { status: 400 });
        }

        // Anthropic-only gateway: coerce any picker key / legacy id → tier → model id
        const tier = resolveModelTier(
          typeof model === 'string' ? model : 'workhorse'
        );
        const resolvedModelId = getModelForTier(tier);
        let modelConfig =
          GPT_MODELS.find((m) => m.key === tier) ||
          GPT_MODELS.find((m) => m.key === model) || {
            key: tier,
            label: tier,
            type: 'anthropic' as const,
            model: resolvedModelId,
          };
        modelConfig = {
          ...modelConfig,
          type: 'anthropic',
          model: resolvedModelId,
          key: tier,
        };

        const isProd = process.env.NODE_ENV === 'production';
        const originalModelKey = modelConfig.key;

        // Anthropic-only — OpenAI / Gemini / DeepSeek paths removed from this route
        if (!process.env.ANTHROPIC_API_KEY) {
            return NextResponse.json({
                error: 'Anthropic API key not configured',
            }, { status: 503 });
        }
        console.log('[gen-survey] Using Anthropic gateway', {
            requestId,
            tier,
            model: modelConfig.model,
        });
        const systemPrompt = (mode === 'quiz') ? `You are an expert assessment and quiz designer. Create a multiple-question quiz with correct answers based on the user's request.

Return a JSON object with this exact structure:
{
  "title": "Quiz Title",
  "description": "Brief description of the quiz purpose",
  "questions": [
    {
      "type": "single-choice|multiple-choice|true-false|text",
      "prompt": "The question text WITHOUT numbers",
      "options": ["option1","option2"],
      "correctOptionIds": [0],
      "explanation": "Why the correct answer is correct (optional)",
      "isRequired": true,
      "points": 1
    }
  ]
}

Guidelines:
- Create 6-12 quiz questions focused on knowledge checks
- Prefer single/multiple choice; allow true/false; include at most 1-2 text questions for manual grading
- Provide 3-5 options for choice questions
- Set at least one correct option (multiple allowed for multi-select)
- Do NOT include numbering in prompts
` : SURVEY_SYSTEM_PROMPT;

        let aiResponse: string | undefined;

        // Anthropic-only via ai-service gateway (tier + internal fallback)
        {
            const maxAttempts = 4;
            let activeTier = tier;
            let lastError: any = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const tStart = Date.now();
                    const result = await withUserOrgAiUsage(
                        userId,
                        'generate-survey',
                        () =>
                            aiComplete({
                                tier: activeTier,
                                system: systemPrompt,
                                maxTokens: 8000,
                                messages: [{ role: 'user', content: prompt }],
                            })
                    );
                    aiResponse = result.content;
                    modelConfig = {
                        ...modelConfig,
                        key: result.tier,
                        model: result.model,
                        type: 'anthropic',
                    };
                    console.log('[gen-survey] Anthropic gateway ok', {
                        requestId,
                        ms: Date.now() - tStart,
                        tier: result.tier,
                        model: result.model,
                        usedFallback: result.usedFallback,
                    });
                    break;
                } catch (err: any) {
                    lastError = err;
                    const status = err?.status ?? err?.statusCode;
                    const msg = String(err?.message || '').toLowerCase();
                    const isTransient =
                        status === 429 ||
                        status === 404 ||
                        status === 529 ||
                        status === 503 ||
                        (typeof status === 'number' && status >= 500 && status < 600) ||
                        msg.includes('timeout') ||
                        msg.includes('overloaded') ||
                        msg.includes('not_found');
                    console.warn('[gen-survey] Anthropic gateway error', {
                        requestId,
                        attempt,
                        status,
                        message: err?.message,
                        tier: activeTier,
                    });
                    if (isTransient && activeTier !== 'cheap') {
                        activeTier = 'cheap';
                        await new Promise((res) => setTimeout(res, status === 429 ? 6000 : 1500));
                        continue;
                    }
                    if (attempt < maxAttempts && isTransient) {
                        await new Promise((res) =>
                            setTimeout(res, 1000 * Math.pow(2, attempt - 1))
                        );
                        continue;
                    }
                    throw err;
                }
            }
            if (!aiResponse && lastError) throw lastError;
        }

        if (!aiResponse) {
            console.error('[gen-survey] No aiResponse', { elapsedMs: Date.now() - t0, model: modelConfig.model });
            return NextResponse.json({ 
                status: false,
                errorId: requestId,
                message: 'Failed to generate survey content' 
            }, { status: 500 });
        }

        // Parse the AI response
        let surveyData;
        try {
            // Remove any markdown code blocks if present
            const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
            surveyData = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[gen-survey] JSON parse failed on first attempt:', parseError);
            console.error('[gen-survey] Raw AI response (first 1000 chars):', aiResponse?.substring(0, 1000));
            
            // Try more aggressive JSON extraction for all models
            try {
                const text = aiResponse || '';
                
                // Remove markdown code fences more aggressively
                let cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim();
                
                // Try to find JSON object boundaries
                const start = cleaned.indexOf('{');
                const end = cleaned.lastIndexOf('}');
                
                if (start !== -1 && end !== -1 && end > start) {
                    const candidate = cleaned.slice(start, end + 1);
                    surveyData = JSON.parse(candidate);
                    console.warn('[gen-survey] Parsed JSON via heuristic extraction');
                } else {
                    throw new Error('No JSON object found in response');
                }
            } catch (e2) {
                console.error('[gen-survey] Heuristic JSON extraction failed:', e2);
                console.error('[gen-survey] Full AI response:', aiResponse);
                
                // Check if it's a reasoning model that might need special handling
                return NextResponse.json({ 
                    error: 'Failed to parse AI response. The model did not return valid JSON. Please try again or switch models.',
                    details: aiResponse?.substring(0, 500) // Include snippet for debugging
                }, { status: 500 });
            }
            return NextResponse.json({
                status: false,
                errorId: requestId,
                message: 'AI returned an invalid format. Please try again (or switch models).',
            }, { status: 502 });
        }

        // Normalize shape + defaults to reduce intermittent "invalid structure" failures.
        surveyData = normalizeGeneratedSurveyShape(surveyData, prompt, mode);

        // Validate the structure
        if (!surveyData.title || !surveyData.questions || !Array.isArray(surveyData.questions)) {
            return NextResponse.json({ 
                status: false,
                errorId: requestId,
                message: 'Invalid survey structure generated. Please try again.' 
            }, { status: 502 });
        }

        // Helper: detect numeric scale in prompt like "On a scale of 1 to 5" and return option strings
        const detectScaleOptions = (prompt: string): string[] | null => {
            if (!prompt) return null;
            const lower = prompt.toLowerCase();
            // common: "on a scale of 1 to N" or "1-5"
            const m1 = lower.match(/scale\s+of\s+1\s*(?:to|\-|–)\s*(\d{1,2})/i);
            if (m1) {
                const max = parseInt(m1[1], 10);
                if (Number.isFinite(max) && max >= 3 && max <= 11) {
                    return Array.from({ length: max }, (_, i) => String(i + 1));
                }
            }
            const m2 = lower.match(/\b1\s*(?:to|\-|–)\s*(\d{1,2})\b/);
            if (m2) {
                const max = parseInt(m2[1], 10);
                if (Number.isFinite(max) && max >= 3 && max <= 11) {
                    return Array.from({ length: max }, (_, i) => String(i + 1));
                }
            }
            // Likert wording heuristic
            if (lower.includes('strongly disagree') && lower.includes('strongly agree')) {
                return ['1', '2', '3', '4', '5'];
            }
            return null;
        };

        // Ensure all questions have required fields and clean up any numbering
        surveyData.questions = surveyData.questions.map((q: any, index: number) => {
            let cleanPrompt = q.prompt || `Question ${index + 1}`;
            
            // Remove any leading question numbers (e.g., "1. ", "2.", "Q1:", etc.)
            cleanPrompt = cleanPrompt.replace(/^(\d+\.?\s*|\w+\d+[:\.]?\s*)/i, '').trim();
            
            // If the prompt is empty after cleaning, use a default
            if (!cleanPrompt) {
                cleanPrompt = `Question ${index + 1}`;
            }
            
            const base = {
                type: q.type || 'text',
                prompt: cleanPrompt,
                options: q.options || undefined,
                isRequired: q.isRequired !== false,
            } as any;
            if (mode === 'quiz') {
                base.correctOptionIds = Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [];
                base.explanation = typeof q.explanation === 'string' ? q.explanation : '';
                base.points = Number.isFinite(q.points) ? q.points : 1;
            } else {
                base.reasoning = q.reasoning || '';
            }

            // Normalize: convert numeric scale prompts into rating options (radio UI)
            const scaleOpts = detectScaleOptions(cleanPrompt);
            if (scaleOpts) {
                base.type = 'rating';
                base.options = scaleOpts;
            }
            return base;
        });

        console.log('[gen-survey] Success', { requestId, elapsedMs: Date.now() - t0 });
        return NextResponse.json({ 
            status: true, 
            survey: surveyData,
            modelUsed: modelConfig.label
        });

    } catch (error) {
        const classification = classifyUpstreamError(error);
        const meta = safeErrorMeta(error);

        console.error("Error in POST /api/ai/generate-survey:", {
            requestId,
            status: meta.status,
            code: meta.code,
            name: meta.name,
            // Do not log prompt content; only log the message for server-side debugging.
            message: meta.message,
        });

        return NextResponse.json({
            status: false,
            errorId: requestId,
            message: classification.clientMessage,
        }, { status: classification.httpStatus });
    }
} 