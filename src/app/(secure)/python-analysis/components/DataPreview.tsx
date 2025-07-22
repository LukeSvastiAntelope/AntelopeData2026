'use client';

import { Dataset } from '../hooks/useAnalysisContext';
import { Database, Hash, Type, Calendar } from 'lucide-react';

interface DataPreviewProps {
  dataset: Dataset;
}

export function DataPreview({ dataset }: DataPreviewProps) {
  const getTypeIcon = (dtype: string) => {
    if (dtype.includes('int') || dtype.includes('float')) {
      return <Hash className="w-3 h-3" />;
    }
    if (dtype.includes('datetime')) {
      return <Calendar className="w-3 h-3" />;
    }
    return <Type className="w-3 h-3" />;
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === 'string' && value.length > 20) {
      return value.substring(0, 20) + '...';
    }
    return String(value);
  };

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center space-x-2">
        <Database className="w-4 h-4 text-primary" />
        <h3 className="font-medium">Dataset Overview</h3>
      </div>

      <div className="space-y-3">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span>
            <div className="font-mono text-xs truncate" title={dataset.name}>
              {dataset.name}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Shape:</span>
            <div className="font-mono text-xs">
              {dataset.shape[0].toLocaleString()} × {dataset.shape[1]}
            </div>
          </div>
        </div>

        {/* Columns */}
        <div>
          <h4 className="text-sm font-medium mb-2">Columns ({dataset.columns.length})</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {dataset.columns.map((column, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1 hover:bg-muted/50 rounded">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  {getTypeIcon(dataset.dtypes[column])}
                  <span className="font-mono truncate" title={column}>
                    {column}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs ml-2">
                  {dataset.dtypes[column]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sample Data */}
        <div>
          <h4 className="text-sm font-medium mb-2">Sample Data</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {dataset.columns.slice(0, 4).map((column, idx) => (
                    <th key={idx} className="text-left p-1 font-medium truncate max-w-20" title={column}>
                      {column}
                    </th>
                  ))}
                  {dataset.columns.length > 4 && (
                    <th className="text-left p-1 text-muted-foreground">
                      +{dataset.columns.length - 4} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {dataset.sampleData.slice(0, 3).map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/50">
                    {row.slice(0, 4).map((cell, cellIdx) => (
                      <td key={cellIdx} className="p-1 truncate max-w-20" title={String(cell)}>
                        {formatValue(cell)}
                      </td>
                    ))}
                    {row.length > 4 && (
                      <td className="p-1 text-muted-foreground">...</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataset.shape[0] > 3 && (
            <p className="text-xs text-muted-foreground mt-1">
              ... and {(dataset.shape[0] - 3).toLocaleString()} more rows
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 