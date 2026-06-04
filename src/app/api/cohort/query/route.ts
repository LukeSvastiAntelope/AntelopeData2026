import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";
import { auth } from '@/auth';

import { createCompletion } from "@/app/utils/services/ai-service";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { SmartSurveyQueryBuilder } from "@/app/utils/survey/smart-query-builder";
import { EnhancedSurveyQueryBuilder } from "@/app/utils/survey/enhanced-query-builder";
import { QueryIntentClassifier } from "@/app/utils/survey/query-intent-classifier";
import {
  getCampaignNewsContextForUser,
  refreshCampaignNewsForUserScope,
  type NewsTimeWindowConfig,
} from "@/app/utils/campaign-news";
import { respondFromCampaignNewsOnly, respondFromGeneralWebOnly } from "./news-copilot";
import { detectSurveyToolIntent, executeSurveyTool } from "./survey-tools";
import { orchestrateWithPlanner } from "./agent-orchestrator";
import {
  buildCampaignMemoryNamespace,
  CampaignMemoryService,
} from "@/app/utils/services/campaign-memory-service";
import {
  computeContinuityScore,
  computeFreshnessScore,
  computeRepetitionScore,
} from "@/app/utils/evaluations/chat-evals";
import {
  getAgentRolloutStage,
  getRolloutStage,
  shouldTriggerAgentRollback,
  shouldTriggerRollback,
} from "@/app/utils/evaluations/rollout-guardrails";
import type { FactSheetQueryResult } from "../../../utils/survey/fact-sheet-query-resolver";
// Note: QuestionIntelligence is dynamically imported in the route handler



interface CohortQueryPayload {
  cohort?: { id?: number; filter?: CohortFilterRule[] };
  question: string;
  recentMessages?: Array<{ role: 'user' | 'agent'; content: string }>;
  topK?: number;
  surveyId?: number;
  model?: string;
  temperature?: number;
  sources?: { survey: boolean; twins: boolean; web: boolean };
  systemPrompt?: string;
  stream?: boolean;
  responseMode?: 'quick_update' | 'decision_support' | 'full_brief';
}

interface CampaignIdentity {
  orgId: number | null;
  candidateName: string | null;
  organizationName: string | null;
  party: string | null;
  officeType: string | null;
  state: string | null;
  districtCode: string | null;
}

type ResponseMode = 'quick_update' | 'decision_support' | 'full_brief';
type ComplexityLevel = 'low' | 'medium' | 'high';

async function getCampaignIdentityForUser(userId: string): Promise<CampaignIdentity | null> {
  const db = await getMySQLConnection();
  const [rows]: any = await db.execute(
    `SELECT o.id AS orgId,
            o.candidate_name AS candidateName,
            o.name AS organizationName,
            o.party AS party,
            o.office_type AS officeType,
            UPPER(TRIM(o.state)) AS state,
            o.district_code AS districtCode
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [userId]
  );
  if (!rows?.length) return null;
  return {
    orgId: rows[0].orgId ? Number(rows[0].orgId) : null,
    candidateName: rows[0].candidateName || null,
    organizationName: rows[0].organizationName || null,
    party: rows[0].party || null,
    officeType: rows[0].officeType || null,
    state: rows[0].state || null,
    districtCode: rows[0].districtCode || null,
  };
}

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function isNewsIntent(question: string): boolean {
  return /(news|headline|headlines|what changed|this week|today|yesterday|press|media|story|stories|update|updates|events?|talking points?|newsletter|subject line|comms|messaging|rapid response|advice|recommendations?)/i.test(
    question || ''
  );
}

function inferResponseMode(question: string, requested?: CohortQueryPayload['responseMode']): ResponseMode {
  if (requested) return requested;
  const q = (question || '').toLowerCase();
  if (/\b(full brief|full report|comprehensive|deep dive|long-form|strategy memo)\b/.test(q)) {
    return 'full_brief';
  }
  if (/\b(what should we do|next steps|recommend|plan|tomorrow|48 hours|action)\b/.test(q)) {
    return 'decision_support';
  }
  return 'quick_update';
}

function inferComplexity(mode: ResponseMode, question: string): ComplexityLevel {
  if (mode === 'full_brief') return 'high';
  const q = (question || '').toLowerCase();
  if (/\b(compare|scenario|tradeoff|risk|opportunity|multi-step|prioritize)\b/.test(q)) {
    return 'medium';
  }
  return mode === 'decision_support' ? 'medium' : 'low';
}

function parseNewsTimeWindow(question: string): NewsTimeWindowConfig | null {
  const q = (question || '').toLowerCase();
  const customDaysMatch = q.match(/\b(last|past)\s+(\d{1,2})\s+days?\b/);
  if (customDaysMatch) {
    const days = Math.max(1, Math.min(30, Number(customDaysMatch[2])));
    return { preset: 'custom_days', days, label: `last ${days} days` };
  }
  if (/\btoday\b/.test(q)) return { preset: 'today', days: 1, label: 'today' };
  if (/\byesterday\b/.test(q)) return { preset: 'yesterday', days: 2, label: 'yesterday' };
  if (/\b(this week|this wk|past week|last week)\b/.test(q)) {
    return { preset: 'this_week', days: 7, label: 'this week' };
  }
  if (/\b(last 7 days|past 7 days)\b/.test(q)) {
    return { preset: 'last_7_days', days: 7, label: 'last 7 days' };
  }
  if (/\b(this month|last month|past month|last 30 days|past 30 days)\b/.test(q)) {
    return { preset: 'last_30_days', days: 30, label: 'last 30 days' };
  }
  return null;
}

type RouteDecision =
  | 'news_only_with_context'
  | 'general_web_only'
  | 'survey_or_analysis';

function decidePrimaryRoute(args: {
  surveyId?: number;
  webSourceEnabled: boolean;
  newsItemCount: number;
  question: string;
}): RouteDecision {
  if (!args.surveyId && args.webSourceEnabled) {
    if (args.newsItemCount > 0 && isNewsIntent(args.question)) {
      return 'news_only_with_context';
    }
    return 'general_web_only';
  }
  return 'survey_or_analysis';
}

function logRoute(traceId: string, stage: string, details: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'cohort-query',
      traceId,
      stage,
      ...details,
    })
  );
}

function buildNewsContextSummary(
  newsContext: Awaited<ReturnType<typeof getCampaignNewsContextForUser>> | null
): string {
  if (!newsContext?.items?.length) return '';
  return newsContext.items
    .slice(0, 8)
    .map((item, idx) => {
      const summary = item.summary ? ` - ${item.summary}` : '';
      return `${idx + 1}. [${item.source}] ${item.title}${summary}${item.url ? ` (${item.url})` : ''}`;
    })
    .join('\n');
}


function buildCampaignCopilotSystemPrompt(basePrompt: string | undefined, newsContext: Awaited<ReturnType<typeof getCampaignNewsContextForUser>> | null): string {
  const contract = `Campaign Copilot behavior:
- Adapt response length and structure to the user request; default concise.
- For follow-ups, focus on deltas/new implications and avoid repeating unchanged context.
- Keep outputs campaign-operational, candidate-specific, and grounded in evidence.
- If evidence is thin, lower confidence and explain why.`;

  const newsPacket = newsContext && newsContext.items.length > 0
    ? `Latest district/state campaign news context:
${newsContext.items.slice(0, 5).map((item, idx) =>
  `${idx + 1}. [${item.source}] ${item.title}${item.summary ? ` — ${item.summary}` : ''} (${item.publishedAt || 'time unknown'})`
).join('\n')}
`
    : 'Latest district/state campaign news context: none available.';

  const existing = (basePrompt || '').trim();
  return [existing, contract, newsPacket].filter(Boolean).join('\n\n');
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
function generateDataCards(factSheet: any, question: string, queryIntent?: any): any[] {
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

/**
 * Process multi-cohort comparative analysis results
 */
async function processMultiCohortResults(
  matchResult: any,
  matcher: any,
  surveyId: number,
  db: any,
  surveyTitle: string
) {
  const cohortResults = [];
  
  for (const cohortResult of matchResult.multiCohortResults) {
    const cohortAnalysis = {
      cohortInfo: cohortResult.cohortInfo,
      results: []
    };
    
    // Process each question for this cohort
    for (const match of cohortResult.matches) {
      console.log(`📊 [${cohortResult.cohortInfo.name}] Querying: ${match.question.prompt}`);
      
      // Build the correct demographic filter for this cohort
      const cohortDemographicFilter = {
        field: cohortResult.cohortInfo.field,
        value: Array.isArray(cohortResult.cohortInfo.value) 
          ? cohortResult.cohortInfo.value[0] 
          : cohortResult.cohortInfo.value,
        questionId: cohortResult.cohortInfo.field.startsWith('question_') 
          ? parseInt(cohortResult.cohortInfo.field.replace('question_', ''))
          : null
      };
      
      const data = await matcher.generateTargetedQueryWithFilter(
        match.question.id,
        surveyId,
        db,
        cohortDemographicFilter
      );
      
      if (data && data.length > 0) {
        cohortAnalysis.results.push({
          title: match.question.prompt,
          description: `Response distribution for ${cohortResult.cohortInfo.name}`,
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
      }
    }
    
    cohortResults.push(cohortAnalysis);
    console.log(`✅ [${cohortResult.cohortInfo.name}] Generated ${cohortAnalysis.results.length} analyses`);
  }
  
  // Generate a formatted content string for frontend display
  let content = `# 📊 Multi-Cohort Comparative Analysis\n\n`;
  content += `**Survey:** ${surveyTitle}\n`;
  content += `**Total Cohorts:** ${cohortResults.length}\n`;
  content += `**Questions Analyzed:** ${matchResult.matches.length}\n\n`;

  // Add comparative analysis for each question
  for (let questionIndex = 0; questionIndex < matchResult.matches.length; questionIndex++) {
    const question = matchResult.matches[questionIndex];
    content += `## ${question.question.prompt}\n\n`;
    
    // Show results for each cohort side by side
    for (const cohort of cohortResults) {
      if (cohort.results[questionIndex]) {
        const result = cohort.results[questionIndex];
        content += `### ${cohort.cohortInfo.name} (${result.totalResponses} respondents)\n\n`;
        
        for (const dataPoint of result.data.slice(0, 3)) { // Show top 3 responses
          content += `- **${dataPoint.answer_value}**: ${dataPoint.percentage}% (${dataPoint.count} responses)\n`;
        }
        content += `\n`;
      }
    }
    
    // Add key differences analysis
    if (cohortResults.length === 2 && cohortResults[0].results[questionIndex] && cohortResults[1].results[questionIndex]) {
      const cohort1 = cohortResults[0].results[questionIndex];
      const cohort2 = cohortResults[1].results[questionIndex];
      
      content += `### 🔍 Key Differences\n\n`;
      
      if (cohort1.data[0] && cohort2.data[0]) {
        const diff = parseFloat(cohort1.data[0].percentage) - parseFloat(cohort2.data[0].percentage);
        const cohortName1 = cohortResults[0].cohortInfo.name;
        const cohortName2 = cohortResults[1].cohortInfo.name;
        
        if (Math.abs(diff) > 5) { // Only show if significant difference
          content += `**${cohort1.data[0].answer_value}**: ${cohortName1} shows ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'higher' : 'lower'} rate than ${cohortName2} (${cohort1.data[0].percentage}% vs ${cohort2.data[0].percentage}%)\n\n`;
        }
      }
    }
    
    content += `---\n\n`;
  }

  return {
    status: true,
    content: content, // Frontend expects this field
    multiCohort: true,
    cohorts: cohortResults,
    survey: {
      id: surveyId,
      title: surveyTitle,
      total_cohorts: cohortResults.length,
      questions_analyzed: matchResult.matches.length
    },
    methodology: 'multi_cohort_comparative_analysis'
  };
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-chat-trace-id') || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  try {
    logRoute(traceId, 'start', { method: 'POST' });
    
    // Authenticate request via NextAuth session (safer than trusting header)
    const session = await auth();
    if (!session?.user?.id) {
      logRoute(traceId, 'auth_failed', {});
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const numericUserId = Number.isFinite(Number(userId)) ? Number(userId) : null;

    const body = (await req.json()) as CohortQueryPayload;
    const { cohort, question, recentMessages, topK = 1000, surveyId: initialSurveyId, model = 'gpt-4o', temperature = 0.0, sources, systemPrompt, stream = true, responseMode: requestedResponseMode } = body;
    let surveyId = initialSurveyId; // Allow reassignment for auto-selection
    const featureFlags = {
      adaptiveModes: envFlag('NEWS_ADAPTIVE_MODES', true),
      memoryRetrieval: envFlag('NEWS_MEMORY_RETRIEVAL', true),
      criticPass: envFlag('NEWS_CRITIC_PASS', true),
      surveyTools: envFlag('CHAT_SURVEY_TOOLS_ENABLED', false),
      surveyCreate: envFlag('CHAT_SURVEY_CREATE_ENABLED', false),
      agentsPlanner: envFlag('AGENTS_PLANNER_ENABLED', false),
      agentsNews: envFlag('AGENTS_NEWS_ENABLED', false),
      agentsCampaignManager: envFlag('AGENTS_CAMPAIGN_MANAGER_ENABLED', false),
      agentsSituationDocs: envFlag('AGENTS_SITUATION_DOCS_ENABLED', false),
      agentsDebugMetadata: envFlag('AGENTS_DEBUG_METADATA', false),
    };
    
    console.log('🔍 DEBUGGING: Request body stream value:', body.stream);
    console.log('🎯 DEBUGGING: surveyId received from frontend:', surveyId);
    console.log('🎯 DEBUGGING: question received:', question);
    console.log('🔍 DEBUGGING: Resolved stream value:', stream);
    console.log('🔍 DEBUGGING: Model being used:', model);
    
    console.log(`📝 Question: "${question}"`);
    console.log(`📊 Survey ID: ${surveyId}`);

    if (!question || question.trim() === "") {
      logRoute(traceId, 'validation_failed', { reason: 'empty_question' });
      return NextResponse.json({ status: false, message: "Question is required" }, { status: 400 });
    }

    // Survey tool action branch (read/list/get + create draft).
    if (featureFlags.surveyTools && numericUserId) {
      const toolIntent = detectSurveyToolIntent(question);
      if (toolIntent.kind === 'ambiguous') {
        logRoute(traceId, 'tool_intent_ambiguous', {});
        return NextResponse.json({
          status: true,
          content: toolIntent.clarification,
          tool: null,
        });
      }
      if (toolIntent.kind === 'tool') {
        logRoute(traceId, 'tool_intent_detected', {
          tool: toolIntent.tool,
          confidence: toolIntent.confidence,
        });
        const toolResult = await executeSurveyTool({
          tool: toolIntent.tool,
          rawArgs: toolIntent.rawArgs,
          userId: numericUserId,
          allowCreate: featureFlags.surveyCreate,
        });
        if (!toolResult.ok) {
          logRoute(traceId, 'tool_failed', {
            tool: toolResult.tool,
            errorCode: toolResult.errorCode,
            missingFields: toolResult.missingFields || [],
          });
        } else {
          logRoute(traceId, 'tool_executed', {
            tool: toolResult.tool,
            keys: Object.keys(toolResult.data || {}),
          });
        }
        logRoute(traceId, 'tool_result_returned', {
          tool: toolResult.tool,
          ok: toolResult.ok,
        });
        return NextResponse.json({
          status: true,
          content: toolResult.summaryMarkdown,
          tool: toolResult.tool,
          toolResult,
        });
      }
    }

    // Default web/news context to ON for campaign copilot unless explicitly disabled.
    const webSourceEnabled = sources?.web !== false;
    const responseMode = featureFlags.adaptiveModes
      ? inferResponseMode(question, requestedResponseMode)
      : 'full_brief';
    const complexity = inferComplexity(responseMode, question);
    const requestedNewsTimeWindow = isNewsIntent(question) ? parseNewsTimeWindow(question) : null;
    let liveRefreshSummary: {
      fetched: number;
      inserted: number;
      deduped: number;
      query: string;
    } | null = null;
    if (webSourceEnabled && isNewsIntent(question)) {
      try {
        liveRefreshSummary = await refreshCampaignNewsForUserScope(userId, question, { maxResults: 12 });
        logRoute(traceId, 'news_live_refresh', liveRefreshSummary);
      } catch (error) {
        logRoute(traceId, 'news_live_refresh_failed', {
          message: error instanceof Error ? error.message : 'Unknown live refresh error',
        });
      }
    }
    const newsContext = webSourceEnabled
      ? await getCampaignNewsContextForUser(userId, {
          limit: 8,
          minItems: 3,
          timeWindow: requestedNewsTimeWindow,
        })
      : null;
    const campaignIdentity = webSourceEnabled ? await getCampaignIdentityForUser(userId) : null;
    let memoryContext = '';
    if (featureFlags.memoryRetrieval && campaignIdentity) {
      try {
        const namespace = buildCampaignMemoryNamespace(campaignIdentity.orgId, numericUserId);
        const recalled = await CampaignMemoryService.retrieveRelevantMemories({
          traceId,
          query: question,
          namespace,
          topK: 6,
          orgId: campaignIdentity.orgId,
          userId: numericUserId,
        });
        if (recalled.length > 0) {
          memoryContext = recalled
            .slice(0, 5)
            .map((m, idx) => `${idx + 1}. (${m.memoryType}) ${m.content}`)
            .join('\n');
        }
      } catch (error) {
        logRoute(traceId, 'memory_retrieval_failed', {
          message: error instanceof Error ? error.message : 'Unknown memory retrieval error',
        });
      }
    }
    const effectiveSystemPrompt = webSourceEnabled
      ? [
          buildCampaignCopilotSystemPrompt(systemPrompt, newsContext),
          memoryContext ? `Relevant campaign memory:\n${memoryContext}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : systemPrompt;
    const evalMetrics = {
      repetitionScore: computeRepetitionScore(question, recentMessages || []),
      continuityScore: computeContinuityScore(question, recentMessages || []),
      freshnessScore: computeFreshnessScore(newsContext?.items || []),
    };
    logRoute(traceId, 'request_parsed', {
      userId,
      surveyId: surveyId || null,
      stream,
      model,
      responseMode,
      complexity,
      webSourceEnabled,
      requestedNewsWindow: requestedNewsTimeWindow?.label || null,
      appliedNewsWindow: newsContext?.retrieval?.appliedWindowLabel || null,
      newsWindowWidened: newsContext?.retrieval?.widened || false,
      newsItems: newsContext?.items?.length || 0,
      liveRefresh: liveRefreshSummary,
      evalMetrics,
      featureFlags,
      rolloutStage: getRolloutStage(),
      agentRolloutStage: getAgentRolloutStage(),
    });
    const guardrail = shouldTriggerRollback({
      repetitionScore: evalMetrics.repetitionScore,
      freshnessScore: evalMetrics.freshnessScore,
      latencyMs: Date.now() - startedAt,
    });
    if (evalMetrics.repetitionScore > 0.85 || evalMetrics.freshnessScore < 0.25) {
      logRoute(traceId, 'eval_alert', evalMetrics);
    }
    if (guardrail.rollback) {
      logRoute(traceId, 'rollout_guardrail_triggered', { reasons: guardrail.reasons });
    }

    const primaryRoute = decidePrimaryRoute({
      surveyId,
      webSourceEnabled,
      newsItemCount: newsContext?.items?.length || 0,
      question,
    });
    logRoute(traceId, 'route_decision', { primaryRoute });

    const multiAgentEligible =
      featureFlags.agentsPlanner &&
      featureFlags.agentsSituationDocs &&
      featureFlags.agentsNews &&
      featureFlags.agentsCampaignManager &&
      Boolean(campaignIdentity?.orgId);

    if (multiAgentEligible && campaignIdentity?.orgId) {
      try {
        logRoute(traceId, 'planner_started', {
          orgId: campaignIdentity.orgId,
        });
        const orchestration = await orchestrateWithPlanner({
          traceId,
          orgId: campaignIdentity.orgId,
          userId,
          question,
          model,
          recentMessages: recentMessages || [],
          memoryContext,
          newsContextSummary: buildNewsContextSummary(newsContext),
        });
        if (orchestration) {
          logRoute(traceId, 'planner_route_decision', {
            reason: orchestration.decision.reason,
            selectedAgents: orchestration.decision.selectedAgents,
          });
          for (const agentId of orchestration.decision.selectedAgents) {
            logRoute(traceId, 'agent_task_started', { agentId });
          }
          for (const result of orchestration.results) {
            logRoute(traceId, 'agent_task_completed', {
              agentId: result.agentId,
              confidence: result.confidence,
              evidenceCount: result.evidenceRefs.length,
            });
          }
          for (const version of orchestration.situationVersions) {
            logRoute(traceId, 'situation_doc_committed', version);
          }
          logRoute(traceId, 'planner_finalized', {
            usedAgents: orchestration.usedAgents,
          });
          const agentGuardrail = shouldTriggerAgentRollback({
            plannerErrorRate: 0,
            docWriteFailureRate: 0,
            p95LatencyMs: Date.now() - startedAt,
          });
          if (agentGuardrail.rollback) {
            logRoute(traceId, 'agent_rollout_guardrail_triggered', { reasons: agentGuardrail.reasons });
          }
          return NextResponse.json({
            status: true,
            content: orchestration.finalAnswer,
            metadata: featureFlags.agentsDebugMetadata
              ? {
                  activeAgents: orchestration.usedAgents,
                  situationVersions: orchestration.situationVersions,
                }
              : undefined,
          });
        }
        logRoute(traceId, 'planner_route_decision', {
          reason: 'fallback_to_existing_paths',
        });
      } catch (error) {
        const agentGuardrail = shouldTriggerAgentRollback({
          plannerErrorRate: 1,
          docWriteFailureRate: 0,
          p95LatencyMs: Date.now() - startedAt,
        });
        if (agentGuardrail.rollback) {
          logRoute(traceId, 'agent_rollout_guardrail_triggered', { reasons: agentGuardrail.reasons });
        }
        logRoute(traceId, 'planner_failed_fallback', {
          message: error instanceof Error ? error.message : 'Unknown planner error',
        });
      }
    }

    if (primaryRoute === 'news_only_with_context') {
      logRoute(traceId, 'route_news_only', { reason: 'no_survey_with_news_context' });
      return respondFromCampaignNewsOnly({
        question,
        stream,
        newsContext,
        campaignIdentity,
        model,
        recentMessages,
        responseMode,
        complexity,
        memoryContext,
        userId: numericUserId || undefined,
        featureFlags,
      });
    }
    if (primaryRoute === 'general_web_only') {
      logRoute(traceId, 'route_general_web', {
        newsItems: newsContext?.items?.length || 0,
        hasCampaignIdentity: Boolean(campaignIdentity),
      });
      return respondFromGeneralWebOnly({
        question,
        stream,
        campaignIdentity,
        model,
        recentMessages,
        memoryContext,
        systemPrompt: effectiveSystemPrompt,
        newsContextSummary: buildNewsContextSummary(newsContext),
        requestedNewsTimeWindow: requestedNewsTimeWindow?.label || null,
      });
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
          `SELECT id, title, source FROM surveys WHERE id = ?`,
          [surveyId]
        ) as any[];

        if (surveyCheck && surveyCheck.length > 0) {
          // 🧠 INTELLIGENT ROUTER: Decide which system to use
          console.log('🧠 ANALYZING QUERY INTENT...');
          const { IntelligentRouter } = await import('../../../utils/survey/intelligent-router');
          const router = new IntelligentRouter();
          const intent = router.analyzeIntent(question);
          console.log(`🎯 Intent: ${intent.primaryAction} → ${intent.outputType} (${intent.complexity}) [${Math.round(intent.confidence * 100)}%]`);
          
          // 🚀 For COMPLEX/ANALYZE queries, try EnhancedSurveyQueryBuilder first
          if (intent.complexity === 'COMPLEX' || intent.primaryAction === 'ANALYZE') {
            console.log(`🚀 ROUTING TO ENHANCED SYSTEM for correlation/complex analysis`);
            try {
              const { EnhancedSurveyQueryBuilder } = await import('../../../utils/survey/enhanced-query-builder');
              const enhancedBuilder = new EnhancedSurveyQueryBuilder();
              const enhancedResult = await enhancedBuilder.buildEnhancedQuery(question, filterRules, userId, surveyId, topK);
              
              if (enhancedResult.sql) {
                const [queryResults] = await db.execute(enhancedResult.sql, enhancedResult.params) as any[];
                if (queryResults && queryResults.length > 0) {
                  console.log(`🎯 ENHANCED SYSTEM SUCCESS! Found ${queryResults.length} data points`);
                  // TODO: Format enhanced results and return
                }
              }
            } catch (error) {
              console.log('❌ Enhanced system failed:', error.message);
            }
          }
          
          // 🧠 STEP 1: Classify query intent for precise question filtering
          const { QueryIntentClassifier } = await import('../../../utils/survey/query-intent-classifier');
          const intentClassifier = new QueryIntentClassifier();
          const queryIntent = intentClassifier.classifyQuery(question);
          console.log(`🎯 [INTENT] Detected: ${queryIntent.intent} (${Math.round(queryIntent.confidence * 100)}% confidence)`);
          console.log(`🎯 [INTENT] Question types needed: ${queryIntent.questionTypes?.join(', ') || 'any'}`);
          console.log(`🎯 [INTENT] Analysis type: ${queryIntent.analysisType}`);
          
          // Use the lightweight matcher (as fallback or for simple queries)
          const { LightweightQuestionMatcher } = await import('../../../utils/survey/lightweight-question-matcher');
          const matcher = new LightweightQuestionMatcher();
          
          // 🎯 ENHANCED: Pass cohort filters AND intent context to the matcher
          console.log(`🎯 [DEBUG] Passing cohort filters to LightweightQuestionMatcher:`, filterRules);
          
          // Find relevant questions with cohort context AND intent guidance
          const matchResult = await matcher.findRelevantQuestionsWithCohort(
            surveyId, 
            question, 
            db, 
            filterRules, // Pass the cohort filters here!
            3, // Max 3 most relevant questions
            queryIntent // Pass intent context for question filtering
          );
          
          console.log(`✅ ${matchResult.reasoning}`);
          
          // 🚀 NEW: Handle multi-cohort comparative analysis  
          if (matchResult.multiCohortResults && matchResult.multiCohortResults.length > 1) {
            console.log(`🎯 [MULTI-COHORT API] Processing ${matchResult.multiCohortResults.length} cohorts for comparison`);
            
            // Instead of separate processing, run normal analysis for each cohort and combine
            const cohortAnalyses = [];
            
            for (const cohortResult of matchResult.multiCohortResults) {
              console.log(`🔍 [MULTI-COHORT] Running normal analysis for: ${cohortResult.cohortInfo.name}`);
              
              // Create a single-cohort filter for this cohort
              const singleCohortFilter = [cohortResult.cohortInfo.filter];
              
              // Run the normal analysis pipeline with this cohort filter
              const cohortMatchResult = await matcher.findRelevantQuestionsWithCohort(
                surveyId,
                question,
                db,
                singleCohortFilter,
                3
              );
              
              // Continue with normal processing for this cohort
          const executedResults = [];
              for (const match of cohortMatchResult.matches) {
                const data = await matcher.generateTargetedQueryWithFilter(
                  match.question.id,
                  surveyId,
                  db,
                  cohortMatchResult.demographicFilter
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
                }
              }
              
              cohortAnalyses.push({
                cohortInfo: cohortResult.cohortInfo,
                results: executedResults
              });
            }
            
            // Create a combined fact sheet for multi-cohort analysis
            const totalRespondents = cohortAnalyses.reduce((sum, cohort) => {
              return sum + (cohort.results[0]?.totalResponses || 0);
            }, 0);
            
            const factSheet = {
              survey_meta: {
                id: surveyId,
                title: `${surveyCheck[0].title} - Multi-Cohort Comparison`,
                total_respondents: totalRespondents,
                description: `Comparative analysis across ${cohortAnalyses.length} cohorts`
              },
              data_cards: cohortAnalyses.flatMap(cohort => 
                cohort.results.map(result => ({
                  ...result,
                  title: `${cohort.cohortInfo.name}: ${result.title}`
                }))
              )
            };
            
            // Run AI analysis on the combined results (same as normal flow)
            const aiAnalysis = await generateAIAnalysis(
              { results: factSheet.data_cards },
              question,
              factSheet.survey_meta
            );
            
            // Format response content like normal flow
            let responseContent = `# Survey Analysis: ${factSheet.survey_meta.title}\n\n`;
            responseContent += `## 🧠 Multi-Cohort Comparative Analysis\n\n${aiAnalysis}\n\n---\n\n`;
            responseContent += `📊 **Interactive charts are displayed below**\n\n`;
            responseContent += `## 📈 Detailed Results\n\n`;
            responseContent += `Comparative analysis across ${cohortAnalyses.length} cohorts:\n\n`;
            
            // Add each cohort's results
            cohortAnalyses.forEach((cohort, cohortIndex) => {
              responseContent += `### ${cohort.cohortInfo.name}\n\n`;
              cohort.results.forEach((result, index) => {
                responseContent += `#### ${result.title}\n\n`;
                responseContent += `**Total Responses:** ${result.totalResponses.toLocaleString()}\n\n`;
                
                if (result.data && result.data.length > 0) {
                  responseContent += `**Distribution:**\n`;
                  result.data.forEach(row => {
                    responseContent += `- **${row.answer_value}**: ${row.percentage}% (${row.count.toLocaleString()} responses)\n`;
                  });
                  responseContent += `\n`;
                }
              });
              responseContent += `\n---\n\n`;
            });
            
            // Format dataCards for frontend charts
            const dataCards = factSheet.data_cards.map(result => {
              console.log(`📊 [DEBUG] Formatting data card for: ${result.title}`);
              console.log(`📊 [DEBUG] Raw data:`, result.data);
              
              return {
                title: result.title,
                chart_type: 'horizontal_bar',
                data: (result.data || []).map(item => ({
                  label: item.answer_value,
                  value: parseFloat(item.percentage)
                }))
              };
            });
            
            console.log(`📊 [DEBUG] Generated ${dataCards.length} data cards for multi-cohort frontend`);
            
            return NextResponse.json({
              status: true,
              content: responseContent,
              dataCards: dataCards,
              factSheet: factSheet
            });
          }
          
          // Standard single-cohort processing
          const executedResults = [];
          const noDataQuestions = [];
          
          for (const match of matchResult.matches) {
            console.log(`📊 Querying: ${match.question.prompt} (score: ${match.relevanceScore})`);
            
            // Get question type from database to preserve for routing
            const [questionInfo] = await db.execute(`
              SELECT type FROM survey_questions WHERE id = ?
            `, [match.question.id]) as any[];
            
            const questionType = questionInfo[0]?.type || 'text';
            console.log(`📊 Question ${match.question.id} type: ${questionType}`);
            
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
                questionType: questionType, // Store the actual question type
                relevanceScore: match.relevanceScore
              });
            } else {
              noDataQuestions.push({
                question: match.question.prompt,
                questionId: match.question.id,
                questionType: questionType
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
                 (matchResult.demographicFilter ? ` with demographic filtering` : ''),
               source: surveyCheck[0].source || 'native'
             },
             question_stats: {},
             analysis_results: analysisResults,
             data_source: 'lightweight_targeted_queries'
           };

           console.log(`✅ LIGHTWEIGHT SUCCESS: ${executedResults.length} targeted queries executed`);
           
           // 🎯 Convert executedResults to rows format for analysis engines
           const rows = [];
           for (const result of executedResults) {
            if (result.data && result.data.length > 0) {
               for (const dataPoint of result.data) {
                 rows.push({
                   answer_value: dataPoint.answer_value,
                   question_text: result.title,
                   question_type: result.questionType, // Use actual question type from database
                   question_id: result.questionId, // Add question identifier for router mapping
                   survey_title: surveyCheck[0].title,
                   count: dataPoint.count,
                   percentage: dataPoint.percentage
                 });
               }
             }
           }
           
           console.log(`🔄 Converted ${executedResults.length} results to ${rows.length} text responses for analysis`);
           
          // 🎯 SUCCESS! Use LightweightQuestionMatcher results - route to analysis engines
           console.log('🚀 Using LightweightQuestionMatcher results - routing to analysis engines');

          // If this is a news-style question and survey rows are empty, answer from campaign news context.
          if (
            rows.length === 0 &&
            webSourceEnabled &&
            newsContext &&
            newsContext.items.length > 0 &&
            isNewsIntent(question)
          ) {
            console.log('📰 Using campaign-news-only fallback (lightweight path)');
            return respondFromCampaignNewsOnly({
              question,
              stream,
              newsContext,
              campaignIdentity,
              model,
              recentMessages,
              responseMode,
              complexity,
              memoryContext,
              userId: numericUserId || undefined,
              featureFlags,
            });
          }
           
           // Use the clean analysis router
           const { routeToAnalysisEngine } = await import('./analysis-router');
           return routeToAnalysisEngine({
             factSheet,
             rows,
             question,
             queryIntent,
             surveyId,
             stream,
             model,
             temperature,
              systemPrompt: effectiveSystemPrompt
           });
        } else {
          console.warn(`❌ Survey ${surveyId} not found`);
        }
      } catch (error) {
        console.warn('Could not generate lightweight analysis:', error.message);
      }
    }
    
    // 🎯 FALLBACK: If no survey provided or lightweight analysis failed, use traditional query builder
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

    // 🎯 CLEAN ROUTING: Use the analysis router to decide between engines
    console.log('🚀 [MAIN-ROUTE] Routing to analysis engines...');
    
    // 🎯 FIX: Add question type detection for fallback path
    if (rows && rows.length > 0) {
      console.log(`🔍 [FALLBACK] Processing ${rows.length} rows from fallback query`);
      
      // Get question types for the rows we have
      const questionIds = [...new Set(rows.map((r: any) => r.question_id).filter(Boolean))];
      if (questionIds.length > 0) {
        const [questionTypes] = await db.execute(`
          SELECT id, type FROM survey_questions WHERE id IN (${questionIds.map(() => '?').join(',')})
        `, questionIds) as any[];
        
        const questionTypeMap = new Map(questionTypes.map((q: any) => [q.id, q.type]));
        
        // Add question types to rows
        rows.forEach((row: any) => {
          if (row.question_id) {
            row.question_type = questionTypeMap.get(row.question_id) || 'text';
      } else {
            row.question_type = 'text'; // Default fallback
          }
        });
        
        console.log(`🔍 [FALLBACK] Added question types:`, questionTypeMap);
      }
    }
    
    if (
      (!rows || rows.length === 0) &&
      webSourceEnabled &&
      newsContext &&
      newsContext.items.length > 0 &&
      isNewsIntent(question)
    ) {
      console.log('📰 Using campaign-news-only fallback (fallback path)');
      return respondFromCampaignNewsOnly({
        question,
        stream,
        newsContext,
        campaignIdentity,
        model,
        recentMessages,
        responseMode,
        complexity,
        memoryContext,
        userId: numericUserId || undefined,
        featureFlags,
      });
    }

    const { routeToAnalysisEngine } = await import('./analysis-router');
    return routeToAnalysisEngine({
      factSheet,
      rows,
      question,
      queryIntent,
      surveyId,
      stream,
      model,
      temperature,
      systemPrompt: effectiveSystemPrompt
    });
  } catch (error) {
    logRoute(traceId, 'unhandled_error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    console.error("Error in cohort query:", error);
    return NextResponse.json({ status: false, message: "Internal error" }, { status: 500 });
  }
} 