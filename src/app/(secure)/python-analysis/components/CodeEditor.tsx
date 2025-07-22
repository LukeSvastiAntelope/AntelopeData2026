'use client';

import { useState, useEffect } from 'react';
import { Play, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeEditorProps {
  code: string;
  generatedExplanation?: string;
  onCodeChange: (code: string) => void;
  onExecute: (code: string) => Promise<void>;
  disabled?: boolean;
}

export function CodeEditor({ code, generatedExplanation, onCodeChange, onExecute, disabled }: CodeEditorProps) {
  const [localCode, setLocalCode] = useState(code || '# Write your Python code here\ndf.head()');
  const [isExecuting, setIsExecuting] = useState(false);

  // Update local code when prop changes (from AI generation)
  useEffect(() => {
    if (code && code !== localCode) {
      setLocalCode(code);
    }
  }, [code]);

  const handleExecute = async () => {
    if (!localCode.trim() || disabled) return;
    
    try {
      setIsExecuting(true);
      onCodeChange(localCode);
      await onExecute(localCode);
    } catch (error) {
      console.error('Execution error:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localCode);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const handleReset = () => {
    const defaultCode = '# Write your Python code here\ndf.head()';
    setLocalCode(defaultCode);
    onCodeChange(defaultCode);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newCode = localCode.substring(0, start) + '    ' + localCode.substring(end);
      setLocalCode(newCode);

      // Set cursor position after the inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }, 0);
    }

    // Handle Ctrl+Enter for execution
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-medium">Python Code</h3>
          {generatedExplanation && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
              AI Generated
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Press Ctrl+Enter to run
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={disabled}
          >
            <Copy className="w-3 h-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={disabled}
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
          
          <Button
            onClick={handleExecute}
            disabled={disabled || !localCode.trim() || isExecuting}
            size="sm"
          >
            {isExecuting ? (
              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            {isExecuting ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="relative">
        <textarea
          value={localCode}
          onChange={(e) => setLocalCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="# Write your Python code here
# The dataset is available as 'df'
df.head()"
          className="w-full h-40 p-4 font-mono text-sm bg-background border-0 resize-none focus:outline-none focus:ring-0"
          disabled={disabled}
        />
        
        {/* Line numbers */}
        <div className="absolute left-2 top-4 text-xs text-muted-foreground pointer-events-none select-none">
          {localCode.split('\n').map((_, index) => (
            <div key={index} className="h-5 leading-5">
              {index + 1}
            </div>
          ))}
        </div>
      </div>

      {/* AI Explanation */}
      {generatedExplanation && (
        <div className="px-4 py-2 bg-primary/5 border-t">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">AI Explanation:</span> {generatedExplanation}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 bg-muted/20 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {localCode.split('\n').length} lines
          </span>
          <span>
            Python via Pyodide
          </span>
        </div>
      </div>
    </div>
  );
} 