import { useState, useCallback } from 'react';
import { Conversation, ChatMessage } from '../types';
import { toast } from '@/components/ui/sonner';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      setConversationsLoading(true);
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        // Only store metadata without large messages to reduce memory footprint
        const metaOnly = (data.conversations || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          messages: [], // lazy-loaded on selection
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          surveyId: c.surveyId,
          cohortId: c.cohortId,
          type: c.type,
          userId: c.userId,
        }));
        setConversations(metaOnly);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const saveConversation = useCallback(async (
    messages: ChatMessage[], 
    surveyId: number | null, 
    cohortId: number | null
  ) => {
    if (messages.length === 0) return;

    try {
      const conversationData = {
        id: currentConversationId,
        messages,
        surveyId,
        cohortId
      };

      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversationData)
      });

      if (response.ok) {
        const result = await response.json();
        if (!currentConversationId) {
          // backend returns { conversation }, normalize id here
          setCurrentConversationId(result.conversation?.id || result.conversationId);
        }
        await fetchConversations();
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
      toast.error('Failed to save conversation');
    }
  }, [currentConversationId, fetchConversations]);

  const loadConversation = useCallback(async (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`);
      if (res.ok) {
        const data = await res.json();
        return data.conversation?.messages || [];
      }
    } catch (e) {
      console.error('Failed to load conversation messages', e);
    }
    return [];
  }, []);

  const startNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    return [];
  }, []);

  return {
    conversations,
    currentConversationId,
    conversationsLoading,
    fetchConversations,
    saveConversation,
    loadConversation,
    startNewConversation,
    setCurrentConversationId
  };
} 