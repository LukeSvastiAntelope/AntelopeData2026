'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFileUploaded: (file: File) => void;
  disabled?: boolean;
}

export function FileUpload({ onFileUploaded, disabled }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      handleFileProcess(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFileProcess(file);
    }
  }, []);

  const handleFileProcess = async (file: File) => {
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // Validate file type
      const validTypes = ['.csv', '.xlsx', '.xls'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        throw new Error('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      }

      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error('File size must be less than 50MB');
      }

      // Simulate progress for UX (actual parsing happens instantly for most files)
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 500));

      clearInterval(progressInterval);
      setProgress(100);

      // Call the parent handler
      onFileUploaded(file);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
      setError(errorMessage);
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1000); // Reset progress after delay
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Dataset
        </CardTitle>
        <CardDescription>
          Upload a CSV or Excel file to start analyzing your data with Python and AI assistance.
          Supports files up to 50MB with automatic column detection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
              : disabled 
              ? 'border-gray-200 bg-gray-50 dark:bg-gray-900/20 cursor-not-allowed' 
              : 'border-gray-300 hover:border-gray-400 cursor-pointer'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && document.getElementById('file-input')?.click()}
        >
          {uploading ? (
            <div className="space-y-4">
              <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Processing file...</p>
                <Progress value={progress} className="w-full max-w-xs mx-auto" />
                <p className="text-xs text-gray-500">{progress}% complete</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-sm text-gray-600">
                {disabled 
                  ? 'Python environment is loading...'
                  : dragActive 
                  ? 'Drop your file here'
                  : 'Drag and drop your file here, or click to browse'
                }
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Supports CSV, Excel (.xlsx, .xls) • Max 50MB
              </p>
            </>
          )}
        </div>

        <input
          id="file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Tips:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>First row should contain column headers</li>
            <li>Survey data? Upload a codebook for better analysis</li>
            <li>Large files are automatically chunked for processing</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 