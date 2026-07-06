import { renderToStaticMarkup } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';

// Ensure React's act() environment is configured so passive effects flush
// correctly during hydration. @testing-library/react sets this automatically,
// but this utility is used standalone in some tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface HydrateResult {
  container: HTMLElement;
  consoleErrors: string[];
}

/**
 * Renders a React element to static markup (simulating SSR), injects the
 * resulting HTML into a DOM container, then hydrates it with hydrateRoot.
 *
 * Captures any console.error calls during hydration — React 19 logs
 * hydration warnings (mismatched text, missing nodes, etc.) there.
 *
 * Must run in a jsdom (or browser-like) environment because hydrateRoot
 * requires a DOM document.
 */
export async function renderAndHydrate(element: ReactElement): Promise<HydrateResult> {
  // 1. Server-render to static HTML
  const html = renderToStaticMarkup(element);

  // 2. Create a DOM container and inject the server HTML
  const container = document.createElement('div');
  document.body.appendChild(container);
  container.innerHTML = html;

  // 3. Capture console.error during hydration
  const consoleErrors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(
      args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '),
    );
  };

  try {
    // 4. Hydrate — this is where SSR→client reconciliation happens.
    //    act() flushes passive effects so any effect-driven warnings
    //    are captured before we restore the spy.
    await act(async () => {
      hydrateRoot(container, element);
    });
  } finally {
    console.error = originalError;
  }

  return { container, consoleErrors };
}
