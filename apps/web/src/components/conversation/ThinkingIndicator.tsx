'use client';

export function ThinkingIndicator() {
  return (
    <div
      className="flex items-center gap-1 py-2"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-text-3 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-text-3 motion-reduce:animate-none"
        style={{ animationDelay: '150ms' }}
        aria-hidden="true"
      />
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-text-3 motion-reduce:animate-none"
        style={{ animationDelay: '300ms' }}
        aria-hidden="true"
      />
      <span className="sr-only">Agent is thinking</span>
    </div>
  );
}
