/**
 * ATDD — Story 1.7: Enforce Authenticated, Full Access for All MVP Users
 * E2E tests for AC-2: authenticated users have full access — no paywall/trial/billing.
 *
 * These tests verify the ABSENCE of feature gates. An authenticated user navigating
 * to platform routes should never encounter "upgrade", "trial", "billing", or
 * "paywall" text. The MVP access policy is: authentication is the only gate.
 *
 * Uses the shared `page` fixture (with synthetic session storage state).
 */

import { test, expect } from '../../support/merged-fixtures';

const FORBIDDEN_TERMS = /upgrade|trial|billing|paywall/i;

test.describe('Story 1.7 — authenticated full-access baseline (AC-2)', () => {
  test('[P0] authenticated user navigating to / sees no paywall or billing gate', async ({ page }) => {
    await page.goto('/');

    // Authenticated users are not redirected to /sign-in
    await expect(page).not.toHaveURL(/\/sign-in/);

    // The real page rendered — onboarding form is visible (redirects to /onboarding when no repo connected)
    await expect(page.getByLabel(/repository url/i)).toBeVisible();

    // No paywall, billing, trial, or upgrade text anywhere on the page
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(FORBIDDEN_TERMS);
  });

  test('[P0] authenticated user navigating to /onboarding sees no paywall or billing gate', async ({ page }) => {
    await page.goto('/onboarding');

    // Authenticated users are not redirected to /sign-in
    await expect(page).not.toHaveURL(/\/sign-in/);

    // The real page rendered — onboarding form is visible
    await expect(page.getByLabel(/repository url/i)).toBeVisible();

    // No paywall, billing, trial, or upgrade text anywhere on the page
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(FORBIDDEN_TERMS);
  });

  test('[P1] authenticated user navigating between routes encounters no paywall throughout the session', async ({ page }) => {
    // Start at / (redirects to /onboarding when no repo is connected)
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.getByLabel(/repository url/i)).toBeVisible();
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(FORBIDDEN_TERMS);

    // Navigate to /onboarding directly
    await page.goto('/onboarding');
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.getByLabel(/repository url/i)).toBeVisible();
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(FORBIDDEN_TERMS);

    // Navigate back to / — access baseline still holds
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.getByLabel(/repository url/i)).toBeVisible();
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(FORBIDDEN_TERMS);
  });

  test('[P1] full-access baseline survives page reload — no paywall after refresh', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.getByLabel(/repository url/i)).toBeVisible();

    await page.reload();

    // Still authenticated after reload — no paywall or billing gate
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.getByLabel(/repository url/i)).toBeVisible();
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(FORBIDDEN_TERMS);
  });

  test('[P1] defense-in-depth layout guard admits authenticated users to (dashboard) routes', async ({ page }) => {
    // /onboarding lives under the (dashboard) route group, whose layout.tsx
    // was updated in Story 1.7 with a secondary auth() check. An authenticated
    // user must pass through without being redirected to /sign-in.
    await page.goto('/onboarding');

    await expect(page).not.toHaveURL(/\/sign-in/);
    // The onboarding form is visible — the layout rendered children, not a redirect
    await expect(page.getByLabel(/repository url/i)).toBeVisible();
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(FORBIDDEN_TERMS);
  });
});
