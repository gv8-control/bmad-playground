'use client';

import { useEffect, useRef } from 'react';

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const MIN_HEIGHT = 52;
const MAX_HEIGHT = 200;

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled = false,
  isProcessing = false,
  placeholder = 'Type a message...',
  onKeyDown,
  inputRef,
}: ChatInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? internalRef;

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value, ref]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
        className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50"
        aria-label="Message input"
      />
      {isProcessing && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border border-border px-4 py-2 text-sm text-text-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
          aria-label="Stop agent"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm text-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50"
        >
          Send
        </button>
      )}
    </div>
  );
}
