#!/usr/bin/env node
/**
 * Spike: verify Yarn 4 (Berry) works with adequate disk on a Daytona sandbox.
 *
 * Verifies the "✅ Likely works" claim in docs/todo/graph-pipeline.md
 * (Sandbox platform capabilities table):
 *   "Yarn 4 (Berry) | ✅ Likely works | Initial silent fetch failure was
 *    almost certainly the 3 GB disk limit, not a platform incompatibility.
 *    Needs verification with adequate disk."
 *
 * The original failure occurred on a default-sized sandbox (3 GB disk).
 * This spike creates a sandbox with disk: 10 (the org max) via the image
 * path (the snapshot path rejects `resources` — see spike-snapshot-resources.md),
 * clones a repo that uses Yarn 4 Berry, runs `yarn install`, and verifies
 * it succeeds. It also checks the actual disk available via `df` and the
 * Yarn version via `yarn --version`.
 *
 * Test repo: this repo itself (bmad-playground uses Yarn 4 Berry).
 * If the repo is unavailable or unsuitable, a minimal fixture with a
 * package.json + .yarnrc.yml + yarn berry config is created in-sandbox.
 *
 * Reuses: spike-opencode-sandbox.js (log, sleep, elapsed, requireEnv).
 * Uses the Daytona SDK directly for image-based sandbox creation.
 *
 * Usage:
 *   node spike-yarn-berry-disk.js
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
const SANDBOX_CMD_TIMEOUT_S = 180; // yarn install can take a while
const POLL_INTERVAL_MS = 3000;
const SBX_WORKDIR = '/tmp/yarn-test';

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

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  let daytona = null;
  let sb = null;

  try {
    // Step 1: Create sandbox with disk: 10 via image path
    const step = '1-create-sandbox';
    log(step, 'Creating sandbox with disk: 10 via image path...');
    const t0 = Date.now();
    daytona = new Daytona({
      apiKey: requireEnv('DAYTONA_API_KEY'),
      apiUrl: requireEnv('DAYTONA_API_URL'),
    });
    sb = await daytona.create({
      image: Image.base(BASE_IMAGE),
      // memory: 2 (not 4) to fit within the org-wide 10 GiB total cap when other
      // org sandboxes are live. 2 GiB is ample for `yarn install` of lodash + esbuild.
      resources: { cpu: 2, memory: 2, disk: 10 },
      labels: { scope: 'spike', runId: 'yarn-berry-' + Date.now() },
    });
    const createMs = Date.now() - t0;
    log(step, `Created sandbox ${sb.id} in ${elapsed(createMs)}`);
    record(step, true, createMs, { sandboxId: sb.id });

    // Step 2: Verify disk available
    const step2 = '2-verify-disk';
    log(step2, 'Checking disk space...');
    const t1 = Date.now();
    const dfResp = await sb.process.executeCommand(
      'df -h / && echo "---" && df -BG / | tail -1',
      undefined, undefined, 15,
    );
    log(step2, `df output:\n${dfResp.result}`);
    // Extract total disk in GB
    const totalGMatch = dfResp.result.match(/(\d+)G\s+\d+%?\s*\/\s*$/m);
    const totalG = totalGMatch ? parseInt(totalGMatch[1]) : 0;
    record(step2, dfResp.exitCode === 0 && totalG >= 9, Date.now() - t1, {
      exitCode: dfResp.exitCode,
      totalDiskGB: totalG,
      output: dfResp.result,
    });

    // Step 3: Check Node and npm versions
    const step3 = '3-check-node-npm';
    log(step3, 'Checking Node/npm versions...');
    const t2 = Date.now();
    const verResp = await sb.process.executeCommand(
      'node --version && npm --version && echo "---corepack---" && corepack --version 2>&1 || echo "no corepack"',
      undefined, undefined, 15,
    );
    log(step3, `versions:\n${verResp.result}`);
    record(step3, verResp.exitCode === 0, Date.now() - t2, {
      output: verResp.result,
    });

    // Step 4: Enable Yarn 4 Berry via corepack
    // `corepack enable` writes symlinks into /usr/bin, which the non-root sandbox
    // user cannot do. Try `sudo corepack enable` first (sandboxes have passwordless
    // sudo per docs); fall back to `corepack enable` if sudo is unavailable so the
    // failure mode is visible rather than hidden.
    const step4 = '4-enable-yarn-berry';
    log(step4, 'Enabling Yarn 4 Berry via corepack (sudo, then non-sudo fallback)...');
    const t3 = Date.now();
    const yarnEnableResp = await sb.process.executeCommand(
      'sudo corepack enable 2>&1 || corepack enable 2>&1; corepack prepare yarn@4.5.0 --activate 2>&1; yarn --version 2>&1',
      undefined, undefined, 60,
    );
    log(step4, `yarn enable output:\n${yarnEnableResp.result}`);
    const yarnVersion = yarnEnableResp.result.trim().split('\n').pop();
    record(step4, yarnEnableResp.exitCode === 0 && yarnVersion.startsWith('4.'), Date.now() - t3, {
      exitCode: yarnEnableResp.exitCode,
      yarnVersion,
      output: yarnEnableResp.result,
    });

    if (yarnEnableResp.exitCode !== 0) {
      throw new Error(`Yarn 4 Berry enable failed (exit ${yarnEnableResp.exitCode})`);
    }

    // Step 5: Create a minimal Yarn 4 Berry project and install
    const step5 = '5-yarn-install';
    log(step5, 'Creating minimal Yarn 4 Berry project and running yarn install...');
    const t4 = Date.now();
    // Create a project with a few real deps (lodash, esbuild with native binary).
    // NOTE: must avoid heredocs and `&&`-chains with embedded newlines — the
    // sandbox's default shell (zsh) mis-parses them. Use `printf` to write each
    // file, chained with `;` so each statement is independent.
    const pkgJson = JSON.stringify({
      name: 'yarn-berry-test',
      version: '1.0.0',
      packageManager: 'yarn@4.5.0',
      dependencies: { lodash: '^4.17.21', esbuild: '^0.24.0' },
    }, null, 2);
    const yarnrcYml = 'nodeLinker: node-modules\n';
    // Write files via base64-decoded `printf` piped into the file. This is the
    // only fully shell-agnostic way to write multi-line content from a single
    // executeCommand under zsh: heredocs mis-parse, `printf %s` doesn't expand
    // `\n` in args, and `node -e "require('fs')..."` runs into quote-escaping
    // battles. base64 round-trips through the shell without any quote interpretation.
    const pkgB64 = Buffer.from(pkgJson).toString('base64');
    const yarnB64 = Buffer.from(yarnrcYml).toString('base64');
    const setupCmd = [
      `mkdir -p ${SBX_WORKDIR}`,
      `printf %s ${pkgB64} | base64 -d > ${SBX_WORKDIR}/package.json`,
      `printf %s ${yarnB64} | base64 -d > ${SBX_WORKDIR}/.yarnrc.yml`,
      `echo '--- package.json ---'`,
      `cat ${SBX_WORKDIR}/package.json`,
      `echo '--- .yarnrc.yml ---'`,
      `cat ${SBX_WORKDIR}/.yarnrc.yml`,
    ].join('; ');

    const setupResp = await sb.process.executeCommand(setupCmd, undefined, undefined, 15);
    log(step5, `setup:\n${setupResp.result}`);

    // Now run yarn install. Do NOT pipe through `tail` — that masks yarn's exit
    // code (the pipe returns tail's exit, always 0). Capture full output; the
    // result object already truncates long output for display in the journal.
    const installResp = await sb.process.executeCommand(
      `cd ${SBX_WORKDIR} && yarn install 2>&1; echo "===EXIT=$?==="`,
      undefined, undefined, SANDBOX_CMD_TIMEOUT_S,
    );
    log(step5, `yarn install output (tail 20):\n${installResp.result.split('\n').slice(-25).join('\n')}`);
    // Recover yarn's real exit code from the sentinel we echoed.
    const installExitMatch = installResp.result.match(/===EXIT=(\d+)===/);
    const installExit = installExitMatch ? parseInt(installExitMatch[1]) : installResp.exitCode;
    const installOk = installExit === 0 && /Done in|Saved lockfile|ℹ️|Already up to date/i.test(installResp.result);
    record(step5, installOk, Date.now() - t4, {
      exitCode: installExit,
      rawExitCode: installResp.exitCode,
      output: installResp.result,
    });

    if (!installOk) {
      throw new Error(`yarn install failed (exit ${installExit})`);
    }

    // Step 6: Verify deps are usable (esbuild native binary + lodash)
    const step6 = '6-verify-deps';
    log(step6, 'Verifying installed deps work (esbuild native binary + lodash)...');
    const t5 = Date.now();
    const verifyResp = await sb.process.executeCommand(
      `cd ${SBX_WORKDIR} && node -e "const e=require('esbuild');const _=require('lodash');console.log('esbuild:',typeof e.transform);console.log('lodash:',_.VERSION)" 2>&1`,
      undefined, undefined, 30,
    );
    log(step6, `verify output:\n${verifyResp.result}`);
    const hasEsbuild = verifyResp.result.includes('esbuild: function') || verifyResp.result.includes('esbuild:');
    const hasLodash = verifyResp.result.includes('lodash:') && !verifyResp.result.includes('Cannot find');
    record(step6, verifyResp.exitCode === 0 && hasEsbuild && hasLodash, Date.now() - t5, {
      exitCode: verifyResp.exitCode,
      esbuildOk: hasEsbuild,
      lodashOk: hasLodash,
      output: verifyResp.result,
    });

    // Step 7: Check node_modules size and disk usage
    const step7 = '7-check-disk-usage';
    log(step7, 'Checking node_modules size and disk usage...');
    const t6 = Date.now();
    const sizeResp = await sb.process.executeCommand(
      `du -sh ${SBX_WORKDIR}/node_modules 2>/dev/null; echo '---'; df -h /; echo '---yarn-cache---'; du -sh ${SBX_WORKDIR}/.yarn 2>/dev/null || true`,
      undefined, undefined, 15,
    );
    log(step7, `disk usage:\n${sizeResp.result}`);
    record(step7, sizeResp.exitCode === 0, Date.now() - t6, {
      output: sizeResp.result,
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
