export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6">
        <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Conversation</h1>
      </header>
      <div className="px-8 pb-8">
        <div className="h-14 animate-pulse bg-surface-raised border border-border rounded-lg max-w-[720px]" />
      </div>
    </div>
  );
}
