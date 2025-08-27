// Quick detector runner for a CSV file path.
// Usage: node scripts/check-csv-detector.js "/absolute/path/to/file.csv"

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Inline copy of the detection logic (aligned with src/app/utils/survey/research-data-detector.ts)
class ResearchDataDetector {
  static analyzeForResearchData(data, fileName = '') {
    if (!data || data.length === 0) {
      return this.createResult(0, [], [], false);
    }

    const headers = Object.keys(data[0] || {});
    const analysisInput = {
      headers,
      sampleData: data.slice(0, 100),
      fileName,
      totalRows: data.length,
    };

    let confidence = 0;
    const reasons = [];
    const recommendations = [];
    const detectedPatterns = {
      technicalColumns: [],
      numericOnlyColumns: [],
      metadataColumns: [],
      waveIdentifiers: [],
    };

    const columnAnalysis = this.analyzeColumnNames(analysisInput);
    confidence += columnAnalysis.score;
    reasons.push(...columnAnalysis.reasons);
    detectedPatterns.technicalColumns = columnAnalysis.technicalColumns;
    detectedPatterns.metadataColumns = columnAnalysis.metadataColumns;
    detectedPatterns.waveIdentifiers = columnAnalysis.waveIdentifiers;

    const responseAnalysis = this.analyzeResponsePatterns(analysisInput);
    confidence += responseAnalysis.score;
    reasons.push(...responseAnalysis.reasons);
    detectedPatterns.numericOnlyColumns = responseAnalysis.numericOnlyColumns;

    const datasetAnalysis = this.analyzeDatasetCharacteristics(analysisInput);
    confidence += datasetAnalysis.score;
    reasons.push(...datasetAnalysis.reasons);

    const fileAnalysis = this.analyzeFileContext(analysisInput);
    confidence += fileAnalysis.score;
    reasons.push(...fileAnalysis.reasons);

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
      detectedPatterns
    );
  }

  static analyzeColumnNames(input) {
    const { headers } = input;
    let score = 0;
    const reasons = [];
    const technicalColumns = [];
    const metadataColumns = [];
    const waveIdentifiers = [];

    const patterns = [
      { regex: /^[A-Z_]+\d*$/, score: 3, name: 'ALL_CAPS_TECHNICAL' },
      { regex: /_W\d+$/, score: 5, name: 'WAVE_IDENTIFIER' },
      { regex: /^F_/, score: 4, name: 'DEMOGRAPHIC_RECODE' },
      { regex: /WEIGHT|WGT/i, score: 5, name: 'WEIGHT_VARIABLE' },
      { regex: /^Q\d+[A-Z]*$/, score: 4, name: 'QUESTION_CODE' },
      { regex: /^[A-Z]+\d+[a-z]?_W\d+$/, score: 5, name: 'RESEARCH_VARIABLE' },
      { regex: /^(RESP|CASEID|QKEY)$/i, score: 4, name: 'RESPONDENT_ID' },
      { regex: /^(LANG|FORM|DEVICE)_/i, score: 3, name: 'SURVEY_METADATA' },
    ];

    headers.forEach((header) => {
      for (const pattern of patterns) {
        if (pattern.regex.test(header)) {
          score += pattern.score;
          technicalColumns.push(header);
          if (pattern.name === 'WAVE_IDENTIFIER') waveIdentifiers.push(header);
          if (pattern.name.includes('DEMOGRAPHIC') || pattern.name.includes('WEIGHT') || pattern.name.includes('METADATA')) {
            metadataColumns.push(header);
          }
          if (reasons.length < 5) reasons.push(`Found ${pattern.name.toLowerCase().replace('_', ' ')} pattern: "${header}"`);
          break;
        }
      }
    });

    const technicalPercentage = (technicalColumns.length / Math.max(headers.length, 1)) * 100;
    if (technicalPercentage > 50) {
      score += 10;
      reasons.push(`${Math.round(technicalPercentage)}% of columns use technical naming patterns`);
    } else if (technicalPercentage > 25) {
      score += 5;
      reasons.push(`${Math.round(technicalPercentage)}% of columns use technical naming patterns`);
    }

    return {
      score: Math.min(score, 40),
      reasons,
      technicalColumns: [...new Set(technicalColumns)],
      metadataColumns: [...new Set(metadataColumns)],
      waveIdentifiers: [...new Set(waveIdentifiers)],
    };
  }

  static analyzeResponsePatterns(input) {
    const { headers, sampleData } = input;
    let score = 0;
    const reasons = [];
    const numericOnlyColumns = [];
    if (sampleData.length === 0) return { score: 0, reasons: [], numericOnlyColumns: [] };

    let numericOnlyCount = 0;
    let limitedRangeCount = 0;
    let refusalCodeCount = 0;

    headers.forEach((header) => {
      const values = sampleData
        .map((row) => row[header])
        .filter((val) => val !== null && val !== undefined && val !== '');
      if (values.length === 0) return;
      const numericValues = values.filter((val) => !isNaN(Number(val)) && val !== '');
      const isAllNumeric = numericValues.length / values.length > 0.9;
      if (isAllNumeric && values.length > 5) {
        numericOnlyCount++;
        numericOnlyColumns.push(header);
        const uniqueNumbers = [...new Set(numericValues.map((val) => Number(val)))].sort((a, b) => a - b);
        if (uniqueNumbers.length <= 7 && uniqueNumbers[uniqueNumbers.length - 1] <= 10) {
          limitedRangeCount++;
        }
        const hasRefusalCodes = uniqueNumbers.some((num) => num >= 97 && num <= 99);
        if (hasRefusalCodes) refusalCodeCount++;
      }
    });

    const numericPercentage = (numericOnlyCount / Math.max(headers.length, 1)) * 100;
    if (numericPercentage > 60) {
      score += 15;
      reasons.push(`${Math.round(numericPercentage)}% of columns contain only numeric codes`);
    } else if (numericPercentage > 30) {
      score += 10;
      reasons.push(`${Math.round(numericPercentage)}% of columns contain only numeric codes`);
    }
    if (limitedRangeCount > headers.length * 0.3) {
      score += 10;
      reasons.push('Many columns use limited numeric ranges (likely Likert scales)');
    }
    if (refusalCodeCount > 3) {
      score += 5;
      reasons.push('Found common refusal codes (97-99) in multiple columns');
    }
    return { score: Math.min(score, 30), reasons, numericOnlyColumns };
  }

  static analyzeDatasetCharacteristics(input) {
    const { headers, totalRows } = input;
    let score = 0;
    const reasons = [];
    if (headers.length > 100) {
      score += 10;
      reasons.push(`Large dataset with ${headers.length} columns (typical of research data)`);
    } else if (headers.length > 50) {
      score += 5;
      reasons.push(`Medium-large dataset with ${headers.length} columns`);
    }
    if (totalRows > 5000) {
      score += 5;
      reasons.push(`Large sample size: ${totalRows.toLocaleString()} responses`);
    } else if (totalRows > 1000) {
      score += 2;
      reasons.push(`Medium sample size: ${totalRows.toLocaleString()} responses`);
    }
    const demographicRecodes = headers.filter((h) => h.startsWith('F_') || h.includes('_FINAL')).length;
    if (demographicRecodes > 5) {
      score += 5;
      reasons.push(`Found ${demographicRecodes} demographic recode variables`);
    }
    return { score: Math.min(score, 20), reasons };
  }

  static analyzeFileContext(input) {
    const { fileName } = input;
    let score = 0;
    const reasons = [];
    if (!fileName) return { score: 0, reasons: [] };
    const lowerFileName = fileName.toLowerCase();
    const researchPatterns = [
      { pattern: 'atp', name: 'American Trends Panel (Pew Research)', score: 5 },
      { pattern: 'pew', name: 'Pew Research', score: 4 },
      { pattern: 'gallup', name: 'Gallup', score: 4 },
      { pattern: 'anes', name: 'American National Election Studies', score: 4 },
      { pattern: 'gss', name: 'General Social Survey', score: 4 },
      { pattern: 'wave', name: 'Wave/Panel Study', score: 3 },
      { pattern: /w\d+/, name: 'Wave Identifier', score: 3 },
    ];
    for (const { pattern, name, score: patternScore } of researchPatterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      if (regex.test(lowerFileName)) {
        score += patternScore;
        reasons.push(`Filename suggests ${name}`);
      }
    }
    return { score: Math.min(score, 10), reasons };
  }

  static createResult(confidence, reasons, recommendations, isResearchData, detectedPatterns = {}) {
    return {
      confidence: Math.round(confidence),
      reasons,
      recommendations,
      isResearchData,
      suggestCodebook: confidence >= 70,
      detectedPatterns,
    };
  }

  static getConfidenceDescription(confidence) {
    if (confidence >= 90) return 'Very High - Research data detected';
    if (confidence >= 70) return 'High - Likely research data';
    if (confidence >= 50) return 'Medium - Possibly research data';
    if (confidence >= 30) return 'Low - Some technical elements';
    return 'Very Low - Standard survey data';
  }
}

function parseCsvSample(filePath, maxBytes = 5 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  const bytesToRead = Math.min(maxBytes, stat.size);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytesToRead);
  fs.readSync(fd, buffer, 0, bytesToRead, 0);
  fs.closeSync(fd);
  const csvString = buffer.toString('utf8');
  const result = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h, i) => (h && h.trim()) || `Column_${i}`,
  });
  if (result.errors && result.errors.length) {
    console.warn('CSV parse warnings:', result.errors.map((e) => e.message).join('; '));
  }
  const rows = Array.isArray(result.data) ? result.data.filter(Boolean) : [];
  return rows.slice(0, 200); // give the detector up to 200 rows to pick 100
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/check-csv-detector.js "/absolute/path/to/file.csv"');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }
  const base = path.basename(csvPath);
  console.log(`🧪 Running detector on: ${base}`);
  const sample = parseCsvSample(csvPath);
  console.log(`Parsed sample rows: ${sample.length}`);
  const result = ResearchDataDetector.analyzeForResearchData(sample, base);
  console.log(`\nConfidence: ${result.confidence}% (${ResearchDataDetector.getConfidenceDescription(result.confidence)})`);
  console.log(`Suggests Codebook: ${result.suggestCodebook ? 'YES' : 'NO'} (threshold >= 70)`);
  console.log('\nTop Reasons:');
  result.reasons.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  console.log('\nDetected Patterns:');
  console.log(`  Technical Columns: ${result.detectedPatterns.technicalColumns?.length || 0}`);
  console.log(`  Wave Identifiers: ${result.detectedPatterns.waveIdentifiers?.length || 0}`);
  console.log(`  Metadata Columns: ${result.detectedPatterns.metadataColumns?.length || 0}`);
  console.log(`  Numeric-only Columns: ${result.detectedPatterns.numericOnlyColumns?.length || 0}`);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});






