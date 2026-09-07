'use client';

import { AnalysisResult } from '../hooks/useAnalysisContext';
import { Terminal, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface ResultsPanelProps {
  results: AnalysisResult[];
  isExecuting: boolean;
  error: string | null;
}

export function ResultsPanel({ results, isExecuting, error }: ResultsPanelProps) {
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  const renderResult = (result: AnalysisResult, index: number) => {
    switch (result.type) {
      case 'text':
        return (
          <div key={index} className="bg-background border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Terminal className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Output</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(result.timestamp)}
              </span>
            </div>
            <pre className="text-sm font-mono whitespace-pre-wrap overflow-x-auto">
              {result.content}
            </pre>
          </div>
        );

      case 'table':
        return (
          <div key={index} className="bg-background border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Terminal className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Table</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(result.timestamp)}
              </span>
            </div>
            <div className="overflow-auto max-h-64">
              <div className="text-sm font-mono whitespace-pre-wrap">
                {result.content}
              </div>
            </div>
          </div>
        );

      case 'image':
        return (
          <div key={index} className="bg-background border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Terminal className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Image</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(result.timestamp)}
              </span>
            </div>
            <img 
              src={result.content} 
              alt="Analysis result" 
              className="max-w-full h-auto rounded"
            />
          </div>
        );

      case 'error':
        return (
          <div key={index} className="bg-destructive/10 border border-destructive/20 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span className="text-xs text-destructive">Error</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(result.timestamp)}
              </span>
            </div>
            <pre className="text-sm font-mono text-destructive whitespace-pre-wrap overflow-x-auto">
              {result.content}
            </pre>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4" />
          <h3 className="text-sm font-medium">Results</h3>
          {isExecuting && (
            <div className="flex items-center space-x-2">
              <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-xs text-muted-foreground">Executing...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
          {results.length > 0 && (
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {results.length === 0 && !isExecuting && !error ? (
          <div className="text-center py-8 text-muted-foreground">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No results yet</p>
            <p className="text-xs">Run some Python code to see the output</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {results.map((result, index) => renderResult(result, index))}
            
            {isExecuting && (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  <span className="text-sm">Running Python code...</span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 bg-destructive/10 border border-destructive/20 rounded p-3">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-3 h-3 text-destructive" />
              <span className="text-xs text-destructive font-medium">Execution Error</span>
            </div>
            <pre className="text-sm font-mono text-destructive whitespace-pre-wrap">
              {error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 