'use client';

import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCallData } from './types';

export interface ToolPillProps {
  toolCall: ToolCallData;
}

export function ToolPill({ toolCall }: ToolPillProps) {
  const [expanded, setExpanded] = useState(false);

  const { toolName, status, input, output, errorMessage } = toolCall;

  const isRunning = status === 'running';
  const isError = status === 'error';

  const label = isRunning
    ? `Running… ${toolName}`
    : isError
      ? `${toolName} failed`
      : toolName;

  const ariaLabel = isRunning
    ? `Tool ${toolName} is running. Click to ${expanded ? 'collapse' : 'expand'} details.`
    : isError
      ? `Tool ${toolName} failed. Click to ${expanded ? 'collapse' : 'expand'} details.`
      : `Tool ${toolName} completed. Click to ${expanded ? 'collapse' : 'expand'} details.`;

  function handleClick() {
    setExpanded((prev) => !prev);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((prev) => !prev);
    }
  }

  return (
    <div className="my-1">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'inline-flex items-center gap-1.5 bg-surface-raised border border-border rounded-sm px-2 py-0.5 text-xs text-text-2 cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
          isError && 'border-negative text-negative',
        )}
      >
        {isRunning && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-text-3 border-t-accent motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {!isRunning && !isError && (
          <span className="text-positive" aria-hidden="true">
            ✓
          </span>
        )}
        {isError && (
          <span className="text-negative" aria-hidden="true">
            ✕
          </span>
        )}
        <span>{label}</span>
      </div>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1 max-w-full">
          {isError && errorMessage && (
            <pre className="font-mono text-xs text-negative bg-surface-raised border border-negative rounded-sm p-2 overflow-x-auto">
              {errorMessage}
            </pre>
          )}
          {input && (
            <pre className="font-mono text-xs text-text-2 bg-surface-raised border border-border rounded-sm p-2 overflow-x-auto">
              {input}
            </pre>
          )}
          {output && (
            <pre className="font-mono text-xs text-text-2 bg-surface-raised border border-border rounded-sm p-2 overflow-x-auto">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
