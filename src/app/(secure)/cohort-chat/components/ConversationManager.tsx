"use client";
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Folder, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  surveys: { id: number; title: string }[];
  expandedSurveys: Set<number>;
  currentConversationId: string | null;
  onToggleSurvey: (surveyId: number) => void;
  onSwitchConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
}

export default function ConversationManager({
  conversations,
  surveys,
  expandedSurveys,
  currentConversationId,
  onToggleSurvey,
  onSwitchConversation,
  onNewConversation,
  onDeleteConversation,
}: Props) {
  const groups: { [key: string]: Conversation[] } = {};
  conversations.forEach(c => {
    const key = c.surveyId ? `survey-${c.surveyId}` : 'no-survey';
    (groups[key] ||= []).push(c);
  });

  const surveyGroups = Object.keys(groups).filter(k => k !== 'no-survey');
  const noSurveyConversations = groups['no-survey'] || [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Conversations</div>
        <Button variant="ghost" size="icon" onClick={onNewConversation} title="New Conversation">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-1">
        {surveyGroups.map(groupKey => {
          const surveyId = parseInt(groupKey.replace('survey-', ''));
          const survey = surveys.find(s => s.id === surveyId);
          const groupConversations = groups[groupKey];
          const isExpanded = expandedSurveys.has(surveyId);
          return (
            <div key={groupKey} className="space-y-1">
              <div
                className="flex items-center justify-between px-2 py-0.5 cursor-pointer hover:bg-muted/50 rounded-md"
                onClick={() => onToggleSurvey(surveyId)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="text-xs font-medium">{survey?.title || `Survey ${surveyId}`}</span>
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                  {groupConversations.length}
                </span>
              </div>
              {isExpanded && (
                <div className="ml-6 space-y-1">
                  {groupConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-0 cursor-pointer transition-colors group rounded-md",
                        currentConversationId === conversation.id
                          ? "text-primary font-semibold"
                          : "text-foreground hover:text-primary hover:bg-muted/50"
                      )}
                      onClick={() => onSwitchConversation(conversation.id)}
                    >
                      <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs truncate flex-1">{conversation.title || 'New Conversation'}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conversation.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {noSurveyConversations.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-0.5">
              <Folder className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">General Conversations</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                {noSurveyConversations.length}
              </span>
            </div>
            <div className="ml-6 space-y-1">
              {noSurveyConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-0 cursor-pointer transition-colors group rounded-md",
                    currentConversationId === conversation.id
                      ? "text-primary font-semibold"
                      : "text-foreground hover:text-primary hover:bg-muted/50"
                  )}
                  onClick={() => onSwitchConversation(conversation.id)}
                >
                  <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{conversation.title || 'New Conversation'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conversation.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


