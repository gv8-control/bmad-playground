import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 1.8: Build the Persistent App Shell
 * E2E tests for AC-1 (side nav), AC-2 (three-zone scroll), AC-3 (breadcrumb),
 * AC-4 (accessibility floor), AC-5 (responsive behavior).
 */

test.describe('Story 1.8 — App Shell', () => {
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
  });

  test.describe('Keyboard tab order (AC-4)', () => {
    test('[P0] keyboard tab order reaches side navigation before main content', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
      expect(focused).toMatch(/new conversation|project map|artifact browser|settings/i);
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
  });

  test.describe('Route focus management (AC-4)', () => {
    test('[P0] focus moves to h1 on route change', async ({ page, withRepoConnection }) => {
      await page.goto('/project-map');
      await expect(page.getByRole('heading', { level: 1, name: /project map/i })).toBeFocused();

      await page.goto('/artifacts');
      await expect(page.getByRole('heading', { level: 1, name: /artifact browser/i })).toBeFocused();
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
  });
});
