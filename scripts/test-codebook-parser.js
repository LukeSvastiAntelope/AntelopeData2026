// Test script for codebook parser functionality
// This simulates the TypeScript logic in JavaScript for testing

class CodebookParser {
  static parseValueLabels(text) {
    const valueLabels = {};
    
    if (!text || text.trim().length === 0) return valueLabels;

    // Common separators for value pairs
    const pairSeparators = [',', ';', '\n', '|'];
    const valueSeparators = ['=', ':', '-', '->'];

    // Find the best separators
    let bestPairSep = ',';
    let bestValueSep = '=';

    for (const sep of pairSeparators) {
      if (text.includes(sep)) {
        bestPairSep = sep;
        break;
      }
    }

    for (const sep of valueSeparators) {
      if (text.includes(sep)) {
        bestValueSep = sep;
        break;
      }
    }

    // Split into pairs and parse
    const pairs = text.split(bestPairSep);
    
    for (const pair of pairs) {
      const trimmedPair = pair.trim();
      if (!trimmedPair) continue;

      const parts = trimmedPair.split(bestValueSep);
      if (parts.length === 2) {
        const code = parts[0].trim();
        const label = parts[1].trim();
        
        if (code && label) {
          valueLabels[code] = label;
        }
      }
    }

    return valueLabels;
  }

  static detectColumnStructure(firstRow) {
    const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());
    
    // Common patterns for variable name columns
    const variableNamePatterns = [
      'variable', 'var', 'variable_name', 'varname', 'name', 'field', 'column', 'item'
    ];
    
    // Common patterns for question text columns
    const questionTextPatterns = [
      'question', 'text', 'label', 'description', 'prompt', 'question_text', 
      'questiontext', 'item_text', 'wording', 'full_text'
    ];
    
    // Common patterns for value labels
    const valueLabelsPatterns = [
      'values', 'value_labels', 'labels', 'codes', 'responses', 'options', 'choices'
    ];

    const findBestMatch = (patterns, headers) => {
      // Exact matches first
      for (const pattern of patterns) {
        const exactMatch = headers.find(h => h === pattern);
        if (exactMatch) return Object.keys(firstRow)[headers.indexOf(exactMatch)];
      }
      
      // Substring matches
      for (const pattern of patterns) {
        const substringMatch = headers.find(h => h.includes(pattern) || pattern.includes(h));
        if (substringMatch) return Object.keys(firstRow)[headers.indexOf(substringMatch)];
      }
      
      return undefined;
    };

    const variableName = findBestMatch(variableNamePatterns, headers) || Object.keys(firstRow)[0];
    const questionText = findBestMatch(questionTextPatterns, headers) || Object.keys(firstRow)[1];
    const valueLabels = findBestMatch(valueLabelsPatterns, headers);

    return {
      variableName,
      questionText,
      valueLabels
    };
  }

  static createVariableMapping(entries) {
    const mapping = {};
    
    for (const entry of entries) {
      mapping[entry.variableName] = entry.questionText;
      
      // Also create lowercase mapping for case-insensitive lookup
      mapping[entry.variableName.toLowerCase()] = entry.questionText;
    }
    
    return mapping;
  }

  static applyCodebookMappings(originalColumns, codebookEntries) {
    const variableMapping = this.createVariableMapping(codebookEntries);
    
    return originalColumns.map(columnName => {
      const mappedName = variableMapping[columnName] || 
                        variableMapping[columnName.toLowerCase()] || 
                        columnName;
      
      const hasMapping = mappedName !== columnName;
      
      // Find value labels for this variable
      const entry = codebookEntries.find(e => 
        e.variableName === columnName || 
        e.variableName.toLowerCase() === columnName.toLowerCase()
      );
      
      return {
        originalName: columnName,
        mappedName,
        hasMapping,
        valueLabels: entry?.valueLabels
      };
    });
  }
}

function testCodebookParser() {
  console.log('🧪 TESTING CODEBOOK PARSER');
  console.log('==========================\n');

  // Test 1: Value Labels Parsing
  console.log('📊 Test 1: Value Labels Parsing');
  console.log('--------------------------------');
  
  const testValueLabels = [
    '1=Male, 2=Female, 3=Other',
    '1: Strongly Disagree; 2: Disagree; 3: Neutral; 4: Agree; 5: Strongly Agree',
    '1->Desktop, 2->Mobile, 3->Tablet',
    '97=Refused|98=Do not know|99=Not applicable'
  ];

  testValueLabels.forEach((text, i) => {
    const result = CodebookParser.parseValueLabels(text);
    console.log(`  Input: "${text}"`);
    console.log(`  Output:`, result);
    console.log();
  });

  // Test 2: Column Structure Detection
  console.log('📊 Test 2: Column Structure Detection');
  console.log('-------------------------------------');
  
  const testHeaders = [
    { 'Variable Name': 'QKEY', 'Question Text': 'Respondent ID', 'Values': '1001-9999' },
    { 'var': 'AGE_W142', 'label': 'What is your age?', 'codes': '18-99, 99=Refused' },
    { 'Field': 'DEVICE_TYPE', 'Description': 'Device used for survey', 'Options': '1=Desktop, 2=Mobile' },
    { 'Column A': 'F_RACECMB', 'Column B': 'Race/ethnicity combined', 'Column C': '1=White, 2=Black' }
  ];

  testHeaders.forEach((header, i) => {
    const structure = CodebookParser.detectColumnStructure(header);
    console.log(`  Test ${i + 1} Headers:`, Object.keys(header));
    console.log(`  Detected Structure:`, structure);
    console.log();
  });

  // Test 3: ATP W142 Style Codebook
  console.log('📊 Test 3: ATP W142 Style Codebook Mapping');
  console.log('------------------------------------------');
  
  const atpCodebook = [
    {
      variableName: 'QKEY',
      questionText: 'Respondent identifier',
      valueLabels: {}
    },
    {
      variableName: 'DEVICE_TYPE_W142',
      questionText: 'What device did you use to take this survey?',
      valueLabels: { '1': 'Desktop computer', '2': 'Mobile phone', '3': 'Tablet' }
    },
    {
      variableName: 'LANG_W142',
      questionText: 'What language did you take the survey in?',
      valueLabels: { '1': 'English', '2': 'Spanish' }
    },
    {
      variableName: 'F_RACECMB',
      questionText: 'What is your race or ethnicity?',
      valueLabels: { '1': 'White', '2': 'Black', '3': 'Hispanic', '4': 'Asian', '5': 'Other' }
    },
    {
      variableName: 'FACTWELL_a_W142',
      questionText: 'How much do you trust information from social media?',
      valueLabels: { '1': 'A lot', '2': 'Some', '3': 'Not much', '4': 'Not at all', '99': 'Do not know' }
    }
  ];

  const originalColumns = ['QKEY', 'DEVICE_TYPE_W142', 'LANG_W142', 'F_RACECMB', 'FACTWELL_a_W142', 'UNKNOWN_VAR'];
  
  const mappingResult = CodebookParser.applyCodebookMappings(originalColumns, atpCodebook);
  
  console.log('Original ATP Columns → Mapped Questions:');
  mappingResult.forEach(mapping => {
    console.log(`  "${mapping.originalName}" → "${mapping.mappedName}" ${mapping.hasMapping ? '✓' : '✗'}`);
    if (mapping.valueLabels && Object.keys(mapping.valueLabels).length > 0) {
      console.log(`    Value Labels: ${JSON.stringify(mapping.valueLabels)}`);
    }
  });

  // Test 4: Coverage Analysis
  console.log('\\n📊 Test 4: Coverage Analysis');
  console.log('-----------------------------');
  
  const mappedCount = mappingResult.filter(m => m.hasMapping).length;
  const totalCount = mappingResult.length;
  const coveragePercent = Math.round((mappedCount / totalCount) * 100);
  
  console.log(`Codebook Coverage: ${mappedCount}/${totalCount} columns (${coveragePercent}%)`);
  console.log(`Unmapped variables: ${mappingResult.filter(m => !m.hasMapping).map(m => m.originalName).join(', ')}`);

  console.log('\\n✅ Codebook parser testing completed!');
  console.log('\\nExpected behavior:');
  console.log('- Value labels should parse different formats correctly');
  console.log('- Column detection should work with various header names');
  console.log('- ATP variables should map to readable questions');
  console.log('- Unknown variables should remain unchanged');
}

testCodebookParser(); 