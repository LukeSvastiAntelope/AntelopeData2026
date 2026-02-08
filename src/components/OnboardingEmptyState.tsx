import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  MessageCircle, 
  BarChart3, 
  Upload, 
  Sparkles, 
  Users, 
  ArrowRight,
  Play,
  FileText,
  PlusCircle,
  Database,
  Send,
  Plus,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingEmptyStateProps {
  onTryDemo: () => void;
  onCreateSurvey: () => void;
  onImportData: () => void;
  onPromptClick: (prompt: string) => void;
  dynamicPrompts: string[];
  selectedSurveyData: any;
  hasFeaturedSurvey: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  // Add props for survey selection and upload
  surveys?: Array<{id: number, title: string}>;
  selectedSurveyId?: number | null;
  onSurveySelect?: (surveyId: number) => void;
  onUploadClick?: () => void;
}

export default function OnboardingEmptyState({
  onTryDemo,
  onCreateSurvey,
  onImportData,
  onPromptClick,
  dynamicPrompts,
  selectedSurveyData,
  hasFeaturedSurvey,
  input,
  setInput,
  onSend,
  onKeyDown,
  isLoading,
  surveys = [],
  selectedSurveyId,
  onSurveySelect,
  onUploadClick
}: OnboardingEmptyStateProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showSurveyDropdown, setShowSurveyDropdown] = useState(false);

  // Click outside handler for survey dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSurveyDropdown) {
        const target = event.target as Element;
        if (!target.closest('[data-survey-dropdown]')) {
          setShowSurveyDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSurveyDropdown]);

  const pathways = [
    {
      id: 'demo',
      title: 'Try Demo Survey',
      description: 'Explore with real Pew Research data',
      icon: Play,
      color: 'bg-blue-500',
      action: onTryDemo,
      badge: 'Instant',
      disabled: !hasFeaturedSurvey,
      tooltip: !hasFeaturedSurvey ? 'Demo survey not available' : undefined
    },
    {
      id: 'create',
      title: 'Create New Survey',
      description: 'Build with our AI survey creator',
      icon: PlusCircle,
      color: 'bg-green-500',
      action: onCreateSurvey,
      badge: 'AI Powered'
    },
    {
      id: 'import',
      title: 'Import Existing Data',
      description: 'Upload CSV, Excel, or connect APIs',
      icon: Upload,
      color: 'bg-purple-500',
      action: onImportData,
      badge: 'Multiple Formats'
    }
  ];

  const features = [
    {
      icon: MessageCircle,
      title: 'Natural Language Chat',
      description: 'Ask questions in plain English and get instant insights'
    },
    {
      icon: Users,
      title: 'Voter Profiles',
      description: 'Create synthetic voter personas from real poll responses'
    },
    {
      icon: BarChart3,
      title: 'Smart Analytics',
      description: 'Automatic pattern detection and trend analysis'
    },
    {
      icon: Database,
      title: 'Data Integration',
      description: 'Connect multiple data sources for comprehensive insights'
    }
  ];

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Beta
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Welcome to Antelope Politico
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Turn your polls into campaign intelligence. Chat with your voter data, create synthetic voter profiles, and discover insights you never knew existed.
          </p>
        </div>

        {/* Three-Path Onboarding */}
        <div className="w-full max-w-4xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold mb-2">Choose Your Path</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pathways.map((pathway) => (
              <Card 
                key={pathway.id}
                className={cn(
                  "relative overflow-hidden transition-all duration-300 cursor-pointer group hover:shadow-lg",
                  hoveredCard === pathway.id && "scale-105 shadow-xl",
                  pathway.disabled && "opacity-50 cursor-not-allowed"
                )}
                onMouseEnter={() => !pathway.disabled && setHoveredCard(pathway.id)}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => !pathway.disabled && pathway.action()}
                title={pathway.tooltip}
              >
                <div className={cn("absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity", pathway.color)} />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={cn("p-2 rounded-lg", pathway.color)}>
                      <pathway.icon className="h-5 w-5 text-white" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {pathway.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{pathway.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {pathway.description}
                  </p>
                  <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
                    Get Started
                    <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="w-full max-w-4xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-2">What You Can Do</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="flex flex-col items-center text-center p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="p-2 rounded-full bg-primary/10 mb-3">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-medium mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center max-w-2xl">
          <p className="text-sm text-muted-foreground">
            Need help getting started? Check out our{' '}
            <a href="#" className="text-primary hover:underline">quick start guide</a>{' '}
            or{' '}
            <a href="#" className="text-primary hover:underline">watch the demo video</a>.
          </p>
        </div>
      </div>

      {/* Chat Input at Bottom */}
      <div className="sticky bottom-0 p-4 pt-0 bg-card">
        <div className="relative max-w-4xl mx-auto">
          <Textarea 
            className="min-h-[80px] pl-4 pr-4 resize-none" 
            placeholder="Ask the cohort…" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={onKeyDown}
            disabled={isLoading}
            rows={2}
          />
          
          {/* Left side buttons - Plus and Upload - positioned inside textarea */}
          <div className="absolute left-2 bottom-2 flex gap-1">
            {/* Plus button for survey selection */}
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setShowSurveyDropdown(!showSurveyDropdown)}
                title="Select survey"
              >
                <Plus className="h-4 w-4" />
              </Button>
              
              {/* Survey dropdown */}
              {showSurveyDropdown && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-popover border border-border rounded-md shadow-lg z-50" data-survey-dropdown>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">Select Survey</h4>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setShowSurveyDropdown(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
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
                            onClick={() => {
                              if (onSurveySelect) {
                                onSurveySelect(survey.id);
                              }
                              setShowSurveyDropdown(false);
                            }}
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