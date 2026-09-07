'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Plus, FileText, FileSpreadsheet } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
  onFileUpload?: (file: File, type: 'dataset' | 'codebook') => void;
}

export function ChatInput({
  input,
  setInput,
  onSend,
  onKeyDown,
  isLoading,
  placeholder = "Ask me anything...",
  disabled = false,
  onFileUpload
}: ChatInputProps) {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUploadMenu(false);
      }
    };

    if (showUploadMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUploadMenu]);

  const handleFileSelect = (type: 'dataset' | 'codebook') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'dataset' ? '.csv,.tsv,.txt,.xlsx,.xls,.docx' : '.xlsx,.xls,.csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onFileUpload) {
        onFileUpload(file, type);
      }
    };
    input.click();
    setShowUploadMenu(false);
  };

  return (
    <div className="sticky bottom-0 p-4 pt-0 bg-card">
      <div className="relative">
        <div className="relative">
          <Textarea 
            className="min-h-[80px] pl-4 pr-16 resize-none" 
            placeholder={placeholder}
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={onKeyDown}
            disabled={isLoading || disabled}
            rows={2}
          />
          
          {/* Plus button - positioned inside textarea left */}
          <div className="absolute left-2 bottom-2">
            <div className="relative" ref={menuRef}>
              <Button
                onClick={() => setShowUploadMenu(!showUploadMenu)}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-muted"
                disabled={disabled}
              >
                <Plus className="h-4 w-4" />
              </Button>
              
              {/* Upload menu */}
              {showUploadMenu && (
                <div className="absolute bottom-10 left-0 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[200px]">
                  <div className="p-1">
                    <button
                      onClick={() => handleFileSelect('dataset')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted rounded"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      <div>
                        <div className="font-medium">Upload Dataset</div>
                        <div className="text-xs text-muted-foreground">CSV, Excel files</div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleFileSelect('codebook')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted rounded"
                    >
                      <FileText className="h-4 w-4 text-blue-600" />
                      <div>
                        <div className="font-medium">Upload Codebook</div>
                        <div className="text-xs text-muted-foreground">Question mappings</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Send button - positioned inside textarea */}
          <div className="absolute right-2 bottom-2">
            <Button
              onClick={onSend}
              disabled={!input.trim() || isLoading || disabled}
              size="sm"
              className="h-8 w-8 p-0"
            >
              {isLoading ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Helper text */}
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            {disabled ? 'Upload data first to start analyzing' : 'Press Enter to send, Shift+Enter for new line'}
          </span>
          <span>
            {input.length}/1000
          </span>
        </div>
      </div>
    </div>
  );
} 