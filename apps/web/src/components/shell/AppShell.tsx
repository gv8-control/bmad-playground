'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { SideNavigation } from '@/components/shell/SideNavigation';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';

interface AppShellProps {
  user: { name?: string | null; email?: string | null };
  conversations: { id: string; title: string | null }[];
  children: React.ReactNode;
}

export function AppShell({ user, conversations, children }: AppShellProps) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    if (drawerOpen) {
      isNavigatingRef.current = true;
    }
    setDrawerOpen(false);

    const main = mainRef.current;
    if (!main) return;

    const focusH1 = (h1: HTMLElement) => {
      h1.focus({ preventScroll: true });
    };

    const h1 = main.querySelector('h1');
    if (h1) {
      focusH1(h1);
      return;
    }

    // No h1 yet — focus the first interactive element now so focus isn't
    // stranded while we wait, but keep watching in case an h1 is still
    // streaming in (e.g. behind a Suspense boundary).
    const firstInteractive = main.querySelector(
      'button, a, input, [tabindex]:not([tabindex="-1"])',
    );
    (firstInteractive as HTMLElement | null)?.focus({ preventScroll: true });

    const observer = new MutationObserver(() => {
      const lateH1 = main.querySelector('h1');
      if (lateH1) {
        focusH1(lateH1);
        observer.disconnect();
      }
    });
    observer.observe(main, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <aside className="hidden lg:flex w-[240px] flex-shrink-0">
        <SideNavigation user={user} conversations={conversations} />
      </aside>

      <main ref={mainRef} className="flex-1 overflow-hidden flex flex-col">
        <div className="lg:hidden flex-shrink-0 p-4">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open navigation"
                className="p-2 bg-surface border border-border rounded-md text-text-1 hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[240px] bg-surface"
              data-testid="sheet-content"
              onCloseAutoFocus={(e) => {
                if (isNavigatingRef.current) {
                  isNavigatingRef.current = false;
                  e.preventDefault();
                }
              }}
            >
              <SideNavigation user={user} conversations={conversations} />
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </main>
    </div>
  );
}
