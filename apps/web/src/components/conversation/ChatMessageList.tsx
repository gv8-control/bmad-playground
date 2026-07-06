'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';
import { ToolPill } from './ToolPill';
import { SemanticPill } from './SemanticPill';
import { AccessNotice } from './AccessNotice';
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
      {messages.map((message) => {
        if (message.role === 'user') {
          return <UserMessage key={message.id} message={message} />;
        }
        if (message.role === 'system') {
          return (
            <div key={message.id} className="flex justify-center py-4">
              <p className="text-xs text-text-3 text-center max-w-md">{message.content}</p>
            </div>
          );
        }
        if (message.toolCall) {
          if (message.toolCall.semantic) {
            return (
              <SemanticPill
                key={message.id}
                artifactType={message.toolCall.semantic.artifactType}
                artifactTitle={message.toolCall.semantic.artifactTitle}
                viewHref={message.toolCall.semantic.viewHref}
              />
            );
          }
          return (
            <div key={message.id}>
              <ToolPill toolCall={message.toolCall} />
              {message.toolCall.accessNotice && (
                <AccessNotice notice={message.toolCall.accessNotice} />
              )}
            </div>
          );
        }
        return <AgentMessage key={message.id} message={message} />;
      })}
      {showScrollToBottom && (
        <ScrollToBottomButton
          count={newMessageCount}
          onClick={onScrollToBottom}
        />
      )}
    </div>
  );
}
