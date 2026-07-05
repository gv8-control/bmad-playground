export function SessionStartSpinner({ label = 'Starting session…' }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-2 py-2"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-3 border-t-accent motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-text-2 text-sm">{label}</span>
    </div>
  );
}
