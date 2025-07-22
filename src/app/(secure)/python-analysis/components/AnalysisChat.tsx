'use client';

import { useState } from 'react';
import { Send, MessageSquare, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dataset } from '../hooks/useAnalysisContext';

interface AnalysisChatProps {
  onQuerySubmit: (query: string) => Promise<void>;
  onCodeGenerated: (code: string, explanation: string) => void;
  dataset: Dataset | null;
  disabled?: boolean;
}

interface CodeGenerationResponse {
  code: string;
  explanation: string;
  suggestedFollowups: string[];
  analysisType: string;
  model: string;
}

export function AnalysisChat({ onQuerySubmit, onCodeGenerated, dataset, disabled }: AnalysisChatProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<CodeGenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateCode = async (userQuery: string) => {
    if (!dataset) {
      setError('No dataset loaded');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/python-analysis/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userQuery,
          dataSchema: {
            columns: dataset.columns,
            types: dataset.dtypes,
            sampleData: dataset.sampleData
          },
          analysisHistory: [], // TODO: Add from context
          analysisType: 'auto'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate code');
      }

      const result: CodeGenerationResponse = await response.json();
      setLastResponse(result);
      
      // Pass generated code to parent
      onCodeGenerated(result.code, result.explanation);
      
      console.log(`[AI-CHAT] Generated code using ${result.model} for ${result.analysisType} analysis`);

    } catch (error) {
      console.error('Code generation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || disabled || isLoading || !dataset) return;

    const userQuery = query.trim();
    setQuery('');

    // Generate code using AI
    await generateCode(userQuery);
    
    // Also call the original callback
    await onQuerySubmit(userQuery);
  };

  const handleExampleClick = (example: string) => {
    if (!disabled && dataset) {
      setQuery(example);
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center space-x-2 px-4 py-2 border-b bg-muted/30">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium">AI Assistant</h3>
        {lastResponse && (
          <span className="text-xs text-muted-foreground">
            via {lastResponse.model}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {!dataset ? (
          <div className="text-center py-6 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Upload a dataset to start AI analysis</p>
            <p className="text-xs">
              I&apos;ll help you generate Python code from natural language
            </p>
          </div>
        ) : (
          <>
            {/* Last Response Info */}
            {lastResponse && (
              <div className="bg-primary/5 border border-primary/20 rounded p-3 text-sm">
                <div className="flex items-center space-x-2 mb-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="font-medium">Generated {lastResponse.analysisType} analysis</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {lastResponse.explanation}
                </p>
                {lastResponse.suggestedFollowups.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Try next:</span>
                    {lastResponse.suggestedFollowups.slice(0, 2).map((followup, index) => (
                      <button
                        key={index}
                        onClick={() => handleExampleClick(followup)}
                        className="block text-xs p-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors text-left w-full"
                        disabled={disabled}
                      >
                        {followup}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-3 h-3 text-destructive" />
                  <span className="text-destructive">{error}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex space-x-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={dataset ? "Ask me to analyze your data..." : "Upload data first..."}
              disabled={disabled || !dataset}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={disabled || !query.trim() || isLoading || !dataset}
              size="sm"
            >
              {isLoading ? (
                <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            {dataset ? 
              `AI will generate Python code for ${dataset.shape[0]} rows × ${dataset.shape[1]} columns` :
              "Upload a CSV file to enable AI assistance"
            }
          </div>
        </form>

        {/* Quick Examples */}
        {dataset && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Quick Examples:</h4>
            <div className="grid grid-cols-1 gap-1">
              {[
                "Show me basic statistics for all columns",
                "Create a correlation matrix heatmap",
                "Find columns with missing values",
                "Plot the distribution of the first numeric column"
              ].map((example, index) => (
                <button
                  key={index}
                  onClick={() => handleExampleClick(example)}
                  className="text-left text-xs p-2 rounded border bg-muted/30 hover:bg-muted/50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled || isLoading}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 