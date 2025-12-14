import { NextRequest, NextResponse } from "next/server";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GPT_MODELS } from '@/app/utils/const';

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

    // OpenAI-compatible SDKs generally set `.status`
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
            clientMessage: 'AI provider is rate limiting requests. Please retry shortly or switch to a faster model.',
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

function getOpenAiSurveyJsonSchema(mode?: string) {
    if (mode === 'quiz') {
        return {
            name: 'quiz',
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'description', 'questions'],
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    questions: {
                        type: 'array',
                        minItems: 1,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['type', 'prompt', 'isRequired', 'correctOptionIds'],
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['single-choice', 'multiple-choice', 'true-false', 'text'],
                                },
                                prompt: { type: 'string' },
                                options: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                                correctOptionIds: {
                                    type: 'array',
                                    items: { type: 'integer' },
                                },
                                explanation: { type: 'string' },
                                isRequired: { type: 'boolean' },
                                points: { type: 'integer' },
                            },
                        },
                    },
                },
            },
        };
    }

    return {
        name: 'survey',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'questions'],
            properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                purpose: { type: 'string' },
                targetAudience: { type: 'string' },
                questions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['type', 'prompt', 'isRequired'],
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['text', 'single-choice', 'multiple-choice', 'rating', 'yes-no'],
                            },
                            prompt: { type: 'string' },
                            options: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                            isRequired: { type: 'boolean' },
                            reasoning: { type: 'string' },
                        },
                    },
                },
            },
        },
    };
}

// POST /api/ai/generate-survey - Generate survey using AI
export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({
                error: 'Invalid JSON body',
            }, { status: 400 });
        }

        const { prompt, model = 'gpt-4o', mode } = body || {};
        const t0 = Date.now();
        
        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ 
                error: 'Prompt is required' 
            }, { status: 400 });
        }

        // Find the model configuration
        let modelConfig = GPT_MODELS.find(m => m.key === model);
        if (!modelConfig) {
            return NextResponse.json({ 
                error: 'Invalid model specified' 
            }, { status: 400 });
        }

        const isProd = process.env.NODE_ENV === 'production';
        const originalModelKey = modelConfig.key;

        // Initialize the appropriate AI client based on model type
        let aiClient: OpenAI | Anthropic;
        let isAnthropic = false;
        
        if (modelConfig.type === "openai") {
            if (!process.env.OPENAI_API_KEY) {
                return NextResponse.json({ 
                    error: 'OpenAI API key not configured' 
                }, { status: 503 });
            }
            // Production needs enough headroom to avoid intermittent timeouts from the provider.
            // Keep this below typical proxy timeouts, but above common OpenAI p95 latencies.
            const providerTimeoutMs = isProd ? 30000 : 240000;
            aiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                // Production deployments (serverless) may have strict execution limits; fail fast and let the UI retry/switch models.
                timeout: providerTimeoutMs,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using OpenAI', { requestId, model: modelConfig.model, timeoutMs: providerTimeoutMs });
        } else if (modelConfig.type === "deepseek") {
            if (!process.env.DEEPSEEK_API_KEY) {
                return NextResponse.json({ 
                    error: 'DeepSeek API key not configured' 
                }, { status: 503 });
            }
            const providerTimeoutMs = isProd ? 25000 : 120000;
            aiClient = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: 'https://api.deepseek.com',
                timeout: providerTimeoutMs,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using DeepSeek', { requestId, model: modelConfig.model, timeoutMs: providerTimeoutMs });
        } else if (modelConfig.type === "gemini") {
            if (!process.env.GEMINI_API_KEY) {
                return NextResponse.json({ 
                    error: 'Gemini API key not configured' 
                }, { status: 503 });
            }
            const providerTimeoutMs = isProd ? 25000 : 120000;
            aiClient = new OpenAI({
                apiKey: process.env.GEMINI_API_KEY,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                timeout: providerTimeoutMs,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using Gemini', { requestId, model: modelConfig.model, timeoutMs: providerTimeoutMs });
        } else if (modelConfig.type === "anthropic") {
            if (!process.env.ANTHROPIC_API_KEY) {
                return NextResponse.json({ 
                    error: 'Anthropic API key not configured' 
                }, { status: 503 });
            }
            aiClient = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });
            isAnthropic = true;
        } else {
            return NextResponse.json({ 
                error: 'Unsupported model type' 
            }, { status: 400 });
        }

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
` : `You are an expert survey designer. Create a comprehensive survey based on the user's request. 

Return a JSON object with this exact structure:
{
  "title": "Survey Title",
  "description": "Brief description of the survey purpose",
  "purpose": "Detailed explanation of what this survey aims to achieve",
  "targetAudience": "Who should take this survey",
  "questions": [
    {
      "type": "text|single-choice|multiple-choice|rating|yes-no",
      "prompt": "The question text WITHOUT any numbers",
      "options": ["option1", "option2"] // only for single-choice and multiple-choice
      "isRequired": true/false,
      "reasoning": "Why this question is important for the survey"
    }
  ]
}

Guidelines:
- Create 5-12 relevant questions
- Mix different question types appropriately
- Include demographic questions when relevant
- Make questions clear and unbiased
- Provide 3-5 options for choice questions
- Use rating scales (1-5) for satisfaction/agreement questions
- Include reasoning for each question
- Ensure questions flow logically
- Make critical questions required
- IMPORTANT: Do NOT include question numbers (like "1.", "2.", etc.) in the prompt field - the system will add numbering automatically`;

        let aiResponse: string | undefined;

        if (isAnthropic) {
            // Use Anthropic API
            const completion = await (aiClient as Anthropic).messages.create({
                model: modelConfig.model,
                max_tokens: 2000,
                system: systemPrompt,
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
            });

            // Extract text content from Claude's response
            aiResponse = completion.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text)
                .join('');
        } else {
            // Use OpenAI-compatible API
            // Use Responses API only for "reasoning" models where it's needed (o1/o3/gpt-5 family).
            // gpt-4o works reliably via Chat Completions, and treating it as a reasoning model can cause
            // production-only failures depending on runtime/SDK/deployment environment.
            const isReasoningModel = (
                modelConfig.model.includes('o1') ||
                modelConfig.model.includes('o3') ||
                modelConfig.model.includes('gpt-5')
            );
            const useNewTokenParam = modelConfig.type === "openai" && isReasoningModel;
            
            const requestParams: any = {
                model: modelConfig.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
            };

            // Strongly enforce JSON output for OpenAI chat-completions models to avoid parse failures in production.
            // Only set for OpenAI (not DeepSeek/Gemini) to avoid incompatibilities with OpenAI-compatible providers.
            if (modelConfig.type === "openai" && !isReasoningModel) {
                const jsonSchema = getOpenAiSurveyJsonSchema(mode);
                // Prefer strict schema when supported (Structured Outputs).
                requestParams.response_format = {
                    type: "json_schema",
                    json_schema: {
                        name: jsonSchema.name,
                        schema: jsonSchema.schema,
                        strict: true,
                    },
                };
            }
            
            // Remove temperature for reasoning models like gpt-5; keep it only for classic models
            if (!isReasoningModel) {
                requestParams.temperature = 0.7;
            }
            
            const tokenBudget =
                modelConfig.model.includes('gpt-5')
                    ? (isProd ? 3000 : 8000)
                    : (isProd ? 700 : 800);
            if (useNewTokenParam) {
                requestParams.max_completion_tokens = tokenBudget;
            } else {
                requestParams.max_tokens = tokenBudget;
            }

            console.log('[gen-survey] Request params', {
                requestId,
                model: requestParams.model,
                hasTemperature: requestParams.temperature !== undefined,
                max_completion_tokens: requestParams.max_completion_tokens,
                max_tokens: requestParams.max_tokens,
                response_format: requestParams.response_format?.type,
                promptLen: prompt.length
            });
            
            // Retry wrapper for transient errors (DNS, timeouts, rate limits)
            const maxAttempts = 3;
            let lastError: any = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const tStart = Date.now();
                    if (isReasoningModel) {
                        // Prefer Responses API for GPT-5/4o/o1/o3
                        const resp: any = await (aiClient as OpenAI).responses.create({
                            model: modelConfig.model,
                            input: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: prompt }
                            ],
                            max_output_tokens: tokenBudget,
                        } as any);
                        console.log('[gen-survey] OpenAI responses ok', { ms: Date.now() - tStart });
                        let content: any = (resp as any).output_text;
                        if (!content || (typeof content === 'string' && content.trim() === '')) {
                            const parts = (((resp as any).output || [])
                                .flatMap((o: any) => (o?.content || []))
                                .map((c: any) => c?.text ?? '')).join('');
                            if (parts && parts.trim()) content = parts;
                        }
                        // Fallback to Chat Completions if still empty
                        if (!content || (typeof content === 'string' && content.trim() === '')) {
                            const t2 = Date.now();
                            const completion = await (aiClient as OpenAI).chat.completions.create(requestParams);
                            console.log('[gen-survey] OpenAI completion fallback ok', {
                                ms: Date.now() - t2,
                                usage: completion.usage,
                            });
                            const firstChoice: any = completion?.choices?.[0]?.message ?? {};
                            content = firstChoice.content;
                            if (Array.isArray(content)) {
                                try {
                                    content = content
                                        .map((part: any) => typeof part === 'string' ? part : (part?.text ?? ''))
                                        .join('');
                                } catch {}
                            }
                            if (!content || (typeof content === 'string' && content.trim() === '')) {
                                const reasoning: any = (firstChoice as any).reasoning;
                                if (Array.isArray(reasoning)) {
                                    try {
                                        const reasoningText = reasoning
                                            .map((r: any) => {
                                                if (typeof r === 'string') return r;
                                                if (Array.isArray(r?.content)) {
                                                    return r.content.map((c: any) => c?.text ?? '').join('');
                                                }
                                                return r?.text ?? '';
                                            })
                                            .join('');
                                        if (reasoningText && reasoningText.trim()) content = reasoningText;
                                    } catch {}
                                }
                            }
                        }
                        aiResponse = typeof content === 'string' ? content : (content ?? '');
                    } else {
                        // Classic Chat Completions
                        const completion = await (aiClient as OpenAI).chat.completions.create(requestParams);
                        console.log('[gen-survey] OpenAI completion ok', {
                            ms: Date.now() - tStart,
                            usage: completion.usage,
                        });
                        const firstChoice: any = completion?.choices?.[0]?.message ?? {};
                        let content: any = firstChoice.content;
                        if (Array.isArray(content)) {
                            try {
                                content = content
                                    .map((part: any) => typeof part === 'string' ? part : (part?.text ?? ''))
                                    .join('');
                            } catch {}
                        }
                        aiResponse = typeof content === 'string' ? content : (content ?? '');
                    }
                    if (!aiResponse || aiResponse.trim() === '') {
                        console.warn('[gen-survey] Empty assistant content after request; falling back if possible');
                    }
                    break;
                } catch (err: any) {
                    lastError = err;
                    const code = err?.code;
                    const status = err?.status;
                    const isTimeoutLike = (err?.name === 'AbortError') || (String(err?.message || '').toLowerCase().includes('timeout'));
                    const isTransient =
                        code === 'ENOTFOUND' ||
                        code === 'ETIMEDOUT' ||
                        status === 429 ||
                        (status >= 500 && status < 600) ||
                        isTimeoutLike;
                    // If production is hitting function timeouts with a slower model, fall back once to a faster model.
                    if (isProd && attempt === 1 && originalModelKey === 'gpt-4o' && (isTransient || isTimeoutLike)) {
                        const fallback = GPT_MODELS.find(m => m.key === 'gpt-4o-mini');
                        if (fallback && fallback.type === modelConfig.type) {
                            console.warn('[gen-survey] Falling back to faster model due to timeout/transient error', {
                                requestId,
                                from: modelConfig.model,
                                to: fallback.model,
                                code,
                                status
                            });
                            modelConfig = fallback;
                            // Update request params for the fallback model; keep other params the same.
                            requestParams.model = modelConfig.model;
                            continue;
                        }
                    }
                    // If the provider rejects structured outputs, fall back to JSON object mode once.
                    if (
                        modelConfig.type === "openai" &&
                        !isReasoningModel &&
                        (status === 400 || status === 422) &&
                        requestParams?.response_format?.type === 'json_schema'
                    ) {
                        console.warn('[gen-survey] Falling back from json_schema to json_object', {
                            requestId,
                            status,
                            message: err?.message,
                        });
                        requestParams.response_format = { type: 'json_object' };
                        continue;
                    }
                    console.warn('[gen-survey] OpenAI completion error', {
                        requestId,
                        attempt,
                        code,
                        status,
                        message: err?.message
                    });
                    if (attempt < maxAttempts && isTransient) {
                        const delayMs = 500 * Math.pow(2, attempt - 1);
                        await new Promise(res => setTimeout(res, delayMs));
                        continue;
                    }
                    throw err;
                }
            }
        }
        
        if (!aiResponse) {
            const isReasoningOverall = (
                modelConfig.model.includes('o1') ||
                modelConfig.model.includes('o3') ||
                modelConfig.model.includes('gpt-5')
            );
            console.error('[gen-survey] No aiResponse', { elapsedMs: Date.now() - t0, model: modelConfig.model });
            if (isReasoningOverall) {
                // Return a non-fatal response so UI can show raw/fallback content instead of a 500
                return NextResponse.json({
                    status: true,
                    modelUsed: modelConfig.label,
                    surveyRaw: '',
                    note: 'Model returned empty content; please retry or switch model. UI may parse raw output when available.'
                });
            }
            return NextResponse.json({ 
                status: false,
                errorId: requestId,
                message: 'Failed to generate survey content' 
            }, { status: 500 });
        }

        // Parse the AI response
        let surveyData;
        surveyData = tryParseJsonFromText(aiResponse);
        if (!surveyData) {
            console.error('[gen-survey] JSON parse failed', { requestId });
            if (!isProd) {
                // Development-only: include raw output to speed up debugging without impacting production privacy.
                return NextResponse.json({
                    status: false,
                    errorId: requestId,
                    message: 'Failed to parse AI response as JSON (dev only includes raw output).',
                    raw: aiResponse,
                }, { status: 502 });
            }
            return NextResponse.json({
                status: false,
                errorId: requestId,
                message: 'AI returned an invalid format. Please try again (or switch models).',
            }, { status: 502 });
        }

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