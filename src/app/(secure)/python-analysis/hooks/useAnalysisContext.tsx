'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface Dataset {
  name: string;
  data: any[][];
  columns: string[];
  shape: [number, number];
  dtypes: Record<string, string>;
  sampleData: any[];
  suggestCodebook?: boolean;
  codebookMappings?: any[];
  codebookCoverage?: {
    mapped: number;
    total: number;
    percentage: number;
  };
  autoCodebookApplied?: {
    standardName: string;
    entriesCount: number;
  };
}

export interface AnalysisResult {
  type: 'text' | 'image' | 'table' | 'error';
  content: string;
  timestamp: Date;
}

export interface ExecutionState {
  currentCode: string;
  results: AnalysisResult[];
  isExecuting: boolean;
  error: string | null;
}

export interface AnalysisEntry {
  id: string;
  query: string;
  code: string;
  results: AnalysisResult[];
  timestamp: Date;
}

export function useAnalysisContext() {
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisEntry[]>([]);
  const [executionState, setExecutionState] = useState<ExecutionState>({
    currentCode: '',
    results: [],
    isExecuting: false,
    error: null
  });

  const loadDataset = useCallback(async (file: File): Promise<Dataset> => {
    try {
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

      let columns: string[] = [];
      let data: any[][] = [];

      if (ext === '.xlsx' || ext === '.xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
        if (!rows.length) throw new Error('Empty spreadsheet');
        columns = Object.keys(rows[0] || {});
        data = rows.map(r => columns.map(c => String((r as any)[c] ?? '')));
      } else if (ext === '.docx') {
        const { extractRawText } = await import('mammoth');
        const buf = await file.arrayBuffer();
        const res = await extractRawText({ arrayBuffer: buf as any });
        const text = (res.value || '').trim();
        if (!text) throw new Error('Empty .docx');

        // Very simple contact extraction into a tabular dataset.
        // Columns: name (optional), phone, email, raw_line
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
        const phoneRe = /(\+?\d[\d\s().-]{7,}\d)/g;
        const extracted: Array<{ phone?: string; email?: string; raw_line: string }> = [];
        for (const line of lines) {
          const emails = line.match(emailRe) || [];
          const phones = line.match(phoneRe) || [];
          if (!emails.length && !phones.length) continue;
          if (emails.length || phones.length) {
            const max = Math.max(emails.length || 1, phones.length || 1);
            for (let i = 0; i < max; i++) {
              extracted.push({
                email: emails[i],
                phone: phones[i],
                raw_line: line,
              });
            }
          }
        }
        columns = ['phone', 'email', 'raw_line'];
        data = extracted.map(r => [r.phone || '', r.email || '', r.raw_line]);
        if (!data.length) {
          // fallback to one-column dataset so user can still analyze text
          columns = ['text'];
          data = lines.map(l => [l]);
        }
      } else {
        const text = await file.text();
        if (!text.trim()) throw new Error('Empty file');

        const delimiter = ext === '.tsv' ? '\t' : undefined;
        const parsed = Papa.parse<Record<string, any>>(text, {
          header: true,
          skipEmptyLines: true,
          delimiter,
          dynamicTyping: false,
        });

        if (parsed.errors?.length) {
          throw new Error(parsed.errors[0]?.message || 'Failed to parse file');
        }
        const rows = (parsed.data || []).filter(Boolean);
        columns = (parsed.meta.fields || []).filter(Boolean) as string[];
        if (!columns.length || !rows.length) {
          // Fallback: treat as 1-column text dataset
          columns = ['text'];
          data = text.split(/\r?\n/).filter(l => l.trim()).map(l => [l.trim()]);
        } else {
          data = rows.map(r => columns.map(c => String((r as any)[c] ?? '')));
        }
      }

      // Infer data types
      const dtypes: Record<string, string> = {};
      columns.forEach((col, idx) => {
        const sample = data.slice(0, 100).map(row => row[idx]).filter(val => val && val !== '');
        if (sample.length === 0) {
          dtypes[col] = 'object';
          return;
        }

        const isNumeric = sample.every(val => !isNaN(Number(val)));
        const isInteger = isNumeric && sample.every(val => Number.isInteger(Number(val)));
        
        if (isInteger) {
          dtypes[col] = 'int64';
        } else if (isNumeric) {
          dtypes[col] = 'float64';
        } else {
          dtypes[col] = 'object';
        }
      });

      // Detect if codebook might be needed using existing research data detector
      let suggestCodebook = false;
      let detectedStandard: any = null;
      try {
        // Import is inside try-catch to handle potential import issues
        const { ResearchDataDetector } = await import('@/app/utils/survey/research-data-detector');
        const { AutoCodebookGenerator } = await import('@/app/utils/survey/auto-codebook-generator');
        
        const rawDataForDetection = data.slice(0, 100).map(row => {
          const obj: any = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });
        
        const detection = ResearchDataDetector.analyzeForResearchData(rawDataForDetection, file.name);
        suggestCodebook = detection.suggestCodebook;
        detectedStandard = detection.detectedStandard;
        console.log('Codebook detection:', detection);
      } catch (error) {
        console.warn('Could not run codebook detection:', error);
      }

      const dataset: Dataset = {
        name: file.name,
        data,
        columns,
        shape: [data.length, columns.length],
        dtypes,
        sampleData: data.slice(0, 5),
        suggestCodebook // Add this flag to indicate if codebook is recommended
      };

      // Auto-generate codebook if standard detected
      if (detectedStandard?.autoCodebookAvailable) {
        try {
          const { AutoCodebookGenerator } = await import('@/app/utils/survey/auto-codebook-generator');
          const autoCodebookEntries = AutoCodebookGenerator.generateForStandard(
            detectedStandard.name,
            columns
          );
          
          if (autoCodebookEntries.length > 0) {
            // Apply auto-generated mappings to the dataset
            const { CodebookParser } = await import('@/app/utils/survey/codebook-parser');
            const mappings = CodebookParser.applyCodebookMappings(columns, autoCodebookEntries);
            
            dataset.codebookMappings = mappings;
            dataset.autoCodebookApplied = {
              standardName: detectedStandard.name,
              entriesCount: autoCodebookEntries.length
            };
            
            console.log(`Auto-applied ${autoCodebookEntries.length} codebook entries for ${detectedStandard.name}`);
            dataset.suggestCodebook = false; // Don't suggest manual codebook since we auto-applied one
          }
        } catch (error) {
          console.warn('Could not auto-generate codebook:', error);
        }
      }

      setCurrentDataset(dataset);
      
      // Reset execution state
      setExecutionState({
        currentCode: '',
        results: [],
        isExecuting: false,
        error: null
      });

      console.log('Dataset loaded:', dataset);
      return dataset; // Return the loaded dataset
    } catch (error) {
      console.error('Failed to load dataset:', error);
      setExecutionState(prev => ({
        ...prev,
        error: `Failed to load dataset: ${error}`
      }));
      throw error; // Re-throw the error so caller can handle it
    }
  }, []);

  const executeCode = useCallback(async (code: string, pyodide: any) => {
    if (!currentDataset) {
      setExecutionState(prev => ({
        ...prev,
        error: 'No dataset loaded'
      }));
      return;
    }

    try {
      setExecutionState(prev => ({
        ...prev,
        isExecuting: true,
        error: null,
        currentCode: code
      }));

      // Load data into Python if not already loaded
      if (!pyodide.globals.get('df')) {
        const dataJson = JSON.stringify({
          columns: currentDataset.columns,
          data: currentDataset.data
        });
        
        pyodide.runPython(`
          import json
          import pandas as pd
          
          # Load the dataset
          data_json = '''${dataJson}'''
          data_dict = json.loads(data_json)
          df = pd.DataFrame(data_dict['data'], columns=data_dict['columns'])
          
          # Try to convert numeric columns
          for col in df.columns:
            try:
              df[col] = pd.to_numeric(df[col])
            except:
              pass
        `);
      }

              // Execute the user's code and capture output
        let stdout = '';
        let result = null;
        let plots: string[] = [];
        
        try {
          // Set up output capture and matplotlib backend with better error handling
          pyodide.runPython(`
            import sys
            from io import StringIO
            import base64
            from io import BytesIO
            
            # Import matplotlib with proper error handling
            try:
                import matplotlib
                import matplotlib.pyplot as plt
                
                # Set matplotlib to use Agg backend for headless operation
                matplotlib.use('Agg')
                
                # Configure matplotlib for Pyodide
                matplotlib.rcParams['figure.max_open_warning'] = 0
                matplotlib.rcParams['axes.formatter.useoffset'] = False
                
                # Clear any existing plots
                plt.ioff()  # Turn off interactive mode
                plt.clf()
                plt.close('all')
                
                has_matplotlib = True
            except Exception as e:
                print(f"Matplotlib setup warning: {e}")
                has_matplotlib = False
            
            # Capture any print statements
            old_stdout = sys.stdout
            sys.stdout = mystdout = StringIO()
            
            # Store original show function and setup plot capture
            plot_data = []
            
            if has_matplotlib:
                original_show = plt.show
                
                def custom_show():
                    try:
                        fig = plt.gcf()
                        if fig.get_axes():  # Only save if there are plots
                            buf = BytesIO()
                            fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
                            buf.seek(0)
                            img_str = base64.b64encode(buf.getvalue()).decode()
                            plot_data.append(f"data:image/png;base64,{img_str}")
                            buf.close()
                        plt.close(fig)
                    except Exception as e:
                        print(f"Plot generation error: {e}")
                
                # Replace plt.show with our custom function
                plt.show = custom_show
            else:
                # Create dummy functions if matplotlib fails
                def custom_show():
                    print("Matplotlib not available - plot skipped")
                
                # Create a dummy plt object
                class DummyPlt:
                    def show(self): custom_show()
                    def figure(self, *args, **kwargs): return self
                    def bar(self, *args, **kwargs): return self
                    def title(self, *args, **kwargs): return self
                    def xlabel(self, *args, **kwargs): return self
                    def ylabel(self, *args, **kwargs): return self
                    def xticks(self, *args, **kwargs): return self
                    def grid(self, *args, **kwargs): return self
                    def close(self, *args, **kwargs): return self
                    def clf(self, *args, **kwargs): return self
                
                plt = DummyPlt()
                
            # Fix for Pyodide pandas compatibility issues
            import pandas as pd
            import numpy as np
            
            # Ensure proper pandas configuration for Pyodide
            pd.set_option('display.max_columns', 20)
            pd.set_option('display.max_rows', 100)
            pd.set_option('display.width', None)
            pd.set_option('display.max_colwidth', 50)
          `);
        
        // Execute the user's code with intelligent error handling
        try {
          result = pyodide.runPython(code);
        } catch (execError) {
          console.warn('Code execution failed, attempting automatic fixes:', execError);
          
          // Try to diagnose and fix common issues
          const errorMessage = String(execError);
          let fixedCode = code;
          
          // Fix 1: Missing imports
          if (errorMessage.includes('not defined') || errorMessage.includes('NameError')) {
            fixedCode = `
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
try:
    from scipy import stats
except ImportError:
    print("Note: scipy not available")

${code}
            `;
          }
          
          // Fix 2: Variable not found - try to find alternative variables
          else if (errorMessage.includes('KeyError') || errorMessage.includes('not in index')) {
            fixedCode = `
try:
    ${code}
except KeyError as e:
    print(f"Variable not found: {e}")
    print("Available columns:", df.columns.tolist())
    print("Let me try to find similar variables...")
    
    # Try to find education variables
    edu_cols = [col for col in df.columns if 'EDUC' in col.upper()]
    if edu_cols:
        print("Found education variables:", edu_cols)
    
    # Try to find healthcare/opinion variables  
    health_cols = [col for col in df.columns if any(term in col.upper() for term in ['HEALTH', 'CARE', 'MEDICAL', 'OPINION'])]
    if health_cols:
        print("Found potential healthcare/opinion variables:", health_cols)
    
    print("\\nBasic dataset info:")
    print("Shape:", df.shape)
    print("First few rows:")
    print(df.head())
            `;
          }
          
          // Fix 3: Plotting issues
          else if (errorMessage.includes('plot') || errorMessage.includes('matplotlib')) {
            fixedCode = code.replace('plt.show()', `
try:
    plt.show()
except Exception as plot_error:
    print(f"Plotting error: {plot_error}")
    print("Continuing without plot...")
            `);
          }
          
          // Fix 4: Data type issues
          else if (errorMessage.includes('dtype') || errorMessage.includes('astype')) {
            fixedCode = `
try:
    ${code}
except Exception as dtype_error:
    print(f"Data type error: {dtype_error}")
    print("Trying with basic data exploration instead...")
    print("Dataset info:")
    print(df.info())
    print("\\nDescriptive statistics:")
    print(df.describe())
            `;
          }
          
          // General fallback
          else {
            fixedCode = `
try:
    ${code}
except Exception as e:
    print(f"Execution error: {str(e)}")
    print("\\nLet me try a simpler approach...")
    print("Dataset shape:", df.shape)
    print("Available columns:", df.columns.tolist())
    print("\\nFirst few rows:")
    print(df.head())
    print("\\nBasic statistics:")
    try:
        print(df.describe())
    except:
        print("Could not generate basic statistics")
            `;
          }
          
          try {
            console.log('Attempting to run fixed code...');
            result = pyodide.runPython(fixedCode);
          } catch (finalError) {
            console.error('Local fixes failed, trying AI-powered fix:', finalError);
            
            // Try AI-powered code fix as last resort
            try {
              const fixResponse = await fetch('/api/python-analysis/fix-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  originalCode: code,
                  errorMessage: String(finalError),
                  dataSchema: {
                    columns: currentDataset.columns,
                    types: currentDataset.dtypes,
                    sampleData: currentDataset.sampleData
                  }
                })
              });
              
              if (fixResponse.ok) {
                const fixResult = await fixResponse.json();
                console.log('AI suggested fix:', fixResult.fixedCode);
                result = pyodide.runPython(fixResult.fixedCode);
              } else {
                throw new Error('AI fix failed');
              }
            } catch (aiFinalError) {
              console.error('AI fix also failed:', aiFinalError);
              result = pyodide.runPython(`
print("=== ANALYSIS ERROR ===")
print("I tried multiple approaches but couldn't fix the error automatically.")
print("Original error: ${String(execError).replace(/'/g, "\\'")}")
print("\\nBasic dataset info:")
print("Shape:", df.shape)
print("Columns available:", len(df.columns))
print("\\nSuggestion: Try a simpler question or check if the variables exist in your data.")
              `);
            }
          }
        }
        
        // Get captured output and plots
        stdout = pyodide.runPython(`
          output = mystdout.getvalue()
          sys.stdout = old_stdout
          output
        `);
        
        plots = pyodide.runPython(`plot_data`).toJs();
        
        // Restore matplotlib
        pyodide.runPython(`
          if has_matplotlib and 'original_show' in globals():
              plt.show = original_show
              plt.close('all')
        `);
        
      } catch (execError) {
        // Restore stdout and matplotlib in case of error
        pyodide.runPython(`
          sys.stdout = old_stdout if 'old_stdout' in globals() else sys.stdout
          if has_matplotlib and 'original_show' in globals():
              plt.show = original_show
              plt.close('all')
        `);
        throw execError;
      }

      const newResults: AnalysisResult[] = [];

      // Add text output if any
      if (stdout && stdout.trim()) {
        newResults.push({
          type: 'text',
          content: stdout.trim(),
          timestamp: new Date()
        });
      }

      // Add result if it's not None and different from stdout
      if (result !== undefined && result !== null && String(result).trim() !== stdout.trim()) {
        newResults.push({
          type: 'text',
          content: String(result),
          timestamp: new Date()
        });
      }

      // Add plots if any were generated
      plots.forEach((plotData, index) => {
        newResults.push({
          type: 'image',
          content: plotData,
          timestamp: new Date()
        });
      });

      setExecutionState(prev => ({
        ...prev,
        results: [...prev.results, ...newResults],
        isExecuting: false
      }));

      // Return the new results for immediate use
      return newResults;

    } catch (error) {
      console.error('Code execution error:', error);
      const errorResult = {
        type: 'error' as const,
        content: String(error),
        timestamp: new Date()
      };
      
      setExecutionState(prev => ({
        ...prev,
        results: [...prev.results, errorResult],
        isExecuting: false,
        error: String(error)
      }));

      // Return the error as a result
      return [errorResult];
    }
  }, [currentDataset]);

  const addAnalysis = useCallback((entry: AnalysisEntry) => {
    setAnalysisHistory(prev => [entry, ...prev]);
  }, []);

  const clearResults = useCallback(() => {
    setExecutionState(prev => ({
      ...prev,
      results: [],
      error: null
    }));
  }, []);

  const applyCodebook = useCallback((mappings: any[], coverage: any) => {
    if (!currentDataset) return;

    setCurrentDataset(prev => ({
      ...prev!,
      codebookMappings: mappings,
      codebookCoverage: coverage
    }));

    console.log('Codebook applied:', { mappings, coverage });
  }, [currentDataset]);

  const getCodebookContext = useCallback(() => {
    if (!currentDataset?.codebookMappings?.length) return '';

    const source = currentDataset.autoCodebookApplied 
      ? `auto-detected ${currentDataset.autoCodebookApplied.standardName} standard`
      : 'uploaded codebook';
    
    const contextLines = [
      `CODEBOOK INFORMATION (from ${source}):`,
      'The following variables have associated question text and value labels:',
      ''
    ];

    currentDataset.codebookMappings.forEach(mapping => {
      contextLines.push(`Variable: ${mapping.variableName}`);
      if (mapping.questionText) {
        contextLines.push(`  Question: ${mapping.questionText}`);
      }
      if (mapping.valueLabels && Object.keys(mapping.valueLabels).length > 0) {
        contextLines.push('  Value Labels:');
        Object.entries(mapping.valueLabels).forEach(([code, label]: [string, any]) => {
          contextLines.push(`    ${code} = ${label}`);
        });
      }
      if (mapping.description) {
        contextLines.push(`  Description: ${mapping.description}`);
      }
      contextLines.push('');
    });

    contextLines.push('IMPORTANT: When analyzing these variables, use meaningful interpretations based on the value labels. For example, instead of showing "1, 2, 3", show "Male, Female, Other" for gender variables.');

    return contextLines.join('\n');
  }, [currentDataset]);

  return {
    currentDataset,
    analysisHistory,
    executionState,
    loadDataset,
    executeCode,
    addAnalysis,
    applyCodebook,
    getCodebookContext,
    clearResults
  };
} 