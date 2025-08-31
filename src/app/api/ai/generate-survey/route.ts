import { NextRequest, NextResponse } from "next/server";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GPT_MODELS } from '@/app/utils/const';

// Allow longer processing time during generation
export const maxDuration = 120;

// POST /api/ai/generate-survey - Generate survey using AI
export async function POST(req: NextRequest) {
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        const { prompt, model = 'gpt-4o', mode } = await req.json();
        const t0 = Date.now();
        
        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ 
                error: 'Prompt is required' 
            }, { status: 400 });
        }

        // Find the model configuration
        const modelConfig = GPT_MODELS.find(m => m.key === model);
        if (!modelConfig) {
            return NextResponse.json({ 
                error: 'Invalid model specified' 
            }, { status: 400 });
        }

        // Initialize the appropriate AI client based on model type
        let aiClient: OpenAI | Anthropic;
        let isAnthropic = false;
        
        if (modelConfig.type === "openai") {
            if (!process.env.OPENAI_API_KEY) {
                return NextResponse.json({ 
                    error: 'OpenAI API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                timeout: 120000,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using OpenAI', { model: modelConfig.model, timeoutMs: 120000 });
        } else if (modelConfig.type === "deepseek") {
            if (!process.env.DEEPSEEK_API_KEY) {
                return NextResponse.json({ 
                    error: 'DeepSeek API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: 'https://api.deepseek.com',
                timeout: 120000,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using DeepSeek', { model: modelConfig.model });
        } else if (modelConfig.type === "gemini") {
            if (!process.env.GEMINI_API_KEY) {
                return NextResponse.json({ 
                    error: 'Gemini API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.GEMINI_API_KEY,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                timeout: 120000,
                maxRetries: 0,
            });
            console.log('[gen-survey] Using Gemini', { model: modelConfig.model });
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
            // Newer OpenAI models (o1, o3, gpt-5, gpt-4o) use max_completion_tokens and may not support temperature
            const isReasoningModel = (
                modelConfig.model.includes('o1') ||
                modelConfig.model.includes('o3') ||
                modelConfig.model.includes('gpt-5') ||
                modelConfig.model.includes('gpt-4o')
            );
            const useNewTokenParam = modelConfig.type === "openai" && isReasoningModel;
            
            const requestParams: any = {
                model: modelConfig.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
            };
            
            // Remove temperature for reasoning models like gpt-5; keep it only for classic models
            if (!isReasoningModel) {
                requestParams.temperature = 0.7;
            }
            
            const tokenBudget = 800; // lower budget to reduce latency
            if (useNewTokenParam) {
                requestParams.max_completion_tokens = tokenBudget;
            } else {
                requestParams.max_tokens = tokenBudget;
            }

            console.log('[gen-survey] Request params', {
                model: requestParams.model,
                hasTemperature: requestParams.temperature !== undefined,
                max_completion_tokens: requestParams.max_completion_tokens,
                max_tokens: requestParams.max_tokens,
                promptLen: prompt.length
            });
            
            // Retry wrapper for transient errors (DNS, timeouts, rate limits)
            const maxAttempts = 3;
            let lastError: any = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const tStart = Date.now();
                    const completion = await (aiClient as OpenAI).chat.completions.create(requestParams);
                    console.log('[gen-survey] OpenAI completion ok', {
                        ms: Date.now() - tStart,
                        usage: completion.usage,
                    });
                    aiResponse = completion.choices[0]?.message?.content;
                    break;
                } catch (err: any) {
                    lastError = err;
                    const code = err?.code;
                    const status = err?.status;
                    const isTransient = code === 'ENOTFOUND' || code === 'ETIMEDOUT' || status === 429 || (status >= 500 && status < 600);
                    console.warn('[gen-survey] OpenAI completion error', {
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
            console.error('[gen-survey] No aiResponse', { elapsedMs: Date.now() - t0 });
            return NextResponse.json({ 
                error: 'Failed to generate survey content' 
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
            // Heuristic JSON extraction for reasoning models (e.g., gpt-5) that may wrap JSON in analysis
            const isReasoningModel = (
                modelConfig.model.includes('o1') ||
                modelConfig.model.includes('o3') ||
                modelConfig.model.includes('gpt-5') ||
                modelConfig.model.includes('gpt-4o')
            );
            if (isReasoningModel) {
                try {
                    const text = aiResponse || '';
                    const fenceCleaned = text.replace(/```json\n?|```/g, '').trim();
                    // Try to find the largest JSON object in the text
                    const start = fenceCleaned.indexOf('{');
                    const end = fenceCleaned.lastIndexOf('}');
                    if (start !== -1 && end !== -1 && end > start) {
                        const candidate = fenceCleaned.slice(start, end + 1);
                        surveyData = JSON.parse(candidate);
                        console.warn('[gen-survey] Parsed JSON via heuristic extraction for reasoning model');
                    }
                } catch (e2) {
                    console.error('[gen-survey] Heuristic JSON extraction failed:', e2);
                }
                // As a final fallback for GPT-5/4o, return raw text so UI can show something instead of 500
                if (!surveyData) {
                    console.warn('[gen-survey] Returning raw text fallback for reasoning model');
                    return NextResponse.json({
                        status: true,
                        modelUsed: modelConfig.label,
                        surveyRaw: aiResponse,
                        note: 'Model returned non-JSON content; showing raw output.'
                    });
                }
            } else {
                console.error('AI Response:', aiResponse);
                return NextResponse.json({ 
                    error: 'Failed to parse AI response. Please try again.' 
                }, { status: 500 });
            }
        }

        // Validate the structure
        if (!surveyData.title || !surveyData.questions || !Array.isArray(surveyData.questions)) {
            return NextResponse.json({ 
                error: 'Invalid survey structure generated. Please try again.' 
            }, { status: 500 });
        }

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
            return base;
        });

        console.log('[gen-survey] Success', { elapsedMs: Date.now() - t0 });
        return NextResponse.json({ 
            status: true, 
            survey: surveyData,
            modelUsed: modelConfig.label
        });

    } catch (error) {
        console.error("Error in POST /api/ai/generate-survey:", error);
        
        if (error instanceof Error && error.message.includes('API key')) {
            return NextResponse.json({ 
                status: false, 
                message: 'AI service configuration error' 
            }, { status: 503 });
        }
        
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 