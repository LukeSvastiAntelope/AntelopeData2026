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
    
    // Platform adoption questions
    const platformStats = Object.values(questionStats).find((stats: any) => 
      stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
    ) as any;
    
    if (platformStats && this.isPlatformQuestion(questionLower)) {
      return this.resolvePlatformQuestion(questionLower, platformStats, factSheet);
    }
    
    // Usage statistics questions
    const usageStats = Object.values(questionStats).find((stats: any) => 
      stats.statistics && stats.statistics.mean !== undefined
    ) as any;
    
    if (usageStats && this.isUsageQuestion(questionLower)) {
      return this.resolveUsageQuestion(questionLower, usageStats, factSheet);
    }
    
    // Demographics questions
    if (factSheet.core_stats?.demographic_distribution && this.isDemographicQuestion(questionLower)) {
      return this.resolveDemographicQuestion(questionLower, factSheet.core_stats.demographic_distribution, factSheet);
    }
    
    // Survey overview questions
    if (factSheet.survey_metadata && this.isOverviewQuestion(questionLower)) {
      return this.resolveOverviewQuestion(questionLower, factSheet, questionStats);
    }
    
    // Can't answer from fact sheet - need raw data
    return {
      canAnswer: false,
      confidence: 0,
      reasoning: "Question requires qualitative analysis or specific response details not available in fact sheet",
      fallbackNeeded: {
        reason: "Need individual responses for detailed analysis",
        suggestedQuery: "targeted_raw_query"
      }
    };
  }
  
  private isPlatformQuestion(question: string): boolean {
    const platformKeywords = [
      'platform', 'social media', 'app', 'service', 'popular', 'most used',
      'facebook', 'instagram', 'youtube', 'twitter', 'tiktok', 'snapchat',
      'adoption', 'usage rate', 'percentage', 'how many use',
      'together', 'commonly used', 'combinations', 'used together', 
      'common platforms', 'which platforms', 'platform usage'
    ];
    return platformKeywords.some(keyword => question.includes(keyword));
  }
  
  private isUsageQuestion(question: string): boolean {
    const usageKeywords = [
      'hours', 'time', 'usage', 'spend', 'daily', 'average', 'typical',
      'how long', 'how much time', 'frequency', 'often'
    ];
    return usageKeywords.some(keyword => question.includes(keyword));
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
  
  private resolvePlatformQuestion(question: string, platformStats: any, factSheet: any): FactSheetQueryResult {
    const adoptionRates = platformStats.adoption_rates;
    const sortedPlatforms = Object.entries(adoptionRates)
      .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
    
    let answer = "";
    const dataCards: any[] = [];
    let confidence = 0.9;
    
    // Most popular platform questions
    if (question.includes('most popular') || question.includes('top platform') || question.includes('most used')) {
      const topPlatform = sortedPlatforms[0] as any;
      answer = `The most popular platform is ${topPlatform[0]} with ${topPlatform[1].percentage}% adoption (${topPlatform[1].users} out of ${factSheet.survey_metadata?.total_responses || 'total'} respondents).`;
      
      if (sortedPlatforms.length > 1) {
        const top3 = sortedPlatforms.slice(0, 3);
        answer += ` The top 3 platforms are: ${top3.map(([name, stats]: any) => `${name} (${stats.percentage}%)`).join(', ')}.`;
      }
      
      confidence = 0.95;
    }
    // Platform combination questions
    else if (question.includes('together') || question.includes('combinations') || question.includes('commonly used') || question.includes('used together')) {
      const top3 = sortedPlatforms.slice(0, 3);
      answer = `Based on platform adoption rates, the most commonly used platforms are: ${top3.map(([name, stats]: any) => `${name} (${stats.percentage}%)`).join(', ')}. `;
      answer += `These platforms are likely used together by many respondents, with ${top3[0][0]} being the most popular at ${top3[0][1].percentage}% adoption, followed by ${top3[1][0]} at ${top3[1][1].percentage}%.`;
      confidence = 0.85;
    }
    // Platform comparison questions
    else if (question.includes('compare') || question.includes('vs') || question.includes('versus')) {
      answer = `Platform adoption rates: ${sortedPlatforms.map(([name, stats]: any) => `${name}: ${stats.percentage}% (${stats.users} users)`).join(', ')}.`;
      confidence = 0.9;
    }
    // General platform usage questions
    else {
      answer = `Platform adoption breakdown: ${sortedPlatforms.map(([name, stats]: any) => `${name} is used by ${stats.percentage}% of respondents (${stats.users} users)`).join(', ')}.`;
      confidence = 0.85;
    }
    
    // Create data card
    dataCards.push({
      type: 'platform_adoption',
      title: 'Platform Adoption Rates',
      data: sortedPlatforms.slice(0, 5).map(([platform, stats]: any) => ({
        label: platform,
        value: stats.percentage,
        count: stats.users
      })),
      chart_type: 'horizontal_bar'
    });
    
    return {
      canAnswer: true,
      answer,
      dataCards,
      confidence,
      reasoning: `Answered directly from pre-computed platform adoption statistics with ${confidence * 100}% confidence`
    };
  }
  
  private resolveUsageQuestion(question: string, usageStats: any, factSheet: any): FactSheetQueryResult {
    const stats = usageStats.statistics;
    let answer = "";
    const dataCards: any[] = [];
    let confidence = 0.9;
    
    if (question.includes('average') || question.includes('typical')) {
      answer = `On average, users spend ${stats.mean} hours per day, with a median of ${stats.median} hours. Usage ranges from ${stats.min} to ${stats.max} hours daily.`;
      confidence = 0.95;
    } else if (question.includes('most') || question.includes('majority')) {
      answer = `The median usage is ${stats.median} hours per day, meaning half of users spend more and half spend less than this amount. The average is ${stats.mean} hours per day.`;
      confidence = 0.9;
    } else {
      answer = `Daily usage statistics: Average ${stats.mean} hours, Median ${stats.median} hours, Range ${stats.min}-${stats.max} hours.`;
      confidence = 0.85;
    }
    
    // Create usage stats card
    dataCards.push({
      type: 'usage_stats',
      title: 'Daily Usage Statistics',
      data: {
        average: `${stats.mean} hours/day`,
        median: `${stats.median} hours/day`,
        range: `${stats.min}-${stats.max} hours`
      },
      chart_type: 'metric_card'
    });
    
    return {
      canAnswer: true,
      answer,
      dataCards,
      confidence,
      reasoning: `Answered directly from pre-computed usage statistics with ${confidence * 100}% confidence`
    };
  }
  
  private resolveDemographicQuestion(question: string, demographics: any, factSheet: any): FactSheetQueryResult {
    let answer = "";
    const dataCards: any[] = [];
    let confidence = 0.8;
    
    if (question.includes('age') && demographics.age) {
      const ageData = Object.entries(demographics.age)
        .sort(([,a]: any, [,b]: any) => b.percentage - a.percentage);
      
      answer = `Age distribution: ${ageData.map(([group, stats]: any) => `${group}: ${stats.percentage}% (${stats.count} respondents)`).join(', ')}.`;
      
      dataCards.push({
        type: 'age_distribution',
        title: 'Age Distribution',
        data: ageData.map(([group, stats]: any) => ({
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
      
      answer = `Gender distribution: ${genderData.map(([group, stats]: any) => `${group}: ${stats.percentage}% (${stats.count} respondents)`).join(', ')}.`;
      confidence = 0.9;
    } else {
      // General demographic overview
      const availableDemo = Object.keys(demographics).join(', ');
      answer = `Available demographic data includes: ${availableDemo}. `;
      
      if (demographics.age) {
        const topAge = Object.entries(demographics.age)[0] as any;
        answer += `Most common age group: ${topAge[0]} (${topAge[1].percentage}%). `;
      }
      
      confidence = 0.7;
    }
    
    return {
      canAnswer: true,
      answer,
      dataCards,
      confidence,
      reasoning: `Answered from pre-computed demographic statistics with ${confidence * 100}% confidence`
    };
  }
  
  private resolveOverviewQuestion(question: string, factSheet: any, questionStats: any): FactSheetQueryResult {
    const metadata = factSheet.survey_metadata;
    const coreStats = factSheet.core_stats;
    
    let answer = `Survey overview: ${metadata.total_responses} total responses across ${metadata.total_questions} questions. `;
    
    if (coreStats.data_quality) {
      answer += `Data quality: ${coreStats.data_quality.completion_rate}% completion rate, ${coreStats.data_quality.response_quality}% high-quality responses. `;
    }
    
    // Add key insights
    const platformStats = Object.values(questionStats).find((stats: any) => 
      stats.adoption_rates && Object.keys(stats.adoption_rates).length > 0
    ) as any;
    
    if (platformStats) {
      const topPlatform = Object.entries(platformStats.adoption_rates)[0] as any;
      answer += `Key finding: ${topPlatform[0]} is the most popular platform at ${topPlatform[1].percentage}% adoption. `;
    }
    
    const usageStats = Object.values(questionStats).find((stats: any) => 
      stats.statistics && stats.statistics.mean !== undefined
    ) as any;
    
    if (usageStats) {
      answer += `Average daily usage: ${usageStats.statistics.mean} hours. `;
    }
    
    return {
      canAnswer: true,
      answer,
      dataCards: [],
      confidence: 0.85,
      reasoning: "Answered from survey metadata and core statistics with 85% confidence"
    };
  }
} 