"use client";

import React, { useRef } from 'react';
import { MessageList, ChatInput } from './';
import type { ChatMessage } from '../types';

type ChatViewProps = {
  messages: ChatMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;

  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  showSurveyDropdown: boolean;
  setShowSurveyDropdown: (show: boolean) => void;
  surveys: { id: number; title: string }[];
  selectedSurveyId: number | null;
  onInlineSurveySelect: (surveyId: number) => void;
  onSelectNewsCopilot: () => void;
  onUploadClick: () => void;
  isNewsMode?: boolean;
};

export default function ChatView(props: ChatViewProps) {
  const {
    messages,
    isLoading,
    messagesEndRef,
    input,
    setInput,
    onSend,
    onKeyDown,
    showSurveyDropdown,
    setShowSurveyDropdown,
    surveys,
    selectedSurveyId,
    onInlineSurveySelect,
    onSelectNewsCopilot,
    onUploadClick,
    isNewsMode,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative flex flex-col flex-1 min-h-0">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        input={input}
        setInput={setInput}
        onSend={onSend}
        onKeyDown={onKeyDown}
        isLoading={isLoading}
        showSurveyDropdown={showSurveyDropdown}
        setShowSurveyDropdown={setShowSurveyDropdown}
        surveys={surveys}
        selectedSurveyId={selectedSurveyId}
        onInlineSurveySelect={onInlineSurveySelect}
        onSelectNewsCopilot={onSelectNewsCopilot}
        onUploadClick={onUploadClick}
        containerRef={containerRef}
        isNewsMode={isNewsMode}
      />
    </div>
  );
}


