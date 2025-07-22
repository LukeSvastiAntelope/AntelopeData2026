'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useCodebookProcessor } from '../hooks/useCodebookProcessor';

interface CodebookUploadProps {
  dataColumns: string[];
  onCodebookProcessed: (mappings: any[], coverage: any) => void;
  onError: (error: string) => void;
}

export function CodebookUpload({ dataColumns, onCodebookProcessed, onError }: CodebookUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const { 
    isProcessing, 
    processingError, 
    processCodebook 
  } = useCodebookProcessor();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (isValidCodebookFile(file)) {
        setSelectedFile(file);
      } else {
        onError('Please upload a valid codebook file (.xlsx, .xls, or .csv)');
      }
    }
  }, [onError]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (isValidCodebookFile(file)) {
        setSelectedFile(file);
      } else {
        onError('Please upload a valid codebook file (.xlsx, .xls, or .csv)');
      }
    }
  }, [onError]);

  const isValidCodebookFile = (file: File): boolean => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    return validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  };

  const handleProcessCodebook = async () => {
    if (!selectedFile || !dataColumns.length) return;

    try {
      const result = await processCodebook(selectedFile, dataColumns);
      
      if (result.success) {
        onCodebookProcessed(result.mappings, result.coverage);
      } else {
        onError(result.errors.join('; '));
      }
    } catch (error) {
      onError(`Failed to process codebook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const resetFile = () => {
    setSelectedFile(null);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Codebook Upload
        </CardTitle>
        <CardDescription>
          Upload a codebook file to add question text and value labels to your data analysis.
          Supports Excel (.xlsx, .xls) and CSV files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedFile ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-sm text-gray-600">
              Drag and drop your codebook file here, or{' '}
              <label className="text-blue-600 hover:text-blue-500 cursor-pointer">
                browse to upload
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Supports .xlsx, .xls, and .csv files
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={resetFile}>
                Remove
              </Button>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleProcessCodebook}
                disabled={isProcessing || !dataColumns.length}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Process Codebook
                  </>
                )}
              </Button>
            </div>

            {!dataColumns.length && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please upload your data file first before processing the codebook.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {processingError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{processingError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
} 