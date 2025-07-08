import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface CodebookEntry {
  variableName: string;
  questionText: string;
  valueLabels?: Record<string, string>; // e.g., {"1": "Male", "2": "Female"}
  description?: string;
  dataType?: string;
}

export interface CodebookParseResult {
  success: boolean;
  entries: CodebookEntry[];
  totalEntries: number;
  errors: string[];
  warnings: string[];
  detectedFormat: string;
  columnMapping: {
    variableName: string;
    questionText: string;
    valueLabels?: string;
    description?: string;
  };
  debugInfo?: {
    fileSize: number;
    detectedHeaders: string[];
    sheetNames?: string[];
    firstRowData?: any;
    rawDataSample?: any[];
    headerDetectionLog?: string[];
  };
}

export class CodebookParser {
  
  /**
   * Main parsing function that handles both CSV and Excel files
   */
  static async parseCodebook(file: File): Promise<CodebookParseResult> {
    const debugInfo: any = {
      fileSize: file.size,
      detectedHeaders: [],
      headerDetectionLog: [],
      rawDataSample: [],
      sheetNames: [],
      firstRowData: null
    };

    try {
      const fileName = file.name.toLowerCase();
      const isCSV = fileName.endsWith('.csv');
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      
      if (!isCSV && !isExcel) {
        return this.createErrorResult('Unsupported file format. Please use CSV or Excel files.');
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let rawData: any[] = [];

      // Parse file based on type
      if (isCSV) {
        rawData = await this.parseCSVData(buffer);
      } else {
        const excelResult = await this.parseExcelData(buffer);
        rawData = excelResult.data;
        debugInfo.sheetNames = excelResult.sheetNames;
        debugInfo.headerDetectionLog.push(`Found ${excelResult.sheetNames.length} sheets: ${excelResult.sheetNames.join(', ')}`);
      }

      if (rawData.length === 0) {
        return this.createErrorResult('File appears to be empty or has no valid data.');
      }

      // Store raw data sample for debugging
      debugInfo.rawDataSample = rawData.slice(0, 3);
      debugInfo.firstRowData = rawData[0];
      debugInfo.detectedHeaders = Object.keys(rawData[0] || {});
      debugInfo.headerDetectionLog.push(`Found ${debugInfo.detectedHeaders.length} columns: ${debugInfo.detectedHeaders.join(', ')}`);

      // Detect column structure with enhanced debugging
      const columnMapping = this.detectColumnStructureWithDebug(rawData[0], debugInfo);
      
      if (!columnMapping.variableName || !columnMapping.questionText) {
        const suggestions = this.suggestColumnMappings(debugInfo.detectedHeaders);
        return {
          success: false,
          entries: [],
          totalEntries: 0,
          errors: [
            'Could not detect required columns (Variable Name, Question Text)',
            `Found headers: ${debugInfo.detectedHeaders.join(', ')}`,
            `Suggestions: ${suggestions}`
          ],
          warnings: [],
          detectedFormat: isCSV ? 'CSV' : 'Excel',
          columnMapping,
          debugInfo
        };
      }

      debugInfo.headerDetectionLog.push(`Mapped columns - Variable: "${columnMapping.variableName}", Question: "${columnMapping.questionText}", Values: "${columnMapping.valueLabels || 'none'}"`);

      // Parse entries with enhanced error handling
      const parseResult = this.parseEntriesWithDebug(rawData, columnMapping, debugInfo);

      return {
        success: parseResult.entries.length > 0,
        entries: parseResult.entries,
        totalEntries: parseResult.entries.length,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        detectedFormat: isCSV ? 'CSV' : 'Excel',
        columnMapping,
        debugInfo
      };

    } catch (error) {
      debugInfo.headerDetectionLog.push(`Parse error: ${error.message}`);
      return this.createErrorResult(`Failed to parse codebook: ${error.message}`);
    }
  }

  /**
   * Parse CSV data using Papa Parse
   */
  private static parseCSVData(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const csvString = buffer.toString('utf-8');
      
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          resolve(results.data);
        },
        error: (error) => reject(error)
      });
    });
  }

  /**
   * Parse Excel data using XLSX
   */
  private static async parseExcelData(buffer: Buffer): Promise<{ data: any[], sheetNames: string[] }> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    
    // Try to find the best sheet (first non-empty sheet)
    let selectedSheet = null;
    let selectedSheetName = '';
    
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (data.length > 0) {
        selectedSheet = worksheet;
        selectedSheetName = sheetName;
        break;
      }
    }
    
    if (!selectedSheet) {
      selectedSheet = workbook.Sheets[sheetNames[0]];
      selectedSheetName = sheetNames[0];
    }
    
    const data = XLSX.utils.sheet_to_json(selectedSheet);
    return { data, sheetNames };
  }

  /**
   * Detect the column structure of the codebook
   */
  private static detectColumnStructure(firstRow: any): {
    variableName: string;
    questionText: string;
    valueLabels?: string;
    description?: string;
  } {
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
    
    // Common patterns for description
    const descriptionPatterns = [
      'desc', 'description', 'notes', 'comment', 'details', 'info'
    ];

    const findBestMatch = (patterns: string[], headers: string[]): string | undefined => {
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
    const description = findBestMatch(descriptionPatterns, headers);

    return {
      variableName,
      questionText,
      valueLabels,
      description
    };
  }

  /**
   * Detect column structure with comprehensive debugging
   */
  private static detectColumnStructureWithDebug(firstRow: any, debugInfo: any): {
    variableName: string;
    questionText: string;
    valueLabels?: string;
    description?: string;
  } {
    const headers = Object.keys(firstRow).map(h => h.trim());
    debugInfo.headerDetectionLog.push(`Analyzing headers: ${headers.join(', ')}`);
    
    // Enhanced patterns for ATP codebooks
    const variableNamePatterns = [
      'variable', 'var', 'variable_name', 'varname', 'name', 'field', 'column', 'item',
      'var_name', 'variable name', 'variablename'
    ];
    
    const questionTextPatterns = [
      'question', 'text', 'label', 'description', 'prompt', 'question_text', 
      'questiontext', 'item_text', 'wording', 'full_text', 'question text',
      'item_label', 'survey_question', 'quest'
    ];
    
    const valueLabelsPatterns = [
      'values', 'value_labels', 'labels', 'codes', 'responses', 'options', 'choices',
      'value labels', 'value_codes', 'response_options', 'coding'
    ];
    
    const descriptionPatterns = [
      'desc', 'description', 'notes', 'comment', 'details', 'info', 'note'
    ];

    const findBestMatch = (patterns: string[], headers: string[]): string | undefined => {
      const headerLower = headers.map(h => h.toLowerCase().trim());
      
      // Exact matches first
      for (const pattern of patterns) {
        const exactMatch = headerLower.find(h => h === pattern);
        if (exactMatch) {
          const originalHeader = headers[headerLower.indexOf(exactMatch)];
          debugInfo.headerDetectionLog.push(`Exact match for "${pattern}": "${originalHeader}"`);
          return originalHeader;
        }
      }
      
      // Substring matches
      for (const pattern of patterns) {
        const substringMatch = headerLower.find(h => h.includes(pattern) || pattern.includes(h));
        if (substringMatch) {
          const originalHeader = headers[headerLower.indexOf(substringMatch)];
          debugInfo.headerDetectionLog.push(`Substring match for "${pattern}": "${originalHeader}"`);
          return originalHeader;
        }
      }
      
      debugInfo.headerDetectionLog.push(`No match found for patterns: ${patterns.join(', ')}`);
      return undefined;
    };

    const variableName = findBestMatch(variableNamePatterns, headers) || headers[0];
    const questionText = findBestMatch(questionTextPatterns, headers) || headers[1];
    const valueLabels = findBestMatch(valueLabelsPatterns, headers);
    const description = findBestMatch(descriptionPatterns, headers);

    debugInfo.headerDetectionLog.push(`Final mapping: Variable="${variableName}", Question="${questionText}", Values="${valueLabels || 'none'}", Description="${description || 'none'}"`);

    return {
      variableName,
      questionText,
      valueLabels,
      description
    };
  }

  /**
   * Suggest column mappings based on headers
   */
  private static suggestColumnMappings(headers: string[]): string {
    const suggestions = [];
    
    if (headers.length >= 2) {
      suggestions.push(`Try renaming "${headers[0]}" to "Variable Name" and "${headers[1]}" to "Question Text"`);
    }
    
    const possibleVariableColumns = headers.filter(h => 
      h.toLowerCase().includes('var') || 
      h.toLowerCase().includes('name') || 
      h.toLowerCase().includes('field')
    );
    
    const possibleQuestionColumns = headers.filter(h => 
      h.toLowerCase().includes('question') || 
      h.toLowerCase().includes('text') || 
      h.toLowerCase().includes('label')
    );
    
    if (possibleVariableColumns.length > 0) {
      suggestions.push(`Possible variable columns: ${possibleVariableColumns.join(', ')}`);
    }
    
    if (possibleQuestionColumns.length > 0) {
      suggestions.push(`Possible question columns: ${possibleQuestionColumns.join(', ')}`);
    }
    
    return suggestions.join('; ');
  }

  /**
   * Parse entries with enhanced debugging
   */
  private static parseEntriesWithDebug(rawData: any[], columnMapping: any, debugInfo: any): {
    entries: CodebookEntry[];
    errors: string[];
    warnings: string[];
  } {
    const entries: CodebookEntry[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    debugInfo.headerDetectionLog.push(`Processing ${rawData.length} rows of data`);

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // +2 because array is 0-indexed and we assume header row

      try {
        const variableName = this.cleanString(row[columnMapping.variableName]);
        const questionText = this.cleanString(row[columnMapping.questionText]);

        // Skip rows with missing essential data
        if (!variableName || !questionText) {
          if (variableName || questionText) { // Only warn if partially filled
            warnings.push(`Row ${rowNum}: Missing ${!variableName ? 'variable name' : 'question text'}`);
          }
          continue;
        }

        const entry: CodebookEntry = {
          variableName,
          questionText
        };

        // Parse value labels if available
        if (columnMapping.valueLabels && row[columnMapping.valueLabels]) {
          const valueLabelsText = this.cleanString(row[columnMapping.valueLabels]);
          entry.valueLabels = this.parseValueLabels(valueLabelsText);
        }

        // Add description if available
        if (columnMapping.description && row[columnMapping.description]) {
          entry.description = this.cleanString(row[columnMapping.description]);
        }

        entries.push(entry);

        // Log first few entries for debugging
        if (i < 3) {
          debugInfo.headerDetectionLog.push(`Entry ${i + 1}: "${variableName}" -> "${questionText.substring(0, 50)}${questionText.length > 50 ? '...' : ''}"`);
        }

      } catch (error) {
        errors.push(`Row ${rowNum}: ${error.message}`);
      }
    }

    // Validation warnings
    if (entries.length === 0) {
      errors.push('No valid entries found in codebook');
    } else if (entries.length < rawData.length * 0.5) {
      warnings.push(`Only ${entries.length} of ${rawData.length} rows were successfully parsed`);
    }

    debugInfo.headerDetectionLog.push(`Successfully parsed ${entries.length} entries`);

    return { entries, errors, warnings };
  }

  /**
   * Clean and normalize string values
   */
  private static cleanString(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\s+/g, ' ');
  }

  /**
   * Parse value labels from text (supports multiple formats)
   */
  private static parseValueLabels(text: string): Record<string, string> {
    const labels: Record<string, string> = {};
    
    if (!text || typeof text !== 'string') return labels;
    
    // Try different separators: comma, semicolon, pipe, newline
    const separators = [',', ';', '|', '\n', '\r\n'];
    let items: string[] = [];
    
    for (const separator of separators) {
      if (text.includes(separator)) {
        items = text.split(separator);
        break;
      }
    }
    
    // If no separator found, treat as single item
    if (items.length === 0) {
      items = [text];
    }
    
    // Parse each item for value=label pairs
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      
      // Try different value-label separators
      const valueLabelSeparators = ['=', ':', '->', '|', ' - '];
      let parsed = false;
      
      for (const separator of valueLabelSeparators) {
        if (trimmed.includes(separator)) {
          const parts = trimmed.split(separator, 2);
          if (parts.length === 2) {
            const value = parts[0].trim();
            const label = parts[1].trim();
            if (value && label) {
              labels[value] = label;
              parsed = true;
              break;
            }
          }
        }
      }
      
      // If no separator found, use the whole string as both value and label
      if (!parsed && trimmed) {
        labels[trimmed] = trimmed;
      }
    }
    
    return labels;
  }

  /**
   * Create error result
   */
  private static createErrorResult(message: string): CodebookParseResult {
    return {
      success: false,
      entries: [],
      totalEntries: 0,
      errors: [message],
      warnings: [],
      detectedFormat: 'Unknown',
      columnMapping: {
        variableName: '',
        questionText: ''
      },
      debugInfo: {
        fileSize: 0,
        detectedHeaders: [],
        headerDetectionLog: [],
        rawDataSample: []
      }
    };
  }

  /**
   * Create a mapping from variable names to question text
   */
  static createVariableMapping(entries: CodebookEntry[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    
    for (const entry of entries) {
      mapping[entry.variableName] = entry.questionText;
      
      // Also create lowercase mapping for case-insensitive lookup
      mapping[entry.variableName.toLowerCase()] = entry.questionText;
    }
    
    return mapping;
  }

  /**
   * Apply codebook mappings to column names
   */
  static applyCodebookMappings(
    originalColumns: string[], 
    codebookEntries: CodebookEntry[]
  ): Array<{
    originalName: string;
    mappedName: string;
    hasMapping: boolean;
    valueLabels?: Record<string, string>;
  }> {
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

  /**
   * Validate codebook format and provide suggestions
   */
  static validateCodebookFormat(entries: CodebookEntry[]): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (entries.length === 0) {
      issues.push('No entries found in codebook');
      suggestions.push('Ensure the file has data rows with variable names and question text');
      return { isValid: false, issues, suggestions };
    }

    // Check for essential fields
    const entriesWithoutQuestions = entries.filter(e => !e.questionText || e.questionText.trim().length === 0);
    if (entriesWithoutQuestions.length > 0) {
      issues.push(`${entriesWithoutQuestions.length} entries missing question text`);
    }

    // Check for very short question texts (likely not actual questions)
    const entriesWithShortQuestions = entries.filter(e => e.questionText && e.questionText.length < 10);
    if (entriesWithShortQuestions.length > entries.length * 0.3) {
      issues.push('Many entries have very short question text - may not be proper questions');
      suggestions.push('Ensure question text column contains full question wording, not just labels');
    }

    // Check for value labels
    const entriesWithValueLabels = entries.filter(e => e.valueLabels && Object.keys(e.valueLabels).length > 0);
    if (entriesWithValueLabels.length === 0) {
      suggestions.push('Consider adding value labels for categorical variables (e.g., "1=Male, 2=Female")');
    }

    const isValid = issues.length === 0;
    return { isValid, issues, suggestions };
  }
} 