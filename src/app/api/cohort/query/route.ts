import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";
import { TextEncoder } from "util";
import { auth } from '@/auth';

import { createCompletion, createStreamingCompletion } from "@/app/utils/services/ai-service";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { SmartSurveyQueryBuilder } from "@/app/utils/survey/smart-query-builder";
import { EnhancedSurveyQueryBuilder } from "@/app/utils/survey/enhanced-query-builder";
import { QueryIntentClassifier } from "@/app/utils/survey/query-intent-classifier";
import type { FactSheetQueryResult } from "../../../utils/survey/fact-sheet-query-resolver";
// Note: QuestionIntelligence is dynamically imported in the route handler



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

/**
 * Generate AI analysis of statistical results to provide intelligent insights
 */
async function generateAIAnalysis(analysisResults: any, userQuestion: string, surveyMeta: any): Promise<string> {
  try {
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
    }).slice(0, 3); // Limit to top 3 questions for analysis

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
      model: 'gpt-4o', // Use stronger model for analysis
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // Balanced temperature for insightful but consistent analysis
      maxTokens: 800
    });

    return completion.content || 'Analysis could not be generated at this time.';

  } catch (error) {
    console.warn('⚠️ AI analysis generation failed:', error.message);
    return 'Statistical data analysis is temporarily unavailable. The numerical results above provide the key findings from your query.';
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 COHORT QUERY ROUTE STARTED - NEW VERSION WITH FACT SHEET FIRST');
    
    // Authenticate request via NextAuth session (safer than trusting header)
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json()) as CohortQueryPayload;
    const { cohort, question, topK = 1000, surveyId: initialSurveyId, model = 'gpt-4o', temperature = 0.0, sources, systemPrompt, stream = true } = body;
    let surveyId = initialSurveyId; // Allow reassignment for auto-selection
    
    console.log('🔍 DEBUGGING: Request body stream value:', body.stream);
    console.log('🔍 DEBUGGING: Resolved stream value:', stream);
    console.log('🔍 DEBUGGING: Model being used:', model);
    
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
      console.log('📊 Complex query detected - will offer report generation...');
      
      // Instead of auto-generating, we'll include report generation suggestion in the response
      // The frontend can then decide whether to trigger report preview generation
    }
    
    // 🎯 STEP 3: Simple approach - Find relevant questions and query them directly
    let factSheet = null; // Keep for compatibility
    let analysisResults = null;
    let autoSelectedSurvey = null;
    
    // 🎯 NEW: Intelligent Survey Auto-Selection
    if (!surveyId) {
      console.log(`🎯 No survey selected - attempting intelligent auto-selection for: "${question}"`);
      
      try {
        // Get user's available surveys
        const [userSurveys] = await db.execute(`
          SELECT id, title, description
          FROM surveys 
          WHERE (created_by = ? OR (is_public = 1 AND status = 'published'))
          AND status IN ('published', 'closed')
          ORDER BY created_at DESC
        `, [userId]) as any[];

        if (userSurveys.length > 0) {
          console.log(`🔍 Found ${userSurveys.length} available surveys for auto-selection`);
          
          // Use LLM to find the most relevant survey based on question content
          const surveysText = userSurveys.map((survey: any, index: number) => 
            `${index + 1}. [ID: ${survey.id}] "${survey.title}"${survey.description ? ` - ${survey.description}` : ''}`
          ).join('\n');

          const autoSelectionPrompt = `You are an expert at matching user questions to relevant surveys.

USER QUESTION: "${question}"

AVAILABLE SURVEYS:
${surveysText}

Your task: Determine if the user's question clearly relates to a specific survey. Consider:
1. Does the question reference specific topics, characters, or scenarios mentioned in survey titles?
2. Would this question be meaningless without a specific survey context?
3. Is there a clear semantic match between the question and a survey title?

Examples:
- "Do most people spare or kill" + "Sparing or Killing Gilbert Alexander in Bioshock 2" = CLEAR MATCH
- "What are some interesting statistics" + multiple surveys = NO CLEAR MATCH (too generic)
- "How do people feel about healthcare" + "Healthcare Survey" = CLEAR MATCH

Return ONLY a JSON object with this format:
{
  "shouldAutoSelect": true/false,
  "surveyId": 123 or null,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this survey was selected or why no selection was made"
}

Only suggest auto-selection if there's a clear, unambiguous match with high confidence (>0.8).`;

          const autoSelectionResult = await createCompletion({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: autoSelectionPrompt }],
            temperature: 0.2,
            maxTokens: 200
          });

          try {
            const autoSelection = JSON.parse(autoSelectionResult.content);
            
            if (autoSelection.shouldAutoSelect && autoSelection.surveyId && autoSelection.confidence > 0.8) {
              const selectedSurvey = userSurveys.find((s: any) => s.id === autoSelection.surveyId);
              if (selectedSurvey) {
                surveyId = autoSelection.surveyId; // Override the surveyId for the rest of the function
                autoSelectedSurvey = {
                  id: selectedSurvey.id,
                  title: selectedSurvey.title,
                  confidence: autoSelection.confidence,
                  reasoning: autoSelection.reasoning
                };
                console.log(`✅ Auto-selected survey: "${selectedSurvey.title}" (confidence: ${Math.round(autoSelection.confidence * 100)}%)`);
                console.log(`🧠 Reasoning: ${autoSelection.reasoning}`);
              }
            } else {
              console.log(`❌ No clear survey match found (confidence: ${Math.round((autoSelection.confidence || 0) * 100)}%)`);
              console.log(`🧠 Reasoning: ${autoSelection.reasoning}`);
            }
          } catch (parseError) {
            console.warn('Could not parse auto-selection result:', parseError.message);
          }
        }
      } catch (error) {
        console.warn('Survey auto-selection failed:', error.message);
      }
    }
    
    if (surveyId) {
      try {
        console.log(`🎯 LIGHTWEIGHT APPROACH: Finding relevant questions for "${question}" in survey ${surveyId}`);
        
        // Check if survey exists
        const [surveyCheck] = await db.execute(
          `SELECT id, title FROM surveys WHERE id = ?`,
          [surveyId]
        ) as any[];

        if (surveyCheck && surveyCheck.length > 0) {
          // Use the new lightweight matcher
          const { LightweightQuestionMatcher } = await import('../../../utils/survey/lightweight-question-matcher');
          const matcher = new LightweightQuestionMatcher();
          
          // Find relevant questions (no pre-analysis needed)
          const matchResult = await matcher.findRelevantQuestions(
            surveyId, 
            question, 
            db, 
            3 // Max 3 most relevant questions
          );
          
          console.log(`✅ ${matchResult.reasoning}`);
          
          // Generate targeted queries only for matched questions
          const executedResults = [];
          const noDataQuestions = [];
          
          for (const match of matchResult.matches) {
            console.log(`📊 Querying: ${match.question.prompt} (score: ${match.relevanceScore})`);
            
            // Use demographic filtering if available
            const data = await matcher.generateTargetedQueryWithFilter(
              match.question.id, 
              surveyId, 
              db, 
              matchResult.demographicFilter
            );
            
            if (data && data.length > 0) {
              executedResults.push({
                title: match.question.prompt,
                description: `Response distribution for survey question`,
                analysisType: 'distribution',
                data: data.map((row: any) => ({
                  answer_value: row.answer_value,
                  count: row.count,
                  percentage: row.percentage
                })),
                visualizationType: 'horizontal_bar',
                category: 'Survey Data',
                totalResponses: data.reduce((sum: number, row: any) => sum + row.count, 0),
                questionId: match.question.id,
                relevanceScore: match.relevanceScore
              });
            } else {
              noDataQuestions.push({
                question: match.question.prompt,
                questionId: match.question.id
              });
            }
          }
          
          // Log issues for debugging
          if (noDataQuestions.length > 0) {
            console.log(`⚠️ Found ${noDataQuestions.length} questions with no valid response data:`);
            noDataQuestions.forEach(q => {
              console.log(`  - Question ${q.questionId}: ${q.question.substring(0, 80)}...`);
            });
          }

          // If no results but we found relevant questions, provide helpful feedback
          if (executedResults.length === 0 && matchResult.matches.length > 0) {
            analysisResults = {
              survey_id: surveyId,
              survey_title: surveyCheck[0].title,
              user_question: question,
              analysis_count: 0,
              results: [],
              matched_questions: matchResult.matches.length,
              methodology: 'lightweight_targeted_queries',
              message: `Found ${matchResult.matches.length} relevant questions in "${surveyCheck[0].title}", but no response data is available. This survey may not have any completed responses yet, or the responses may not contain the expected answer data.`,
              suggestions: [
                "Check if the survey has any completed responses",
                "Verify that respondents are actually filling out the questions",
                "Try asking about other aspects of the survey data"
              ]
            };
          } else {
            analysisResults = {
              survey_id: surveyId,
              survey_title: surveyCheck[0].title,
              user_question: question,
              analysis_count: executedResults.length,
              results: executedResults,
              matched_questions: matchResult.matches.length,
              methodology: 'lightweight_targeted_queries'
            };
          }

           // Create a compatible fact sheet structure for existing code
           // FIX: Use actual survey response count, not sum of question responses
           const actualResponseCount = await db.execute(`
             SELECT COUNT(DISTINCT id) as response_count 
             FROM survey_responses 
             WHERE survey_id = ?
           `, [surveyId]);
           
           // Add demographic context to the title if filtering is applied
           const demographicContext = matchResult.demographicFilter 
             ? ` (filtered by ${matchResult.demographicFilter.field}: ${matchResult.demographicFilter.value})`
             : '';
           
           factSheet = {
             survey_meta: {
               id: surveyId,
               title: surveyCheck[0].title + demographicContext,
               total_respondents: actualResponseCount[0][0].response_count,
               description: `Targeted analysis of ${executedResults.length} relevant questions` + 
                 (matchResult.demographicFilter ? ` with demographic filtering` : '')
             },
             question_stats: {},
             analysis_results: analysisResults,
             data_source: 'lightweight_targeted_queries'
           };

           console.log(`✅ LIGHTWEIGHT SUCCESS: ${executedResults.length} targeted queries executed`);
        } else {
          console.warn(`❌ Survey ${surveyId} not found`);
        }
      } catch (error) {
        console.warn('Could not generate lightweight analysis:', error.message);
      }
    }
    
    // 🎯 STEP 4: INTELLIGENT ROUTING - Use smart intent analysis instead of keywords
    // COMMENTED OUT: Fact sheet routing logic causing cross-survey contamination
    /*
    let factSheetResult: FactSheetQueryResult = { canAnswer: false, confidence: 0, reasoning: "" };
    let routingDecision: any = null;
    
    if (factSheet) {
      try {
        console.log('🧠 Analyzing query intent and routing intelligently...');
        
        // Import and use intelligent router
        const { IntelligentRouter } = await import('../../../utils/survey/intelligent-router');
        const router = new IntelligentRouter();
        
        // Analyze what the user actually wants
        const intent = router.analyzeIntent(question);
        console.log(`🎯 Intent Analysis: ${intent.primaryAction} → ${intent.outputType} (${intent.complexity.toLowerCase()}) [${Math.round(intent.confidence * 100)}% confidence]`);
        
        // Check if we can fulfill with available data
        const capability = router.assessCapability(intent, factSheet);
        console.log(`⚙️ Capability: ${capability.canFulfill ? 'CAN_FULFILL' : 'CANNOT_FULFILL'} (${Math.round(capability.confidence * 100)}% confidence)`);
        console.log(`📝 Reason: ${capability.reason}`);
        
        // Make routing decision
        routingDecision = router.makeRoutingDecision(intent, capability);
        console.log(`🚏 Route Decision: ${routingDecision.route} - ${routingDecision.reason}`);
        console.log(`⏱️ Estimated Time: ${routingDecision.estimatedTime}`);
        
        // If we have analysis results from LightweightQuestionMatcher, use them directly
        if (factSheet.analysis_results && factSheet.analysis_results.results && factSheet.analysis_results.results.length > 0) {
          console.log(`📊 Using direct analysis results with ${factSheet.analysis_results.analysis_count} executed queries`);
          
          // Add AI analysis layer first - transform raw data into insights
          const aiAnalysis = await generateAIAnalysis(factSheet.analysis_results, question, factSheet.survey_meta);
          
          // Generate response content with AI analysis first
          let responseContent = `# Survey Analysis: ${factSheet.survey_meta.title}\n\n`;
          responseContent += `## 🧠 Analysis & Insights\n\n`;
          responseContent += aiAnalysis;
          responseContent += `\n\n---\n\n`;
          
          // Add note about charts being displayed below
          responseContent += `📊 **Interactive charts are displayed below**, followed by detailed statistical breakdowns.\n\n`;
          
          // Add detailed statistical results section
          responseContent += `## 📈 Detailed Statistical Results\n\n`;
          responseContent += `Based on **fresh analysis** of ${factSheet.analysis_results.analysis_count} relevant questions:\n\n`;
          
          // Process each analysis result with full details
          factSheet.analysis_results.results.forEach((result, index) => {
            responseContent += `### ${index + 1}. ${result.title}\n\n`;
            responseContent += `**Total Responses:** ${result.totalResponses.toLocaleString()}\n\n`;
            
            if (result.data && result.data.length > 0) {
              if (result.analysisType === 'distribution') {
                responseContent += `**Complete Distribution:**\n`;
                result.data.forEach(row => {
                  responseContent += `- **${row.answer_value}**: ${row.percentage}% (${row.count.toLocaleString()} responses)\n`;
                });
              } else {
                responseContent += `**Results:** ${result.data.length} data points analyzed\n`;
              }
            }
            
            responseContent += `\n`;
          });
          
          responseContent += `\n---\n*Analysis generated from live database queries on ${new Date().toLocaleDateString()}*`;
          
          // Generate data cards for visualizations (compatible with frontend format)
          const dataCards = factSheet.analysis_results.results.map((result, index) => {
            if (result.analysisType === 'distribution' && result.data && result.data.length > 0) {
                          return {
              id: `chart_${index}`,
              title: result.title,
              description: result.description,
                chart_type: 'horizontal_bar', // Frontend expects this format
                data: result.data.map(row => ({
                  label: row.answer_value,
                  value: parseFloat(row.percentage),
                  count: row.count
                })),
                metadata: {
                  total_responses: result.data.reduce((sum, row) => sum + row.count, 0),
                  analysis_type: 'distribution'
                }
              };
            }
            return null;
          }).filter(card => card !== null);
          
          factSheetResult = { 
            canAnswer: true, 
            confidence: 0.9, 
            reasoning: `Generated ${factSheet.analysis_results.analysis_count} statistical analyses with real data`,
            answer: responseContent,
            dataCards: dataCards
          };
          console.log(`📊 Analysis Direct: SUCCESS with ${responseContent.length} characters and ${dataCards.length} charts`);
          console.log(`📊 Confidence: 90%`);
        } else {
          // No analysis results available, mark as cannot answer
          factSheetResult = { 
            canAnswer: false, 
            confidence: 0, 
            reasoning: 'No analysis results available from lightweight matcher'
          };
        }
        
      } catch (error) {
        console.error('❌ Error in intelligent routing:', error);
        console.log('🔄 Falling back to original routing logic...');
      }
    } else {
      console.log('❌ No fact sheet available - will use full LLM analysis');
    }
    */
    
    // 🎯 STEP 5: Use fact sheet based on intelligent routing decision OR high confidence fallback
    // Force the dynamic SQL path when analysis_results exist
    // COMMENTED OUT: Fact sheet logic causing cross-survey contamination
    /*
    if (factSheet && factSheet.analysis_results) {
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
            "X-Sample-Size": String(factSheet?.survey_meta?.total_respondents || factSheet?.survey_metadata?.total_responses || 0),
            "X-Source": "fact-sheet-direct",
          "X-Confidence": String(Math.round(factSheetResult.confidence * 100)),
            "X-Route": routingDecision?.route || "fact-sheet",
            "X-Intent": routingDecision ? `${routingDecision.intent?.primaryAction}-${routingDecision.intent?.outputType}` : "unknown",
            "X-Estimated-Time": routingDecision?.estimatedTime || "< 3 seconds",
        },
      });
    }
    */
    
    // 🎯 STEP 6: Proceed to LLM analysis with fact sheet context
    console.log(`🤖 Proceeding to LLM analysis with fact sheet context`);
    console.log(`🎯 Analysis Type: ${reportAnalysis.reportType} (${Math.round(reportAnalysis.estimatedComplexity * 100)}% complexity)`);
    
    console.log('🔍 DEBUGGING: About to create QueryIntentClassifier');
    const intentClassifier = new QueryIntentClassifier();
    console.log('🔍 DEBUGGING: QueryIntentClassifier created, about to classify query');
    const queryIntent = intentClassifier.classifyQuery(question);
    console.log('🔍 DEBUGGING: Query classified successfully');
    
    let queryResult;
    let rows;
    
    console.log('🔍 DEBUGGING: About to try enhanced query builder');
    
    // Try enhanced query builder first, fall back to original if it fails
    try {
      console.log('🚀 Attempting enhanced query with normalized demographics...');
      console.log('🔍 DEBUGGING: Creating EnhancedSurveyQueryBuilder');
      const enhancedQueryBuilder = new EnhancedSurveyQueryBuilder();
      console.log('🔍 DEBUGGING: EnhancedSurveyQueryBuilder created');
      queryResult = await enhancedQueryBuilder.buildEnhancedQuery(
      question, 
      filterRules, 
      userId, 
      surveyId, 
      topK
    );

    console.log(`🎯 Query Intent: ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}%)`);
      console.log(`📊 Enhanced Query Strategy: ${queryResult.explanation}`);
    console.log(`🔍 Expected Result Type: ${queryResult.expectedResultType}`);

      // Execute the enhanced query
      console.log('🔍 DEBUGGING: About to execute enhanced query');
      [rows] = await db.execute<any[]>(queryResult.sql, queryResult.params);
      console.log('✅ Enhanced query executed successfully');
      console.log('🔍 DEBUGGING: Enhanced query result rows:', rows.length);
      
    } catch (enhancedError) {
      console.warn('⚠️ Enhanced query failed, falling back to original query builder:', enhancedError.message);
      
      // Fall back to original SmartSurveyQueryBuilder
      const smartQueryBuilder = new SmartSurveyQueryBuilder();
      queryResult = await smartQueryBuilder.buildSmartQuery(
        question, 
        filterRules, 
        userId, 
        surveyId, 
        topK
      );
      
      console.log(`📊 Fallback Query Strategy: ${queryResult.explanation}`);
      console.log(`🔍 Expected Result Type: ${queryResult.expectedResultType}`);
      
      // Execute the fallback query
      console.log('🔍 DEBUGGING: About to execute fallback query');
      [rows] = await db.execute<any[]>(queryResult.sql, queryResult.params);
      console.log('✅ Fallback query executed successfully');
      console.log('🔍 DEBUGGING: Fallback query result rows:', rows.length);
    }

    if (!rows.length) {
      console.log('🔍 DEBUGGING: No rows found from query, fact sheet disabled for clean data');
      console.log('✅ No text responses found - but we have structured data from LightweightQuestionMatcher - proceeding to analysis');
      
      // We still have structured data from LightweightQuestionMatcher that needs analysis!
      // Check if we have fact sheet with analysis results
      if (factSheet && factSheet.analysis_results && factSheet.analysis_results.results && factSheet.analysis_results.results.length > 0) {
        console.log(`📊 PROCEEDING WITH ANALYSIS: Using ${factSheet.analysis_results.analysis_count} structured questions for LLM analysis`);
        
        // Generate AI analysis from the structured data
        const aiAnalysis = await generateAIAnalysis(factSheet.analysis_results, question, factSheet.survey_meta);
        
        // Create data cards for visualization  
        const dataCards = factSheet.analysis_results.results.map((result, index) => ({
          title: result.title,
          chart_type: 'horizontal_bar', // Set the chart type the frontend expects
          data: (result.data || []).map((item: any) => ({
            label: item.answer_value, // Transform answer_value to label
            value: parseFloat(item.percentage) // Transform percentage to value as number
          })),
          totalResponses: result.totalResponses,
          questionId: result.questionId,
          index: index
        }));
        
        console.log(`📊 [DEBUG] Created ${dataCards.length} data cards for visualization`);
        console.log(`📊 [DEBUG] Data cards structure:`, JSON.stringify(dataCards, null, 2));
        
        // Generate structured response
        let responseContent = `# Survey Analysis: ${factSheet.survey_meta.title}\n\n`;
        responseContent += `## 🧠 Analysis & Insights\n\n`;
        responseContent += aiAnalysis;
        responseContent += `\n\n---\n\n`;
        responseContent += `📊 **Analysis based on ${factSheet.analysis_results.analysis_count} relevant questions from ${factSheet.survey_meta.total_respondents} survey respondents.**\n\n`;
        
        // Create SSE stream response with analysis
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            try {
              // Send content as SSE format
              const contentChunk = JSON.stringify({ content: responseContent });
              controller.enqueue(encoder.encode(`data: ${contentChunk}\n\n`));
              
              // Add data cards for visualization if available
              if (dataCards.length > 0) {
                console.log(`📊 [DEBUG] Sending ${dataCards.length} data cards to frontend`);
                const dataCardsContent = '\n```data-cards\n' + JSON.stringify(dataCards, null, 2) + '\n```\n';
                const dataCardsChunk = JSON.stringify({ content: dataCardsContent });
                console.log(`📊 [DEBUG] Data cards content length: ${dataCardsContent.length}`);
                controller.enqueue(encoder.encode(`data: ${dataCardsChunk}\n\n`));
              } else {
                console.log(`📊 [DEBUG] No data cards to send (length: ${dataCards.length})`);
              }
              
              // Send completion signal
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (error) {
              console.error('Response streaming error:', error);
              const errorChunk = JSON.stringify({ content: '\n\n❌ Error occurred during response formatting. Please try again.' });
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
            "X-Sample-Size": String(factSheet.survey_meta.total_respondents),
            "X-Source": "structured-data-analysis",
            "X-Analysis-Type": "structured",
            "X-Has-Fact-Sheet": "true"
          }
        });
      } else {
        console.log('❌ No structured data available for analysis');
        return NextResponse.json({ status: true, content: "No data available for analysis. Please try a different question." });
      }
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
    const genderCounts: Record<string, number> = {};
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
      
      // Gender
      const gender = r.gender_val as string | null;
      if(gender){ genderCounts[gender] = (genderCounts[gender]||0)+1; }
      
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
    const genderSummary = Object.keys(genderCounts).length > 0 ? createDemographicSummary(genderCounts) : '';
    const locationSummary = Object.keys(locationCounts).length > 0 ? createDemographicSummary(locationCounts) : '';
    const occupationSummary = Object.keys(occupationCounts).length > 0 ? createDemographicSummary(occupationCounts) : '';
    const educationSummary = Object.keys(educationCounts).length > 0 ? createDemographicSummary(educationCounts) : '';
    const incomeSummary = Object.keys(incomeCounts).length > 0 ? createDemographicSummary(incomeCounts) : '';
    const politicalSummary = Object.keys(politicalCounts).length > 0 ? createDemographicSummary(politicalCounts) : '';

    // Build comprehensive demographic summary
    const demographicParts = [];
    if (ageSummary) demographicParts.push(`Age: ${ageSummary}`);
    if (genderSummary) demographicParts.push(`Gender: ${genderSummary}`);
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
        political: politicalCounts,
        gender: genderCounts
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
    console.log('🔍 DEBUGGING: Stream parameter value:', stream);
    console.log('🔍 DEBUGGING: About to check streaming mode...');
    
    // Handle non-streaming mode when stream is false
    if (!stream) {
      console.log('🔍 DEBUGGING: Taking NON-STREAMING path');
      console.log('📄 Non-streaming mode requested');
      console.log('🔍 DEBUGGING: System message length:', systemMessage.length);
      console.log('🔍 DEBUGGING: User prompt length:', (demographicSentence + "\n\n" + prompt).length);
      console.log('🔍 DEBUGGING: Model:', model, 'Max tokens:', maxTokens);
      
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
      
      console.log('🔍 DEBUGGING: Completion object keys:', Object.keys(completion));
      console.log('🔍 DEBUGGING: Completion content exists:', !!completion.content);
      if (completion.content) {
        console.log('🔍 DEBUGGING: Content length:', completion.content.length);
        console.log('🔍 DEBUGGING: Content preview:', completion.content.substring(0, 200));
      }

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
      
      // Add report generation suggestion if warranted
      if (reportAnalysis.isReportWorthy && surveyId) {
        const reportSuggestion = {
          suggestReport: true,
          reportType: reportAnalysis.reportType,
          complexity: reportAnalysis.estimatedComplexity,
          surveyId: surveyId,
          cohortId: cohort?.id,
          query: question
        };
        completeResponse += '\n```report-suggestion\n' + JSON.stringify(reportSuggestion, null, 2) + '\n```\n';
      }
      
      // Return as JSON response
      return NextResponse.json({ 
        status: true, 
        content: completeResponse 
      });
    }
    
    try {
      console.log('🔍 DEBUGGING: Taking STREAMING path');
      console.log('🚀 DEBUGGING: Starting streaming completion');
      console.log('🔍 DEBUGGING: System message length:', systemMessage.length);
      console.log('🔍 DEBUGGING: User prompt length:', (demographicSentence + "\n\n" + prompt).length);
      console.log('🔍 DEBUGGING: Model:', model, 'Max tokens:', maxTokens);
      
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
      
      console.log('🔍 DEBUGGING: Streaming completion created successfully');

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
                
                // Add report generation suggestion if warranted
                if (reportAnalysis.isReportWorthy && surveyId) {
                  const reportSuggestion = {
                    suggestReport: true,
                    reportType: reportAnalysis.reportType,
                    complexity: reportAnalysis.estimatedComplexity,
                    surveyId: surveyId,
                    cohortId: cohort?.id,
                    query: question
                  };
                  controller.enqueue(encoder.encode('\n```report-suggestion\n' + JSON.stringify(reportSuggestion, null, 2) + '\n```\n'));
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
            
            // Add report generation suggestion if warranted
            if (reportAnalysis.isReportWorthy && surveyId) {
              const reportSuggestion = {
                suggestReport: true,
                reportType: reportAnalysis.reportType,
                complexity: reportAnalysis.estimatedComplexity,
                surveyId: surveyId,
                cohortId: cohort?.id,
                query: question
              };
              controller.enqueue(encoder.encode('\n```report-suggestion\n' + JSON.stringify(reportSuggestion, null, 2) + '\n```\n'));
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