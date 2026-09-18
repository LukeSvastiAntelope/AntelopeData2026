'use client';

import { useMemo, useState } from 'react';
import { AnalysisResult } from '../hooks/useAnalysisContext';
import { Terminal, AlertCircle, Download, FileStack, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  exportAllAsSeparatePdfs,
  exportCombinedReportPdf,
  exportFigureToPdf,
  type ExportableFigure,
} from '../utils/export-pdf';

interface ResultsPanelProps {
  results: AnalysisResult[];
  isExecuting: boolean;
  error: string | null;
  /** Optional overview/insights text for the combined report PDF */
  overviewText?: string;
}

function figureLabel(result: AnalysisResult, figureIndex: number): string {
  if (result.label?.trim()) return result.label.trim();
  return `figure-${figureIndex + 1}`;
}

export function ResultsPanel({
  results,
  isExecuting,
  error,
  overviewText,
}: ResultsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const figures: ExportableFigure[] = useMemo(() => {
    let figureIndex = 0;
    return results
      .filter((r) => r.type === 'image' && r.content)
      .map((r) => {
        const label = figureLabel(r, figureIndex);
        figureIndex += 1;
        return { pngBase64: r.content, label };
      });
  }, [results]);

  const overviewFromResults = useMemo(() => {
    if (overviewText?.trim()) return overviewText.trim();
    return results
      .filter((r) => r.type === 'text')
      .map((r) => r.content)
      .join('\n\n')
      .slice(0, 8000);
  }, [overviewText, results]);

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  const runExport = async (key: string, fn: () => Promise<void>) => {
    setExportError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  let imageOrdinal = -1;

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

      case 'image': {
        imageOrdinal += 1;
        const thisFigureIndex = imageOrdinal;
        const label = figureLabel(result, thisFigureIndex);
        return (
          <div key={index} className="bg-background border rounded p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(result.timestamp)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy !== null}
                  onClick={() =>
                    void runExport(`fig-${thisFigureIndex}`, () =>
                      exportFigureToPdf(result.content, label)
                    )
                  }
                >
                  <Download className="w-3 h-3" />
                  {busy === `fig-${thisFigureIndex}` ? 'Exporting…' : 'Export PDF'}
                </Button>
              </div>
            </div>
            <img
              src={result.content}
              alt={label}
              className="max-w-full h-auto rounded"
            />
          </div>
        );
      }

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
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 gap-2 flex-wrap">
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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {results.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {results.length} result{results.length !== 1 ? 's' : ''}
              {figures.length > 0 ? ` · ${figures.length} figure${figures.length !== 1 ? 's' : ''}` : ''}
            </span>
          )}
          {figures.length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy !== null}
                onClick={() =>
                  void runExport('all-separate', () => exportAllAsSeparatePdfs(figures))
                }
              >
                <FileStack className="w-3 h-3" />
                {busy === 'all-separate' ? 'Zipping…' : 'Export all as separate PDFs'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy !== null}
                onClick={() =>
                  void runExport('report', () =>
                    exportCombinedReportPdf(figures, overviewFromResults)
                  )
                }
              >
                <FileText className="w-3 h-3" />
                {busy === 'report' ? 'Building…' : 'Export report PDF'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {exportError && (
          <div className="mb-3 text-xs text-destructive border border-destructive/30 rounded px-2 py-1.5">
            {exportError}
          </div>
        )}

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
