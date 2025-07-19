/**
 * Quantitative Analysis Engine
 * Handles statistical analysis with charts and data visualizations
 * For rating, choice, and numerical questions
 */

import { NextResponse } from 'next/server';

export interface QuantitativeAnalysisParams {
  factSheet: any;
  question: string;
  queryIntent: any;
  surveyMeta: any;
  stream: boolean;
  model: string;
  temperature: number;
}

export async function generateQuantitativeAnalysis(params: QuantitativeAnalysisParams) {
  const { factSheet, question, queryIntent, surveyMeta, stream, model, temperature } = params;
  
  console.log(`📊 [QUANTITATIVE] Starting statistical analysis for ${factSheet.analysis_results.analysis_count} questions`);
  
  // Generate AI analysis from the structured data
  const aiAnalysis = await generateAIAnalysis(factSheet.analysis_results, question, surveyMeta);
  
  // Create data cards for visualization  
  const dataCards = factSheet.analysis_results.results.map((result: any, index: number) => ({
    title: result.title,
    chart_type: 'horizontal_bar',
    data: (result.data || []).map((item: any) => ({
      label: item.answer_value,
      value: parseFloat(item.percentage)
    })),
    totalResponses: result.totalResponses,
    questionId: result.questionId,
    index: index
  }));
  
  console.log(`📊 [QUANTITATIVE] Created ${dataCards.length} data cards for visualization`);
  
  // Generate structured response content
  let responseContent = `# Survey Analysis: ${surveyMeta.title}\n\n`;
  responseContent += `## 🧠 Analysis & Insights\n\n`;
  responseContent += aiAnalysis;
  responseContent += `\n\n---\n\n`;
  responseContent += `📊 **Analysis based on ${factSheet.analysis_results.analysis_count} relevant questions from ${surveyMeta.total_respondents} survey respondents.**\n\n`;
  
  if (stream) {
    return createStreamingResponse(responseContent, dataCards, surveyMeta);
  } else {
    return NextResponse.json({
      status: true,
      content: responseContent,
      dataCards: dataCards,
      factSheet: factSheet
    });
  }
}

async function generateAIAnalysis(analysisResults: any, userQuestion: string, surveyMeta: any): Promise<string> {
  try {
    // Import AI service dynamically
    const { createCompletion } = await import('../../../utils/services/ai-service');
    
    // Prepare data for AI analysis
    const dataContext = analysisResults.results.map((result: any) => {
      const topResults = result.data?.slice(0, 6).map((row: any) => 
        `${row.answer_value}: ${row.percentage}% (${row.count} responses)`
      ).join('\n') || 'No data available';
      
      return {
        question: result.title,
        totalResponses: result.totalResponses || 0,
        topResults: topResults,
        analysisType: result.analysisType
      };
    }).slice(0, 3);

    const prompt = `You are an expert data analyst providing insights based on survey results. Your task is to analyze the statistical data and provide intelligent interpretation that goes beyond just stating the numbers.

USER QUESTION: "${userQuestion}"

SURVEY CONTEXT: ${surveyMeta.title} (${analysisResults.analysis_count} questions analyzed)

STATISTICAL DATA:
${dataContext.map((data, i) => `
Question ${i + 1}: ${data.question}
Total Responses: ${data.totalResponses}
Results:
${data.topResults}
`).join('\n')}

Your analysis should:
1. SYNTHESIZE PATTERNS: What do the numbers actually mean? What patterns emerge?
2. PROVIDE CONTEXT: Why might these results be significant? What do they suggest?
3. IDENTIFY KEY INSIGHTS: What are the most important takeaways?
4. CONSIDER IMPLICATIONS: What might these results indicate about the broader topic?
5. NOTE NUANCES: Are there interesting distinctions in the data worth highlighting?

FORMATTING REQUIREMENTS:
- Use proper markdown formatting with headers, bullets, and emphasis
- Structure your response with clear sections using ### headers
- Use **bold** for key findings and *italics* for emphasis
- Use bullet points (-) to break down complex insights
- Include line breaks between paragraphs for readability

Format your response like this:

### 📊 Key Findings

- **Primary insight**: Brief description
- **Secondary insight**: Brief description

### 🔍 Analysis & Patterns

[2-3 well-structured paragraphs with proper markdown formatting]

### 💡 Implications

[1-2 paragraphs about broader significance]

Be analytical and insightful, not just descriptive. Transform raw statistics into understanding using clear, well-formatted markdown.

Do not repeat the exact percentages already shown above - instead interpret what they reveal.`;

    const completion = await createCompletion({
      model: 'gpt-4o',
      messages: [
        { role: "system", content: "You are an expert data analyst providing insights based on survey results." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 800,
      frequencyPenalty: 0.2,
      presencePenalty: 0.2
    });

    return completion.content || 'Analysis could not be generated.';
  } catch (error) {
    console.error('❌ Error generating AI analysis:', error);
    return 'Unable to generate AI analysis at this time.';
  }
}

function createStreamingResponse(content: string, dataCards: any[], surveyMeta: any) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      try {
        // Send content as SSE format
        const contentChunk = JSON.stringify({ content });
        controller.enqueue(encoder.encode(`data: ${contentChunk}\n\n`));
        
        // Add data cards for visualization
        if (dataCards.length > 0) {
          const dataCardsContent = '\n```data-cards\n' + JSON.stringify(dataCards, null, 2) + '\n```\n';
          const dataCardsChunk = JSON.stringify({ content: dataCardsContent });
          controller.enqueue(encoder.encode(`data: ${dataCardsChunk}\n\n`));
        }
        
        // Send completion signal
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('❌ Streaming error:', error);
        const errorChunk = JSON.stringify({ content: '\n\n❌ Error occurred during response formatting.' });
        controller.enqueue(encoder.encode(`data: ${errorChunk}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Sample-Size": String(surveyMeta.total_respondents),
      "X-Source": "quantitative-analysis",
      "X-Analysis-Type": "statistical"
    }
  });
} 