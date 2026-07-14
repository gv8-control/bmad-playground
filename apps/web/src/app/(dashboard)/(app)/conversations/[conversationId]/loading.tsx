import { Breadcrumb } from '@/components/shell/Breadcrumb';

export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
        <div className="flex items-center gap-3">
          <Breadcrumb />
          <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Conversation</h1>
        </div>
      </header>
      <div className="px-8 pb-8">
        <div className="h-14 animate-pulse bg-surface-raised border border-border rounded-lg max-w-[720px]" />
      </div>
    </div>
  );
}
