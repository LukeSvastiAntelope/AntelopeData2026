'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Code, Terminal, User, Bot, AlertCircle, CheckCircle, Clock, FileSpreadsheet, File, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useState } from 'react';

interface AnalysisMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'code' | 'result' | 'error';
  content: string;
  timestamp: Date | string;
  metadata?: {
    model?: string;
    analysisType?: string;
    executionTime?: number;
    code?: string;
    explanation?: string;
    fileName?: string;
    fileSize?: number;
    originalError?: string;
    collapsible?: boolean;
    previewLines?: number;
    quickActions?: Array<{
      text: string;
      action: string;
    }>;
    debug?: any;
    // Recipe-based regeneration properties
    recipeType?: 'code' | 'plot' | 'large_output' | 'step_summary';
    needsRegeneration?: boolean;
  };
}

interface ConversationViewProps {
  messages: AnalysisMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onQuickAction?: (action: string) => void;
}

export function ConversationView({ messages, isLoading, messagesEndRef, onQuickAction }: ConversationViewProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [regeneratingSteps, setRegeneratingSteps] = useState<Set<string>>(new Set());

  const toggleExpanded = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const handleRegenerateStep = async (messageId: string, codeContent: string) => {
    setRegeneratingSteps(prev => new Set([...prev, messageId]));
    
    try {
      // Find the previous code message that should be executed
      const messageIndex = messages.findIndex(m => m.id === messageId);
      let codeToExecute = codeContent;
      
      // If this is a result message, find the preceding code
      if (!codeToExecute) {
        for (let i = messageIndex - 1; i >= 0; i--) {
          if (messages[i].type === 'code') {
            codeToExecute = messages[i].content;
            break;
          }
        }
      }
      
      if (codeToExecute && onQuickAction) {
        // Trigger re-execution of the code
        onQuickAction(`execute: ${codeToExecute}`);
      }
    } catch (error) {
      console.error('Error regenerating step:', error);
    } finally {
      // Remove from regenerating set after a delay
      setTimeout(() => {
        setRegeneratingSteps(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
      }, 2000);
    }
  };

  const CollapsibleContent = ({ 
    content, 
    messageId, 
    previewLines = 3, 
    isCode = false 
  }: { 
    content: string; 
    messageId: string; 
    previewLines?: number; 
    isCode?: boolean;
  }) => {
    const lines = content.split('\n');
    const isExpanded = expandedMessages.has(messageId);
    const shouldCollapse = lines.length > previewLines;
    
    if (!shouldCollapse) {
      return (
        <pre className={cn(
          "text-sm font-mono whitespace-pre-wrap overflow-x-auto p-2 rounded border",
          isCode ? "bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700" : "bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700"
        )}>
          {content}
        </pre>
      );
    }

    const displayContent = isExpanded ? content : lines.slice(0, previewLines).join('\n');
    
    return (
      <div className="relative">
        {/* Simple header with copy and expand buttons */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Code className="h-3 w-3 text-gray-500" />
            <span className="text-xs text-gray-600">
              {isCode ? "Python" : "Output"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigator.clipboard.writeText(content)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded"
            >
              Copy
            </button>
            <button
              onClick={() => toggleExpanded(messageId)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded"
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  Show {lines.length - previewLines} more lines
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Clean code content without container */}
        <div className={cn(
          "text-sm font-mono rounded border overflow-x-auto conversation-message-content break-ultra-long",
          isCode 
            ? "bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700" 
            : "bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
        )}>
          {isCode ? (
            <div className="flex">
              {/* Line numbers column */}
              <div className="text-xs text-gray-400 select-none bg-gray-100 dark:bg-gray-800 px-2 py-3 border-r border-gray-200 dark:border-gray-700">
                {displayContent.split('\n').map((_, idx) => (
                  <div key={idx} className="text-right leading-5 h-5">
                    {idx + 1}
                  </div>
                ))}
              </div>
              {/* Code content column */}
              <div className="flex-1 p-3 break-ultra-long">
                {displayContent}
                {!isExpanded && lines.length > previewLines && (
                  <span className="text-gray-500">...</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 break-ultra-long">
              {displayContent}
              {!isExpanded && lines.length > previewLines && (
                <span className="text-gray-500">...</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMessage = (message: AnalysisMessage, index: number) => {
    const isUser = message.type === 'user';
    const isCode = message.type === 'code';
    const isError = message.type === 'error';
    const isResult = message.type === 'result';
    const isSystem = message.type === 'system';
    const isFileUpload = isUser && message.metadata?.fileName && !message.content.trim();

    return (
      <div
        key={message.id}
        className={cn(
          'flex gap-3 p-2 animate-in fade-in duration-500'
          // Removed flex-row-reverse - all messages now left-aligned
        )}
        style={{ 
          animationDelay: `${Math.min(index * 50, 500)}ms`,
          animationFillMode: 'both'
        }}
      >
        {/* Avatar */}
        <Avatar className={cn('h-8 w-8 shrink-0')}>
          <AvatarFallback className={cn(
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
            isSystem && 'bg-blue-100 dark:bg-blue-900',
            isError && 'bg-destructive text-destructive-foreground'
          )}>
            {isUser ? <User className="h-4 w-4" /> : 
             isCode ? <Code className="h-4 w-4" /> :
             isResult ? <Terminal className="h-4 w-4" /> :
             isError ? <AlertCircle className="h-4 w-4" /> :
             <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {/* File upload - no container, just the component */}
          {isFileUpload ? (
            <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm w-fit">
              <div className="flex-shrink-0">
                {message.metadata.fileName.endsWith('.csv') ? (
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                ) : (
                  <File className="h-4 w-4 text-blue-600" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {message.metadata.fileName}
                </div>
                <div className="text-xs text-gray-500">
                  {message.metadata.fileSize ? 
                    `${(message.metadata.fileSize / (1024 * 1024)).toFixed(2)} MB` : 
                    'Unknown size'
                  }
                </div>
              </div>
            </div>
          ) : (
            /* Regular message container */
            <div className={cn(
              'rounded-lg px-3 py-2 max-w-[85%] conversation-message-content',
              isUser && 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700',
              !isUser && 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
              isCode && 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
              isError && 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
              isResult && 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-900 dark:text-green-100'
            )}>
            {/* Message Header for special types */}
            {(isCode || isResult || message.metadata) && (
              <div className="flex items-center justify-between mb-1 text-xs opacity-70">
                <div className="flex items-center gap-2">
                  {isCode && <Code className="h-3 w-3" />}
                  {isResult && <Terminal className="h-3 w-3" />}
                  <span>
                    {isCode && `Generated Code (${message.metadata?.model})`}
                    {isResult && 'Execution Results'}
                    {!isCode && !isResult && message.type}
                  </span>
                </div>
                {message.metadata?.executionTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{message.metadata.executionTime}ms</span>
                  </div>
                )}
              </div>
            )}

            {/* Code Content */}
            {isCode ? (
              <div className="space-y-3">
                {message.metadata?.explanation && (
                  <div className="text-sm text-gray-300 mb-3">
                    {message.metadata.explanation}
                  </div>
                )}
                {message.metadata?.collapsible ? (
                  <CollapsibleContent 
                    content={message.content}
                    messageId={message.id}
                    previewLines={message.metadata.previewLines || 3}
                    isCode={true}
                  />
                ) : (
                  <pre className="text-sm font-mono break-ultra-long bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {message.content}
                  </pre>
                )}
              </div>
            ) : isResult ? (
              // Check if this needs regeneration (saved as recipe)
              message.metadata?.needsRegeneration ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <RefreshCw className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {message.metadata.recipeType === 'plot' ? 'Plot Available' : 'Full Output Available'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRegenerateStep(message.id, '')}
                      disabled={regeneratingSteps.has(message.id)}
                      className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-300 px-2 py-1 rounded border border-blue-300 dark:border-blue-600 disabled:opacity-50"
                    >
                      {regeneratingSteps.has(message.id) ? 'Regenerating...' : 'Show Full Result'}
                    </button>
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    {message.content}
                  </div>
                </div>
              ) : // Check if this is an image result (base64 data URL)
              message.content.startsWith('data:image/') ? (
                <div className="max-w-full">
                  <img 
                    src={message.content} 
                    alt="Analysis plot" 
                    className="max-w-full h-auto rounded border shadow-sm"
                    style={{ maxHeight: '400px', objectFit: 'contain' }}
                  />
                </div>
              ) : message.metadata?.collapsible ? (
                <CollapsibleContent 
                  content={message.content}
                  messageId={message.id}
                  previewLines={message.metadata.previewLines || 4}
                  isCode={false}
                />
              ) : (
                <pre className="text-sm font-mono break-ultra-long bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 p-2 rounded border border-green-200 dark:border-green-700">
                  {message.content}
                </pre>
              )
            ) : (
              <div>
                {/* Only show text content if it exists */}
                {message.content.trim() && (
                  <div className={cn(
                    'text-sm prose prose-sm max-w-none prose-p:py-0 prose-p:my-0.5 conversation-message-content',
                    isUser && 'text-gray-900',
                    isError && 'text-red-700 dark:text-red-300',
                    !isUser && !isError && 'text-gray-900'
                  )}>
                  <ReactMarkdown
                    components={{
                      code: ({ children, ...props }) => (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono break-all" {...props}>
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm font-mono whitespace-pre-wrap overflow-x-auto my-2 break-all">
                          {children}
                        </pre>
                      ),
                      p: ({ children }) => (
                        <p className="break-all overflow-wrap-anywhere">
                          {children}
                        </p>
                      )
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {message.type === 'error' && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">Analysis Error</h4>
                    <pre className="text-sm whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900/40 p-2 rounded border">
                      {message.content}
                    </pre>
                    {message.metadata?.originalError && (
                      <details className="mt-2">
                        <summary className="text-sm text-red-700 dark:text-red-300 cursor-pointer hover:text-red-900 dark:hover:text-red-100">
                          View Technical Details
                        </summary>
                        <pre className="text-xs mt-1 p-2 bg-red-100 dark:bg-red-900/40 rounded border font-mono whitespace-pre-wrap">
                          {message.metadata.originalError}
                        </pre>
                      </details>
                    )}
                    <div className="mt-2 text-sm">
                      <span className="text-red-700 dark:text-red-300">💡 Try: </span>
                      <span className="text-red-600 dark:text-red-400">Ask a simpler question or check if your variables exist in the data</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Debug Info */}
            {message.metadata?.debug && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  🔍 Debug Information
                </summary>
                <pre className="text-xs mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border font-mono whitespace-pre-wrap">
                  {JSON.stringify(message.metadata.debug, null, 2)}
                </pre>
              </details>
            )}

            {/* Quick Actions */}
            {message.metadata?.quickActions && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.metadata.quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => onQuickAction?.(action.action)}
                    className="px-3 py-1 text-sm bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full transition-colors"
                  >
                    {action.text}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div className={cn(
              'text-xs opacity-50 mt-2',
              isUser && 'text-gray-700'
            )}>
              {(() => {
                // Handle both Date objects and ISO strings
                const timestamp = message.timestamp instanceof Date 
                  ? message.timestamp 
                  : new Date(message.timestamp);
                return timestamp.toLocaleTimeString();
              })()}
            </div>
          </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ScrollArea className="flex-1 min-h-0" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="space-y-1">
        {messages.map((message, index) => renderMessage(message, index))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3 p-4">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-muted">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="rounded-lg px-4 py-3 bg-muted/50 max-w-[85%]">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
} 