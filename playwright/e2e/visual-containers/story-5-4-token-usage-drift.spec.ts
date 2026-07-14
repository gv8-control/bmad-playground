import { test, expect } from '../../support/merged-fixtures';
import { resetRepoConnection, seedRepoConnection } from '../../support/reset-repo-connection';

/**
 * ATDD — Story 5.4: Fix Token-Usage Drift and Token-Config Gaps
 * E2E tests for user-visible outcomes of the token-usage drift fixes.
 *
 * Covers:
 * - AC-2: Onboarding input recessed background and label color (computed style)
 * - AC-3: Onboarding focus ring visible and border transitions to accent
 * - AC-6: Shell hairline border visible (side nav right border, computed style)
 * - AC-7: Scrollbar hiding on scrollable panels (class + computed style + overflow)
 *
 * NOT covered here (covered by co-located unit tests or build verification):
 * - AC-1 (ArtifactCard hover border): CSS class assertion in ArtifactCard.test.tsx.
 *   The withArtifacts E2E fixture is broken (unique constraint violations on
 *   [repoConnectionId, path]) with no planned fix; the hover border token is
 *   verified at the component level.
 * - AC-4 (Save button text color): CSS class assertion in WorkingTreeIndicator.test.tsx.
 *   Requires a conversation with working-tree state for E2E — complex setup for a
 *   token-color check already verified at the component level.
 * - AC-5 (ArtifactListEntry hover/date color): CSS class assertions in
 *   ArtifactListEntry.test.tsx. Verified at the component level.
 * - AC-7 artifact list pane (P1): CSS class assertion in artifacts/page.test.tsx.
 *   Same withArtifacts fixture dependency as AC-1; verified at the component level.
 * - AC-9 (WorkingTreeIndicator floating shadow): CSS class assertion in
 *   WorkingTreeIndicator.test.tsx. Same complex setup as AC-4.
 * - AC-8, AC-10, AC-11 (Tailwind config changes): verified by the production
 *   build (yarn nx build web) — if non-design-system utilities were in use,
 *   the build would fail or produce missing styles.
 *
 * Following the Story 5.2 precedent: E2E tests focus on user-visible outcomes
 * (computed styles, functional behavior), not Tailwind token class presence.
 *
 * Token values (from tailwind.config.ts):
 * - accent: #7B6EE8 -> rgb(123, 110, 232)
 * - bg: #0D0D11 -> rgb(13, 13, 17)
 * - surface: #16161C -> rgb(22, 22, 28)
 * - surface-raised: #1E1E26 -> rgb(30, 30, 38)
 * - text-1: #EDECF5 -> rgb(237, 236, 245)
 * - text-2: #8D8CA0 -> rgb(141, 140, 160)
 * - border: #2B2B38 -> rgb(43, 43, 56)
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel > getByTestId (no raw CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for secondary checks.
 */

// Serial mode: AC-2/AC-3 tests use resetRepoConnection in beforeEach which
// deletes ALL connections for the test user. If AC-6/AC-7 tests (which
// use withRepoConnection) run in parallel, their connection gets deleted
// mid-test. Serial mode prevents this race condition.
test.describe.configure({ mode: 'serial' });

// Restore a repo connection after all tests so subsequent test files that
// require a connection for seeding are not left without one.
test.afterAll(seedRepoConnection);

// ─── AC-2: Onboarding input recessed background and label color ──────────

test.describe('Story 5.4 — AC-2: Onboarding input recessed background', () => {
  test.beforeEach(resetRepoConnection);

  test('[P0] input background is bg-bg (recessed), not bg-surface (raised)', async ({ page }) => {
    await page.goto('/onboarding');

    const input = page.getByLabel(/repository url/i);
    await expect(input).toBeVisible();

    const bgColor = await input.evaluate((el) => getComputedStyle(el).backgroundColor);
    // bg = #0D0D11 = rgb(13, 13, 17)
    expect(bgColor).toContain('13');
    // surface = #16161C = rgb(22, 22, 28) — should NOT match
    expect(bgColor).not.toContain('22');
  });

  test('[P0] field label uses text-text-1 (primary), not text-text-2 (secondary)', async ({
    page,
  }) => {
    await page.goto('/onboarding');

    const label = page.locator('label[for="repo-url"]');
    await expect(label).toBeVisible();

    const color = await label.evaluate((el) => getComputedStyle(el).color);
    // text-1 = #EDECF5 = rgb(237, 236, 245)
    expect(color).toContain('237');
    // text-2 = #8D8CA0 = rgb(141, 140, 160) — should NOT match
    expect(color).not.toContain('141');
  });
});

// ─── AC-3: Onboarding focus ring and border transition ───────────────────

test.describe('Story 5.4 — AC-3: Onboarding focus ring', () => {
  test.beforeEach(resetRepoConnection);

  test('[P0] focusing the input produces a visible focus ring (box-shadow)', async ({ page }) => {
    await page.goto('/onboarding');

    const input = page.getByLabel(/repository url/i);
    await expect(input).toBeVisible();

    // Before focus: no ring (box-shadow is none)
    const restingShadow = await input.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(restingShadow).toBe('none');

    await input.focus();

    // After focus: ring is visible (box-shadow is not none)
    // The focus:ring-2 + focus:ring-offset-2 classes create a box-shadow ring
    await expect.poll(
      async () => await input.evaluate((el) => getComputedStyle(el).boxShadow),
    ).not.toBe('none');
  });

  test('[P0] input border transitions to accent on focus', async ({ page }) => {
    await page.goto('/onboarding');

    const input = page.getByLabel(/repository url/i);
    await expect(input).toBeVisible();

    await input.focus();

    // focus:border-accent -> border-color = accent = #7B6EE8 = rgb(123, 110, 232)
    await expect.poll(
      async () => await input.evaluate((el) => getComputedStyle(el).borderColor),
    ).toContain('123');
  });
});

// ─── AC-6: Shell hairline border visible ──────────────────────────────────

test.describe('Story 5.4 — AC-6: Shell hairline border', () => {
  test('[P0] side nav right border is visible (border-surface-raised)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/project-map');
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const nav = page.locator('aside nav').first();
    await expect(nav).toBeVisible();

    // border-surface-raised replaced border-border-subtle (AC-6, DP-3)
    const borderRightWidth = await nav.evaluate((el) => getComputedStyle(el).borderRightWidth);
    expect(parseFloat(borderRightWidth)).toBeGreaterThan(0);

    // surface-raised = #1E1E26 = rgb(30, 30, 38)
    const borderRightColor = await nav.evaluate((el) => getComputedStyle(el).borderRightColor);
    expect(borderRightColor).toContain('30');
  });
});

// ─── AC-7: Scrollbar hiding on scrollable panels ──────────────────────────

test.describe('Story 5.4 — AC-7: Scrollbar hiding', () => {
  test('[P0] side nav conversation list hides scrollbars and remains scrollable', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/project-map');
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    // The conversation-list div may have 0 height when empty (no conversations),
    // so use toBeAttached (not toBeVisible) — the element exists in the DOM
    // even when it has no content. See Story 5.2 AC-10 for the same pattern.
    const conversationList = page.getByTestId('conversation-list');
    await expect(conversationList).toHaveCount(1);

    // Class presence (source of truth — the .no-scrollbar utility class)
    await expect(conversationList).toHaveClass(/no-scrollbar/);

    // CSS rule applied: scrollbar-width: none (Firefox standard, Chrome 121+)
    const scrollbarWidth = await conversationList.evaluate(
      (el) => getComputedStyle(el).scrollbarWidth,
    );
    expect(scrollbarWidth).toBe('none');

    // Panel is still scrollable (overflow-y: auto — scrollbar hidden, not scrolling disabled)
    const overflowY = await conversationList.evaluate((el) => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflowY);
  });
});
