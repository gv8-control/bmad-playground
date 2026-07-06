'use client';

export interface ScrollToBottomButtonProps {
  count: number;
  onClick: () => void;
}

export function ScrollToBottomButton({ count, onClick }: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-surface-raised border border-border px-4 py-2 text-xs text-text-1 shadow-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      aria-label="Scroll to bottom"
    >
      {count > 0 ? `${count} new` : 'Scroll to bottom'}
    </button>
  );
}
