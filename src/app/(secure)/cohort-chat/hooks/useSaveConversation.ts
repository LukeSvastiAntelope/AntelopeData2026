"use client";

import { useCallback } from 'react';
import type { ChatMessage, Conversation } from '../types';

type SaveArgs = {
  currentConversationType: 'chat' | 'code';
  selectedSurveyId: number | null;
  selectedCohortId: number | null;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
};

export function useSaveConversation({
  currentConversationType,
  selectedSurveyId,
  selectedCohortId,
  setConversations,
}: SaveArgs) {
  const saveConversation = useCallback(async (conversationId: string, messages: ChatMessage[], title?: string) => {
    const processedMessages = messages.map((m) => {
      const meta = (m as any).metadata || {};
      const content = m.content;
      const messageType = (m as any).type;

      if (messageType === 'code') {
        return { ...m, content, metadata: { ...meta, recipeType: 'code' } } as any;
      }
      if (messageType === 'result') {
        if (typeof content === 'string' && content.startsWith('data:image/')) {
          return { ...m, content, metadata: { ...meta, recipeType: 'plot' } } as any;
        }
        if (typeof content === 'string' && content.length > 5000) {
          const summary = content.substring(0, 500) + '...';
          return {
            ...m,
            content: `📊 **Analysis Output Summary:**\n${summary}\n\n🔄 [Full output will be regenerated on load]`,
            metadata: { ...meta, recipeType: 'large_output', needsRegeneration: true },
          } as any;
        }
        return { ...m, content, metadata: meta } as any;
      }
      if (messageType === 'assistant' && typeof content === 'string' && content.includes('Step ')) {
        return { ...m, content, metadata: { ...meta, recipeType: 'step_summary' } } as any;
      }
      return { ...m, content, metadata: meta } as any;
    });

    const firstUser = processedMessages.find((m: any) => m.role === 'user' || m.type === 'user');
    const finalTitle = title || (firstUser ? firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '...' : '') : 'New Conversation');

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          title: finalTitle,
          messages: processedMessages,
          surveyId: selectedSurveyId,
          cohortId: selectedCohortId,
          type: currentConversationType,
        }),
      });

      if (!response.ok) {
        const txt = await response.text();
        console.error('❌ SAVE FAILED:', response.status, response.statusText, txt);
      }

      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conversationId);
        const updated: Conversation = {
          id: conversationId,
          title: finalTitle,
          messages: processedMessages as any,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          surveyId: selectedSurveyId,
          cohortId: selectedCohortId,
          type: currentConversationType,
        };
        if (existing) {
          return prev.map((c) => (c.id === conversationId ? updated : c));
        }
        return [updated, ...prev];
      });
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }, [currentConversationType, selectedCohortId, selectedSurveyId, setConversations]);

  return { saveConversation };
}



