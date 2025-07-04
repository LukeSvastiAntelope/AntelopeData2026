export interface FactSheetQueryResult {
  canAnswer: boolean;
  answer?: string;
  dataCards?: any[];
  confidence: number;
  reasoning: string;
  fallbackNeeded?: {
    reason: string;
    suggestedQuery: string;
  };
}

export class FactSheetQueryResolver {
  
  /**
   * Attempts to answer a user question directly from fact sheet statistics
   */
  resolveFromFactSheet(question: string, factSheet: any): FactSheetQueryResult {
    if (!factSheet || !factSheet.question_stats) {
      return {
        canAnswer: false,
        confidence: 0,
        reasoning: "No fact sheet available",
        fallbackNeeded: {
          reason: "No pre-computed statistics available",
          suggestedQuery: "raw_data_needed"
        }
      };
    }

    const questionLower = question.toLowerCase();
    const questionStats = factSheet.question_stats;
    
    // Try to find relevant data for the question
    const relevantStats = this.findRelevantStats(questionLower, questionStats);
    
    if (relevantStats.length > 0) {
      return this.generateAnswerFromStats(questionLower, relevantStats, factSheet);
    }
    
    // Try demographics questions
    if (factSheet.core_stats?.demographic_distribution && this.isDemographicQuestion(questionLower)) {
      return this.resolveDemographicQuestion(questionLower, factSheet.core_stats.demographic_distribution, factSheet);
    }
    
    // Try survey overview questions
    if (factSheet.survey_metadata && this.isOverviewQuestion(questionLower)) {
      return this.resolveOverviewQuestion(questionLower, factSheet);
    }
    
    // Can't answer from fact sheet - need raw data
    return {
      canAnswer: false,
      confidence: 0,
      reasoning: "Question requires analysis not available in the current fact sheet",
      fallbackNeeded: {
        reason: "Need individual responses for detailed analysis",
        suggestedQuery: "targeted_raw_query"
      }
    };
  }
  
  /**
   * Find statistics that might be relevant to the user's question
   */
  private findRelevantStats(question: string, questionStats: any): Array<{key: string, stats: any, type: string}> {
    const relevantStats: Array<{key: string, stats: any, type: string}> = [];
    
    // Look through all question statistics
    Object.entries(questionStats).forEach(([key, stats]: [string, any]) => {
      // Check if this statistic might be relevant to the question
      if (this.isStatRelevant(question, key, stats)) {
        let type = 'unknown';
        
        if (stats.adoption_rates) type = 'multi_select';
        else if (stats.statistics) type = 'numeric';
        else if (stats.distribution) type = 'categorical';
        
        relevantStats.push({ key, stats, type });
      }
    });
    
    // Sort by relevance (prioritize multi-select for "popular" questions, numeric for "average" questions)
    return relevantStats.sort((a, b) => {
      const aScore = this.calculateRelevanceScore(question, a);
      const bScore = this.calculateRelevanceScore(question, b);
      return bScore - aScore;
    });
  }
  
  /**
   * Check if a statistic might be relevant to the user's question
   */
  private isStatRelevant(question: string, statKey: string, stats: any): boolean {
    // Always relevant if the question contains words from the stat key
    const keyWords = statKey.replace(/_/g, ' ').toLowerCase();
    const questionWords = question.toLowerCase();
    
    // Check for word overlap
    const keyWordsList = keyWords.split(' ');
    const hasWordOverlap = keyWordsList.some(word => 
      word.length > 3 && questionWords.includes(word)
    );
    
    if (hasWordOverlap) return true;
    
    // Check for general question patterns that could apply to any data
    const generalPatterns = [
      'popular', 'most', 'top', 'common', 'frequently', 'majority',
      'average', 'typical', 'mean', 'median', 'usually',
      'percentage', 'percent', 'how many', 'what proportion',
      'distribution', 'breakdown', 'split'
    ];
    
    return generalPatterns.some(pattern => questionWords.includes(pattern));
  }
  
  /**
   * Calculate relevance score for sorting
   */
  private calculateRelevanceScore(question: string, stat: {key: string, stats: any, type: string}): number {
    let score = 0;
    
    // Word overlap bonus
    const keyWords = stat.key.replace(/_/g, ' ').toLowerCase();
    const questionWords = question.toLowerCase();
    const keyWordsList = keyWords.split(' ');
    const overlapCount = keyWordsList.filter(word => 
      word.length > 3 && questionWords.includes(word)
    ).length;
    score += overlapCount * 10;
    
    // Type-specific bonuses
    if (question.includes('popular') || question.includes('most') || question.includes('top')) {
      if (stat.type === 'multi_select') score += 5;
    }
    
    if (question.includes('average') || question.includes('typical') || question.includes('mean')) {
      if (stat.type === 'numeric') score += 5;
    }
    
    return score;
  }
  
  /**
   * Generate answer from relevant statistics
   */
  private generateAnswerFromStats(question: string, relevantStats: Array<{key: string, stats: any, type: string}>, factSheet: any): FactSheetQueryResult {
    const primaryStat = relevantStats[0];
    console.log('🎯 Generating answer from stats for question:', question);
    console.log('📊 Primary stat:', primaryStat.key, 'Type:', primaryStat.type);
    console.log('📈 Stat data structure:', Object.keys(primaryStat.stats));
    
    let answer = "";
    const dataCards: any[] = [];
    let confidence = 0.8;
    
    // Generate answer based on the type of data available
    if (primaryStat.type === 'multi_select' && primaryStat.stats.adoption_rates) {
      console.log('🔍 Processing multi-select data...');
      const result = this.generateMultiSelectAnswer(question, primaryStat, factSheet);
      answer = result.answer;
      dataCards.push(...result.dataCards);
      confidence = result.confidence;
    } else if (primaryStat.type === 'numeric' && primaryStat.stats.statistics) {
      console.log('🔍 Processing numeric data...');
      const result = this.generateNumericAnswer(question, primaryStat, factSheet);
      answer = result.answer;
      dataCards.push(...result.dataCards);
      confidence = result.confidence;
    } else if (primaryStat.type === 'categorical' && primaryStat.stats.distribution) {
      console.log('🔍 Processing categorical data...');
      const result = this.generateCategoricalAnswer(question, primaryStat, factSheet);
      answer = result.answer;
      dataCards.push(...result.dataCards);
      confidence = result.confidence;
    } else {
      console.log('❌ No matching data type found for answer generation');
      console.log('📊 Available stat types:', {
        hasAdoptionRates: !!primaryStat.stats.adoption_rates,
        hasStatistics: !!primaryStat.stats.statistics,
        hasDistribution: !!primaryStat.stats.distribution
      });
      return {
        canAnswer: false,
        confidence: 0,
        reasoning: "Found relevant data but couldn't generate a meaningful answer",
        fallbackNeeded: {
          reason: "Data format not suitable for this question type",
          suggestedQuery: "raw_data_needed"
        }
      };
    }
    
    console.log('✅ Final answer generated:', answer);
    console.log('🎯 Final confidence:', confidence);
    
    return {
      canAnswer: true,
      answer,
      dataCards,
      confidence,
      reasoning: `Answered from pre-computed statistics with ${(confidence * 100).toFixed(0)}% confidence`
    };
  }
  
  /**
   * Generate answer for multi-select questions (adoption rates)
   */
  private generateMultiSelectAnswer(question: string, stat: {key: string, stats: any, type: string}, factSheet: any): {answer: string, dataCards: any[], confidence: number} {
    const adoptionRates = stat.stats.adoption_rates;
    console.log('🔍 Generating multi-select answer for:', question);
    console.log('📊 Adoption rates data:', adoptionRates);
    
    const sortedOptions = Object.entries(adoptionRates)
      .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
    
    console.log('📈 Sorted options:', sortedOptions);
    
    let answer = "";
    let confidence = 0.9;
    
    // Generate context-appropriate answer
    if (question.includes('most popular') || question.includes('top') || question.includes('most common')) {
      const topOption = sortedOptions[0] as [string, any];
      answer = `The most popular option is "${topOption[0]}" with ${topOption[1].percentage}% of respondents selecting it (${topOption[1].users} out of ${factSheet.survey_metadata?.total_responses || 'total'} respondents).`;
      
      if (sortedOptions.length > 1) {
        const top3 = sortedOptions.slice(0, 3);
        answer += ` The top 3 choices are: ${top3.map(([name, stats]: [string, any]) => `"${name}" (${stats.percentage}%)`).join(', ')}.`;
      }
      confidence = 0.95;
    } else if (question.includes('least') || question.includes('unpopular')) {
      const leastOption = sortedOptions[sortedOptions.length - 1] as [string, any];
      answer = `The least popular option is "${leastOption[0]}" with ${leastOption[1].percentage}% of respondents (${leastOption[1].users} users).`;
      confidence = 0.9;
    } else {
      // General breakdown
      answer = `Response breakdown: ${sortedOptions.map(([name, stats]: [string, any]) => `"${name}" was selected by ${stats.percentage}% of respondents (${stats.users} users)`).join(', ')}.`;
      confidence = 0.85;
    }
    
    console.log('✅ Generated answer:', answer);
    console.log('🎯 Confidence:', confidence);
    
    // Create data card
    const dataCards = [{
      type: 'adoption_rates',
      title: 'Response Distribution',
      data: sortedOptions.slice(0, 10).map(([option, stats]: [string, any]) => ({
        label: option,
        value: stats.percentage,
        count: stats.users
      })),
      chart_type: 'horizontal_bar'
    }];
    
    return { answer, dataCards, confidence };
  }
  
  /**
   * Generate answer for numeric questions
   */
  private generateNumericAnswer(question: string, stat: {key: string, stats: any, type: string}, factSheet: any): {answer: string, dataCards: any[], confidence: number} {
    const stats = stat.stats.statistics;
    let answer = "";
    let confidence = 0.9;
    
    // Determine the unit from the data (if available)
    const hasDistribution = stat.stats.distribution;
    let unit = "";
    if (hasDistribution) {
      const sampleKey = Object.keys(hasDistribution)[0];
      if (sampleKey?.includes('hours')) unit = " hours";
      else if (sampleKey?.includes('days')) unit = " days";
      else if (sampleKey?.includes('times')) unit = " times";
    }
    
    if (question.includes('average') || question.includes('typical') || question.includes('mean')) {
      answer = `The average is ${stats.mean}${unit}, with a median of ${stats.median}${unit}. Values range from ${stats.min}${unit} to ${stats.max}${unit}.`;
      confidence = 0.95;
    } else if (question.includes('median') || question.includes('middle')) {
      answer = `The median is ${stats.median}${unit}, meaning half of respondents are above and half are below this value. The average is ${stats.mean}${unit}.`;
      confidence = 0.95;
    } else if (question.includes('range') || question.includes('minimum') || question.includes('maximum')) {
      answer = `Values range from ${stats.min}${unit} to ${stats.max}${unit}, with an average of ${stats.mean}${unit} and median of ${stats.median}${unit}.`;
      confidence = 0.9;
    } else {
      answer = `Statistical summary: Average ${stats.mean}${unit}, Median ${stats.median}${unit}, Range ${stats.min}-${stats.max}${unit}.`;
      confidence = 0.85;
    }
    
    // Create data card
    const dataCards = [{
      type: 'numeric_stats',
      title: 'Statistical Summary',
      data: {
        average: `${stats.mean}${unit}`,
        median: `${stats.median}${unit}`,
        range: `${stats.min}-${stats.max}${unit}`,
        std_dev: stats.std_dev ? `${stats.std_dev}${unit}` : undefined
      },
      chart_type: 'metric_card'
    }];
    
    return { answer, dataCards, confidence };
  }
  
  /**
   * Generate answer for categorical questions
   */
  private generateCategoricalAnswer(question: string, stat: {key: string, stats: any, type: string}, factSheet: any): {answer: string, dataCards: any[], confidence: number} {
    const distribution = stat.stats.distribution;
    const sortedCategories = Object.entries(distribution)
      .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
    
    let answer = "";
    let confidence = 0.85;
    
    if (question.includes('most common') || question.includes('majority') || question.includes('popular')) {
      const topCategory = sortedCategories[0] as [string, any];
      answer = `The most common response is "${topCategory[0]}" at ${topCategory[1].percentage}% (${topCategory[1].count} respondents).`;
      
      if (sortedCategories.length > 1) {
        const top3 = sortedCategories.slice(0, 3);
        answer += ` Top responses: ${top3.map(([cat, stats]: [string, any]) => `"${cat}" (${stats.percentage}%)`).join(', ')}.`;
      }
      confidence = 0.9;
    } else {
      answer = `Distribution: ${sortedCategories.map(([cat, stats]: [string, any]) => `"${cat}": ${stats.percentage}% (${stats.count} respondents)`).join(', ')}.`;
    }
    
    const dataCards = [{
      type: 'categorical_distribution',
      title: 'Response Distribution',
      data: sortedCategories.map(([category, stats]: [string, any]) => ({
        label: category,
        value: stats.percentage,
        count: stats.count
      })),
      chart_type: 'pie'
    }];
    
    return { answer, dataCards, confidence };
  }
  
  private isDemographicQuestion(question: string): boolean {
    const demoKeywords = [
      'age', 'gender', 'education', 'income', 'location', 'demographic',
      'who', 'breakdown', 'distribution', 'profile'
    ];
    return demoKeywords.some(keyword => question.includes(keyword));
  }
  
  private isOverviewQuestion(question: string): boolean {
    const overviewKeywords = [
      'overview', 'summary', 'total', 'how many responses', 'sample size',
      'survey', 'respondents', 'participants', 'general', 'overall'
    ];
    return overviewKeywords.some(keyword => question.includes(keyword));
  }
  
  private resolveDemographicQuestion(question: string, demographics: any, factSheet: any): FactSheetQueryResult {
    let answer = "";
    const dataCards: any[] = [];
    let confidence = 0.8;
    
    if (question.includes('age') && demographics.age) {
      const ageData = Object.entries(demographics.age)
        .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
      
      answer = `Age distribution: ${ageData.map(([group, stats]: [string, any]) => `${group}: ${stats.percentage}% (${stats.count} respondents)`).join(', ')}.`;
      
      dataCards.push({
        type: 'age_distribution',
        title: 'Age Distribution',
        data: ageData.map(([group, stats]: [string, any]) => ({
          label: group,
          value: stats.percentage,
          count: stats.count
        })),
        chart_type: 'pie'
      });
      
      confidence = 0.9;
    } else if (question.includes('gender') && demographics.gender) {
      const genderData = Object.entries(demographics.gender)
        .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
      
      answer = `Gender distribution: ${genderData.map(([group, stats]: [string, any]) => `${group}: ${stats.percentage}% (${stats.count} respondents)`).join(', ')}.`;
      confidence = 0.9;
    } else {
      // General demographic overview
      const availableDemo = Object.keys(demographics).join(', ');
      answer = `Available demographic data includes: ${availableDemo}. `;
      
      if (demographics.age) {
        const topAge = Object.entries(demographics.age)[0] as [string, any];
        answer += `Most common age group: ${topAge[0]} (${topAge[1].percentage}%). `;
      }
      
      confidence = 0.7;
    }
    
    return {
      canAnswer: true,
      answer,
      dataCards,
      confidence,
      reasoning: `Answered from demographic statistics with ${(confidence * 100).toFixed(0)}% confidence`
    };
  }
  
  private resolveOverviewQuestion(question: string, factSheet: any): FactSheetQueryResult {
    const metadata = factSheet.survey_metadata;
    const coreStats = factSheet.core_stats;
    
    let answer = `Survey overview: ${metadata.total_responses} total responses across ${metadata.total_questions} questions. `;
    
    if (coreStats.data_quality) {
      answer += `Data quality: ${coreStats.data_quality.completion_rate}% completion rate, ${coreStats.data_quality.response_quality}% high-quality responses. `;
    }
    
    // Add key insights from available data
    const questionStats = factSheet.question_stats;
    const availableStats = Object.entries(questionStats);
    
    if (availableStats.length > 0) {
      const [firstStatKey, firstStat] = availableStats[0] as [string, any];
      
      if (firstStat.adoption_rates) {
        const topOption = Object.entries(firstStat.adoption_rates)[0] as [string, any];
        answer += `Key finding: "${topOption[0]}" is the most popular response at ${topOption[1].percentage}%. `;
      } else if (firstStat.statistics) {
        answer += `Key finding: Average response is ${firstStat.statistics.mean}. `;
      }
    }
    
    return {
      canAnswer: true,
      answer,
      dataCards: [],
      confidence: 0.85,
      reasoning: "Answered from survey metadata and available statistics with 85% confidence"
    };
  }
} 