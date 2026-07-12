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
  ariaActivedescendant?: string;
  ariaControls?: string;
  workingTreeIndicator?: React.ReactNode;
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
  ariaActivedescendant,
  ariaControls,
  workingTreeIndicator,
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

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  }

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col gap-2.5 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-activedescendant={ariaActivedescendant}
        aria-controls={ariaControls}
        style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
        className="flex-1 resize-none bg-transparent border-none outline-none text-text-1 placeholder:text-text-3 disabled:opacity-50"
        aria-label="Message input"
      />
      <div className="flex items-center justify-between">
        {workingTreeIndicator && <div>{workingTreeIndicator}</div>}
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
            className="rounded-md bg-accent px-4 py-2 text-sm text-accent-fg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
