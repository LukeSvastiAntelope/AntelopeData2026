import { NextRequest, NextResponse } from "next/server";
import OpenAI from 'openai';
import { GPT_MODELS } from '@/app/utils/const';

// POST /api/ai/generate-survey - Generate survey using AI
export async function POST(req: NextRequest) {
    try {
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

        const { prompt, model = 'gpt-4o' } = await req.json();
        
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
        let aiClient: OpenAI;
        
        if (modelConfig.type === "openai") {
            if (!process.env.OPENAI_API_KEY) {
                return NextResponse.json({ 
                    error: 'OpenAI API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });
        } else if (modelConfig.type === "deepseek") {
            if (!process.env.DEEPSEEK_API_KEY) {
                return NextResponse.json({ 
                    error: 'DeepSeek API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: 'https://api.deepseek.com'
            });
        } else if (modelConfig.type === "gemini") {
            if (!process.env.GEMINI_API_KEY) {
                return NextResponse.json({ 
                    error: 'Gemini API key not configured' 
                }, { status: 503 });
            }
            aiClient = new OpenAI({
                apiKey: process.env.GEMINI_API_KEY,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
            });
        } else {
            return NextResponse.json({ 
                error: 'Unsupported model type' 
            }, { status: 400 });
        }

        const systemPrompt = `You are an expert survey designer. Create a comprehensive survey based on the user's request. 

Return a JSON object with this exact structure:
{
  "title": "Survey Title",
  "description": "Brief description of the survey purpose",
  "purpose": "Detailed explanation of what this survey aims to achieve",
  "targetAudience": "Who should take this survey",
  "questions": [
    {
      "type": "text|single-choice|multiple-choice|rating|yes-no",
      "prompt": "The question text",
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
- Make critical questions required`;

        const completion = await aiClient.chat.completions.create({
            model: modelConfig.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const aiResponse = completion.choices[0]?.message?.content;
        
        if (!aiResponse) {
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
            console.error('Failed to parse AI response:', parseError);
            console.error('AI Response:', aiResponse);
            return NextResponse.json({ 
                error: 'Failed to parse AI response. Please try again.' 
            }, { status: 500 });
        }

        // Validate the structure
        if (!surveyData.title || !surveyData.questions || !Array.isArray(surveyData.questions)) {
            return NextResponse.json({ 
                error: 'Invalid survey structure generated. Please try again.' 
            }, { status: 500 });
        }

        // Ensure all questions have required fields
        surveyData.questions = surveyData.questions.map((q: any, index: number) => ({
            type: q.type || 'text',
            prompt: q.prompt || `Question ${index + 1}`,
            options: q.options || undefined,
            isRequired: q.isRequired !== false, // Default to true
            reasoning: q.reasoning || ''
        }));

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