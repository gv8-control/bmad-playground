/**
 * @jest-environment node
 *
 * ATDD — Story 5.1: Restore Missing Visual Containers Across Surfaces
 * Server Component unit tests for SettingsPage.
 * Covers AC-4 (Settings "coming soon" empty-state).
 *
 * GREEN PHASE: tests are active for Task 4 implementation.
 *
 * Uses the @jest-environment node + renderToStaticMarkup pattern from
 * project-map/page.test.tsx (Server Component test canonical pattern).
 * Breadcrumb is mocked as a render stub to isolate the page test.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/components/shell/Breadcrumb', () => ({
  Breadcrumb: () => 'Breadcrumb',
}));

import SettingsPage from './page';

describe('SettingsPage — coming soon empty-state (Story 5.1, AC-4)', () => {
  it('[P0] renders a 56x56 icon box (w-14 h-14 bg-surface border border-border rounded-xl) (AC-4, Task 4.2)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('w-14');
    expect(markup).toContain('h-14');
    expect(markup).toContain('bg-surface');
    expect(markup).toContain('border');
    expect(markup).toContain('rounded-xl');
  });

  it('[P0] renders the title "Settings coming soon" (AC-4, Task 4.3)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('Settings coming soon');
  });

  it('[P0] renders a body paragraph with coming-soon copy (AC-4, Task 4.4)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('Account management');
    expect(markup).toContain('repository connections');
    expect(markup).toContain('notification preferences');
  });

  it('[P0] renders three teaser item rows (AC-4, Task 4.5, 4.6)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('Manage connected repositories');
    expect(markup).toContain('Account and profile');
    expect(markup).toContain('Notification preferences');
  });

  it('[P0] wraps the empty-state in a centered container with max-w-[400px] (AC-4, Task 4.7)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('max-w-[400px]');
  });

  it('[P0] does NOT render the bare "Coming soon" placeholder (AC-4, Task 4.1)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).not.toMatch(/<p[^>]*>\s*Coming soon\s*<\/p>/);
  });

  it('[P1] preserves the Breadcrumb and h1 with tabIndex={-1} (route-focus management)', async () => {
    const markup = renderToStaticMarkup(await SettingsPage());
    expect(markup).toContain('Breadcrumb');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('Settings');
  });
});
