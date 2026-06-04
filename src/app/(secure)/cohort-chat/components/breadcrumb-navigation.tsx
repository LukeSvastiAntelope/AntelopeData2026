import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Conversation } from '../types';

interface BreadcrumbNavigationProps {
  // Survey state
  surveys: { id: number; title: string }[];
  selectedSurveyId: number | null;
  onSurveyChange: (surveyId: number | null) => void;
  
  // Conversation state
  conversations: Conversation[];
  currentConversationId: string | null;
  onConversationSwitch: (conversationId: string) => void;
  onNewConversation: () => void;
  
  // Loading states
  conversationsLoading: boolean;
  
  // UI state
  currentConversationType?: 'chat' | 'news' | 'code';
}

export function BreadcrumbNavigation({
  surveys,
  selectedSurveyId,
  onSurveyChange,
  conversations,
  currentConversationId,
  onConversationSwitch,
  onNewConversation,
  conversationsLoading,
  currentConversationType = 'chat'
}: BreadcrumbNavigationProps) {
  // Get current survey data
  const currentSurvey = surveys.find(s => s.id === selectedSurveyId);
  
  // Get current conversation data
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  
  // Filter conversations for current survey
  const surveyConversations = selectedSurveyId 
    ? conversations.filter(c => c.surveyId === selectedSurveyId)
    : conversations;
  
  // Generate conversation title with type indicator (no truncation for main breadcrumb)
  const getConversationDisplayTitle = (conversation: Conversation) => {
    const baseTitle = conversation.title || 'New Conversation';
    const typeIcon =
      conversation.type === 'code' ? '🧪 ' :
      conversation.type === 'news' ? '📰 ' :
      '💬 ';
    return typeIcon + baseTitle;
  };
  
  // Generate conversation title with truncation for dropdown items
  const getConversationDropdownTitle = (conversation: Conversation) => {
    const title = conversation.title || 'New Conversation';
    const typeIcon =
      conversation.type === 'code' ? '🧪 ' :
      conversation.type === 'news' ? '📰 ' :
      '💬 ';
    const fullTitle = typeIcon + title;
    return fullTitle.length > 30 ? `${fullTitle.substring(0, 30)}...` : fullTitle;
  };
  
  // Generate survey title (no truncation for main breadcrumb)
  const getSurveyDisplayTitle = (survey: { id: number; title: string }) => {
    return survey.title;
  };
  
  // Generate survey title with truncation for dropdown items
  const getSurveyDropdownTitle = (survey: { id: number; title: string }) => {
    return survey.title.length > 40 ? `${survey.title.substring(0, 40)}...` : survey.title;
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Survey Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap">
            {currentSurvey ? getSurveyDisplayTitle(currentSurvey) : 'Select Survey'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[300px]">
          {surveys.length === 0 ? (
            <DropdownMenuItem disabled>
              No surveys available
            </DropdownMenuItem>
          ) : (
            surveys.map((survey) => (
              <DropdownMenuItem
                key={survey.id}
                onClick={() => onSurveyChange(survey.id)}
                className={cn(
                  "cursor-pointer",
                  selectedSurveyId === survey.id && "bg-muted"
                )}
              >
                <div className="flex flex-col gap-1">
                  <div className="font-medium">{survey.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Survey ID: {survey.id}
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Separator */}
      {currentSurvey && (
        <>
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          
          {/* Conversation Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                                  <button className="text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap">
                      {currentConversation ? getConversationDisplayTitle(currentConversation) :
                       (currentConversationType === 'code'
                         ? '🧪 Legacy Code Conversation'
                         : currentConversationType === 'news'
                           ? '📰 New general/news'
                           : '💬 New Cohort Chat')}
                    </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[280px]">
              {/* New Conversation Option */}
              <DropdownMenuItem
                onClick={onNewConversation}
                className="cursor-pointer flex items-center gap-2"
              >
                <Plus className="h-3 w-3" />
                <span className="font-medium">New Conversation</span>
              </DropdownMenuItem>
              
              {/* Separator if there are existing conversations */}
              {surveyConversations.length > 0 && <DropdownMenuSeparator />}
              
              {/* Loading state */}
              {conversationsLoading ? (
                <DropdownMenuItem disabled>
                  Loading conversations...
                </DropdownMenuItem>
              ) : (
                /* Existing Conversations */
                surveyConversations.length > 0 ? (
                  surveyConversations
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 10) // Limit to 10 most recent
                    .map((conversation) => (
                      <DropdownMenuItem
                        key={conversation.id}
                        onClick={() => onConversationSwitch(conversation.id)}
                        className={cn(
                          "cursor-pointer",
                          currentConversationId === conversation.id && "bg-muted"
                        )}
                      >
                        <div className="flex flex-col gap-1 w-full">
                          <div className="font-medium text-sm">
                            {getConversationDropdownTitle(conversation)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(conversation.createdAt).toLocaleDateString()} • {' '}
                            {conversation.messages?.length || 0} messages
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))
                ) : (
                  <DropdownMenuItem disabled>
                    No conversations yet
                  </DropdownMenuItem>
                )
              )}
              
              {/* Show "View All" if there are more than 10 conversations */}
              {surveyConversations.length > 10 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    View all conversations in sidebar →
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
} 