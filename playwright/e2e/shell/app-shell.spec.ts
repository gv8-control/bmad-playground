import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 1.8: Build the Persistent App Shell
 * E2E tests for AC-1 (side nav), AC-2 (three-zone scroll), AC-3 (breadcrumb),
 * AC-4 (accessibility floor), AC-5 (responsive behavior).
 */

// Serial: every test shares the synthetic E2E user, whose RepoConnection is
// created/deleted by the withRepoConnection fixture. Running serially prevents
// parallel withRepoConnection tests from making the onboarding test (which
// expects no connection) see a shell.
test.describe.serial('Story 1.8 — App Shell', () => {
  test.describe('Side Navigation (AC-1)', () => {
    test('[P0] side nav visible with all items', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');

      await expect(page.getByText('bmad-easy')).toBeVisible();
      await expect(page.getByRole('link', { name: /new conversation/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /project map/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /artifact browser/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();
    });

    test('[P0] active nav item highlighted on /project-map', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      const projectMapLink = page.getByRole('link', { name: /^project map$/i });
      await expect(projectMapLink).toHaveClass(/bg-surface-raised/);
    });

    test('[P0] active nav item highlighted on /artifacts', async ({ page, withRepoConnection }) => {
      await page.goto('/artifacts');
      const artifactsLink = page.getByRole('link', { name: /artifact browser/i });
      await expect(artifactsLink).toHaveClass(/bg-surface-raised/);
    });

    test('[P1] New Conversation button navigates to /conversations/new', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      await page.getByRole('link', { name: /new conversation/i }).click();
      await expect(page).toHaveURL(/\/conversations\/new/);
      await expect(page.getByRole('heading', { level: 1, name: /new conversation/i })).toBeVisible();
    });

    test('[P1] Settings avatar link highlighted on /settings', async ({ page, withRepoConnection }) => {
      await page.goto('/settings');
      const avatar = page.getByRole('link', { name: /e2e test user.*settings/i });
      const bg = await avatar.evaluate((el) => getComputedStyle(el).backgroundColor);
      // Active avatar has a visible surface-raised background, not transparent.
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('[P1] Settings avatar shows user initials and accessible aria-label', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      // Synthetic E2E session user is "E2E Test User" (see playwright/auth.setup.ts).
      const avatar = page.getByRole('link', { name: /e2e test user.*settings/i });
      await expect(avatar).toHaveAttribute('aria-label', /E2E Test User.+Settings/i);
      await expect(avatar).toContainText('EU');
    });

    test('[P1] inactive nav item uses muted text color', async ({ page, withRepoConnection }) => {
      await page.goto('/artifacts');
      const projectMapLink = page.getByRole('link', { name: /^project map$/i });
      await expect(projectMapLink).toHaveClass(/text-text-2/);
      await expect(projectMapLink).not.toHaveClass(/text-text-1/);
    });

    test('[P1] conversation list section is empty with no show-more affordance', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      const conversationList = page.getByTestId('conversation-list');
      await expect(conversationList).toBeVisible();
      await expect(conversationList).toBeEmpty();
      await expect(page.getByRole('link', { name: /view all|show more/i })).toHaveCount(0);
    });
  });

  test.describe('Three-zone scroll model (AC-2)', () => {
    test('[P1] side nav is a fixed full-height column and the document does not scroll', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      const sideNav = page.getByRole('navigation');
      const box = await sideNav.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBe(240);
      expect(box!.height).toBeGreaterThan(600);
      // The side nav column is not itself a scroll region.
      const navScrolls = await sideNav.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(navScrolls).toBe(false);
      // The shell contains content within the viewport — no document-level scroll.
      const docScrolls = await page.evaluate(
        () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
      );
      expect(docScrolls).toBe(false);
    });

    test('[P1] content pane scrolls independently while header and side nav stay fixed', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');

      // Inject tall content into the scrolling content pane to make it overflow
      await page.evaluate(() => {
        const contentPane = document.querySelector('main .overflow-y-auto');
        if (contentPane) {
          const tall = document.createElement('div');
          tall.style.height = '2000px';
          tall.textContent = 'Tall content for scroll testing';
          contentPane.appendChild(tall);
        }
      });

      // Verify the content pane is now scrollable
      const contentScrolls = await page.evaluate(() => {
        const pane = document.querySelector('main .overflow-y-auto');
        return pane ? pane.scrollHeight > pane.clientHeight : false;
      });
      expect(contentScrolls).toBe(true);

      // Record header and side nav positions before scrolling
      const headerYBefore = await page
        .locator('main header')
        .first()
        .evaluate((el) => el.getBoundingClientRect().y);
      const sideNavYBefore = await page
        .getByRole('navigation')
        .evaluate((el) => el.getBoundingClientRect().y);

      // Scroll the content pane down
      await page.evaluate(() => {
        const pane = document.querySelector('main .overflow-y-auto') as HTMLElement;
        pane?.scrollTo(0, 200);
      });

      // Verify header and side nav positions are unchanged (they stay fixed)
      const headerYAfter = await page
        .locator('main header')
        .first()
        .evaluate((el) => el.getBoundingClientRect().y);
      const sideNavYAfter = await page
        .getByRole('navigation')
        .evaluate((el) => el.getBoundingClientRect().y);
      expect(headerYAfter).toBe(headerYBefore);
      expect(sideNavYAfter).toBe(sideNavYBefore);
    });
  });

  test.describe('Keyboard tab order (AC-4)', () => {
    test('[P0] keyboard tab order reaches side navigation before main content', async ({ page, withRepoConnection }) => {
      // /artifacts has a tabbable breadcrumb link in main content, making the
      // before/after comparison meaningful (project-map's main has no tabbables).
      await page.goto('/artifacts');
      await expect(page.getByRole('link', { name: /artifact browser/i })).toBeVisible();
      // Tab order follows DOM order. The side navigation's first tabbable must
      // come before the main content's first tabbable, so keyboard users reach
      // the side nav before the page content.
      const { sideFirst, mainFirst } = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        const main = document.querySelector('main');
        const tabbables = Array.from(
          document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
        const sideFirst = tabbables.findIndex((el) => aside?.contains(el) ?? false);
        const mainFirst = tabbables.findIndex((el) => main?.contains(el) ?? false);
        return { sideFirst, mainFirst };
      });
      expect(sideFirst).toBeGreaterThanOrEqual(0);
      expect(mainFirst).toBeGreaterThanOrEqual(0);
      expect(sideFirst).toBeLessThan(mainFirst);
    });
  });

  test.describe('Breadcrumb (AC-3)', () => {
    test('[P0] breadcrumb visible on /artifacts', async ({ page, withRepoConnection }) => {
      await page.goto('/artifacts');
      await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /← project map/i })).toBeVisible();
    });

    test('[P0] breadcrumb visible on /settings', async ({ page, withRepoConnection }) => {
      await page.goto('/settings');
      await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
    });

    test('[P0] no breadcrumb on /project-map (depth-0 page)', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      await expect(page.getByRole('navigation', { name: /breadcrumb/i })).not.toBeVisible();
    });

    test('[P1] breadcrumb visible on /conversations/new (depth-1 page)', async ({ page, withRepoConnection }) => {
      await page.goto('/conversations/new');
      await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /← project map/i })).toBeVisible();
    });

    test('[P1] breadcrumb link navigates to /project-map', async ({ page, withRepoConnection }) => {
      await page.goto('/artifacts');
      await page.getByRole('link', { name: /← project map/i }).click();
      await expect(page).toHaveURL(/\/project-map/);
    });
  });

  test.describe('Route focus management (AC-4)', () => {
    test('[P0] focus moves to h1 on route change', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      await expect(page.getByRole('heading', { level: 1, name: /project map/i })).toBeFocused();

      await page.goto('/artifacts');
      await expect(page.getByRole('heading', { level: 1, name: /artifact browser/i })).toBeFocused();
    });
  });

  test.describe('Accessibility floor (AC-4)', () => {
    test('[P1] focus ring appears on focused nav link', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      const link = page.getByRole('link', { name: /^project map$/i });
      const boxShadowBefore = await link.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadowBefore).toBe('none');
      await link.focus();
      const boxShadowAfter = await link.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadowAfter).not.toBe('none');
    });

    test('[P1] icon-only hamburger button has accessible aria-label', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      const hamburger = page.getByRole('button', { name: /open navigation/i });
      await expect(hamburger).toHaveAttribute('aria-label', 'Open navigation');
    });
  });

  test.describe('Side nav NOT shown on onboarding (AC-1)', () => {
    test('[P0] side nav not visible on /onboarding (no repo connection)', async ({ page }) => {
      await page.goto('/onboarding');
      await expect(page.getByText('bmad-easy')).not.toBeVisible();
      await expect(page.getByRole('link', { name: /new conversation/i })).not.toBeVisible();
    });
  });

  test.describe('Mobile drawer (AC-5)', () => {
    test('[P0] hamburger visible at tablet viewport (900x800)', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible();
    });

    test('[P0] drawer opens on hamburger click and closes on Escape', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      await page.getByRole('button', { name: /open navigation/i }).click();
      await expect(page.getByRole('link', { name: /artifact browser/i })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible();
    });

    test('[P0] drawer closes on nav link click', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      await page.getByRole('button', { name: /open navigation/i }).click();
      await page.getByRole('link', { name: /artifact browser/i }).click();
      await expect(page).toHaveURL(/\/artifacts/);
      await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible();
    });

    test('[P1] desktop layout at 1280px: side nav visible, hamburger hidden', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/project-map');
      await expect(page.getByText('bmad-easy')).toBeVisible();
      await expect(page.getByRole('button', { name: /open navigation/i })).not.toBeVisible();
    });

    test('[P1] drawer dismisses on outside (overlay) click', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      await page.getByRole('button', { name: /open navigation/i }).click();
      await expect(page.getByRole('link', { name: /artifact browser/i })).toBeVisible();
      await page.locator('.bg-overlay').first().click();
      await expect(page.getByRole('link', { name: /artifact browser/i })).not.toBeVisible();
    });

    test('[P1] drawer returns focus to trigger on close', async ({ page, withRepoConnection }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/project-map');
      const hamburger = page.getByRole('button', { name: /open navigation/i });
      await hamburger.click();
      await expect(page.getByRole('link', { name: /artifact browser/i })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(hamburger).toBeFocused();
    });
  });
});
