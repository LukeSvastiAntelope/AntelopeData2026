/**
 * Qualitative Analysis Engine  
 * Handles text analysis with citations and source rollovers
 * For open-ended text questions
 */

import { NextResponse } from 'next/server';

export interface QualitativeAnalysisParams {
  rows: any[];
  question: string;
  queryIntent: any;
  surveyId: number;
  stream: boolean;
  model: string;
  temperature: number;
  systemPrompt?: string;
  factSheet?: any;
}

export async function generateQualitativeAnalysis(params: QualitativeAnalysisParams) {
  const { rows, question, queryIntent, surveyId, stream, model, temperature, systemPrompt, factSheet } = params;
  
  console.log(`📝 [QUALITATIVE] Starting text analysis with citations for ${rows.length} text responses`);
  
  // Filter for meaningful text answers
  const meaningfulAnswers = rows.filter((r: any) => {
    if (!r.answer_value || typeof r.answer_value !== 'string') return false;
    
    const trimmed = r.answer_value.trim();
    if (trimmed.length === 0) return false;
    
    // For choice questions, any non-empty answer is meaningful
    if (r.question_type === 'single-choice' || r.question_type === 'multiple-choice') {
      return trimmed.length > 0;
    }
    
    // For text questions, be more nuanced in filtering
    if (trimmed.length < 2) return false;
    if (/^[0-9\s\.\-]+$/.test(trimmed) && trimmed.length < 5) return false;
    if (/^(yes|no|maybe|ok|good|bad)$/i.test(trimmed)) return false;
    
    return true;
  });
  
  console.log(`📝 [QUALITATIVE] Found ${meaningfulAnswers.length} meaningful text responses`);
  
  if (meaningfulAnswers.length === 0) {
    return NextResponse.json({ 
      status: true, 
      content: "No meaningful text responses found for qualitative analysis. Please try a different question or check if the survey contains open-ended questions." 
    });
  }
  
  // Build demographic analysis
  const demographics = analyzeDemographics(meaningfulAnswers);
  
  // Prepare quotes for citations
  const sampleSize = meaningfulAnswers.length;
  const maxQuotes = Math.min(12, meaningfulAnswers.length);
  const quoteObjs = meaningfulAnswers.slice(0, maxQuotes).map((r: any, idx: number) => ({ 
    id: idx + 1, 
    text: r.answer_value as string,
    question: r.question_text as string,
    questionType: r.question_type as string,
    questionOptions: r.question_options as string,
    surveyTitle: r.survey_title as string
  }));
  
  // Generate citations appendix
  const statsAppendix = `\n\n---\nsample-size: ${sampleSize}\nsentiment: 👍 ${demographics.sentiment.positive}% | 😐 ${demographics.sentiment.neutral}% | 👎 ${demographics.sentiment.negative}%\ndemographics: ${demographics.summary}\ncitations:\n` + quoteObjs.map(q=> {
    const questionContext = `Q: "${q.question}" | A: "${q.text}"`;
    return `[${q.id}] ${questionContext}`;
  }).join('\n');
  
  // Build prompt with quotes
  const quotesForPrompt = quoteObjs.map(q=> {
    let questionContext = `Question: "${q.question}"`;
    
    if ((q.questionType === 'single-choice' || q.questionType === 'multiple-choice') && q.questionOptions) {
      try {
        const options = JSON.parse(q.questionOptions);
        if (Array.isArray(options) && options.length > 0) {
          questionContext += ` (Options: ${options.join(', ')})`;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
    return `[${q.id}] ${questionContext} (from "${q.surveyTitle}") | Answer: "${q.text}"`;
  }).join('\n');
  
  // Generate survey context
  const surveyTitles = [...new Set(quoteObjs.map(q => q.surveyTitle))];
  const surveyQuestions = [...new Set(quoteObjs.map(q => q.question))];
  
  const surveyTopicsContext = `
Survey Topics Overview:
- Survey Titles: ${surveyTitles.join(', ')}
- Key Questions Asked: ${surveyQuestions.slice(0, 5).join('; ')}${surveyQuestions.length > 5 ? '...' : ''}
- Total Questions Available: ${surveyQuestions.length}
`;
  
  const factSheetPromptContext = factSheet ? 
    `\n\nSTATISTICAL FOUNDATION: You also have access to statistical data showing overall patterns and distributions. Use this for quantitative claims but focus your analysis on the qualitative insights from individual responses.` : '';
  
  const analysisTypeGuidance = queryIntent.analysisType === 'thematic' ? 
    `\n\nANALYSIS FOCUS: Provide thematic analysis focusing on patterns, themes, and qualitative insights. Use citations [1], [2], etc. to reference specific quotes that support your analysis.` : 
    '';
  
  const intentExplanation = `Intent: ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)`;
  
  const prompt = `You are an expert analyst representing the collective voice of survey respondents. Your task is to provide meaningful insights based on the survey data provided.

DETECTED INTENT: ${intentExplanation}
ANALYSIS TYPE: ${queryIntent.analysisType}
DATA TYPE: text responses
${factSheetPromptContext}
${analysisTypeGuidance}

CONTEXTUAL INTELLIGENCE GUIDELINES:
- ALWAYS try to answer the user's question if it relates to the survey topics, even if not directly asked
- Make intelligent connections between the user's question and available survey data
- If asking about "who/what is popular/important/impactful" and surveys discuss those topics, infer from the response patterns
- If asking about opinions/attitudes and surveys cover related areas, extrapolate thoughtfully
- Look for themes, patterns, and implicit information in the responses
- Use survey question context to understand what respondents were thinking about
- Only claim insufficient data if the question is completely unrelated to any survey content

RESPONSE REQUIREMENTS:
- PRIORITIZE pre-computed statistics from the fact sheet for quantitative claims
- Use individual responses to illustrate patterns and provide qualitative insights
- When stating percentages or adoption rates, use the EXACT numbers from the fact sheet
- Cite specific quotes using [1], [2], [3] format to support qualitative insights
- Never claim "all responses" unless the fact sheet shows 100%
- Explain your reasoning and how you connected the data to the question
- Include demographic context when relevant

${surveyTopicsContext}
Demographics of the cohort: ${demographics.summary}
Sample size: ${sampleSize} meaningful responses

User question: "${question}"

Available survey responses with their questions:
${quotesForPrompt}`;
  
  // Build system message
  const baseSystemMessage = "You are an expert analyst representing survey respondents' collective voice with deep understanding of their perspectives.";
  const intentSpecificMessage = getIntentSpecificSystemMessage(queryIntent.analysisType);
  const complexityMessage = `You are providing focused qualitative analysis with rich citations and source context.`;
  
  const finalSystemMessage = systemPrompt || `${baseSystemMessage} ${intentSpecificMessage} ${complexityMessage}

ANALYSIS APPROACH:
- You have access to individual text response samples with full context
- Use individual responses for qualitative insights, themes, and context
- Always cite supporting evidence using [1], [2], [3] format
- Make meaningful connections between different data points when relevant
- Focus on themes, patterns, and qualitative insights rather than statistics

Your goal is to provide insightful qualitative analysis with proper citations and source attribution.`;
  
  // Generate response
  if (stream) {
    return createQualitativeStreamingResponse(finalSystemMessage, prompt, demographics.summary, statsAppendix, model, temperature);
  } else {
    return createQualitativeNonStreamingResponse(finalSystemMessage, prompt, demographics.summary, statsAppendix, model, temperature);
  }
}

function getIntentSpecificSystemMessage(analysisType: string): string {
  switch (analysisType) {
    case 'thematic':
      return 'Focus on identifying themes, patterns, and qualitative insights from text responses.';
    case 'sentiment':
      return 'Analyze emotional tone and sentiment patterns in the responses.';
    default:
      return 'Provide comprehensive analysis of the text responses.';
  }
}

function analyzeDemographics(meaningfulAnswers: any[]) {
  const genderCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  const ageGroups: Record<string, number> = {};
  
  let positive = 0, neutral = 0, negative = 0;
  
  meaningfulAnswers.forEach((r: any) => {
    // Basic sentiment analysis
    const text = r.answer_value.toLowerCase();
    if (text.includes('great') || text.includes('good') || text.includes('helped') || text.includes('better')) {
      positive++;
    } else if (text.includes('bad') || text.includes('worse') || text.includes('jaded') || text.includes('negative')) {
      negative++;
    } else {
      neutral++;
    }
    
    // Demographics
    if (r.gender) genderCounts[r.gender] = (genderCounts[r.gender] || 0) + 1;
    if (r.location) locationCounts[r.location] = (locationCounts[r.location] || 0) + 1;
    if (r.age) {
      const ageGroup = r.age < 25 ? '18-24' : r.age < 35 ? '25-34' : r.age < 45 ? '35-44' : '45+';
      ageGroups[ageGroup] = (ageGroups[ageGroup] || 0) + 1;
    }
  });
  
  const total = meaningfulAnswers.length;
  const createSummary = (counts: Record<string, number>, maxItems: number = 3) => {
    const sorted = Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxItems);
    return sorted.map(([key, count]) => `${key}: ${Math.round((count/total)*100)}%`).join(', ');
  };
  
  const demographicParts = [];
  if (Object.keys(ageGroups).length > 0) demographicParts.push(`Age: ${createSummary(ageGroups)}`);
  if (Object.keys(genderCounts).length > 0) demographicParts.push(`Gender: ${createSummary(genderCounts)}`);
  if (Object.keys(locationCounts).length > 0) demographicParts.push(`Location: ${createSummary(locationCounts)}`);
  
  return {
    summary: demographicParts.join(' | ') || 'Demographics not available',
    sentiment: {
      positive: Math.round((positive/total)*100),
      neutral: Math.round((neutral/total)*100), 
      negative: Math.round((negative/total)*100)
    }
  };
}

async function createQualitativeStreamingResponse(systemMessage: string, prompt: string, demographicSummary: string, statsAppendix: string, model: string, temperature: number) {
  const { createStreamingCompletion } = await import('../../../utils/services/ai-service');
  const encoder = new TextEncoder();
  
  console.log(`📝 [QUALITATIVE] Starting streaming LLM analysis`);
  
  const streamingCompletion = await createStreamingCompletion({
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: demographicSummary + "\n\n" + prompt }
    ],
    stream: true,
    temperature: temperature,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    maxTokens: 3000,
  });
  
  const enhancedStream = new ReadableStream({
    async start(controller) {
      try {
        const reader = streamingCompletion.stream.getReader();
        let isStreamComplete = false;
        
        while (!isStreamComplete) {
          const { done, value } = await reader.read();
          
          if (done) {
            isStreamComplete = true;
            // Add citations after main content
            controller.enqueue(encoder.encode(statsAppendix));
          } else {
            controller.enqueue(value);
          }
        }
        
        controller.close();
      } catch (error) {
        console.error('❌ Qualitative streaming error:', error);
        controller.close();
      }
    }
  });
  
  return new NextResponse(enhancedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Source": "qualitative-analysis",
      "X-Analysis-Type": "thematic"
    }
  });
}

async function createQualitativeNonStreamingResponse(systemMessage: string, prompt: string, demographicSummary: string, statsAppendix: string, model: string, temperature: number) {
  const { createCompletion } = await import('../../../utils/services/ai-service');
  
  console.log(`📝 [QUALITATIVE] Starting non-streaming LLM analysis`);
  
  const completion = await createCompletion({
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: demographicSummary + "\n\n" + prompt }
    ],
    temperature: temperature,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    maxTokens: 3000,
  });
  
  const fullAnswer = completion.content + statsAppendix;
  
  return NextResponse.json({
    status: true,
    content: fullAnswer,
    analysis_type: 'qualitative',
    citations: true
  });
} 