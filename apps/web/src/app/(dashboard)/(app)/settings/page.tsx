import { Breadcrumb } from '@/components/shell/Breadcrumb';

export default async function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
        <div className="flex items-center gap-3">
          <Breadcrumb />
          <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Settings</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="flex flex-col items-center gap-4 max-w-[400px] text-center">
          <div className="w-14 h-14 bg-surface border border-border rounded-xl flex items-center justify-center text-2xl text-text-3">
            ⚙
          </div>
          <h2 className="text-lg font-semibold text-text-1">Settings coming soon</h2>
          <p className="text-sm text-text-2 leading-relaxed">
            Account management, repository connections, and notification preferences will be available here in a future release.
          </p>
          <div className="w-full flex flex-col gap-2 mt-2 text-left">
            <div className="flex items-center gap-3 p-3 bg-surface border border-surface-raised rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
              <span className="text-sm text-text-2">Manage connected repositories</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface border border-surface-raised rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
              <span className="text-sm text-text-2">Account and profile</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface border border-surface-raised rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
              <span className="text-sm text-text-2">Notification preferences</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
