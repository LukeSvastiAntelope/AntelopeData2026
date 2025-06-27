import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";
import { TextEncoder } from "util";
import { createCompletion } from "@/app/utils/services/ai-service";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { SmartSurveyQueryBuilder } from "@/app/utils/survey/smart-query-builder";
import { QueryIntentClassifier } from "@/app/utils/survey/query-intent-classifier";

interface CohortQueryPayload {
  cohort?: { id?: number; filter?: CohortFilterRule[] };
  question: string;
  topK?: number;
  surveyId?: number;
  model?: string;
  sources?: { survey: boolean; twins: boolean; web: boolean };
  systemPrompt?: string;
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

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token and get user ID
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = jwtPayload.email as string;

    const body = (await req.json()) as CohortQueryPayload;
    const { cohort, question, topK = 50, surveyId, model = 'gpt-4o', sources, systemPrompt } = body;

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

    // 🎯 NEW: Use Smart Query Builder for intent-aware data fetching
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
    const db = await getMySQLConnection();
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
    
    const prompt = `You are an expert analyst representing the collective voice of survey respondents. Your task is to provide meaningful insights based on the survey data provided.

DETECTED INTENT: ${intentExplanation}
ANALYSIS TYPE: ${queryIntent.analysisType}
DATA TYPE: ${queryResult.expectedResultType} responses

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
- Always ground your analysis in the actual survey responses provided
- Cite specific quotes using [1], [2], [3] format frequently throughout your response
- Explain your reasoning and how you connected the data to the question
- If making inferences, clearly indicate this while showing your evidence
- Include demographic context when relevant
- Use citations liberally to support every major point you make

${surveyTopicsContext}
Demographics of the cohort: ${fullDemographicSummary}
Sample size: ${sampleSize} meaningful responses

User question: "${question}"

Available survey responses with their questions:
${quotesForPrompt}`;



    // build deterministic demographic sentence before prompt
    const demographicSentence = fullDemographicSummary ? `Demographics: ${fullDemographicSummary}.` : '';

    const encoder = new TextEncoder();
    
    // 🎯 Intent-aware system message
    const baseSystemMessage = "You are an expert analyst with strong contextual intelligence, representing survey respondents' collective voice.";
    const intentSpecificMessage = getIntentSpecificSystemMessage(queryIntent.analysisType);
    const systemMessage = systemPrompt || `${baseSystemMessage} ${intentSpecificMessage} You excel at making meaningful connections between user questions and available survey data. When survey topics relate to the user's question - even indirectly - you provide insightful analysis based on response patterns, themes, and implicit information. You only claim insufficient data when questions are completely unrelated to survey content. Always cite evidence and explain your reasoning clearly.`;



    // update completion call - use more tokens for o3 models due to reasoning overhead
    const isO3Model = model.startsWith('o3') || model.startsWith('o1');
    const maxTokens = isO3Model ? 3000 : 500;
    
    const completion = await createCompletion({
      model: model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: demographicSentence + "\n\n" + prompt }
      ],
      temperature: 0.25,
      frequencyPenalty: 0.2,
      presencePenalty: 0.2,
      maxTokens: maxTokens,
    });

    console.log(`Model: ${model}, Completion response:`, completion);
    console.log(`Query executed for user ${userId}, found ${rows.length} responses from user's surveys`);
    
    const fullAnswer = completion.content || "I apologize, but I couldn't generate a response. Please try again or switch to a different model.";

    // 🎯 Add intent detection info to response for debugging
    const intentDebugInfo = `\n\n---\n🎯 QUERY ANALYSIS:\nDetected Intent: ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)\nAnalysis Type: ${queryIntent.analysisType}\nData Type: ${queryResult.expectedResultType}\nStrategy: ${queryResult.explanation}`;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(fullAnswer));
        controller.enqueue(encoder.encode(statsAppendix));
        controller.enqueue(encoder.encode(intentDebugInfo));
        if (question.toLowerCase().match(/chart|graph|distribution|histogram/)) {
          controller.enqueue(encoder.encode('\n```chart\n' + JSON.stringify(chartSpec) + '\n```\n'));
        }
        controller.close();
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Sample-Size": String(rows.length),
      },
    });
  } catch (error) {
    console.error("Error in cohort query:", error);
    return NextResponse.json({ status: false, message: "Internal error" }, { status: 500 });
  }
} 