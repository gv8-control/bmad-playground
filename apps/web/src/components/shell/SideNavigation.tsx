'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SideNavigationProps {
  user: { name?: string | null; email?: string | null };
  conversations?: { id: string; title: string | null }[];
}

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function SideNavigation({ user, conversations = [] }: SideNavigationProps) {
  const pathname = usePathname();

  const isProjectMapActive = pathname === '/' || pathname === '/project-map';
  const isArtifactsActive = pathname.startsWith('/artifacts');
  const isSettingsActive = pathname === '/settings';

  const ariaLabel = `${user.name ?? user.email ?? 'User'} — Settings`;

  return (
    <nav className="w-[240px] h-full bg-surface border-r border-border-subtle flex flex-col">
      <div className="h-12 flex items-center px-4 text-text-1 font-semibold">
        bmad-easy
      </div>

      <Link
        href="/conversations/new"
        className="mx-3 px-3 py-2 border border-accent text-accent rounded-md text-sm font-medium hover:bg-accent/10 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      >
        New Conversation
      </Link>

      <div data-testid="conversation-list" className="flex-1 flex flex-col gap-1 px-3 mt-4 overflow-hidden">
        {conversations
          .filter((c) => c.title !== null)
          .map((c) => (
            <Link
              key={c.id}
              href={`/conversations/${c.id}`}
              className={cn(
                'px-3 py-2 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface truncate',
                pathname === `/conversations/${c.id}`
                  ? 'bg-surface-raised text-text-1'
                  : 'text-text-2 hover:bg-surface-raised',
              )}
            >
              {c.title}
            </Link>
          ))}
      </div>

      <div className="border-t border-border-subtle my-4 mx-3" />

      <div className="flex flex-col gap-1 px-3">
        <Link
          href="/project-map"
          className={cn(
            'px-4 py-2 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
            isProjectMapActive
              ? 'bg-surface-raised text-text-1'
              : 'text-text-2 hover:bg-surface-raised',
          )}
        >
          Project Map
        </Link>
        <Link
          href="/artifacts"
          className={cn(
            'px-4 py-2 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
            isArtifactsActive
              ? 'bg-surface-raised text-text-1'
              : 'text-text-2 hover:bg-surface-raised',
          )}
        >
          Artifact Browser
        </Link>
      </div>

      <div className="p-3 mt-auto">
        <Link
          href="/settings"
          aria-label={ariaLabel}
          className={cn(
            'flex items-center gap-2 px-2 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
            isSettingsActive ? 'bg-surface-raised' : 'hover:bg-surface-raised',
          )}
        >
          <span className="w-8 h-8 rounded-full bg-accent text-accent-fg flex items-center justify-center text-xs font-semibold">
            {getInitials(user.name)}
          </span>
        </Link>
      </div>
    </nav>
  );
}
