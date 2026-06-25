import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Upload, Send, BarChart3, X, Newspaper, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Survey } from '../types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  showSurveyDropdown: boolean;
  setShowSurveyDropdown: (show: boolean) => void;
  surveys: Survey[];
  selectedSurveyId: number | null;
  onInlineSurveySelect: (surveyId: number) => void;
  onSelectNewsCopilot: () => void;
  onUploadClick: () => void;
  containerRef?: React.RefObject<HTMLElement>;
  isNewsMode?: boolean;
  deepResearch?: boolean;
  onToggleDeepResearch?: () => void;
}

export function ChatInput({
  input,
  setInput,
  onSend,
  onKeyDown,
  isLoading,
  showSurveyDropdown,
  setShowSurveyDropdown,
  surveys,
  selectedSurveyId,
  onInlineSurveySelect,
  onSelectNewsCopilot,
  onUploadClick,
  containerRef,
  isNewsMode,
  deepResearch,
  onToggleDeepResearch
}: ChatInputProps) {
  return (
    <div className="w-full z-40 px-4 pt-2 pb-3 bg-card flex-shrink-0">
      {isNewsMode && onToggleDeepResearch && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDeepResearch}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              deepResearch
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50"
            )}
            title="Deep Research: break the topic into sub-questions, search multiple sources, and synthesize a cited report"
          >
            <Microscope className="h-3.5 w-3.5" />
            Deep Research{deepResearch ? ' · ON' : ''}
          </button>
          {deepResearch && (
            <span className="text-[11px] text-muted-foreground">Multi-source web research with citations — takes a bit longer.</span>
          )}
        </div>
      )}
      <div className="relative">
        <div className="relative">
          <Textarea
            className={cn("min-h-[80px] pr-12 resize-none shadow-lg border", isNewsMode ? "pl-4" : "pl-12")}
            placeholder={isNewsMode ? (deepResearch ? "Research a topic in depth — e.g. 'NJ-07 race dynamics and key issues'…" : "Ask about district/state news…") : "Ask the cohort…"}
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={onKeyDown}
            disabled={isLoading}
            rows={2}
          />
          
          {/* Left side buttons - Plus and Upload - positioned inside textarea (hidden in news mode) */}
          {!isNewsMode && (
            <div className="absolute left-2 bottom-2 flex gap-1">
              {/* Plus button for survey selection */}
              <div className="relative">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => setShowSurveyDropdown(!showSurveyDropdown)}
                  title="Select context"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                
                {/* Survey dropdown */}
                {showSurveyDropdown && (
                  <div className="absolute bottom-full left-0 mb-2 w-80 bg-popover border border-border rounded-md shadow-lg z-50" data-survey-dropdown>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">Pick Context</h4>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setShowSurveyDropdown(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div
                        className="mb-2 flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-muted border border-border/60"
                        onClick={() => {
                          onSelectNewsCopilot();
                          setShowSurveyDropdown(false);
                        }}
                      >
                        <Newspaper className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">general/news</div>
                          <div className="text-[11px] text-muted-foreground">News, public records, and cross-source analysis</div>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {surveys.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No surveys available
                          </div>
                        ) : (
                          surveys.map((survey) => (
                            <div
                              key={survey.id}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-muted",
                                selectedSurveyId === survey.id && "bg-muted"
                              )}
                              onClick={() => onInlineSurveySelect(survey.id)}
                            >
                              <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {survey.title}
                                </div>
                              </div>
                              {selectedSurveyId === survey.id && (
                                <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0" />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Upload button */}
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8" 
                onClick={onUploadClick}
                title="Upload survey file"
              >
                <Upload className="h-4 w-4"/>
              </Button>
            </div>
          )}
          
          {/* Send button - positioned inside textarea on the right */}
          <div className="absolute right-2 bottom-2">
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8" 
              onClick={onSend} 
              disabled={isLoading}
            >
              <Send className="h-4 w-4"/>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 