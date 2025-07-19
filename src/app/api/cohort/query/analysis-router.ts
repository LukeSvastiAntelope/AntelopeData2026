/**
 * Analysis Router
 * Clean routing logic between quantitative and qualitative analysis engines
 */

export interface AnalysisRouterParams {
  factSheet: any;
  rows: any[];
  question: string;
  queryIntent: any;
  surveyId: number;
  stream: boolean;
  model: string;
  temperature: number;
  systemPrompt?: string;
}

export async function routeToAnalysisEngine(params: AnalysisRouterParams) {
  const { factSheet, rows, question, queryIntent, surveyId, stream, model, temperature, systemPrompt } = params;
  
  console.log(`🚀 [ANALYSIS-ROUTER] Deciding between quantitative and qualitative analysis...`);
  console.log(`🔍 [ROUTER] Query intent: ${queryIntent.analysisType}`);
  
  // Check if we have data from LightweightQuestionMatcher or other sources
  if ((factSheet && factSheet.analysis_results && factSheet.analysis_results.results && factSheet.analysis_results.results.length > 0) || rows.length > 0) {
    
    // Detect if we have text questions by checking question types in rows
    const hasTextQuestions = rows.some(row => 
      row.question_type === 'text' || 
      row.question_type === 'open_ended' ||
      row.question_type === 'textarea' ||
      row.question_type === 'long_text'
    );
    
    // Check for genuinely long, narrative text responses (not just long choice labels)
    const hasNarrativeTextResponses = rows.some(row => {
      if (typeof row.answer_value !== 'string') return false;
      
      // Check if it's a text/open-ended question type
      const isTextQuestion = row.question_type === 'text' || 
                           row.question_type === 'open_ended' ||
                           row.question_type === 'textarea' ||
                           row.question_type === 'long_text';
      
      // For text questions, any substantial response is narrative
      if (isTextQuestion && row.answer_value.length > 20) return true;
      
      // For non-text questions, only very long responses (100+ chars) are likely narrative
      // This filters out long choice labels like "Science, technology, engineering and math education..."
      if (!isTextQuestion && row.answer_value.length > 100) return true;
      
      return false;
    });

    // NEW: If survey was imported from CSV we default to quantitative charts unless thematic intent explicitly requested
    const src = (factSheet?.survey_meta?.source || '').toLowerCase();
    const isCsvSource = src.includes('csv');

    // NEW: Detect categorical text questions (short labels repeated across many rows)
    const looksCategorical = !hasNarrativeTextResponses && rows.length > 3 && rows.every(row => {
      if (typeof row.answer_value !== 'string') return false;
      const len = row.answer_value.length;
      // Categorical answers are usually short labels (<= 30 chars)
      return len > 0 && len <= 30;
    });
    
    console.log(`🔍 [ROUTER] Has text questions: ${hasTextQuestions} (by question type)`);
    console.log(`🔍 [ROUTER] Has narrative text responses: ${hasNarrativeTextResponses} (by content analysis)`);
    console.log(`🔍 [ROUTER] Looks categorical: ${looksCategorical}`);
    console.log(`🔍 [ROUTER] Imported CSV source: ${isCsvSource}`);
    console.log(`🔍 [ROUTER] Analysis type: ${queryIntent.analysisType}`);
    
    // Log some example responses to help debug
    console.log(`🔍 [ROUTER] Sample responses:`, rows.slice(0, 3).map(r => ({
      type: r.question_type,
      length: r.answer_value?.length,
      value: r.answer_value?.substring(0, 60) + '...'
    })));
    
    // ROUTING DECISION:
    // - If thematic analysis OR has text question types OR has genuine narrative text → Use QUALITATIVE engine (with citations)
    // - Otherwise → Use QUANTITATIVE engine (with charts)
    
    const shouldUseQualitative = (queryIntent.analysisType === 'thematic' && !isCsvSource) ||
                                ((hasTextQuestions && !looksCategorical) && !isCsvSource) ||
                                 (hasNarrativeTextResponses && !isCsvSource);
    
    console.log(`🎯 [ROUTER] FINAL DECISION: shouldUseQualitative = ${shouldUseQualitative}`);
    console.log(`🎯 [ROUTER] Breakdown: thematic=${queryIntent.analysisType === 'thematic'}, textQuestions=${hasTextQuestions}, narrative=${hasNarrativeTextResponses}, categorical=${looksCategorical}, csv=${isCsvSource}`);
    
    if (shouldUseQualitative) {
      console.log(`📝 [QUALITATIVE-ROUTE] → Routing to qualitative analysis engine with citations`);
      
      const { generateQualitativeAnalysis } = await import('./qualitative-analysis');
      return generateQualitativeAnalysis({
        rows,
        question,
        queryIntent,
        surveyId,
        stream,
        model,
        temperature,
        systemPrompt,
        factSheet
      });
    } else {
      console.log(`📊 [QUANTITATIVE-ROUTE] → Routing to quantitative analysis engine with charts`);
      
      const { generateQuantitativeAnalysis } = await import('./quantitative-analysis');
      return generateQuantitativeAnalysis({
        factSheet,
        question,
        queryIntent,
        surveyMeta: factSheet.survey_meta,
        stream,
        model,
        temperature
      });
    }
  } else {
    console.log(`❌ [ROUTER] No structured data available for analysis`);
    const { NextResponse } = await import('next/server');
    return NextResponse.json({ 
      status: true, 
      content: "No data available for analysis. Please try a different question." 
    });
  }
} 