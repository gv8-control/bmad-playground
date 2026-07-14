export function SessionStartSpinner({ label = 'Starting session…', hint = 'Your message will send automatically when ready.' }: { label?: string; hint?: string | null }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-2"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-text-2 text-sm">{label}</span>
      {hint && <span className="text-text-3 text-sm italic">{hint}</span>}
    </div>
  );
}
