'use client';

import { useState, useCallback, useRef } from 'react';

// Agent State Types
interface AnalysisStep {
  id: string;
  type: 'explore' | 'analyze' | 'visualize' | 'synthesize' | 'verify';
  description: string;
  code?: string;
  dependencies?: string[];
  priority: number;
  estimated_complexity: 'low' | 'medium' | 'high';
}

interface ExecutedStep {
  id: string;
  step: AnalysisStep;
  code: string;
  output: string;
  success: boolean;
  error?: string;
  timestamp: Date;
  execution_time_ms: number;
  insights: string[];
}

interface AnalysisContext {
  question: string;
  dataset_info: {
    columns: string[];
    types: Record<string, string>;
    sample_data: any[];
    codebook_mappings?: Record<string, any>;
  };
  discovered_variables: Record<string, string[]>;
  key_findings: string[];
  current_hypothesis: string[];
  gaps_identified: string[];
}

interface AgentState {
  session_id: string;
  status: 'planning' | 'executing' | 'error_recovery' | 'synthesizing' | 'completed' | 'paused';
  current_step_index: number;
  planned_steps: AnalysisStep[];
  executed_steps: ExecutedStep[];
  context: AnalysisContext;
  error_count: number;
  start_time: Date;
  completion_criteria: {
    min_steps_completed: number;
    required_insights: number;
    max_execution_time_minutes: number;
  };
}

export function useAnalysisAgent() {
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize new analysis session
  const initializeAgent = useCallback(async (
    question: string,
    datasetInfo: AnalysisContext['dataset_info']
  ) => {
    const sessionId = `session-${Date.now()}`;
    
    const initialState: AgentState = {
      session_id: sessionId,
      status: 'planning',
      current_step_index: 0,
      planned_steps: [],
      executed_steps: [],
      context: {
        question,
        dataset_info: datasetInfo,
        discovered_variables: {},
        key_findings: [],
        current_hypothesis: [],
        gaps_identified: []
      },
      error_count: 0,
      start_time: new Date(),
      completion_criteria: {
        min_steps_completed: 5,
        required_insights: 3,
        max_execution_time_minutes: 10
      }
    };

    setAgentState(initialState);
    return { sessionId, initialState };
  }, []);

  // Dynamic Step Planner
  const planAnalysisSteps = useCallback(async (state: AgentState): Promise<AnalysisStep[]> => {
    try {
      const response = await fetch('/api/python-analysis/plan-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.context.question,
          datasetInfo: state.context.dataset_info,
          executedSteps: state.executed_steps,
          currentFindings: state.context.key_findings
        })
      });

      if (!response.ok) {
        throw new Error(`Planning failed: ${response.status}`);
      }

      const result = await response.json();
      return result.steps || [];
    } catch (error) {
      console.error('Step planning failed:', error);
      // Fallback to basic plan
      return [
        {
          id: 'explore-1',
          type: 'explore',
          description: 'Explore dataset and identify relevant variables',
          priority: 1,
          estimated_complexity: 'low'
        },
        {
          id: 'analyze-1', 
          type: 'analyze',
          description: 'Perform statistical analysis on key variables',
          dependencies: ['explore-1'],
          priority: 2,
          estimated_complexity: 'medium'
        },
        {
          id: 'visualize-1',
          type: 'visualize', 
          description: 'Create visualizations of key relationships',
          dependencies: ['analyze-1'],
          priority: 3,
          estimated_complexity: 'medium'
        }
      ];
    }
  }, []);

  // Generate code for specific step
  const generateStepCode = useCallback(async (
    step: AnalysisStep,
    context: AnalysisContext,
    executedSteps: ExecutedStep[]
  ): Promise<string> => {
    const response = await fetch('/api/python-analysis/generate-step-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step,
        context,
        executedSteps: executedSteps.slice(-3) // Last 3 steps for context
      })
    });

    if (!response.ok) {
      throw new Error(`Code generation failed: ${response.status}`);
    }

    const result = await response.json();
    return result.code;
  }, []);

  // Execute code with error handling and recovery
  const executeStepCode = useCallback(async (
    code: string,
    pyodide: any,
    context: AnalysisContext,
    maxRetries: number = 3
  ): Promise<{ output: string; success: boolean; error?: string; plots?: string[] }> => {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure dataset is loaded into Python as 'df'
        if (!pyodide.globals.get('df') && context.dataset_info) {
          console.log('Loading dataset into Pyodide for autonomous analysis...');
          
          // Validate data structure before creating DataFrame
          const columns = context.dataset_info.columns;
          const data = context.dataset_info.sample_data;
          
          console.log(`Columns (${columns.length}):`, columns);
          console.log(`Data sample (first row ${data[0]?.length} cols):`, data[0]);
          
          // Use the data as-is without truncating - let pandas handle any inconsistencies
          const cleanedData = data;
          
          console.log('Data preserved without truncation:', {
            originalRows: data.length,
            preservedRows: cleanedData.length,
            sampleRow: cleanedData[0]
          });
          
          const dataJson = JSON.stringify({
            columns: columns,
            data: cleanedData
          });
          
          // Pass the dataset to Python as a global string instead of inlining
          // it into the source. The previous approach escaped apostrophes as \\'
          // which is INVALID JSON, so any survey text containing an apostrophe
          // (very common) broke json.loads and the whole analysis failed.
          pyodide.globals.set('__antelope_data_json__', dataJson);
          pyodide.runPython(`
            import json
            import pandas as pd
            import numpy as np

            # Load the dataset with validation
            data_dict = json.loads(__antelope_data_json__)
            
            print(f"🔍 DEBUGGING: Creating DataFrame with {len(data_dict['columns'])} columns and {len(data_dict['data'])} rows")
            print(f"🔍 DEBUGGING: Columns: {data_dict['columns']}")
            if len(data_dict['data']) > 0:
                print(f"🔍 DEBUGGING: First row length: {len(data_dict['data'][0])}")
                print(f"🔍 DEBUGGING: First row sample: {data_dict['data'][0][:10]}")
                print(f"🔍 DEBUGGING: Last few columns of first row: {data_dict['data'][0][-5:]}")
            
            # Handle column mismatch dynamically
            actual_columns = data_dict['columns']
            data_rows = data_dict['data']
            
            if len(data_rows) > 0:
                max_cols = max(len(row) for row in data_rows)
                if max_cols > len(actual_columns):
                    # Extend column names for extra columns
                    for i in range(len(actual_columns), max_cols):
                        actual_columns.append(f'extra_col_{i}')
                    print(f"🔍 DEBUGGING: Extended columns to {len(actual_columns)} to match data width")
            
            df = pd.DataFrame(data_rows, columns=actual_columns)
            
            print(f"🔍 DEBUGGING: DataFrame created successfully: {df.shape}")
            print(f"🔍 DEBUGGING: Column names: {list(df.columns)}")
            print(f"🔍 DEBUGGING: Data types: {df.dtypes}")
            print(f"🔍 DEBUGGING: Non-null counts: {df.count()}")
            
            # Show first few rows to understand the data
            print(f"🔍 DEBUGGING: First 3 rows:")
            print(df.head(3))
            
            # Try to convert numeric columns
            for col in df.columns:
              try:
                df[col] = pd.to_numeric(df[col])
              except:
                pass
                
            print(f"🔍 DEBUGGING: After numeric conversion - Dataset: {df.shape} - {len(df.columns)} columns")
            print(f"🔍 DEBUGGING: Final non-null counts: {df.count()}")
          `);
        }

        // Set up output capture and matplotlib backend for plot capture
        pyodide.runPython(`
          import sys
          from io import StringIO
          import base64
          from io import BytesIO
          import ast

          # Capture any print statements
          old_stdout = sys.stdout
          sys.stdout = mystdout = StringIO()
          
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
        `);

        // Execute the user's code and capture output
        let textOutput = '';
        let plots: string[] = [];
        
        try {
          // **NEW**: Logic to capture the last expression's value
          const result = pyodide.runPython(`
exec_result = None
try:
    # Parse the code to find the last expression
    parsed_code = ast.parse(${JSON.stringify(code)})
    if parsed_code.body and isinstance(parsed_code.body[-1], ast.Expr):
        # Last node is an expression, split the code
        last_expr_node = parsed_code.body.pop()
        
        # Compile and execute the code without the last expression
        exec_body = ast.unparse(parsed_code)
        exec(compile(exec_body, '<string>', 'exec'), globals())
        
        # Evaluate the last expression separately to capture its result
        last_expr = ast.unparse(last_expr_node)
        exec_result = eval(last_expr, globals())
    else:
        # No final expression, just execute the whole block
        exec(compile(${JSON.stringify(code)}, '<string>', 'exec'), globals())

except Exception as e:
    print(f"Execution error: {e}")
    raise e

# Return the result for processing in JS
exec_result
          `);
          
          // Get captured stdout
          textOutput = pyodide.runPython(`
            output = mystdout.getvalue()
            sys.stdout = old_stdout
            output
          `);
          
          // Prepend the exec_result if it exists
          if (result !== undefined && result !== null) {
            const resultStr = String(result);
            // Avoid duplicating output that's already in stdout
            if (!textOutput.includes(resultStr)) {
              textOutput = resultStr + '\n' + textOutput;
            }
          }

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

        // Combine text output and plots information
        let combinedOutput = textOutput.trim() || 'Code executed successfully (no text output)';
        if (plots.length > 0) {
          combinedOutput += `\n\n📊 Generated ${plots.length} visualization(s)`;
        }

        return { 
          output: combinedOutput, 
          success: true, 
          plots: plots // Add plots to return value
        };
      } catch (error) {
        lastError = String(error);
        console.warn(`Execution attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Try to fix the code
          try {
            const fixResponse = await fetch('/api/python-analysis/fix-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalCode: code,
                errorMessage: lastError,
                dataSchema: {
                  columns: context.dataset_info?.columns || [],
                  types: context.dataset_info?.types || {},
                  sampleData: context.dataset_info?.sample_data || []
                }
              })
            });

            if (fixResponse.ok) {
              const fixResult = await fixResponse.json();
              code = fixResult.fixedCode;
              console.log(`Attempting fix ${attempt}:`, code.substring(0, 100) + '...');
            }
          } catch (fixError) {
            console.warn('Auto-fix failed:', fixError);
          }
        }
      }
    }

    return { output: '', success: false, error: lastError };
  }, []);

  // Extract insights from execution results
  const extractInsights = useCallback(async (
    step: AnalysisStep,
    output: string,
    context: AnalysisContext
  ): Promise<string[]> => {
    try {
      const response = await fetch('/api/python-analysis/extract-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          output,
          context: {
            question: context.question,
            key_findings: context.key_findings,
            dataset_info: {
              codebook_mappings: context.dataset_info.codebook_mappings
            }
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.insights || [];
      }
    } catch (error) {
      console.warn('Insight extraction failed:', error);
    }

    // Fallback: simple insight extraction
    const insights: string[] = [];
    if (output.includes('correlation') || output.includes('relationship')) {
      insights.push('Relationships detected in the data');
    }
    if (output.includes('significant')) {
      insights.push('Statistically significant findings identified');
    }
    return insights;
  }, []);

  // Check if analysis is complete
  const isAnalysisComplete = useCallback((state: AgentState): boolean => {
    const criteria = state.completion_criteria;
    const executedCount = state.executed_steps.filter(s => s.success).length;
    const insightsCount = state.context.key_findings.length;
    const elapsed = Date.now() - state.start_time.getTime();
    const elapsedMinutes = elapsed / (1000 * 60);

    return (
      executedCount >= criteria.min_steps_completed &&
      insightsCount >= criteria.required_insights
    ) || elapsedMinutes >= criteria.max_execution_time_minutes;
  }, []);

  // Generate final synthesis
  const generateFinalSynthesis = useCallback(async (state: AgentState) => {
    try {
      console.log('🔬 Generating final synthesis with:', {
        question: state.context.question,
        stepsCount: state.executed_steps.length,
        findingsCount: state.context.key_findings.length
      });

      const response = await fetch('/api/python-analysis/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.context.question,
          executedSteps: state.executed_steps,
          keyFindings: state.context.key_findings
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Synthesis API response:', result);
        
        if (result.synthesis) {
          state.context.key_findings.push(`FINAL SYNTHESIS: ${result.synthesis}`);
          console.log('✅ Synthesis added to key findings');
        } else {
          console.warn('⚠️ Synthesis API returned empty synthesis');
          throw new Error('Empty synthesis received');
        }
      } else {
        console.error('❌ Synthesis API failed:', response.status, response.statusText);
        throw new Error(`Synthesis API failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Synthesis generation failed:', error);
      throw error; // Re-throw to be caught by the calling code
    }
  }, []);

  // Main autonomous execution loop
  const runAutonomousAnalysis = useCallback(async (
    pyodide: any,
    onUpdate: (state: AgentState) => void,
    initialState?: AgentState
  ) => {
    const stateToUse = initialState || agentState;
    console.log('🚀 runAutonomousAnalysis called', { agentState: !!stateToUse, isRunning });
    if (!stateToUse || isRunning) {
      console.warn('❌ Cannot run autonomous analysis:', { agentState: !!stateToUse, isRunning });
      return;
    }

    setIsRunning(true);
    const currentState = { ...stateToUse };
    console.log('✅ Starting autonomous analysis with state:', currentState.session_id);

    try {
      // Phase 1: Planning
      if (currentState.planned_steps.length === 0) {
        console.log('📋 Phase 1: Planning analysis steps');
        currentState.status = 'planning';
        onUpdate(currentState);
        
        const plannedSteps = await planAnalysisSteps(currentState);
        currentState.planned_steps = plannedSteps;
        console.log(`✅ Agent planned ${plannedSteps.length} analysis steps:`, plannedSteps.map(s => s.description));
        onUpdate(currentState);
      }

      // Phase 2: Autonomous Execution Loop
      console.log('🔄 Phase 2: Starting execution loop');
      while (!isAnalysisComplete(currentState) && currentState.status !== 'completed') {
        const currentStepIndex = currentState.current_step_index;
        console.log(`🔢 Processing step ${currentStepIndex + 1} of ${currentState.planned_steps.length}`);
        
        if (currentStepIndex >= currentState.planned_steps.length) {
          // Need more steps - replan
          console.log('📋 Need more steps, replanning...');
          const additionalSteps = await planAnalysisSteps(currentState);
          currentState.planned_steps.push(...additionalSteps);
        }

        const currentStep = currentState.planned_steps[currentStepIndex];
        if (!currentStep) {
          console.warn('❌ No current step found, breaking');
          break;
        }

        currentState.status = 'executing';
        onUpdate(currentState);

        console.log(`⚡ Executing step ${currentStepIndex + 1}: ${currentStep.description}`);

        try {
          // Generate code for this step
          const stepCode = await generateStepCode(
            currentStep,
            currentState.context,
            currentState.executed_steps
          );

          // Execute the code
          const startTime = Date.now();
          const executionResult = await executeStepCode(stepCode, pyodide, currentState.context);
          const executionTime = Date.now() - startTime;

          // Extract insights
          const insights = await extractInsights(
            currentStep,
            executionResult.output,
            currentState.context
          );

          // Record the executed step
          const executedStep: ExecutedStep = {
            id: `exec-${Date.now()}`,
            step: currentStep,
            code: stepCode,
            output: executionResult.output,
            success: executionResult.success,
            error: executionResult.error,
            timestamp: new Date(),
            execution_time_ms: executionTime,
            insights,
            ...(executionResult.plots && { plots: executionResult.plots }) // Add plots if they exist
          };

          currentState.executed_steps.push(executedStep);
          
          // Add insights with deduplication
          const existingFindings = new Set(currentState.context.key_findings);
          const newInsights = insights.filter(insight => !existingFindings.has(insight));
          currentState.context.key_findings.push(...newInsights);
          
          if (executionResult.success) {
            currentState.current_step_index++;
            currentState.error_count = 0; // Reset error count on success
          } else {
            currentState.error_count++;
            if (currentState.error_count >= 3) {
              // Too many errors, pause for intervention
              currentState.status = 'error_recovery';
              break;
            }
            // Try alternative approach or skip step
            currentState.current_step_index++;
          }

          onUpdate(currentState);

          // Small delay to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (stepError) {
          console.error(`Step execution failed:`, stepError);
          currentState.error_count++;
          currentState.current_step_index++;
          
          if (currentState.error_count >= 3) {
            currentState.status = 'error_recovery';
            break;
          }
        }
      }

      // Phase 3: Synthesis
      if (isAnalysisComplete(currentState)) {
        console.log('🔬 Phase 3: Starting synthesis...');
        currentState.status = 'synthesizing';
        onUpdate(currentState);
        
        // Generate final synthesis
        try {
          await generateFinalSynthesis(currentState);
          console.log('✅ Synthesis completed');
        } catch (synthError) {
          console.error('❌ Synthesis failed:', synthError);
          // Add a basic synthesis as fallback
          currentState.context.key_findings.push('FINAL SYNTHESIS: Analysis completed with insights extracted from the executed steps.');
        }
        
        currentState.status = 'completed';
        console.log('🎯 Analysis status set to completed');
      }

    } catch (error) {
      console.error('Autonomous analysis failed:', error);
      currentState.status = 'error_recovery';
    } finally {
      setAgentState(currentState);
      setIsRunning(false);
      onUpdate(currentState);
    }
  }, [agentState, isRunning, planAnalysisSteps, generateStepCode, executeStepCode, extractInsights, isAnalysisComplete, generateFinalSynthesis]);

  // Control functions
  const pauseAgent = useCallback(() => {
    if (agentState) {
      setAgentState(prev => prev ? { ...prev, status: 'paused' } : null);
    }
    setIsRunning(false);
  }, [agentState]);

  const resumeAgent = useCallback((pyodide: any, onUpdate: (state: AgentState) => void) => {
    if (agentState && agentState.status === 'paused') {
      setAgentState(prev => prev ? { ...prev, status: 'executing' } : null);
      runAutonomousAnalysis(pyodide, onUpdate);
    }
  }, [agentState, runAutonomousAnalysis]);

  return {
    agentState,
    isRunning,
    initializeAgent,
    runAutonomousAnalysis,
    pauseAgent,
    resumeAgent
  };
} 