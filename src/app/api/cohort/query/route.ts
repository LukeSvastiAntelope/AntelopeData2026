import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";
import { TextEncoder } from "util";
import { createCompletion, createStreamingCompletion } from "@/app/utils/services/ai-service";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { SmartSurveyQueryBuilder } from "@/app/utils/survey/smart-query-builder";
import { QueryIntentClassifier } from "@/app/utils/survey/query-intent-classifier";
import type { FactSheetQueryResult } from "../../../utils/survey/fact-sheet-query-resolver";

interface CohortQueryPayload {
  cohort?: { id?: number; filter?: CohortFilterRule[] };
  question: string;
  topK?: number;
  surveyId?: number;
  model?: string;
  temperature?: number;
  sources?: { survey: boolean; twins: boolean; web: boolean };
  systemPrompt?: string;
  stream?: boolean;
}

function buildWhereClause(rules: CohortFilterRule[], params: any[]): string {
  const clauses: string[] = [];

  for (const rule of rules) {
    switch (rule.op) {
      case "=":
        clauses.push(`${rule.field} = ?`);
        params.push(rule.value);
        break;
      case "IN":
        if (Array.isArray(rule.value) && rule.value.length) {
          clauses.push(`${rule.field} IN (${rule.value.map(() => "?").join(",")})`);
          params.push(...rule.value);
        }
        break;
      case "CONTAINS":
        clauses.push(`JSON_CONTAINS(${rule.field}, '"${rule.value}"')`);
        break;
    }
  }

  return clauses.length ? clauses.join(" AND ") : "1"; // default TRUE
}

// Helper function to get analysis-specific guidance
function getAnalysisTypeGuidance(analysisType: string, expectedResultType: string): string {
  switch (analysisType) {
    case 'thematic':
      return `THEMATIC ANALYSIS FOCUS:
- Identify recurring themes, concepts, and patterns in the text responses
- Group similar ideas and experiences together
- Look for underlying motivations, concerns, and perspectives
- Extract key insights about what matters most to respondents
- Highlight both majority and minority viewpoints`;
      
    case 'categorical':
      return `CATEGORICAL ANALYSIS FOCUS:
- Analyze patterns in choice selections and preferences
- Identify the most and least popular options
- Look for demographic differences in choices
- Explain what the selection patterns reveal about the cohort`;
      
    case 'sentiment':
      return `SENTIMENT ANALYSIS FOCUS:
- Assess the emotional tone and attitudes in responses
- Identify positive, negative, and neutral sentiment patterns
- Look for emotional drivers and concerns
- Analyze how sentiment varies across different topics or demographics`;
      
    case 'demographic':
      return `DEMOGRAPHIC ANALYSIS FOCUS:
- Break down responses by age, location, occupation, and other demographics
- Identify how different groups respond differently
- Highlight demographic-specific patterns and preferences
- Explain what drives differences between groups`;
      
    default:
      return `GENERAL ANALYSIS FOCUS:
- Provide comprehensive insights based on the available data
- Balance quantitative patterns with qualitative insights
- Consider multiple perspectives and interpretations`;
  }
}

// Helper function for intent-specific system messages
function getIntentSpecificSystemMessage(analysisType: string): string {
  switch (analysisType) {
    case 'thematic':
      return "You specialize in thematic analysis, identifying patterns, themes, and underlying meanings in qualitative text responses.";
    case 'categorical':
      return "You specialize in categorical analysis, understanding choice patterns and preference distributions.";
    case 'sentiment':
      return "You specialize in sentiment analysis, detecting emotional tones and attitudes in responses.";
    case 'demographic':
      return "You specialize in demographic analysis, identifying how different population segments respond differently.";
    default:
      return "You provide comprehensive analysis across multiple dimensions.";
  }
}

// Generate Perplexity-style data cards from fact sheet
function generateDataCards(factSheet: any, question: string): any[] {
  if (!factSheet || !factSheet.question_stats) return [];
  
  const cards = [];
  const questionLower = question.toLowerCase();
  
  // Platform adoption card
  const platformStats = Object.values(factSheet.question_stats).find((stats: any) => 
    stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
  ) as any;
  
  if (platformStats && (questionLower.includes('platform') || questionLower.includes('popular') || questionLower.includes('social'))) {
    const topPlatforms = Object.entries(platformStats.adoption_rates)
      .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
      .slice(0, 5);
    
    cards.push({
      type: 'platform_adoption',
      title: 'Top Platforms',
      data: topPlatforms.map(([platform, stats]: any) => ({
        label: platform,
        value: stats.percentage,
        count: stats.users
      })),
      chart_type: 'horizontal_bar'
    });
  }
  
  // Usage statistics card
  const usageStats = Object.values(factSheet.question_stats).find((stats: any) => 
    stats.statistics && stats.statistics.mean !== undefined
  ) as any;
  
  if (usageStats && (questionLower.includes('hour') || questionLower.includes('time') || questionLower.includes('usage'))) {
    cards.push({
      type: 'usage_stats',
      title: 'Usage Statistics',
      data: {
        average: `${usageStats.statistics.mean} hours/day`,
        median: `${usageStats.statistics.median} hours/day`,
        range: `${usageStats.statistics.min}-${usageStats.statistics.max} hours`
      },
      chart_type: 'metric_card'
    });
  }
  
  // Demographics card
  if (factSheet.core_stats && factSheet.core_stats.demographic_distribution) {
    const demographics = factSheet.core_stats.demographic_distribution;
    
    if (questionLower.includes('age') || questionLower.includes('demographic')) {
      if (demographics.age) {
        const ageData = Object.entries(demographics.age).map(([group, stats]: any) => ({
          label: group,
          value: stats.percentage,
          count: stats.count
        }));
        
        cards.push({
          type: 'age_distribution',
          title: 'Age Distribution',
          data: ageData,
          chart_type: 'pie'
        });
      }
    }
  }
  
  return cards;
}

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 COHORT QUERY ROUTE STARTED - NEW VERSION WITH FACT SHEET FIRST');
    
    // Get user ID from NextAuth middleware
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = userIdHeader;

    const body = (await req.json()) as CohortQueryPayload;
    const { cohort, question, topK = 1000, surveyId, model = 'gpt-4o', temperature = 0.0, sources, systemPrompt, stream = true } = body;
    
    console.log(`📝 Question: "${question}"`);
    console.log(`📊 Survey ID: ${surveyId}`);

    if (!question || question.trim() === "") {
      return NextResponse.json({ status: false, message: "Question is required" }, { status: 400 });
    }

    // Resolve cohort filter
    let filterRules: CohortFilterRule[] = [];
    if (cohort?.id) {
      const cohorts = await CohortRepo.listVisibleCohorts(null, "admin"); // we need dedicated repo method to getById; quick workaround
      const found = cohorts.find((c) => c.id === cohort.id);
      if (!found) {
        return NextResponse.json({ status: false, message: "Cohort not found" }, { status: 404 });
      }
      filterRules = found.filter_json as any;
    } else if (cohort?.filter) {
      filterRules = cohort.filter;
    }

    // 🎯 STEP 1: Initialize database connection
    const db = await getMySQLConnection();
    
    // 🎯 STEP 2: Enhanced Query Classifier - UNDERSTAND THE QUESTION FIRST
    console.log('🧠 Understanding query intent and complexity...');
    
    let reportAnalysis;
    try {
      const { EnhancedQueryClassifier } = await import('../../../utils/services/enhanced-query-classifier');
      const enhancedClassifier = new EnhancedQueryClassifier();
      reportAnalysis = enhancedClassifier.classifyReportWorthiness(question);
      console.log(`🎯 Query Understanding: ${reportAnalysis.isReportWorthy ? 'COMPLEX_ANALYSIS_NEEDED' : 'SIMPLE_QUERY'}`);
      console.log(`📊 Report Type: ${reportAnalysis.reportType}`);
      console.log(`⚡ Complexity: ${Math.round(reportAnalysis.estimatedComplexity * 100)}%`);
      console.log(`🧠 Reasoning: ${reportAnalysis.reasoning}`);
    } catch (error) {
      console.warn('Could not load EnhancedQueryClassifier:', error.message);
      reportAnalysis = { 
        isReportWorthy: false, 
        reportType: 'comprehensive',
        estimatedComplexity: 0.5,
        reasoning: 'Classifier not available - defaulting to LLM analysis' 
      };
    }
    
    // 🎯 NEW: Check if report generation is warranted
    if (reportAnalysis.isReportWorthy && surveyId) {
      console.log('📊 Complex query detected - initiating background report generation...');
      
      try {
        const { ReportGenerationService } = await import('../../../utils/services/report-generation-service');
        const reportService = new ReportGenerationService();
        
        const reportId = await reportService.initiateReport({
          userId,
          surveyId,
          cohortId: cohort?.id,
          query: question,
          reportType: reportAnalysis.reportType,
          tokenBudget: reportAnalysis.tokenBudget || 6000,
          complexity: reportAnalysis.estimatedComplexity
        });
        
        console.log(`📋 Report ${reportId} initiated for background processing`);
        
        // Return immediate acknowledgment if not streaming
        if (!stream) {
          return NextResponse.json({
            status: true,
            content: `🔄 **Generating Comprehensive ${reportAnalysis.reportType.charAt(0).toUpperCase() + reportAnalysis.reportType.slice(1)} Report**\n\n` +
                     `I'm creating a detailed analysis for your query. This will take 3-5 minutes to complete.\n\n` +
                     `**What I'm analyzing:**\n` +
                     `• ${reportAnalysis.reportType === 'demographic' ? 'Breaking down responses by demographic segments' : ''}` +
                     `• ${reportAnalysis.reportType === 'thematic' ? 'Identifying key themes and patterns' : ''}` +
                     `• ${reportAnalysis.reportType === 'comparative' ? 'Comparing different groups and segments' : ''}` +
                     `• ${reportAnalysis.reportType === 'longitudinal' ? 'Analyzing changes over time' : ''}` +
                     `• ${reportAnalysis.reportType === 'comprehensive' ? 'Conducting full multi-dimensional analysis' : ''}\n\n` +
                     `I'll notify you when the report is ready. The generation includes delays to respect API rate limits.\n\n` +
                     `You can check the status anytime by visiting the [Reports](/reports) page.`,
            reportId: reportId,
            reportStatus: 'initiated',
            estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 minutes
          });
        }
        
        // For streaming mode, we'll continue with regular analysis but add report notification
        // The report will be generated in the background
      } catch (error) {
        console.error('Failed to initiate report generation:', error);
        // Continue with regular analysis if report generation fails
      }
    }
    
    // 🎯 STEP 3: Load fact sheet as context data (not as replacement)
    let factSheet = null;
    if (surveyId) {
      try {
        const { analyzeSurveySchema } = await import('../../../../../scripts/analyze-survey-schema.js');
        const schema = await analyzeSurveySchema(surveyId, db);
        factSheet = schema.fact_sheet;
        console.log(`📊 Loaded fact sheet with ${Object.keys(factSheet.question_stats || {}).length} question stats for context`);
      } catch (error) {
        console.warn('Could not load fact sheet:', error.message);
      }
    }
    
    // 🎯 STEP 4: For SIMPLE queries only, try fact sheet with HIGH confidence threshold
    let factSheetResult: FactSheetQueryResult = { canAnswer: false, confidence: 0, reasoning: "" };
    
    if (!reportAnalysis.isReportWorthy && factSheet) {
      console.log('🔍 Query is simple - checking if fact sheet can provide direct answer...');
      try {
        const { FactSheetQueryResolver } = await import('../../../utils/survey/fact-sheet-query-resolver');
        const factSheetResolver = new FactSheetQueryResolver();
        factSheetResult = factSheetResolver.resolveFromFactSheet(question, factSheet);
        console.log(`📊 Fact Sheet Analysis: ${factSheetResult.canAnswer ? 'CAN_ANSWER' : 'NEEDS_LLM'}`);
        console.log(`📊 Confidence: ${Math.round(factSheetResult.confidence * 100)}%`);
        console.log(`📊 Reasoning: ${factSheetResult.reasoning}`);
      } catch (error) {
        console.error('❌ Error loading FactSheetQueryResolver:', error);
      }
    } else {
      console.log('🎯 Query is complex - skipping fact sheet shortcut, proceeding to LLM analysis');
    }
    
    // 🎯 STEP 5: Use fact sheet ONLY for simple queries with VERY high confidence (95%+)
    if (factSheetResult.canAnswer && factSheetResult.confidence >= 0.95) {
      console.log(`✅ Simple query answered directly from fact sheet (${Math.round(factSheetResult.confidence * 100)}% confidence)`);
      console.log('🔍 DEBUG: factSheetResult contents:', {
        canAnswer: factSheetResult.canAnswer,
        confidence: factSheetResult.confidence,
        hasAnswer: !!factSheetResult.answer,
        answerLength: factSheetResult.answer?.length || 0,
        answerPreview: factSheetResult.answer?.slice(0, 100) || 'NO_ANSWER',
        reasoning: factSheetResult.reasoning,
        hasDataCards: !!factSheetResult.dataCards,
        dataCardsLength: factSheetResult.dataCards?.length || 0
      });
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Send SSE formatted answer so frontend parser can handle it
          const sendJson = (obj: any) => {
            const jsonStr = JSON.stringify(obj);
            console.log('📤 Sending SSE JSON:', jsonStr);
            controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`));
          };
          
          // Send answer as JSON so frontend can parse
          sendJson({ content: factSheetResult.answer });
          
          // Add fact sheet source info
          const metaInfo = `\n---\n📊 SOURCE: Pre-computed statistics from ${factSheet?.survey_metadata?.total_responses || 'all'} survey responses\n✅ CONFIDENCE: ${Math.round(factSheetResult.confidence * 100)}%\n🔍 METHOD: ${factSheetResult.reasoning}`;
          sendJson({ content: metaInfo });

          // Add data cards for visualization
          if (factSheetResult.dataCards && factSheetResult.dataCards.length > 0) {
            sendJson({ content: '```data-cards\n' + JSON.stringify(factSheetResult.dataCards, null, 2) + '\n```' });
          }
          // End of stream
          console.log('📤 Sending [DONE] signal');
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          
          controller.close();
        }
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Sample-Size": String(factSheet?.survey_metadata?.total_responses || 0),
          "X-Source": "fact-sheet",
          "X-Confidence": String(Math.round(factSheetResult.confidence * 100)),
        },
      });
    }
    
    // 🎯 STEP 6: Proceed to LLM analysis with fact sheet context
    console.log(`🤖 Proceeding to LLM analysis with fact sheet context`);
    console.log(`🎯 Analysis Type: ${reportAnalysis.reportType} (${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity)`);
    
    const smartQueryBuilder = new SmartSurveyQueryBuilder();
    const intentClassifier = new QueryIntentClassifier();
    
    // Classify the query intent and build optimized query
    const queryIntent = intentClassifier.classifyQuery(question);
    const queryResult = await smartQueryBuilder.buildSmartQuery(
      question, 
      filterRules, 
      userId, 
      surveyId, 
      topK
    );

    console.log(`🎯 Query Intent: ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}%)`);
    console.log(`📊 Query Strategy: ${queryResult.explanation}`);
    console.log(`🔍 Expected Result Type: ${queryResult.expectedResultType}`);

    // Execute the smart query
    const [rows] = await db.execute<any[]>(queryResult.sql, queryResult.params);

    if (!rows.length) {
      return NextResponse.json({ status: true, answer: "No survey data available for this cohort." });
    }

    // Check if we have sufficient meaningful data - be more lenient and contextual
    const meaningfulAnswers = rows.filter((r: any) => {
      if (!r.answer_value || typeof r.answer_value !== 'string') return false;
      
      const trimmed = r.answer_value.trim();
      if (trimmed.length === 0) return false;
      
      // For choice questions, any non-empty answer is meaningful
      if (r.question_type === 'single-choice' || r.question_type === 'multiple-choice') {
        return trimmed.length > 0;
      }
      
      // For text questions, be more nuanced in filtering
      // Allow short but meaningful answers, exclude only obvious garbage
      if (trimmed.length < 2) return false;
      if (/^[0-9\s\.\-]+$/.test(trimmed) && trimmed.length < 5) return false; // Very short pure numbers
      if (/^(yes|no|maybe|ok|good|bad)$/i.test(trimmed)) return false; // Single word non-descriptive answers
      
      return true; // Allow most other answers
    });

    // More flexible minimum data requirements
    const minResponsesNeeded = Math.max(1, Math.min(3, Math.floor(rows.length * 0.3)));
    
    if (meaningfulAnswers.length < minResponsesNeeded) {
      return NextResponse.json({ 
        status: true, 
        answer: `I found only ${meaningfulAnswers.length} meaningful responses for this cohort, which is insufficient to provide a reliable analysis. Please try a broader cohort or check if there are more survey responses available.` 
      });
    }

    console.log(`Found ${rows.length} total responses, ${meaningfulAnswers.length} meaningful responses`);

    const answersText = meaningfulAnswers.map((r: any) => r.answer_value).join("\n");

    // Demographic distribution summaries
    const ageCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    const occupationCounts: Record<string, number> = {};
    const educationCounts: Record<string, number> = {};
    const incomeCounts: Record<string, number> = {};
    const politicalCounts: Record<string, number> = {};
    
    const seen = new Set<number>();
    rows.forEach((r:any)=> {
      if(seen.has(r.rid)) return;
      seen.add(r.rid);
      
      // Age
      const age = r.age_val as string | null;
      if(age){ ageCounts[age] = (ageCounts[age]||0)+1; }
      
      // Location
      const location = r.location_val as string | null;
      if(location){ locationCounts[location] = (locationCounts[location]||0)+1; }
      
      // Occupation
      const occupation = r.occupation_val as string | null;
      if(occupation){ occupationCounts[occupation] = (occupationCounts[occupation]||0)+1; }
      
      // Education
      const education = r.education_val as string | null;
      if(education){ educationCounts[education] = (educationCounts[education]||0)+1; }
      
      // Income
      const income = r.income_val as string | null;
      if(income){ incomeCounts[income] = (incomeCounts[income]||0)+1; }
      
      // Political Views
      const political = r.political_val as string | null;
      if(political){ politicalCounts[political] = (politicalCounts[political]||0)+1; }
    });

    // Build numeric age array for adaptive binning
    const numericAges:number[] = [];
    rows.forEach((r:any)=>{
      const ageStr = (r.age_val as string)||'';
      if(/\d+/.test(ageStr)){
        const m = ageStr.match(/(\d{1,3})/);
        if(m){ numericAges.push(parseInt(m[1],10)); }
      }
    });

    // determine grouping from question
    function binAges(): {labels:string[]; counts:number[]} {
      if(numericAges.length===0) return {labels:Object.keys(ageCounts),counts:Object.values(ageCounts)};
      const ages = numericAges.slice().sort((a,b)=>a-b);
      const bins:number[]=[]; let labels:string[]=[]; let counts:number[]=[];
      const qLower = question.toLowerCase();
      const makeHistogram=(width:number)=>{
        const min = Math.min(...ages); const max=Math.max(...ages);
        const start = Math.floor(min/width)*width;
        const end = Math.ceil((max+1)/width)*width;
        const size = Math.ceil((end-start)/width);
        counts = Array(size).fill(0);
        labels = Array(size).fill('');
        for(let i=0;i<size;i++){
          const from=start+i*width;
          const to=from+width-1;
          labels[i]=`${from}-${to}`;
        }
        ages.forEach(a=>{
          const idx=Math.floor((a-start)/width);
          counts[idx]++;
        });
      };
      if(/decade|10\s?year|10-year/.test(qLower)){
        makeHistogram(10);
      } else if(/5\s?-?year/.test(qLower)){
        makeHistogram(5);
      } else if(/five/.test(qLower) && /group|category|bin|split/.test(qLower)){
        // quantiles 5
        const n=5; labels=[];counts=Array(n).fill(0);
        const step=Math.floor(ages.length/n);
        for(let i=0;i<n;i++){
          const slice=ages.slice(i*step, i===n-1?undefined:(i+1)*step);
          if(slice.length){
            labels.push(`${slice[0]}-${slice[slice.length-1]}`);
            counts[i]=slice.length;
          }
        }
      } else {
        // default distinct ages
        labels=Object.keys(ageCounts);
        counts=Object.values(ageCounts);
      }
      return {labels,counts};
    }

    const {labels:ageLabels, counts:ageValues} = binAges();

    const ageTotal = ageValues.reduce((a,b)=>a+b,0)||1;
    const ageSummaryLines = ageLabels.map((lab,idx)=>`${lab}: ${Math.round((ageValues[idx]/ageTotal)*100)}%`);
    const ageSummary = ageSummaryLines.join(', ');

    // Helper function to create demographic summaries
    const createDemographicSummary = (counts: Record<string, number>, maxItems: number = 5) => {
      const total = Object.values(counts).reduce((a,b)=>a+b,0)||1;
      const sorted = Object.entries(counts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, maxItems);
      return sorted.map(([key, count]) => `${key}: ${Math.round((count/total)*100)}%`).join(', ');
    };

    // Create summaries for all demographics
    const locationSummary = Object.keys(locationCounts).length > 0 ? createDemographicSummary(locationCounts) : '';
    const occupationSummary = Object.keys(occupationCounts).length > 0 ? createDemographicSummary(occupationCounts) : '';
    const educationSummary = Object.keys(educationCounts).length > 0 ? createDemographicSummary(educationCounts) : '';
    const incomeSummary = Object.keys(incomeCounts).length > 0 ? createDemographicSummary(incomeCounts) : '';
    const politicalSummary = Object.keys(politicalCounts).length > 0 ? createDemographicSummary(politicalCounts) : '';

    // Build comprehensive demographic summary
    const demographicParts = [];
    if (ageSummary) demographicParts.push(`Age: ${ageSummary}`);
    if (locationSummary) demographicParts.push(`Location: ${locationSummary}`);
    if (occupationSummary) demographicParts.push(`Occupation: ${occupationSummary}`);
    if (educationSummary) demographicParts.push(`Education: ${educationSummary}`);
    if (incomeSummary) demographicParts.push(`Income: ${incomeSummary}`);
    if (politicalSummary) demographicParts.push(`Political Views: ${politicalSummary}`);
    
    const fullDemographicSummary = demographicParts.join(' | ');

    // Build chart spec for UI
    const chartSpec = {
      type: 'bar',
      title: 'Age distribution',
      labels: ageLabels,
      values: ageValues
    };

    // Prepare stats & quotes - use meaningful answers and include question context
    const sampleSize = meaningfulAnswers.length;
    // Provide more quotes for better context, prioritizing diverse question types
    const maxQuotes = Math.min(12, meaningfulAnswers.length);
    const quoteObjs = meaningfulAnswers.slice(0, maxQuotes).map((r: any, idx: number) => ({ 
      id: idx + 1, 
      text: r.answer_value as string,
      question: r.question_text as string,
      questionType: r.question_type as string,
      questionOptions: r.question_options as string,
      surveyTitle: r.survey_title as string
    }));

    // naive sentiment counts - use meaningful answers only
    let pos = 0, neg = 0, neu = 0;
    const positiveWords = ['good','love','great','like','best','excellent','positive','happy','satisfied','pleased'];
    const negativeWords = ['bad','hate','poor','worst','expensive','overpriced','negative','unhappy','dissatisfied','disappointed'];
    meaningfulAnswers.forEach((r:any)=>{
      const text = (r.answer_value as string).toLowerCase();
      if (positiveWords.some(w=>text.includes(w))) pos++; else if (negativeWords.some(w=>text.includes(w))) neg++; else neu++;
    });

    const statsJson = {
      sampleSize,
      sentiment:{ pos, neu, neg },
      quotes: quoteObjs,
      demographics: {
        age: ageCounts,
        location: locationCounts,
        occupation: occupationCounts,
        education: educationCounts,
        income: incomeCounts,
        political: politicalCounts
      }
    };

    const statsAppendix = `\n\n---\nsample-size: ${sampleSize}\nsentiment: 👍 ${Math.round((pos/sampleSize)*100)}% | 😐 ${Math.round((neu/sampleSize)*100)}% | 👎 ${Math.round((neg/sampleSize)*100)}%\ndemographics: ${fullDemographicSummary}\ncitations:\n` + quoteObjs.map(q=> {
      // Include full quote with question context for better hover tooltips
      const questionContext = `Q: "${q.question}" | A: "${q.text}"`;
      return `[${q.id}] ${questionContext}`;
    }).join('\n');

    // Build prompt with quotes list including question context
    const quotesForPrompt = quoteObjs.map(q=> {
      let questionContext = `Question: "${q.question}"`;
      
      // Add options context for choice questions
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
    
    // Analyze survey content and user question for contextual relevance
    const questionLower = question.toLowerCase();
    const surveyTitles = [...new Set(quoteObjs.map(q => q.surveyTitle))];
    const surveyQuestions = [...new Set(quoteObjs.map(q => q.question))];
    
    // Extract key topics and themes from survey questions and titles
    const allSurveyText = (surveyTitles.join(' ') + ' ' + surveyQuestions.join(' ')).toLowerCase();
    
    // Create contextual analysis for better AI understanding
    const surveyTopicsContext = `
Survey Topics Overview:
- Survey Titles: ${surveyTitles.join(', ')}
- Key Questions Asked: ${surveyQuestions.slice(0, 5).join('; ')}${surveyQuestions.length > 5 ? '...' : ''}
- Total Questions Available: ${surveyQuestions.length}
`;
    
    // 🎯 Build intent-aware prompt based on detected analysis type
    const intentExplanation = intentClassifier.explainIntent(queryIntent);
    const analysisTypeGuidance = getAnalysisTypeGuidance(queryIntent.analysisType, queryResult.expectedResultType);
    
    // 🎯 Enhanced fact sheet context for LLM
    let factSheetPromptContext = '';
    if (factSheet && factSheet.question_stats) {
      console.log('📊 Adding comprehensive fact sheet context to LLM prompt');
      
      factSheetPromptContext = `\n🔢 AUTHORITATIVE STATISTICAL FOUNDATION (${factSheet.survey_metadata?.total_responses || 'all'} responses):\n`;
      
      // Add all available statistics from fact sheet
      Object.entries(factSheet.question_stats).forEach(([questionKey, stats]: [string, any]) => {
        if (stats.adoption_rates) {
          const topOptions = Object.entries(stats.adoption_rates)
            .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
            .slice(0, 10);
          factSheetPromptContext += `\n📊 ${questionKey} (Platform/Option Adoption):\n`;
          topOptions.forEach(([option, data]: [string, any]) => {
            factSheetPromptContext += `  • ${option}: ${data.percentage}% (${data.users} users)\n`;
          });
        }
        
        if (stats.statistics) {
          factSheetPromptContext += `\n📈 ${questionKey} (Numerical Stats):\n`;
          factSheetPromptContext += `  • Average: ${stats.statistics.mean}\n`;
          factSheetPromptContext += `  • Median: ${stats.statistics.median}\n`;
          factSheetPromptContext += `  • Range: ${stats.statistics.min} - ${stats.statistics.max}\n`;
          if (stats.statistics.std_dev) {
            factSheetPromptContext += `  • Standard Deviation: ${stats.statistics.std_dev}\n`;
          }
        }
        
        if (stats.distribution) {
          const topCategories = Object.entries(stats.distribution)
            .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage)
            .slice(0, 5);
          factSheetPromptContext += `\n📋 ${questionKey} (Category Distribution):\n`;
          topCategories.forEach(([category, data]: [string, any]) => {
            factSheetPromptContext += `  • ${category}: ${data.percentage}% (${data.count} responses)\n`;
          });
        }
      });
      
      // Add demographic context if available
      if (factSheet.core_stats?.demographic_distribution) {
        factSheetPromptContext += `\n👥 DEMOGRAPHIC BREAKDOWN:\n`;
        Object.entries(factSheet.core_stats.demographic_distribution).forEach(([demo, data]: [string, any]) => {
          factSheetPromptContext += `• ${demo}: `;
          const entries = Object.entries(data).slice(0, 3);
          factSheetPromptContext += entries.map(([group, stats]: [string, any]) => `${group} (${stats.percentage}%)`).join(', ');
          if (Object.keys(data).length > 3) factSheetPromptContext += '...';
          factSheetPromptContext += '\n';
        });
      }
      
      factSheetPromptContext += '\n⚠️ CRITICAL INSTRUCTIONS:\n';
      factSheetPromptContext += '• Use these EXACT percentages and numbers for quantitative claims\n';
      factSheetPromptContext += '• Individual response samples below are for qualitative insights and context only\n';
      factSheetPromptContext += '• Combine statistical foundation with qualitative patterns for comprehensive analysis\n';
      factSheetPromptContext += `• This is a ${reportAnalysis.reportType} analysis with ${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity\n\n`;
    }
    
    const prompt = `You are an expert analyst representing the collective voice of survey respondents. Your task is to provide meaningful insights based on the survey data provided.

DETECTED INTENT: ${intentExplanation}
ANALYSIS TYPE: ${queryIntent.analysisType}
DATA TYPE: ${queryResult.expectedResultType} responses
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
Demographics of the cohort: ${fullDemographicSummary}
Sample size: ${sampleSize} meaningful responses

User question: "${question}"

Available survey responses with their questions:
${quotesForPrompt}`;



    // build deterministic demographic sentence before prompt
    const demographicSentence = fullDemographicSummary ? `Demographics: ${fullDemographicSummary}.` : '';

    const encoder = new TextEncoder();
    
    // 🎯 Enhanced system message based on query understanding
    const baseSystemMessage = "You are an expert analyst representing survey respondents' collective voice with deep understanding of their perspectives.";
    const intentSpecificMessage = getIntentSpecificSystemMessage(queryIntent.analysisType);
    const complexityMessage = reportAnalysis.isReportWorthy ? 
      `You are conducting a ${reportAnalysis.reportType} analysis that requires comprehensive, multi-dimensional insights.` :
      `You are providing focused analysis based on the specific question asked.`;
    
    const systemMessage = systemPrompt || `${baseSystemMessage} ${intentSpecificMessage} ${complexityMessage}

ANALYSIS APPROACH:
- You have access to both authoritative statistical data AND individual response samples
- Use statistical data for quantitative claims and percentages
- Use individual responses for qualitative insights, themes, and context
- Provide analysis appropriate to the complexity level requested (${Math.round(reportAnalysis.estimatedComplexity * 100)}%)
- Always explain your reasoning and cite supporting evidence
- Make meaningful connections between different data points when relevant

Your goal is to provide exactly the level of analysis the user is seeking while maintaining accuracy and insight.`;



    // 🎯 Generate streaming LLM response with appropriate token allocation
    const isO3Model = model.startsWith('o3') || model.startsWith('o1');
    const baseTokens = reportAnalysis.isReportWorthy ? 6000 : 3000;
    const maxTokens = isO3Model ? Math.min(baseTokens * 1.5, 8000) : baseTokens;
    
    console.log(`🚀 Starting ${reportAnalysis.isReportWorthy ? 'comprehensive' : 'focused'} LLM analysis (${maxTokens} tokens)`);
    
    // Handle non-streaming mode when stream is false
    if (!stream) {
      console.log('📄 Non-streaming mode requested');
      const completion = await createCompletion({
        model: model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: demographicSentence + "\n\n" + prompt }
        ],
        temperature: temperature,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        maxTokens: maxTokens,
      });

      // Generate data cards from fact sheet
      const dataCards = factSheet ? generateDataCards(factSheet, question) : [];
      
      let fullAnswer = '';
      if (completion.content) {
        fullAnswer = completion.content;
      } else if ((completion as any).choices?.[0]?.message?.content) {
        fullAnswer = (completion as any).choices[0].message.content;
      } else {
        console.warn('⚠️ Unexpected completion format:', Object.keys(completion));
        fullAnswer = "I apologize, but I couldn't generate a response. Please try again.";
      }
      
      // Build complete response with all metadata
      let completeResponse = fullAnswer + statsAppendix;
      
      // Add analysis metadata
      completeResponse += `\n\n---\n🎯 **ANALYSIS DETAILS:**\n`;
      completeResponse += `📊 **Type:** ${reportAnalysis.reportType} (${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity)\n`;
      completeResponse += `🧠 **Intent:** ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)\n`;
      completeResponse += `📈 **Data:** ${queryResult.expectedResultType} responses\n`;
      completeResponse += `🔍 **Method:** ${queryResult.explanation}\n`;
      completeResponse += `📊 **Sources:** ${factSheet ? 'Statistical foundation + Individual responses' : 'Individual responses only'}`;
      
      // Add data cards for visualization
      if (dataCards.length > 0) {
        completeResponse += '\n```data-cards\n' + JSON.stringify(dataCards, null, 2) + '\n```\n';
      }
      
      // Add chart if requested or relevant
      if (question.toLowerCase().match(/chart|graph|distribution|histogram/) || reportAnalysis.isReportWorthy) {
        completeResponse += '\n```chart\n' + JSON.stringify(chartSpec) + '\n```\n';
      }
      
      // Return as JSON response
      return NextResponse.json({ 
        status: true, 
        content: completeResponse 
      });
    }
    
    try {
      const streamingCompletion = await createStreamingCompletion({
        model: model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: demographicSentence + "\n\n" + prompt }
        ],
        temperature: temperature,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        maxTokens: maxTokens,
      });

      console.log(`🚀 Streaming ${reportAnalysis.isReportWorthy ? 'comprehensive' : 'focused'} analysis to user`);
      console.log(`📊 Query executed for user ${userId}, found ${rows.length} responses from user's surveys`);
      
      // 🎯 Generate data cards from fact sheet (Perplexity-style)
      const dataCards = factSheet ? generateDataCards(factSheet, question) : [];
      
      // 🎯 Create enhanced streaming response that adds metadata after the main content
      const enhancedStream = new ReadableStream({
        async start(controller) {
          try {
            // First, stream the LLM response (already in SSE format)
            const reader = streamingCompletion.stream.getReader();
            let isStreamComplete = false;
            
            while (!isStreamComplete) {
              const { done, value } = await reader.read();
              
              if (done) {
                isStreamComplete = true;
                
                // After streaming is complete, add metadata and citations as plain text
                controller.enqueue(encoder.encode(statsAppendix));
                
                // Add analysis metadata
                const analysisInfo = `\n\n---\n🎯 **ANALYSIS DETAILS:**\n`;
                const analysisDetails = `📊 **Type:** ${reportAnalysis.reportType} (${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity)\n`;
                const intentDetails = `🧠 **Intent:** ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)\n`;
                const dataDetails = `📈 **Data:** ${queryResult.expectedResultType} responses\n`;
                const methodDetails = `🔍 **Method:** ${queryResult.explanation}\n`;
                const sourceDetails = `📊 **Sources:** ${factSheet ? 'Statistical foundation + Individual responses' : 'Individual responses only'}`;
                
                controller.enqueue(encoder.encode(analysisInfo + analysisDetails + intentDetails + dataDetails + methodDetails + sourceDetails));
                
                // Add data cards for visualization
                if (dataCards.length > 0) {
                  controller.enqueue(encoder.encode('\n```data-cards\n' + JSON.stringify(dataCards, null, 2) + '\n```\n'));
                }
                
                // Add chart if requested or relevant
                if (question.toLowerCase().match(/chart|graph|distribution|histogram/) || reportAnalysis.isReportWorthy) {
                  controller.enqueue(encoder.encode('\n```chart\n' + JSON.stringify(chartSpec) + '\n```\n'));
                }
                
                controller.close();
              } else {
                // Forward the streaming chunk (already in SSE format from createStreamingCompletion)
                controller.enqueue(value);
              }
            }
          } catch (error) {
            console.error('Enhanced streaming error:', error);
            controller.enqueue(encoder.encode('\n\n❌ Error occurred during streaming. Please try again.'));
            controller.close();
          }
        }
      });
      
      return new NextResponse(enhancedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Sample-Size": String(rows.length),
          "X-Source": "llm-streaming-analysis",
          "X-Analysis-Type": reportAnalysis.reportType,
          "X-Complexity": String(Math.round(reportAnalysis.estimatedComplexity * 100)),
          "X-Intent": queryIntent.intent,
          "X-Confidence": String(Math.round(queryIntent.confidence * 100)),
          "X-Has-Fact-Sheet": factSheet ? "true" : "false",
        },
      });
      
    } catch (streamingError) {
      console.error('Streaming failed, falling back to non-streaming:', streamingError);
      
      // Fallback to non-streaming completion
      const completion = await createCompletion({
        model: model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: demographicSentence + "\n\n" + prompt }
        ],
        temperature: temperature,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        maxTokens: maxTokens,
      });

      console.log(`📄 Fallback to non-streaming response`);
      
      // 🎯 Generate data cards from fact sheet (Perplexity-style)
      const dataCards = factSheet ? generateDataCards(factSheet, question) : [];
      
      // 🎯 Handle completion response
      let fullAnswer = '';
      
      if (completion.content) {
        fullAnswer = completion.content;
      } else if ((completion as any).choices?.[0]?.message?.content) {
        fullAnswer = (completion as any).choices[0].message.content;
      } else {
        console.warn('⚠️ Unexpected completion format:', Object.keys(completion));
        fullAnswer = "I apologize, but I couldn't generate a response. Please try again.";
      }
      
      // 🎯 Create response stream with the LLM content
      const stream = new ReadableStream({
        start(controller) {
          try {
            // Send the main LLM response
            controller.enqueue(encoder.encode(fullAnswer));
            
            // Add metadata and citations
            controller.enqueue(encoder.encode(statsAppendix));
            
            // Add analysis metadata
            const analysisInfo = `\n\n---\n🎯 **ANALYSIS DETAILS:**\n`;
            const analysisDetails = `📊 **Type:** ${reportAnalysis.reportType} (${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity)\n`;
            const intentDetails = `🧠 **Intent:** ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)\n`;
            const dataDetails = `📈 **Data:** ${queryResult.expectedResultType} responses\n`;
            const methodDetails = `🔍 **Method:** ${queryResult.explanation}\n`;
            const sourceDetails = `📊 **Sources:** ${factSheet ? 'Statistical foundation + Individual responses' : 'Individual responses only'}`;
            
            controller.enqueue(encoder.encode(analysisInfo + analysisDetails + intentDetails + dataDetails + methodDetails + sourceDetails));
            
            // Add data cards for visualization
            if (dataCards.length > 0) {
              controller.enqueue(encoder.encode('\n```data-cards\n' + JSON.stringify(dataCards, null, 2) + '\n```\n'));
            }
            
            // Add chart if requested or relevant
            if (question.toLowerCase().match(/chart|graph|distribution|histogram/) || reportAnalysis.isReportWorthy) {
              controller.enqueue(encoder.encode('\n```chart\n' + JSON.stringify(chartSpec) + '\n```\n'));
            }
            
            controller.close();
          } catch (error) {
            console.error('Response streaming error:', error);
            controller.enqueue(encoder.encode('\n\n❌ Error occurred during response formatting. Please try again.'));
            controller.close();
          }
        }
              });
        
        return new NextResponse(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Sample-Size": String(rows.length),
            "X-Source": "llm-analysis-with-context",
            "X-Analysis-Type": reportAnalysis.reportType,
            "X-Complexity": String(Math.round(reportAnalysis.estimatedComplexity * 100)),
            "X-Intent": queryIntent.intent,
            "X-Confidence": String(Math.round(queryIntent.confidence * 100)),
            "X-Has-Fact-Sheet": factSheet ? "true" : "false",
          },
        });
    }
  } catch (error) {
    console.error("Error in cohort query:", error);
    return NextResponse.json({ status: false, message: "Internal error" }, { status: 500 });
  }
} 