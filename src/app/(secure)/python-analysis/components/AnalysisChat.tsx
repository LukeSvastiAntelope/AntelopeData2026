'use client';

import { useState } from 'react';
import { Send, MessageSquare, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dataset, AnalysisEntry } from '../hooks/useAnalysisContext';

interface AnalysisChatProps {
  onQuerySubmit: (query: string) => Promise<void>;
  onCodeGenerated: (code: string, explanation: string) => void;
  dataset: Dataset | null;
  /** Prior steps + outputs for continuity (was hard-coded []). */
  analysisHistory?: AnalysisEntry[];
  /** Formatted buildAnalyticsContext block when survey-backed. */
  analyticsContextPrompt?: string | null;
  disabled?: boolean;
}

interface CodeGenerationResponse {
  code: string;
  explanation: string;
  suggestedFollowups: string[];
  analysisType: string;
  model: string;
}

export function AnalysisChat({
  onQuerySubmit,
  onCodeGenerated,
  dataset,
  analysisHistory = [],
  analyticsContextPrompt,
  disabled,
}: AnalysisChatProps) {
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

      const historyPayload = (analysisHistory || []).slice(-8).map((h) => ({
        code: h.code || '',
        output: (h.results || [])
          .map((r) => (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)))
          .join('\n')
          .slice(0, 2000),
        timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : String(h.timestamp || ''),
        question: h.query,
      }));

      const sampleRows =
        dataset.sampleData?.length &&
        dataset.sampleData[0] &&
        !Array.isArray(dataset.sampleData[0])
          ? dataset.sampleData.slice(0, 15)
          : (dataset.data || []).slice(0, 15).map((row: any) => {
              if (row && !Array.isArray(row) && typeof row === 'object') return row;
              const obj: Record<string, unknown> = {};
              (dataset.columns || []).forEach((c, i) => {
                obj[c] = Array.isArray(row) ? row[i] : undefined;
              });
              return obj;
            });

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
            sampleData: sampleRows,
            rowCount: dataset.shape?.[0] ?? dataset.data?.length,
            codebookMappings: dataset.codebookMappings,
          },
          analysisHistory: historyPayload,
          analyticsContextPrompt: analyticsContextPrompt || undefined,
          analysisType: 'auto',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate code');
      }

      const result: CodeGenerationResponse = await response.json();
      setLastResponse(result);
      
      onCodeGenerated(result.code, result.explanation);
      
      console.log(`[AI-CHAT] Generated code using ${result.model} for ${result.analysisType} analysis (history=${historyPayload.length})`);

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

    await generateCode(userQuery);
    await onQuerySubmit(userQuery);
  };

  const handleExampleClick = (example: string) => {
    if (!disabled && dataset) {
      setQuery(example);
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-center space-x-2 px-4 py-2 border-b bg-muted/30">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium">AI Assistant</h3>
        {lastResponse && (
          <span className="text-xs text-muted-foreground">
            via {lastResponse.model}
          </span>
        )}
      </div>

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
            {error && (
              <div className="flex items-center space-x-2 text-destructive text-sm bg-destructive/10 p-2 rounded">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex space-x-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about your data..."
                disabled={disabled || isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={!query.trim() || disabled || isLoading}>
                <Send className="w-4 h-4" />
              </Button>
            </form>

            {analysisHistory.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Continuity: {analysisHistory.length} prior step(s) included in the prompt
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {[
                'Show basic demographics',
                'Find correlations',
                'Cross-tab by party',
              ].map((ex) => (
                <Button
                  key={ex}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => handleExampleClick(ex)}
                  disabled={disabled || isLoading}
                >
                  {ex}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
