#!/usr/bin/env node
/**
 * Spike: verify browser external access from a Daytona sandbox with a
 * custom snapshot that has proper browser dependencies.
 *
 * Verifies the "✅ Likely works" claim in docs/todo/graph-pipeline.md
 * (Sandbox platform capabilities table):
 *   "Browser external access | ✅ Likely works | Playwright is in the
 *    essential services allowlist. Initial ERR_CONNECTION_RESET was likely
 *    a snapshot-specific TLS/proxy issue. A custom snapshot with proper
 *    browser deps should resolve it."
 *
 * The spike builds a custom image with Playwright's browser dependencies
 * installed, creates a sandbox from it, installs Playwright, and attempts
 * to navigate to external HTTPS URLs (allowlisted: registry.npmjs.org,
 * github.com; non-allowlisted: example.com). Also tests curl (control)
 * and screenshot rendering.
 *
 * Lessons applied from spike-yarn-berry-disk.md:
 *   - Default shell is zsh; use base64 round-trips for multi-line file writes
 *   - /workspace is root-owned; use /tmp
 *   - Pipe-through-tail masks exit codes; use sentinels
 *
 * Reuses: spike-opencode-sandbox.js (log, sleep, elapsed, requireEnv).
 * Uses the Daytona SDK directly for image-based sandbox creation.
 *
 * Usage:
 *   node spike-browser-external-access.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 */

const { Daytona, Image } = require('@daytonaio/sdk');
const { log, sleep, elapsed } = require('./spike-opencode-sandbox.js');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`${name} is not set in env — cannot create Daytona client`);
  }
  return val;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE_IMAGE = 'daytonaio/sandbox:0.8.0';
const SANDBOX_CMD_TIMEOUT_S = 120;
const SBX_WORKDIR = '/tmp/browser-test';

// URLs to test — mix of allowlisted and non-allowlisted
const TEST_URLS = [
  { url: 'https://registry.npmjs.org/', name: 'npmjs-registry', allowlisted: true },
  { url: 'https://example.com', name: 'example.com', allowlisted: false },
  { url: 'https://github.com', name: 'github.com', allowlisted: true },
];

// ─── Result collection ─────────────────────────────────────────────────────

const results = { steps: [], errors: [], t0: Date.now() };

function record(step, ok, ms, extra = {}) {
  results.steps.push({ step, ok, ms, ...extra });
  log(step, `${ok ? 'PASS' : 'FAIL'} (${elapsed(ms)})`);
}

function recordError(step, err) {
  results.errors.push({ step, error: err.message || String(err) });
  log(step, `ERROR: ${err.message}`);
}

// Helper: write a file in the sandbox via base64 (zsh-safe)
async function writeFileViaBase64(sb, remotePath, content) {
  const b64 = Buffer.from(content).toString('base64');
  const resp = await sb.process.executeCommand(
    `printf %s '${b64}' | base64 -d > ${remotePath} && echo "WROTE ${remotePath}"`,
    undefined, undefined, 15,
  );
  if (!resp.result.includes('WROTE')) {
    throw new Error(`Failed to write ${remotePath}: ${resp.result}`);
  }
  return resp;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  let daytona = null;
  let sb = null;

  try {
    // Step 1: Build a custom image with Playwright browser deps
    const step = '1-build-image';
    log(step, 'Building custom image with Playwright browser dependencies...');
    const t0 = Date.now();
    daytona = new Daytona({
      apiKey: requireEnv('DAYTONA_API_KEY'),
      apiUrl: requireEnv('DAYTONA_API_URL'),
    });

    const customImage = Image.base(BASE_IMAGE)
      .runCommands([
        'apt-get update && apt-get install -y --no-install-recommends '
          + 'libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 '
          + 'libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 '
          + 'libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 '
          + 'libasound2 libatspi2.0-0 libxshmfence1 '
          + 'fonts-liberation fonts-noto-color-emoji',
        'npm install -g playwright@latest',
        'npx playwright install --with-deps chromium 2>&1 | tail -5',
      ]);

    log(step, 'Creating sandbox from custom image (this may take a few minutes on first build)...');
    sb = await daytona.create({
      image: customImage,
      resources: { cpu: 4, memory: 4, disk: 10 },
      labels: { scope: 'spike', runId: 'browser-access-' + Date.now() },
    }, { timeout: 0 });  // 0 = no timeout; image build + browser install can take 5+ min
    const createMs = Date.now() - t0;
    log(step, `Created sandbox ${sb.id} in ${elapsed(createMs)}`);
    record(step, true, createMs, { sandboxId: sb.id });

    // Step 2: Verify Playwright is installed and browsers are present
    const step2 = '2-verify-playwright';
    log(step2, 'Verifying Playwright installation...');
    const t1 = Date.now();
    const pwCheckResp = await sb.process.executeCommand(
      'npx playwright --version 2>&1; echo "---browsers---"; ls -la ~/.cache/ms-playwright/ 2>&1 | head -10; echo "===EXIT=$?==="',
      undefined, undefined, 30,
    );
    log(step2, `playwright check:\n${pwCheckResp.result}`);
    record(step2, pwCheckResp.exitCode === 0, Date.now() - t1, {
      output: pwCheckResp.result,
    });

    // Step 3: Test external HTTPS access via curl (control test)
    const step3 = '3-curl-control';
    log(step3, 'Testing external HTTPS via curl (control)...');
    const t2 = Date.now();
    for (const target of TEST_URLS) {
      const curlResp = await sb.process.executeCommand(
        `curl -sf --max-time 10 -o /dev/null -w "%{http_code}" ${target.url} 2>&1; echo "===EXIT=$?==="`,
        undefined, undefined, 15,
      );
      log(step3, `curl ${target.name} (${target.url}): ${curlResp.result}`);
      record(`${step3}-${target.name}`, curlResp.result.includes('200'), Date.now() - t2, {
        url: target.url,
        allowlisted: target.allowlisted,
        output: curlResp.result,
      });
    }

    // Step 4: Test browser navigation via Playwright
    const step4 = '4-playwright-navigation';
    log(step4, 'Testing browser navigation via Playwright...');
    const t3 = Date.now();

    // Write the Playwright test script via base64 (zsh-safe)
    const scriptContent = `const { chromium } = require('playwright');
(async () => {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const testUrls = ${JSON.stringify(TEST_URLS, null, 2)};
  
  for (const target of testUrls) {
    try {
      const response = await page.goto(target.url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      const status = response ? response.status() : 'no-response';
      const title = await page.title().catch(() => 'no-title');
      results.push({
        name: target.name,
        url: target.url,
        allowlisted: target.allowlisted,
        status: status,
        title: title,
        ok: status === 200,
      });
      console.log(target.name + ': ' + status + ' - ' + title);
    } catch (err) {
      results.push({
        name: target.name,
        url: target.url,
        allowlisted: target.allowlisted,
        error: err.message,
        ok: false,
      });
      console.log(target.name + ': ERROR - ' + err.message);
    }
  }
  
  await browser.close();
  console.log('---JSON---');
  console.log(JSON.stringify(results, null, 2));
})();
`;

    await sb.process.executeCommand(`mkdir -p ${SBX_WORKDIR}`, undefined, undefined, 5);
    await writeFileViaBase64(sb, `${SBX_WORKDIR}/test.js`, scriptContent);

    const runResp = await sb.process.executeCommand(
      `cd ${SBX_WORKDIR} && node test.js 2>&1; echo "===EXIT=$?==="`,
      undefined, undefined, SANDBOX_CMD_TIMEOUT_S,
    );
    log(step4, `playwright test output:\n${runResp.result}`);

    // Parse the JSON results
    const jsonMatch = runResp.result.match(/---JSON---\n([\s\S]+?)(?:===EXIT|$)/);
    let pwResults = null;
    if (jsonMatch) {
      try {
        pwResults = JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        log(step4, `Failed to parse JSON: ${e.message}`);
      }
    }

    const allAllowlistedOk = pwResults
      ? pwResults.filter(r => r.allowlisted).every(r => r.ok)
      : false;
    record(step4, allAllowlistedOk, Date.now() - t3, {
      results: pwResults,
      rawOutput: runResp.result,
    });

    // Step 5: Test with a simple screenshot to verify rendering works
    const step5 = '5-screenshot-test';
    log(step5, 'Testing screenshot capability (verifies rendering, not just navigation)...');
    const t4 = Date.now();
    const screenshotScript = `const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://registry.npmjs.org/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.screenshot({ path: '${SBX_WORKDIR}/test-screenshot.png' });
  const fs = require('fs');
  const stats = fs.statSync('${SBX_WORKDIR}/test-screenshot.png');
  console.log('screenshot size: ' + stats.size + ' bytes');
  console.log('screenshot ok: ' + (stats.size > 1000));
  await browser.close();
})();
`;
    await writeFileViaBase64(sb, `${SBX_WORKDIR}/screenshot.js`, screenshotScript);
    const screenshotResp = await sb.process.executeCommand(
      `cd ${SBX_WORKDIR} && node screenshot.js 2>&1; echo "===EXIT=$?==="`,
      undefined, undefined, 60,
    );
    log(step5, `screenshot output:\n${screenshotResp.result}`);
    const screenshotOk = screenshotResp.result.includes('screenshot ok: true');
    record(step5, screenshotOk, Date.now() - t4, {
      output: screenshotResp.result,
    });

  } catch (err) {
    recordError('fatal', err);
  } finally {
    // Cleanup
    if (daytona && sb) {
      try {
        log('cleanup', `Destroying sandbox ${sb.id}...`);
        await daytona.delete(sb);
        log('cleanup', 'Sandbox destroyed');
      } catch (err) {
        log('cleanup', `Cleanup failed: ${err.message}`);
      }
    }
  }

  // Print results
  results.totalMs = Date.now() - results.t0;
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = results.errors.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
