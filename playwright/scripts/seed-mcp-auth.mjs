#!/usr/bin/env node

/**
 * Seed browser-MCP auth state via real GitHub OAuth.
 *
 * The browser MCP (Playwright MCP) starts with a fresh session every time.
 * This script runs the real GitHub OAuth flow (using credentials from .env.local),
 * seeds a RepoConnection, and saves the storage state to a file that agents
 * can load into the browser MCP context.
 *
 * Usage:
 *   node playwright/scripts/seed-mcp-auth.mjs
 *
 * Prerequisites:
 *   - Dev server running at http://localhost:3000
 *   - .env.local with TEST_GITHUB_USERNAME, TEST_GITHUB_PASSWORD, TEST_GITHUB_OTP_SECRET
 *   - TEST_ENV set on the server (for internal test API access)
 *
 * Output:
 *   .auth/local/default/storage-state.json   (for Playwright test runner)
 *   .auth/local/default/mcp-load-cookies.js   (for browser MCP run_code_unsafe)
 *
 * After running, an agent loads auth into the browser MCP:
 *   playwright_browser_run_code_unsafe({ filename: ".auth/local/default/mcp-load-cookies.js" })
 *   playwright_browser_navigate({ url: "http://localhost:3000/conversations/new" })
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import * as OTPAuth from 'otpauth';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const STORAGE_STATE_PATH = '.auth/local/default/storage-state.json';
const MCP_LOADER_PATH = '.auth/local/default/mcp-load-cookies.js';
const ENV_FILE = '.env.local';

/**
 * Parse .env.local directly — bypasses system env vars that may be empty.
 * dotenv with override:false won't overwrite empty system env vars, so we
 * read the file ourselves to get the real values.
 */
function loadEnvLocal() {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found. Run from project root.`);
  }
  const content = readFileSync(ENV_FILE, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    const val = trimmed.substring(eqIdx + 1);
    env[key] = val;
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();

  const username = env.TEST_GITHUB_USERNAME;
  const password = env.TEST_GITHUB_PASSWORD;
  const otpSecret = env.TEST_GITHUB_OTP_SECRET;
  const repoUrl = env.TEST_GITHUB_REPO_URL;

  if (!username || !password) {
    throw new Error(
      'TEST_GITHUB_USERNAME and TEST_GITHUB_PASSWORD must be set in .env.local'
    );
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ── 1. Navigate to sign-in ──────────────────────────────────────────
    console.log('Navigating to sign-in page...');
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });

    // ── 2. Click "Sign in with GitHub" ──────────────────────────────────
    console.log('Clicking "Sign in with GitHub"...');
    await page.getByRole('button', { name: /sign in with github/i }).click({
      noWaitAfter: true,
    });
    await page.waitForURL('**/github.com/**', { timeout: 30_000 });

    // ── 3. Fill GitHub credentials ──────────────────────────────────────
    console.log('Filling GitHub credentials...');
    await page.getByLabel('Username or email address').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // ── 4. Handle 2FA if prompted ───────────────────────────────────────
    if (otpSecret) {
      console.log('Waiting for 2FA prompt...');
      // Wait for either the 2FA page or a redirect back to the app.
      await Promise.race([
        page.waitForURL('**/sessions/two-factor/**', { timeout: 15_000 }).catch(() => {}),
        page.waitForURL(`${BASE_URL}/**`, { timeout: 15_000 }).catch(() => {}),
      ]);
      // GitHub's label changed from "authentication code" to "verification code".
      // Match both for robustness.
      const otpField = page.getByLabel(/authentication code|verification code/i);
      if (await otpField.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const totp = new OTPAuth.TOTP({
          secret: OTPAuth.Secret.fromBase32(otpSecret),
        });
        console.log('Entering TOTP code...');
        await otpField.fill(totp.generate());
        // GitHub's 2FA form auto-submits on 6 digits — no explicit click needed.
      }
    }

    // ── 5. Handle OAuth authorize page if shown ─────────────────────────
    console.log('Waiting for redirect...');
    const authorizeBtn = page.getByRole('button', { name: /authorize/i });
    if (await authorizeBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('Clicking "Authorize"...');
      // GitHub disables the button via JS for a moment — force enable + click.
      await authorizeBtn.evaluate((el) => {
        el.disabled = false;
      });
      await authorizeBtn.click({ force: true, noWaitAfter: true });
    }

    // ── 6. Wait for redirect back to app ───────────────────────────────
    await page.waitForURL(`${BASE_URL}/**`, { timeout: 30_000 });
    console.log('OAuth complete — back at app:', page.url());

    // ── 7. Seed RepoConnection via internal test API ───────────────────
    if (repoUrl) {
      console.log('Seeding RepoConnection...');
      const sessionRes = await page.request.get(`${BASE_URL}/api/auth/session`);
      if (sessionRes.ok()) {
        const session = await sessionRes.json();
        if (session.userId) {
          const connRes = await page.request.post(
            `${BASE_URL}/api/internal/test/repo-connections`,
            { data: { userId: session.userId, repoUrl } }
          );
          if (connRes.ok()) {
            console.log('RepoConnection seeded:', repoUrl);
          } else {
            console.warn(
              'RepoConnection seed failed (may already exist):',
              connRes.status()
            );
          }
        }
      }
    }

    // ── 8. Save storage state + generate MCP loader ────────────────────
    mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('Storage state saved to:', STORAGE_STATE_PATH);

    // Generate a self-contained JS file for the browser MCP's run_code_unsafe.
    // The MCP sandbox has no require/import — cookies must be embedded as literals.
    const state = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf8'));
    const loader = `async (page) => {\n  await page.context().addCookies(${JSON.stringify(state.cookies)});\n  return 'Auth cookies loaded (' + ${state.cookies.length} + ' cookies)';\n}`;
    writeFileSync(MCP_LOADER_PATH, loader);
    console.log('MCP loader saved to:', MCP_LOADER_PATH);

    // ── 9. Verify by navigating to an authenticated page ───────────────
    console.log('Verifying auth by navigating to /conversations/new...');
    await page.goto(`${BASE_URL}/conversations/new`, {
      waitUntil: 'domcontentloaded',
    });
    if (page.url().includes('/sign-in')) {
      throw new Error('Verification failed — redirected to sign-in');
    }
    console.log('Auth verified — on page:', page.url());
    console.log('\n✅ Done. Storage state ready for browser MCP.');
    console.log('');
    console.log('To load auth into the browser MCP, run:');
    console.log('  playwright_browser_run_code_unsafe({');
    console.log('    filename: "' + MCP_LOADER_PATH + '"');
    console.log('  })');
    console.log('  playwright_browser_navigate({ url: "http://localhost:3000/conversations/new" })');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
