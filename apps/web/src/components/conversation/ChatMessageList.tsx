'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';
import { ToolPill } from './ToolPill';
import { SemanticPill } from './SemanticPill';
import { AccessNotice } from './AccessNotice';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { ThinkingIndicator } from './ThinkingIndicator';
import { SessionStartSpinner } from './SessionStartSpinner';

export interface ChatMessageListProps {
  messages: ChatMessage[];
  showScrollToBottom: boolean;
  newMessageCount: number;
  onScrollToBottom: () => void;
  onScrollPositionChange?: (isAtBottom: boolean) => void;
  isThinking?: boolean;
  showSpinner?: boolean;
  spinnerLabel?: string;
  errorMessage?: string | null;
  showRetry?: boolean;
  onRetry?: () => void;
}

export function ChatMessageList({
  messages,
  showScrollToBottom,
  newMessageCount,
  onScrollToBottom,
  onScrollPositionChange,
  isThinking = false,
  showSpinner = false,
  spinnerLabel,
  errorMessage,
  showRetry = false,
  onRetry,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;
    const threshold = 50;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    isAtBottomRef.current = isAtBottom;
    onScrollPositionChange?.(isAtBottom);
  }

  function handleScrollToBottomClick() {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    isAtBottomRef.current = true;
    onScrollPositionChange?.(true);
    onScrollToBottom();
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-8 pt-6 pb-4 max-w-[824px] mx-auto w-full no-scrollbar"
        role="log"
        aria-live="polite"
        data-testid="chat-message-list"
      >
        {messages.length === 0 && !showSpinner && !errorMessage && (
          <div className="flex flex-col items-center gap-4 max-w-[480px] mx-auto text-center pt-10">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-surface border border-border text-lg">
              ✦
            </div>
            <div className="text-lg font-semibold text-text-1">
              Start a new conversation
            </div>
            <p className="text-text-2 text-sm leading-relaxed">
              Press <kbd className="inline-block bg-surface-raised border border-border rounded px-1.5 py-0.5 font-mono text-xs text-text-1">/</kbd> to browse available skills, or type a message to start.
            </p>
          </div>
        )}
        {showSpinner && (
          <div className="flex items-center justify-center py-10">
            <SessionStartSpinner label={spinnerLabel} hint={spinnerLabel ? null : undefined} />
          </div>
        )}
        {messages.map((message) => {
          if (message.role === 'user') {
            return <UserMessage key={message.id} message={message} />;
          }
          if (message.role === 'system') {
            return (
              <div key={message.id} className="flex justify-center py-4">
                <p className="text-xs text-text-2 text-center max-w-md" role="status">{message.content}</p>
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
        {errorMessage && !showSpinner && (
          <p className="text-negative text-sm" role="alert">
            {errorMessage}
          </p>
        )}
        {showRetry && onRetry && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accent-fg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Retry
            </button>
          </div>
        )}
        {isThinking && <ThinkingIndicator />}
      </div>
      {showScrollToBottom && (
        <ScrollToBottomButton
          count={newMessageCount}
          onClick={handleScrollToBottomClick}
        />
      )}
    </div>
  );
}
