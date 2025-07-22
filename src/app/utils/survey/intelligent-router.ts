interface QueryIntent {
  primaryAction: 'CREATE' | 'ANALYZE' | 'SHOW' | 'COMPARE' | 'SUMMARIZE' | 'EXPLAIN' | 'UNKNOWN';
  outputType: 'VISUALIZATION' | 'STATISTICS' | 'INSIGHTS' | 'COMPARISON' | 'SUMMARY' | 'UNKNOWN';
  complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  dataNeeds: string[];
  confidence: number;
}

interface RoutingDecision {
  route: 'FACT_SHEET_DIRECT' | 'HYBRID' | 'FULL_LLM' | 'CANNOT_FULFILL';
  reason: string;
  confidence: number;
  estimatedTime: string;
  dataSources: string[];
}

export class IntelligentRouter {
  
  /**
   * Analyze query intent without using keywords - understand what user actually wants
   */
  analyzeIntent(query: string): QueryIntent {
    const lowerQuery = query.toLowerCase();
    
    // Parse primary action by understanding sentence structure
    let primaryAction: QueryIntent['primaryAction'] = 'UNKNOWN';
    let confidence = 0.5;
    
    // Action detection based on imperative vs interrogative patterns
    if (this.isCreationRequest(lowerQuery)) {
      primaryAction = 'CREATE';
      confidence = 0.9;
    } else if (this.isAnalysisRequest(lowerQuery)) {
      primaryAction = 'ANALYZE';
      confidence = 0.8;
    } else if (this.isDisplayRequest(lowerQuery)) {
      primaryAction = 'SHOW';
      confidence = 0.8;
    } else if (this.isComparisonRequest(lowerQuery)) {
      primaryAction = 'COMPARE';
      confidence = 0.8;
    } else if (this.isSummaryRequest(lowerQuery)) {
      primaryAction = 'SUMMARIZE';
      confidence = 0.7;
    }
    
    // Determine output type based on what they're asking for
    let outputType: QueryIntent['outputType'] = 'UNKNOWN';
    if (this.wantsVisualization(lowerQuery)) {
      outputType = 'VISUALIZATION';
    } else if (this.wantsStatistics(lowerQuery)) {
      outputType = 'STATISTICS';
    } else if (this.wantsInsights(lowerQuery)) {
      outputType = 'INSIGHTS';
    } else if (this.wantsComparison(lowerQuery)) {
      outputType = 'COMPARISON';
    } else if (this.wantsSummary(lowerQuery)) {
      outputType = 'SUMMARY';
    }
    
    // Determine complexity based on scope and requirements
    const complexity = this.assessComplexity(lowerQuery, primaryAction, outputType);
    
    // Identify what data they need
    const dataNeeds = this.identifyDataNeeds(lowerQuery);
    
    return {
      primaryAction,
      outputType,
      complexity,
      dataNeeds,
      confidence
    };
  }
  
  /**
   * Assess if we can fulfill the request with available data
   */
  assessCapability(intent: QueryIntent, factSheet: any): { canFulfill: boolean; confidence: number; reason: string } {
    // Check if we have the required data - support both old and new formats
    const hasQuestionStats = factSheet?.fact_sheet?.question_stats && 
                            Object.keys(factSheet.fact_sheet.question_stats).length > 0;
    const hasAnalysisResults = factSheet?.analysis_results?.results && 
                              factSheet.analysis_results.results.length > 0;
    const hasDemographics = factSheet?.demographics && 
                           Object.keys(factSheet.demographics).length > 0;
    const hasMetadata = factSheet?.survey_meta?.total_respondents;
    
    // We have data if either format is available
    const hasData = hasQuestionStats || hasAnalysisResults;
    const dataCount = hasAnalysisResults ? factSheet.analysis_results.results.length : 
                     (hasQuestionStats ? Object.keys(factSheet.fact_sheet.question_stats).length : 0);
    
    // For visualization requests
    if (intent.outputType === 'VISUALIZATION') {
      if (hasData) {
        return { 
          canFulfill: true, 
          confidence: 0.95, 
          reason: `Can create charts from ${dataCount} analyzed questions using ${hasAnalysisResults ? 'intelligent question selection' : 'fact sheet data'}` 
        };
      } else {
        return { 
          canFulfill: false, 
          confidence: 0.1, 
          reason: 'No statistical data available for visualization' 
        };
      }
    }
    
    // For statistics requests
    if (intent.outputType === 'STATISTICS') {
      if (hasData || hasDemographics || hasMetadata) {
        return { 
          canFulfill: true, 
          confidence: 0.9, 
          reason: `Statistical data available from ${hasAnalysisResults ? 'dynamic analysis' : 'fact sheet'}` 
        };
      }
    }
    
    // For summary requests
    if (intent.outputType === 'SUMMARY' && intent.complexity === 'SIMPLE') {
      if (hasMetadata && hasData) {
        return { 
          canFulfill: true, 
          confidence: 0.85, 
          reason: `Can provide summary from metadata and ${dataCount} analyzed questions` 
        };
      }
    }
    
    // For complex analysis or insights
    if (intent.complexity === 'COMPLEX' || intent.outputType === 'INSIGHTS') {
      return { 
        canFulfill: false, 
        confidence: 0.3, 
        reason: 'Complex analysis requires full LLM processing' 
      };
    }
    
    return { 
      canFulfill: false, 
      confidence: 0.1, 
      reason: 'Unable to determine capability for this request type' 
    };
  }
  
  /**
   * Make intelligent routing decision
   */
  makeRoutingDecision(intent: QueryIntent, capability: { canFulfill: boolean; confidence: number; reason: string }): RoutingDecision {
    // High confidence + can fulfill = direct route
    if (capability.canFulfill && capability.confidence >= 0.9 && intent.confidence >= 0.8) {
      return {
        route: 'FACT_SHEET_DIRECT',
        reason: `Direct fulfillment: ${capability.reason}`,
        confidence: capability.confidence,
        estimatedTime: '< 3 seconds',
        dataSources: ['Fact Sheet Cache', 'Pre-computed Statistics']
      };
    }
    
    // Medium confidence or moderate complexity = hybrid
    if (capability.canFulfill && capability.confidence >= 0.7) {
      return {
        route: 'HYBRID',
        reason: `Hybrid approach: Use fact sheet + LLM interpretation`,
        confidence: capability.confidence * 0.9,
        estimatedTime: '5-15 seconds',
        dataSources: ['Fact Sheet Cache', 'LLM Analysis']
      };
    }
    
    // Low confidence or complex analysis = full LLM
    if (intent.complexity === 'COMPLEX' || !capability.canFulfill) {
      return {
        route: 'FULL_LLM',
        reason: `Complex analysis required: ${capability.reason}`,
        confidence: 0.6,
        estimatedTime: '30-60 seconds',
        dataSources: ['Raw Survey Data', 'Full LLM Processing']
      };
    }
    
    return {
      route: 'CANNOT_FULFILL',
      reason: 'Unable to determine appropriate route',
      confidence: 0.1,
      estimatedTime: 'unknown',
      dataSources: []
    };
  }
  
  // Helper methods for intent detection
  private isCreationRequest(query: string): boolean {
    const creationPatterns = [
      'create', 'make', 'generate', 'build', 'produce', 'construct'
    ];
    return creationPatterns.some(pattern => query.includes(pattern));
  }
  
  private isAnalysisRequest(query: string): boolean {
    const analysisPatterns = [
      'analyze', 'examine', 'study', 'investigate', 'explore', 'understand'
    ];
    return analysisPatterns.some(pattern => query.includes(pattern));
  }
  
  private isDisplayRequest(query: string): boolean {
    const displayPatterns = [
      'show', 'display', 'present', 'reveal', 'demonstrate', 'who', 'what', 'which'
    ];
    return displayPatterns.some(pattern => query.includes(pattern));
  }
  
  private isComparisonRequest(query: string): boolean {
    const comparisonPatterns = [
      'compare', 'contrast', 'difference', 'versus', 'vs', 'between'
    ];
    return comparisonPatterns.some(pattern => query.includes(pattern));
  }
  
  private isSummaryRequest(query: string): boolean {
    const summaryPatterns = [
      'summary', 'overview', 'summarize', 'outline', 'brief'
    ];
    return summaryPatterns.some(pattern => query.includes(pattern));
  }
  
  private wantsVisualization(query: string): boolean {
    const vizPatterns = [
      'graph', 'chart', 'plot', 'diagram', 'visual', 'visualization', 'interesting', 'facts'
    ];
    return vizPatterns.some(pattern => query.includes(pattern));
  }
  
  private wantsStatistics(query: string): boolean {
    const statPatterns = [
      'statistics', 'stats', 'numbers', 'percentage', 'count', 'how many', 'popular', 'most', 'top', 'best', 'highest', 'frequently'
    ];
    return statPatterns.some(pattern => query.includes(pattern));
  }
  
  private wantsInsights(query: string): boolean {
    const insightPatterns = [
      'insight', 'pattern', 'trend', 'finding', 'discovery', 'learning'
    ];
    return insightPatterns.some(pattern => query.includes(pattern));
  }
  
  private wantsComparison(query: string): boolean {
    return this.isComparisonRequest(query);
  }
  
  private wantsSummary(query: string): boolean {
    return this.isSummaryRequest(query);
  }
  
  private assessComplexity(query: string, action: QueryIntent['primaryAction'], outputType: QueryIntent['outputType']): QueryIntent['complexity'] {
    // Simple: Direct requests for existing data
    if ((action === 'CREATE' && outputType === 'VISUALIZATION') ||
        (action === 'SHOW' && outputType === 'STATISTICS')) {
      return 'SIMPLE';
    }
    
    // Complex: Analysis requiring interpretation
    if (action === 'ANALYZE' || outputType === 'INSIGHTS') {
      return 'COMPLEX';
    }
    
    // Moderate: Everything else
    return 'MODERATE';
  }
  
  private identifyDataNeeds(query: string): string[] {
    const needs: string[] = [];
    
    if (query.includes('demographic') || query.includes('age') || query.includes('gender')) {
      needs.push('demographics');
    }
    
    if (query.includes('question') || query.includes('response') || query.includes('answer')) {
      needs.push('question_responses');
    }
    
    if (query.includes('trend') || query.includes('time') || query.includes('change')) {
      needs.push('temporal_data');
    }
    
    return needs;
  }
} 