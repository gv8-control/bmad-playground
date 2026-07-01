'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { SideNavigation } from '@/components/shell/SideNavigation';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';

interface AppShellProps {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);

    const main = mainRef.current;
    if (!main) return;
    const h1 = main.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    } else {
      const firstInteractive = main.querySelector(
        'button, a, input, [tabindex]:not([tabindex="-1"])',
      );
      (firstInteractive as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <aside className="hidden lg:flex w-[240px] flex-shrink-0">
        <SideNavigation user={user} />
      </aside>

      <div className="lg:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Open navigation"
              className="fixed top-4 left-4 z-40 p-2 bg-surface border border-border rounded-md text-text-1 hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] bg-surface">
            <SideNavigation user={user} />
          </SheetContent>
        </Sheet>
      </div>

      <main ref={mainRef} className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
