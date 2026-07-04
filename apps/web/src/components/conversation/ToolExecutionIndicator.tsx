'use client';

export interface ToolExecutionIndicatorProps {
  toolName: string;
  completed?: boolean;
}

export function ToolExecutionIndicator({ toolName, completed = false }: ToolExecutionIndicatorProps) {
  return (
    <div
      className="flex items-center gap-2 py-1"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-text-3 border-t-accent motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-xs text-text-2">
        {completed ? `${toolName} completed` : `Running… ${toolName}`}
      </span>
    </div>
  );
}
