interface DetectionResult {
  confidence: number; // 0-100 score
  reasons: string[];
  recommendations: string[];
  isResearchData: boolean;
  suggestCodebook: boolean;
  detectedStandard?: {
    name: string;
    confidence: number;
    autoCodebookAvailable: boolean;
  };
  detectedPatterns: {
    technicalColumns: string[];
    numericOnlyColumns: string[];
    metadataColumns: string[];
    waveIdentifiers: string[];
  };
}

interface AnalysisInput {
  headers: string[];
  sampleData: any[];
  fileName: string;
  totalRows: number;
}

export class ResearchDataDetector {
  
  /**
   * Main analysis function - detects if dataset needs a codebook
   */
  static analyzeForResearchData(data: any[], fileName: string = ''): DetectionResult {
    if (!data || data.length === 0) {
      return this.createResult(0, [], [], false);
    }

    const headers = Object.keys(data[0]);
    const analysisInput: AnalysisInput = {
      headers,
      sampleData: data.slice(0, 100), // Analyze first 100 rows
      fileName,
      totalRows: data.length
    };

    let confidence = 0;
    const reasons: string[] = [];
    const recommendations: string[] = [];
    const detectedPatterns = {
      technicalColumns: [],
      numericOnlyColumns: [],
      metadataColumns: [],
      waveIdentifiers: []
    };

    // 1. Column Name Analysis (40 points max)
    const columnAnalysis = this.analyzeColumnNames(analysisInput);
    confidence += columnAnalysis.score;
    reasons.push(...columnAnalysis.reasons);
    detectedPatterns.technicalColumns = columnAnalysis.technicalColumns;
    detectedPatterns.metadataColumns = columnAnalysis.metadataColumns;
    detectedPatterns.waveIdentifiers = columnAnalysis.waveIdentifiers;

    // 2. Response Pattern Analysis (30 points max)
    const responseAnalysis = this.analyzeResponsePatterns(analysisInput);
    confidence += responseAnalysis.score;
    reasons.push(...responseAnalysis.reasons);
    detectedPatterns.numericOnlyColumns = responseAnalysis.numericOnlyColumns;

    // 3. Dataset Characteristics (20 points max)
    const datasetAnalysis = this.analyzeDatasetCharacteristics(analysisInput);
    confidence += datasetAnalysis.score;
    reasons.push(...datasetAnalysis.reasons);

    // 4. File Context Analysis (10 points max)
    const fileAnalysis = this.analyzeFileContext(analysisInput);
    confidence += fileAnalysis.score;
    reasons.push(...fileAnalysis.reasons);

    // 5. Survey Standard Detection
    const standardDetection = this.detectSurveyStandard(analysisInput);
    if (standardDetection.detected) {
      confidence += standardDetection.confidenceBonus;
      reasons.push(...standardDetection.reasons);
    }

    // Generate recommendations based on confidence
    if (confidence >= 90) {
      recommendations.push('This appears to be research data with technical variable names');
      recommendations.push('A codebook is highly recommended for proper question mapping');
      recommendations.push('Consider filtering out metadata columns during import');
    } else if (confidence >= 70) {
      recommendations.push('This might be research data with some technical elements');
      recommendations.push('A codebook would help improve question readability');
    } else if (confidence >= 50) {
      recommendations.push('Some columns appear to be technical codes');
      recommendations.push('Consider uploading a codebook if available');
    } else {
      recommendations.push('This appears to be standard survey data');
    }

    return this.createResult(
      Math.min(confidence, 100), 
      reasons, 
      recommendations, 
      confidence >= 70,
      detectedPatterns,
      standardDetection.detected ? standardDetection : undefined
    );
  }

  /**
   * Analyze column names for technical patterns
   */
  private static analyzeColumnNames(input: AnalysisInput) {
    const { headers } = input;
    let score = 0;
    const reasons: string[] = [];
    const technicalColumns: string[] = [];
    const metadataColumns: string[] = [];
    const waveIdentifiers: string[] = [];

    // Technical patterns (more specific = higher score)
    const patterns = [
      { regex: /^[A-Z_]+\d*$/, score: 3, name: 'ALL_CAPS_TECHNICAL' }, // QKEY, DEVICE_TYPE
      { regex: /_W\d+$/, score: 5, name: 'WAVE_IDENTIFIER' }, // _W142, _W143
      { regex: /^F_/, score: 4, name: 'DEMOGRAPHIC_RECODE' }, // F_RACECMB, F_IDEO
      { regex: /WEIGHT|WGT/i, score: 5, name: 'WEIGHT_VARIABLE' }, // WEIGHT_W142, WGTVAR
      { regex: /^Q\d+[A-Z]*$/, score: 4, name: 'QUESTION_CODE' }, // Q1A, Q2B
      { regex: /^[A-Z]+\d+[a-z]?_W\d+$/, score: 5, name: 'RESEARCH_VARIABLE' }, // DEVICE_TYPE_W142
      { regex: /^(RESP|CASEID|QKEY)$/i, score: 4, name: 'RESPONDENT_ID' },
      { regex: /^(LANG|FORM|DEVICE)_/i, score: 3, name: 'SURVEY_METADATA' }
    ];

    headers.forEach(header => {
      for (const pattern of patterns) {
        if (pattern.regex.test(header)) {
          score += pattern.score;
          technicalColumns.push(header);
          
          if (pattern.name === 'WAVE_IDENTIFIER') {
            waveIdentifiers.push(header);
          }
          if (pattern.name.includes('DEMOGRAPHIC') || pattern.name.includes('WEIGHT') || pattern.name.includes('METADATA')) {
            metadataColumns.push(header);
          }
          
          if (reasons.length < 5) { // Limit reason verbosity
            reasons.push(`Found ${pattern.name.toLowerCase().replace('_', ' ')} pattern: "${header}"`);
          }
          break; // Only count each header once
        }
      }
    });

    // Bonus for high percentage of technical columns
    const technicalPercentage = (technicalColumns.length / headers.length) * 100;
    if (technicalPercentage > 50) {
      score += 10;
      reasons.push(`${Math.round(technicalPercentage)}% of columns use technical naming patterns`);
    } else if (technicalPercentage > 25) {
      score += 5;
      reasons.push(`${Math.round(technicalPercentage)}% of columns use technical naming patterns`);
    }

    return {
      score: Math.min(score, 40), // Cap at 40 points
      reasons,
      technicalColumns: [...new Set(technicalColumns)], // Remove duplicates
      metadataColumns: [...new Set(metadataColumns)],
      waveIdentifiers: [...new Set(waveIdentifiers)]
    };
  }

  /**
   * Analyze response patterns for research data indicators
   */
  private static analyzeResponsePatterns(input: AnalysisInput) {
    const { headers, sampleData } = input;
    let score = 0;
    const reasons: string[] = [];
    const numericOnlyColumns: string[] = [];

    if (sampleData.length === 0) return { score: 0, reasons: [], numericOnlyColumns: [] };

    let numericOnlyCount = 0;
    let limitedRangeCount = 0;
    let refusalCodeCount = 0;

    headers.forEach(header => {
      const values = sampleData
        .map(row => row[header])
        .filter(val => val !== null && val !== undefined && val !== '');

      if (values.length === 0) return;

      // Check if all values are numeric
      const numericValues = values.filter(val => !isNaN(Number(val)) && val !== '');
      const isAllNumeric = numericValues.length / values.length > 0.9;

      if (isAllNumeric && values.length > 5) {
        numericOnlyCount++;
        numericOnlyColumns.push(header);

        // Check for limited ranges (typical of Likert scales)
        const uniqueNumbers = [...new Set(numericValues.map(val => Number(val)))].sort((a, b) => a - b);
        if (uniqueNumbers.length <= 7 && uniqueNumbers[uniqueNumbers.length - 1] <= 10) {
          limitedRangeCount++;
        }

        // Check for common refusal codes (97, 98, 99)
        const hasRefusalCodes = uniqueNumbers.some(num => num >= 97 && num <= 99);
        if (hasRefusalCodes) {
          refusalCodeCount++;
        }
      }
    });

    // Scoring based on patterns
    const numericPercentage = (numericOnlyCount / headers.length) * 100;
    if (numericPercentage > 60) {
      score += 15;
      reasons.push(`${Math.round(numericPercentage)}% of columns contain only numeric codes`);
    } else if (numericPercentage > 30) {
      score += 10;
      reasons.push(`${Math.round(numericPercentage)}% of columns contain only numeric codes`);
    }

    if (limitedRangeCount > headers.length * 0.3) {
      score += 10;
      reasons.push(`Many columns use limited numeric ranges (likely Likert scales)`);
    }

    if (refusalCodeCount > 3) {
      score += 5;
      reasons.push(`Found common refusal codes (97-99) in multiple columns`);
    }

    return {
      score: Math.min(score, 30), // Cap at 30 points
      reasons,
      numericOnlyColumns
    };
  }

  /**
   * Analyze overall dataset characteristics
   */
  private static analyzeDatasetCharacteristics(input: AnalysisInput) {
    const { headers, totalRows } = input;
    let score = 0;
    const reasons: string[] = [];

    // Large number of columns suggests research data
    if (headers.length > 100) {
      score += 10;
      reasons.push(`Large dataset with ${headers.length} columns (typical of research data)`);
    } else if (headers.length > 50) {
      score += 5;
      reasons.push(`Medium-large dataset with ${headers.length} columns`);
    }

    // Large number of rows
    if (totalRows > 5000) {
      score += 5;
      reasons.push(`Large sample size: ${totalRows.toLocaleString()} responses`);
    } else if (totalRows > 1000) {
      score += 2;
      reasons.push(`Medium sample size: ${totalRows.toLocaleString()} responses`);
    }

    // Check for demographic recode patterns
    const demographicRecodes = headers.filter(h => h.startsWith('F_') || h.includes('_FINAL')).length;
    if (demographicRecodes > 5) {
      score += 5;
      reasons.push(`Found ${demographicRecodes} demographic recode variables`);
    }

    return {
      score: Math.min(score, 20), // Cap at 20 points
      reasons
    };
  }

  /**
   * Analyze file context and naming
   */
  private static analyzeFileContext(input: AnalysisInput) {
    const { fileName } = input;
    let score = 0;
    const reasons: string[] = [];

    if (!fileName) return { score: 0, reasons: [] };

    const lowerFileName = fileName.toLowerCase();

    // Research organization patterns
    const researchPatterns = [
      { pattern: 'atp', name: 'American Trends Panel (Pew Research)', score: 5 },
      { pattern: 'pew', name: 'Pew Research', score: 4 },
      { pattern: 'gallup', name: 'Gallup', score: 4 },
      { pattern: 'anes', name: 'American National Election Studies', score: 4 },
      { pattern: 'gss', name: 'General Social Survey', score: 4 },
      { pattern: 'wave', name: 'Wave/Panel Study', score: 3 },
      { pattern: /w\d+/, name: 'Wave Identifier', score: 3 }
    ];

    for (const { pattern, name, score: patternScore } of researchPatterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      if (regex.test(lowerFileName)) {
        score += patternScore;
        reasons.push(`Filename suggests ${name}`);
      }
    }

    return {
      score: Math.min(score, 10), // Cap at 10 points
      reasons
    };
  }

  /**
   * Detect known survey standards (Pew Research, ANES, etc.)
   */
  private static detectSurveyStandard(input: AnalysisInput): {
    detected: boolean;
    name?: string;
    confidence?: number;
    autoCodebookAvailable?: boolean;
    confidenceBonus: number;
    reasons: string[];
  } {
    const { headers, fileName } = input;
    const reasons: string[] = [];
    let detected = false;
    let standardName = '';
    let standardConfidence = 0;
    let confidenceBonus = 0;

    // Pew Research Center Detection
    const pewPatterns = {
      fileName: /^(atp|pew).*w\d+/i,
      columns: {
        demographics: ['F_GENDER', 'F_AGECAT', 'F_EDUCCAT', 'F_RACECMB', 'F_PARTY', 'F_IDEO'],
        wave: /_W\d+$/,
        weight: /WEIGHT.*W\d+/i
      }
    };

    // Check filename patterns
    if (pewPatterns.fileName.test(fileName)) {
      standardConfidence += 40;
      reasons.push(`Filename matches Pew Research pattern: "${fileName}"`);
    }

    // Check for Pew demographic columns
    const pewDemographics = pewPatterns.columns.demographics.filter(col => 
      headers.some(h => h === col)
    );
    if (pewDemographics.length >= 3) {
      standardConfidence += 30;
      reasons.push(`Found ${pewDemographics.length} Pew demographic columns: ${pewDemographics.join(', ')}`);
    }

    // Check for wave identifiers
    const waveColumns = headers.filter(h => pewPatterns.columns.wave.test(h));
    if (waveColumns.length >= 5) {
      standardConfidence += 20;
      reasons.push(`Found ${waveColumns.length} wave identifier columns`);
    }

    // Check for weight variables
    const weightColumns = headers.filter(h => pewPatterns.columns.weight.test(h));
    if (weightColumns.length > 0) {
      standardConfidence += 10;
      reasons.push(`Found Pew weight variables: ${weightColumns.join(', ')}`);
    }

    // Determine if we detected Pew Research
    if (standardConfidence >= 60) {
      detected = true;
      standardName = 'Pew Research Center';
      confidenceBonus = Math.min(standardConfidence / 2, 15); // Bonus up to 15 points
      reasons.push(`🎯 **Pew Research format detected** (${standardConfidence}% confidence)`);
    }

    return {
      detected,
      name: standardName,
      confidence: standardConfidence,
      autoCodebookAvailable: detected,
      confidenceBonus,
      reasons
    };
  }

  /**
   * Create standardized result object
   */
  private static createResult(
    confidence: number, 
    reasons: string[], 
    recommendations: string[], 
    isResearchData: boolean,
    detectedPatterns: any = {},
    detectedStandard?: any
  ): DetectionResult {
    return {
      confidence: Math.round(confidence),
      reasons,
      recommendations,
      isResearchData,
      suggestCodebook: confidence >= 70,
      detectedStandard,
      detectedPatterns
    };
  }

  /**
   * Get user-friendly confidence description
   */
  static getConfidenceDescription(confidence: number): string {
    if (confidence >= 90) return 'Very High - Research data detected';
    if (confidence >= 70) return 'High - Likely research data';
    if (confidence >= 50) return 'Medium - Possibly research data';
    if (confidence >= 30) return 'Low - Some technical elements';
    return 'Very Low - Standard survey data';
  }

  /**
   * Get recommended action based on confidence
   */
  static getRecommendedAction(confidence: number): string {
    if (confidence >= 90) return 'Codebook strongly recommended';
    if (confidence >= 70) return 'Codebook recommended';
    if (confidence >= 50) return 'Consider uploading codebook';
    return 'Codebook not needed';
  }
} 