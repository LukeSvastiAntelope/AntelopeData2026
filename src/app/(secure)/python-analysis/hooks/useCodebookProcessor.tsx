'use client';

import { useState, useCallback } from 'react';

interface CodebookMapping {
  variableName: string;
  questionText: string;
  valueLabels?: Record<string, string>;
  description?: string;
}

interface CodebookProcessingResult {
  success: boolean;
  mappings: CodebookMapping[];
  coverage: {
    mapped: number;
    total: number;
    percentage: number;
  };
  errors: string[];
  warnings: string[];
}

export function useCodebookProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [codebookMappings, setCodebookMappings] = useState<CodebookMapping[]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const processCodebook = useCallback(async (
    codebookFile: File,
    dataColumns: string[]
  ): Promise<CodebookProcessingResult> => {
    setIsProcessing(true);
    setProcessingError(null);

    try {
      const formData = new FormData();
      formData.append('codebook', codebookFile);
      formData.append('originalColumns', JSON.stringify(dataColumns));

      const response = await fetch('/api/python-analysis/process-codebook', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.status) {
        setCodebookMappings(result.mappings);
        return {
          success: true,
          mappings: result.mappings,
          coverage: result.coverage,
          errors: [],
          warnings: result.warnings || []
        };
      } else {
        const errorMessage = result.message || 'Failed to process codebook';
        setProcessingError(errorMessage);
        return {
          success: false,
          mappings: [],
          coverage: { mapped: 0, total: 0, percentage: 0 },
          errors: [errorMessage],
          warnings: []
        };
      }
    } catch (error) {
      console.error('Codebook processing error:', error);
      const errorMessage = `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setProcessingError(errorMessage);
      return {
        success: false,
        mappings: [],
        coverage: { mapped: 0, total: 0, percentage: 0 },
        errors: [errorMessage],
        warnings: []
      };
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const applyCodebookToData = useCallback((rawData: any[], mappings: CodebookMapping[]) => {
    if (!rawData.length || !mappings.length) return rawData;

    // Create lookup maps for faster processing
    const variableToLabels = new Map<string, Record<string, string>>();
    const variableToQuestionText = new Map<string, string>();

    mappings.forEach(mapping => {
      if (mapping.valueLabels) {
        variableToLabels.set(mapping.variableName, mapping.valueLabels);
      }
      if (mapping.questionText) {
        variableToQuestionText.set(mapping.variableName, mapping.questionText);
      }
    });

    // Apply value label transformations to the data
    return rawData.map(row => {
      const transformedRow = { ...row };
      
      Object.keys(row).forEach(column => {
        const valueLabels = variableToLabels.get(column);
        if (valueLabels && row[column] != null) {
          const value = String(row[column]);
          const label = valueLabels[value];
          if (label) {
            // Create a new column with labeled values, keeping original for analysis
            transformedRow[`${column}_labeled`] = label;
          }
        }
      });

      return transformedRow;
    });
  }, []);

  const getColumnMetadata = useCallback((columnName: string) => {
    const mapping = codebookMappings.find(m => m.variableName === columnName);
    return mapping ? {
      questionText: mapping.questionText,
      valueLabels: mapping.valueLabels,
      description: mapping.description
    } : null;
  }, [codebookMappings]);

  const generateCodebookContext = useCallback(() => {
    if (!codebookMappings.length) return '';

    const contextLines = [
      'CODEBOOK INFORMATION:',
      'The following variables have associated question text and value labels:',
      ''
    ];

    codebookMappings.forEach(mapping => {
      contextLines.push(`Variable: ${mapping.variableName}`);
      if (mapping.questionText) {
        contextLines.push(`  Question: ${mapping.questionText}`);
      }
      if (mapping.valueLabels && Object.keys(mapping.valueLabels).length > 0) {
        contextLines.push('  Value Labels:');
        Object.entries(mapping.valueLabels).forEach(([code, label]) => {
          contextLines.push(`    ${code} = ${label}`);
        });
      }
      if (mapping.description) {
        contextLines.push(`  Description: ${mapping.description}`);
      }
      contextLines.push('');
    });

    contextLines.push('IMPORTANT: When analyzing these variables, use the labeled versions when available (e.g., GENDER_labeled instead of GENDER codes) to make results more interpretable.');

    return contextLines.join('\n');
  }, [codebookMappings]);

  return {
    isProcessing,
    codebookMappings,
    processingError,
    processCodebook,
    applyCodebookToData,
    getColumnMetadata,
    generateCodebookContext
  };
} 