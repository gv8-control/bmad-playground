'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';
import { ScrollToBottomButton } from './ScrollToBottomButton';

export interface ChatMessageListProps {
  messages: ChatMessage[];
  showScrollToBottom: boolean;
  newMessageCount: number;
  onScrollToBottom: () => void;
}

export function ChatMessageList({
  messages,
  showScrollToBottom,
  newMessageCount,
  onScrollToBottom,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;
    const threshold = 50;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    isAtBottomRef.current = isAtBottom;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-8 py-4"
      aria-live="polite"
    >
      {messages.length === 0 && (
        <p className="text-text-2 text-sm">
          Press `/` to browse available skills, or type a message to start.
        </p>
      )}
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AgentMessage key={message.id} message={message} />
        ),
      )}
      {showScrollToBottom && (
        <ScrollToBottomButton
          count={newMessageCount}
          onClick={onScrollToBottom}
        />
      )}
    </div>
  );
}
