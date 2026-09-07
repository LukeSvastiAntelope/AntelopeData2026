"use client";

import { useCallback } from 'react';
import type { ChatMessage, Conversation } from '../types';

type SaveArgs = {
  currentConversationType: 'chat' | 'news' | 'code';
  selectedSurveyId: number | null;
  selectedCohortId: number | null;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
};

type ConversationContextSnapshot = {
  type: 'chat' | 'news' | 'code';
  surveyId: number | null;
  cohortId: number | null;
};

function createSaveTraceId() {
  return `convsave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSaveConversation({
  currentConversationType,
  selectedSurveyId,
  selectedCohortId,
  setConversations,
}: SaveArgs) {
  const saveConversation = useCallback(async (
    conversationId: string,
    messages: ChatMessage[],
    title?: string,
    contextOverride?: ConversationContextSnapshot
  ) => {
    const requestedContext: ConversationContextSnapshot = contextOverride || {
      type: currentConversationType,
      surveyId: selectedSurveyId,
      cohortId: selectedCohortId,
    };
    const effectiveContext: ConversationContextSnapshot =
      requestedContext.type === 'news'
        ? { type: 'news', surveyId: null, cohortId: null }
        : requestedContext;

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

    // Safety net: code conversations can carry many base64 chart images and
    // grow into multiple MB. If the payload is too large to reliably persist,
    // drop the heavy image data (keeping all text/code/steps/insights) so the
    // conversation history still saves instead of silently failing.
    const MAX_SAVE_BYTES = 2_500_000;
    let safeMessages: any[] = processedMessages;
    try {
      if (JSON.stringify(processedMessages).length > MAX_SAVE_BYTES) {
        safeMessages = processedMessages.map((m: any) =>
          typeof m.content === 'string' && m.content.startsWith('data:image/')
            ? { ...m, content: '📊 [Chart generated — re-run the analysis to view it]', metadata: { ...(m.metadata || {}), recipeType: 'plot', plotStripped: true } }
            : m
        );
      }
    } catch { /* fall back to original */ }

    const firstUser = safeMessages.find((m: any) => m.role === 'user' || m.type === 'user');
    const finalTitle = title || (firstUser ? firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '...' : '') : 'New Conversation');

    try {
      const traceId = createSaveTraceId();
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-trace-id': traceId,
        },
        body: JSON.stringify({
          id: conversationId,
          title: finalTitle,
          messages: processedMessages,
          surveyId: effectiveContext.surveyId,
          cohortId: effectiveContext.cohortId,
          type: effectiveContext.type,
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
          surveyId: effectiveContext.surveyId,
          cohortId: effectiveContext.cohortId,
          type: effectiveContext.type,
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



