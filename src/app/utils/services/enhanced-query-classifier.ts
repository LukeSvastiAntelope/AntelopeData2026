import { QueryIntentClassifier, QueryIntent } from '../survey/query-intent-classifier';

export interface ReportWorthinessAnalysis {
  isReportWorthy: boolean;
  reportType: 'demographic' | 'thematic' | 'comparative' | 'longitudinal' | 'comprehensive';
  estimatedComplexity: number;
  tokenBudget: number;
  reasoning: string;
  immediateResponse?: string;
}

export class EnhancedQueryClassifier extends QueryIntentClassifier {
  
  /**
   * Determines if a query warrants comprehensive report generation
   */
  classifyReportWorthiness(query: string): ReportWorthinessAnalysis {
    // Step 1: Analyze the semantic components of the query
    const semanticAnalysis = this.analyzeQuerySemantics(query);
    
    // Step 2: Determine report type based on semantic understanding
    const reportType = this.inferReportType(semanticAnalysis);
    
    // Step 3: Calculate complexity based on what's being asked
    const complexityScore = this.calculateSemanticComplexity(semanticAnalysis);
    
    // Step 4: Determine if this requires deep analysis
    const isReportWorthy = this.requiresDeepAnalysis(semanticAnalysis, complexityScore);
    
    // Step 5: Estimate token budget based on scope
    const tokenBudget = this.estimateTokenBudgetFromScope(semanticAnalysis, isReportWorthy);
    
    // Step 6: Generate intelligent reasoning
    const reasoning = this.generateSemanticReasoning(semanticAnalysis, isReportWorthy, complexityScore);
    
    // Generate immediate response for report-worthy queries
    const immediateResponse = isReportWorthy ? 
      this.generateImmediateResponse(reportType, tokenBudget) : 
      undefined;
    
    return {
      isReportWorthy,
      reportType,
      estimatedComplexity: complexityScore,
      tokenBudget,
      reasoning,
      immediateResponse
    };
  }
  
  private analyzeQuerySemantics(query: string): any {
    const queryLower = query.toLowerCase();
    
    // Extract action intent (what the user wants us to do)
    const actionVerbs = {
      generative: ['create', 'generate', 'produce', 'write', 'compile', 'prepare', 'develop'],
      analytical: ['analyze', 'examine', 'investigate', 'explore', 'study', 'assess'],
      extractive: ['find', 'identify', 'extract', 'list', 'show', 'display'],
      explanatory: ['explain', 'describe', 'clarify', 'elaborate', 'interpret'],
      comparative: ['compare', 'contrast', 'differentiate', 'relate'],
      evaluative: ['evaluate', 'judge', 'rate', 'rank', 'prioritize']
    };
    
    let primaryAction = 'extractive';
    let actionIntensity = 0;
    
    for (const [actionType, verbs] of Object.entries(actionVerbs)) {
      const matches = verbs.filter(verb => queryLower.includes(verb)).length;
      if (matches > actionIntensity) {
        primaryAction = actionType;
        actionIntensity = matches;
      }
    }
    
    // Identify the desired output format
    const outputFormats = {
      document: ['report', 'analysis', 'summary', 'overview', 'review', 'assessment', 'study'],
      data: ['statistics', 'numbers', 'percentages', 'metrics', 'data', 'figures'],
      insights: ['insights', 'findings', 'takeaways', 'conclusions', 'recommendations', 'learnings'],
      answer: ['answer', 'response', 'information', 'details']
    };
    
    let desiredFormat = 'answer';
    for (const [format, keywords] of Object.entries(outputFormats)) {
      if (keywords.some(kw => queryLower.includes(kw))) {
        desiredFormat = format;
        break;
      }
    }
    
    // Analyze scope indicators
    const scopeIndicators = {
      comprehensive: ['all', 'entire', 'complete', 'full', 'comprehensive', 'overall', 'general', 'whole'],
      focused: ['specific', 'particular', 'certain', 'single', 'one'],
      multi_aspect: ['various', 'multiple', 'different', 'several', 'diverse'],
      main_points: ['main', 'key', 'important', 'primary', 'major', 'top', 'significant']
    };
    
    let scope = 'focused';
    let scopeScore = 0;
    
    for (const [scopeType, indicators] of Object.entries(scopeIndicators)) {
      const matches = indicators.filter(ind => queryLower.includes(ind)).length;
      if (matches > scopeScore) {
        scope = scopeType;
        scopeScore = matches;
      }
    }
    
    // Detect synthesis requirements
    const synthesisIndicators = [
      'summarize', 'synthesize', 'takeaways', 'take a ways', 'conclusions',
      'what does this mean', 'interpret', 'implications', 'significance'
    ];
    
    const requiresSynthesis = synthesisIndicators.some(ind => queryLower.includes(ind));
    
    // Analyze depth indicators
    const depthIndicators = {
      surface: ['quick', 'brief', 'simple', 'basic', 'short'],
      moderate: ['explain', 'describe', 'show', 'tell'],
      deep: ['detailed', 'thorough', 'in-depth', 'comprehensive', 'extensive', 'deep']
    };
    
    let analysisDepth = 'moderate';
    for (const [depth, indicators] of Object.entries(depthIndicators)) {
      if (indicators.some(ind => queryLower.includes(ind))) {
        analysisDepth = depth;
        break;
      }
    }
    
    // Check for multi-dimensional analysis needs
    const dimensions = {
      demographic: queryLower.includes('demographic') || queryLower.includes('who'),
      temporal: queryLower.includes('when') || queryLower.includes('time') || queryLower.includes('trend'),
      thematic: queryLower.includes('what') || queryLower.includes('theme') || queryLower.includes('topic'),
      comparative: queryLower.includes('compare') || queryLower.includes('difference'),
      causal: queryLower.includes('why') || queryLower.includes('because') || queryLower.includes('reason')
    };
    
    const activeDimensions = Object.values(dimensions).filter(d => d).length;
    
    return {
      query,
      primaryAction,
      actionIntensity,
      desiredFormat,
      scope,
      scopeScore,
      requiresSynthesis,
      analysisDepth,
      dimensions,
      activeDimensions,
      // Special case: asking for a "report" is inherently a document generation task
      isExplicitDocumentRequest: desiredFormat === 'document',
      // Special case: asking for "takeaways" or "findings" requires synthesis
      isInsightRequest: desiredFormat === 'insights' || requiresSynthesis
    };
  }
  
  private inferReportType(analysis: any): ReportWorthinessAnalysis['reportType'] {
    const { dimensions, scope, primaryAction, desiredFormat } = analysis;
    
    // If multiple dimensions are active, it's likely comprehensive
    if (analysis.activeDimensions >= 3) {
      return 'comprehensive';
    }
    
    // Check specific dimension combinations
    if (dimensions.temporal && (dimensions.comparative || primaryAction === 'comparative')) {
      return 'longitudinal';
    }
    
    if (dimensions.comparative || primaryAction === 'comparative') {
      return 'comparative';
    }
    
    if (dimensions.demographic && analysis.activeDimensions === 1) {
      return 'demographic';
    }
    
    if (dimensions.thematic || (desiredFormat === 'insights' && analysis.requiresSynthesis)) {
      return 'thematic';
    }
    
    // Default to comprehensive for general reports or broad scope
    if (scope === 'comprehensive' || scope === 'main_points' || desiredFormat === 'document') {
      return 'comprehensive';
    }
    
    return 'thematic'; // Default for focused analysis
  }
  
  private calculateSemanticComplexity(analysis: any): number {
    let complexity = 0;
    
    // Action type contributes to complexity
    const actionComplexity = {
      extractive: 0.1,
      explanatory: 0.2,
      analytical: 0.4,
      comparative: 0.5,
      evaluative: 0.6,
      generative: 0.7
    };
    complexity += actionComplexity[analysis.primaryAction as keyof typeof actionComplexity] || 0.2;
    
    // Scope adds to complexity
    const scopeComplexity = {
      focused: 0.1,
      multi_aspect: 0.3,
      main_points: 0.4,
      comprehensive: 0.5
    };
    complexity += scopeComplexity[analysis.scope as keyof typeof scopeComplexity] || 0.1;
    
    // Multi-dimensional analysis is complex
    complexity += Math.min(0.3, analysis.activeDimensions * 0.1);
    
    // Synthesis requirements add complexity
    if (analysis.requiresSynthesis) complexity += 0.2;
    if (analysis.isInsightRequest) complexity += 0.1;
    
    // Depth of analysis
    const depthComplexity = {
      surface: 0,
      moderate: 0.1,
      deep: 0.3
    };
    complexity += depthComplexity[analysis.analysisDepth as keyof typeof depthComplexity] || 0.1;
    
    // Document generation is inherently complex
    if (analysis.isExplicitDocumentRequest) complexity += 0.2;
    
    return Math.min(1.0, complexity);
  }
  
  private requiresDeepAnalysis(analysis: any, complexityScore: number): boolean {
    // Quick heuristic: simple extractive queries (e.g. "top 5 ...", "list ...") generally don't
    // need a full report. If the query is purely extractive, focuses on a single dimension, and
    // doesn't require synthesis or explicitly ask for a document, treat it as a simple query.
    if (analysis.primaryAction === 'extractive' &&
        analysis.activeDimensions <= 1 &&
        !analysis.requiresSynthesis &&
        !analysis.isExplicitDocumentRequest) {
      return false;
    }
    
    // Explicit document requests always require deep analysis
    if (analysis.isExplicitDocumentRequest) {
      return true;
    }
    
    // Insight requests with synthesis requirements need deep analysis
    if (analysis.isInsightRequest && analysis.requiresSynthesis) {
      return true;
    }
    
    // Generative or evaluative actions with broad scope
    if ((analysis.primaryAction === 'generative' || analysis.primaryAction === 'evaluative') && 
        (analysis.scope === 'comprehensive' || analysis.scope === 'main_points')) {
      return true;
    }
    
    // Multi-dimensional analysis
    if (analysis.activeDimensions >= 2 && analysis.scope !== 'focused') {
      return true;
    }
    
    // High complexity score
    if (complexityScore > 0.6) {
      return true;
    }
    
    // Comprehensive scope with any synthesis requirement
    if (analysis.scope === 'comprehensive' && 
        (analysis.requiresSynthesis || analysis.analysisDepth === 'deep')) {
      return true;
    }
    
    return false;
  }
  
  private estimateTokenBudgetFromScope(analysis: any, isReportWorthy: boolean): number {
    let baseBudget = 1000;
    
    // Scope-based budget
    const scopeBudgets = {
      focused: 1000,
      multi_aspect: 2500,
      main_points: 3000,
      comprehensive: 5000
    };
    baseBudget = scopeBudgets[analysis.scope as keyof typeof scopeBudgets] || 2000;
    
    // Add budget for multi-dimensional analysis
    baseBudget += analysis.activeDimensions * 500;
    
    // Document generation needs more tokens
    if (analysis.isExplicitDocumentRequest) {
      baseBudget *= 1.5;
    }
    
    // Synthesis and insights need additional tokens
    if (analysis.requiresSynthesis) {
      baseBudget += 1000;
    }
    
    // Deep analysis needs more tokens
    if (analysis.analysisDepth === 'deep') {
      baseBudget *= 1.3;
    }
    
    // Report-worthy queries get a minimum budget
    if (isReportWorthy) {
      baseBudget = Math.max(baseBudget, 4000);
    }
    
    return Math.min(15000, Math.round(baseBudget));
  }
  
  private generateSemanticReasoning(analysis: any, isReportWorthy: boolean, complexityScore: number): string {
    const reasons = [];
    
    // Explain the primary action understanding
    const actionDescriptions = {
      generative: "creating new content",
      analytical: "deep analysis",
      extractive: "data extraction",
      explanatory: "detailed explanation",
      comparative: "comparison analysis",
      evaluative: "evaluation and assessment"
    };
    
    if (analysis.primaryAction !== 'extractive') {
      reasons.push(`Request involves ${actionDescriptions[analysis.primaryAction as keyof typeof actionDescriptions] || analysis.primaryAction}`);
    }
    
    // Explain format requirements
    if (analysis.isExplicitDocumentRequest) {
      reasons.push("Explicit request for document generation (report/analysis)");
    } else if (analysis.desiredFormat === 'insights') {
      reasons.push("Request for synthesized insights and takeaways");
    }
    
    // Explain scope
    const scopeDescriptions = {
      comprehensive: "comprehensive coverage of all aspects",
      main_points: "synthesis of main points and key findings",
      multi_aspect: "analysis across multiple dimensions",
      focused: "focused analysis on specific aspects"
    };
    
    if (analysis.scope !== 'focused') {
      reasons.push(`Requires ${scopeDescriptions[analysis.scope as keyof typeof scopeDescriptions]}`);
    }
    
    // Explain multi-dimensional needs
    if (analysis.activeDimensions > 1) {
      const activeDims = [];
      if (analysis.dimensions.demographic) activeDims.push("demographic");
      if (analysis.dimensions.temporal) activeDims.push("temporal");
      if (analysis.dimensions.thematic) activeDims.push("thematic");
      if (analysis.dimensions.comparative) activeDims.push("comparative");
      if (analysis.dimensions.causal) activeDims.push("causal");
      reasons.push(`Multi-dimensional analysis needed: ${activeDims.join(", ")}`);
    }
    
    // Explain synthesis requirements
    if (analysis.requiresSynthesis) {
      reasons.push("Requires synthesis and interpretation of data");
    }
    
    // Final reasoning
    if (isReportWorthy) {
      return `Deep analysis required: ${reasons.join("; ")}. Complexity: ${Math.round(complexityScore * 100)}%`;
    } else {
      return reasons.length > 0 
        ? `Query can be answered directly: ${reasons.join("; ")}. Complexity: ${Math.round(complexityScore * 100)}%`
        : `Simple data retrieval query. Complexity: ${Math.round(complexityScore * 100)}%`;
    }
  }
  
  private generateImmediateResponse(reportType: string, tokenBudget: number): string {
    const timeEstimate = this.estimateReportTime(tokenBudget);
    
    return `🔄 **Generating Comprehensive ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report**

I'm creating a detailed analysis for your query. This will take approximately ${timeEstimate} to complete.

**What I'm analyzing:**
${this.getReportDescription(reportType)}

**Estimated completion:** ${new Date(Date.now() + this.getTimeInMs(timeEstimate)).toLocaleTimeString()}

I'll notify you when the report is ready and provide a summary here. In the meantime, feel free to ask other questions!`;
  }
  
  private estimateReportTime(tokens: number): string {
    if (tokens < 3000) return "2-3 minutes";
    if (tokens < 6000) return "3-5 minutes";
    if (tokens < 10000) return "5-8 minutes";
    return "8-12 minutes";
  }
  
  private getTimeInMs(timeEstimate: string): number {
    if (timeEstimate.includes("2-3")) return 150000; // 2.5 minutes
    if (timeEstimate.includes("3-5")) return 240000; // 4 minutes
    if (timeEstimate.includes("5-8")) return 390000; // 6.5 minutes
    return 600000; // 10 minutes
  }
  
  private getReportDescription(reportType: string): string {
    switch (reportType) {
      case 'demographic':
        return `• Demographic breakdowns and patterns
• Cross-demographic comparisons
• Statistical significance testing
• Visual demographic distributions`;
      
      case 'thematic':
        return `• Thematic analysis of text responses
• Sentiment patterns and trends
• Key topic identification
• Qualitative insights extraction`;
      
      case 'comparative':
        return `• Comparative analysis across groups
• Statistical correlation testing
• Difference significance analysis
• Relationship pattern identification`;
      
      case 'longitudinal':
        return `• Temporal trend analysis
• Change pattern identification
• Time-series statistical analysis
• Evolution insights`;
      
      case 'comprehensive':
      default:
        return `• Multi-dimensional analysis
• Demographic and thematic insights
• Statistical correlations
• Comprehensive data visualization
• Executive summary with key findings`;
    }
  }
} 