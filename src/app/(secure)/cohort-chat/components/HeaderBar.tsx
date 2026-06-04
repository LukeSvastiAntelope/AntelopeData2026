"use client";

import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { PanelLeft, PanelRight, Plus, Newspaper } from 'lucide-react';
import { BreadcrumbNavigation } from './breadcrumb-navigation';
import type { Conversation } from '../types';

type Survey = { id: number; title: string };

type Props = {
  surveys: Survey[];
  selectedSurveyId: number | null;
  onSurveyChange: (id: number | null) => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  onConversationSwitch: (id: string) => void;
  onNewConversation: () => void;
  conversationsLoading: boolean;
  currentConversationType: 'chat' | 'news' | 'code';
  isCollapsed: boolean;
  onToggleRightPanel: () => void;
};

export default function HeaderBar(props: Props) {
  const {
    surveys,
    selectedSurveyId,
    onSurveyChange,
    conversations,
    currentConversationId,
    onConversationSwitch,
    onNewConversation,
    conversationsLoading,
    currentConversationType,
    isCollapsed,
    onToggleRightPanel,
  } = props;

  return (
    <div className="flex items-center px-6 py-2 min-w-0">
      <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground flex-shrink-0" />
      <div className="h-4 border-l border-border mx-4 flex-shrink-0" />
      <div className="flex-1 min-w-0 mr-4">
        {currentConversationType === 'news' ? (
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium">general/news</span>
            <span className="text-xs text-muted-foreground">General questions &amp; public data</span>
          </div>
        ) : (
          <BreadcrumbNavigation
            surveys={surveys}
            selectedSurveyId={selectedSurveyId}
            onSurveyChange={onSurveyChange}
            conversations={conversations}
            currentConversationId={currentConversationId}
            onConversationSwitch={onConversationSwitch}
            onNewConversation={onNewConversation}
            conversationsLoading={conversationsLoading}
            currentConversationType={currentConversationType}
          />
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={onNewConversation}
          title="New Conversation"
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">New Conversation</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-0.5 h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={onToggleRightPanel}
        >
          {isCollapsed ? <PanelRight /> : <PanelLeft />}
          <span className="sr-only">Toggle Right Panel</span>
        </Button>
      </div>
    </div>
  );
}


