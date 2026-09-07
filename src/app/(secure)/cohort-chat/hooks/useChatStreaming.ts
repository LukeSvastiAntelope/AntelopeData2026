// New hook to encapsulate streaming logic and reduce page size
"use client";
import { useCallback, useRef } from 'react';

type Message = {
  role: 'user' | 'agent';
  content: string;
  citations?: Record<string, string>;
  chartSpec?: any;
  dataCards?: any[];
  id?: string;
};

type StreamingMode = 'off' | 'smart' | 'buffered' | 'instant';

export function useChatStreaming(options: {
  streamingMode: StreamingMode;
  processPartialResponse: (content: string, existingMessage: any) => any;
}) {
  const chunkBufferRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);

  const flushBuffer = useCallback((
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    if (chunkBufferRef.current.length === 0) return;
    const content = chunkBufferRef.current.join('');
    chunkBufferRef.current = [];
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'agent') {
        const partial = options.processPartialResponse(content, last);
        last.content = partial.content;
        last.citations = partial.citations;
        updated[updated.length - 1] = last;
      }
      return updated;
    });
  }, [options]);

  const scheduleFlush = useCallback((
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushBuffer(setMessages);
    });
  }, [flushBuffer]);

  const appendChunk = useCallback((
    chunk: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    mode: StreamingMode
  ) => {
    chunkBufferRef.current.push(chunk);
    if (mode === 'instant') {
      scheduleFlush(setMessages);
    } else if (mode === 'buffered') {
      if (chunkBufferRef.current.join('').length >= 200) {
        flushBuffer(setMessages);
      }
    } else if (mode === 'smart') {
      // Defer to rAF as a compromise for now
      scheduleFlush(setMessages);
    }
  }, [scheduleFlush, flushBuffer]);

  const finalize = useCallback((
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    flushBuffer(setMessages);
  }, [flushBuffer]);

  return { appendChunk, finalize };
}


