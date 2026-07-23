// Stage 2 integration test: proves the full provisioning round-trip works
// against real Daytona.
//
// Run: node pipeline3/lib/stage2-provisioning.test.mjs
//
// Exercises snapshot.mjs (clone + image build), provision.mjs (sandbox
// creation + file copy + git checkout), and reaper.mjs (list + reap +
// destroy). Skips with exit 0 if required env vars are missing so the
// test can run in CI without Daytona credentials.
//
// The first image build takes ~30s (spike F5); subsequent cached builds
// are faster. Exits 0 on success, 1 on failure.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { prepareCloneForBaking, buildWorkerImage } from './snapshot.mjs';
import { createDaytonaClient, provisionSandbox, getTunnelProxyEnv } from './provision.mjs';
import { listPipelineSandboxes, reapOrphanedSandboxes, destroyRunSandboxes } from './reaper.mjs';

let failures = 0;
let tests = 0;

function assert(name, cond) {
  tests++;
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
  }
}

function assertEqual(name, actual, expected) {
  tests++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// --- 0. Pre-flight: verify required env vars ---
console.log('\n0. pre-flight env var checks');
const requiredEnvVars = ['DAYTONA_API_KEY', 'DAYTONA_API_URL', 'GITHUB_TOKEN', 'RELAY_AUTH_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.log(`\n  SKIP: missing env vars: ${missingEnvVars.join(', ')}`);
  console.log('  This test requires real Daytona + GitHub credentials.');
  console.log('  Set the missing env vars and re-run to exercise the provisioning round-trip.');
  console.log('\n  (skipped, not failed)');
  process.exit(0);
}
console.log('  \u2713 all required env vars present');

// State tracked across steps for cleanup.
let cloneCleanup = null;
let sandbox = null;
let sandboxId = null;
let daytona = null;
let runId = null;

try {
  // --- 1. Prepare the clone ---
  console.log('\n1. prepareCloneForBaking');
  const cloneResult = prepareCloneForBaking({
    repoUrl: 'git@github.com:gv8-control/bmad-playground.git',
    branch: 'main',
  });
  cloneCleanup = cloneResult.cleanup;
  const { cloneDir } = cloneResult;

  assert('cloneDir is a non-empty string', typeof cloneDir === 'string' && cloneDir.length > 0);
  assert('clone dir exists', existsSync(cloneDir));
  assert('clone has .git directory', existsSync(join(cloneDir, '.git')));
  assert('clone has package.json', existsSync(join(cloneDir, 'package.json')));

  // --- 2. Build the image ---
  console.log('\n2. buildWorkerImage');
  console.log('  (first build may take ~30s — spike F5; cached rebuilds are faster)');
  const image = buildWorkerImage({ cloneDir, opencodeVersion: '1.17.20' });
  assert('image is a truthy object', image && typeof image === 'object');
  assert('image has dockerfile property', image && typeof image.dockerfile === 'string');

  // --- 3. Provision a sandbox ---
  console.log('\n3. provisionSandbox');
  daytona = createDaytonaClient();
  runId = 'stage2-test-' + Date.now();
  console.log(`  runId: ${runId}`);

  const provisionStart = Date.now();
  const provisionResult = await provisionSandbox({
    daytona,
    image,
    runId,
    baseRef: 'origin/main',
  });
  const provisionMs = Date.now() - provisionStart;

  sandbox = provisionResult.sandbox;
  sandboxId = provisionResult.sandboxId;

  assert('sandboxId is a non-empty string', typeof sandboxId === 'string' && sandboxId.length > 0);
  assertEqual('repoPath is /workspace/repo', provisionResult.repoPath, '/workspace/repo');
  console.log(`  provision took ${(provisionMs / 1000).toFixed(1)}s`);

  // --- 4. Verify sandbox reachability ---
  console.log('\n4. sandbox reachability');
  const idResp = await sandbox.process.executeCommand('id', undefined, undefined, 10);
  assertEqual('id exits 0', idResp.exitCode, 0);
  assert('id output contains uid', typeof idResp.result === 'string' && idResp.result.includes('uid='));

  const logResp = await sandbox.process.executeCommand(
    'git -C /workspace/repo log --oneline -1',
    '/workspace/repo',
    undefined,
    15,
  );
  assertEqual('git log exits 0', logResp.exitCode, 0);
  assert('git log output is non-empty', typeof logResp.result === 'string' && logResp.result.trim().length > 0);

  // --- 5. Verify provisioning artifacts ---
  console.log('\n5. provisioning artifacts');

  const nodeModulesResp = await sandbox.process.executeCommand(
    'test -d /workspace/repo/node_modules && echo exists',
    '/workspace/repo',
    undefined,
    10,
  );
  assertEqual('node_modules exists (baked deps survived)', nodeModulesResp.exitCode, 0);
  assert('node_modules check output confirms', nodeModulesResp.result.trim() === 'exists');

  const opencodeVersionResp = await sandbox.process.executeCommand(
    'opencode --version',
    '/workspace/repo',
    undefined,
    15,
  );
  assertEqual('opencode --version exits 0', opencodeVersionResp.exitCode, 0);
  assert(
    'opencode version is 1.17.20',
    typeof opencodeVersionResp.result === 'string' && opencodeVersionResp.result.includes('1.17.20'),
  );

  const yarnVersionResp = await sandbox.process.executeCommand(
    'yarn --version',
    '/workspace/repo',
    undefined,
    15,
  );
  assertEqual('yarn --version exits 0', yarnVersionResp.exitCode, 0);
  const yarnMajor = (yarnVersionResp.result || '').trim().split('.')[0];
  assert('yarn is 4.x', yarnMajor === '4');

  const envFileResp = await sandbox.process.executeCommand(
    'test -f /workspace/repo/.env && echo exists',
    '/workspace/repo',
    undefined,
    10,
  );
  assertEqual('.env was copied (exit 0)', envFileResp.exitCode, 0);
  assert('.env exists', envFileResp.result.trim() === 'exists');

  const opencodeJsonResp = await sandbox.process.executeCommand(
    'test -f /workspace/repo/opencode.json && echo exists',
    '/workspace/repo',
    undefined,
    10,
  );
  assertEqual('opencode.json was copied (exit 0)', opencodeJsonResp.exitCode, 0);
  assert('opencode.json exists', opencodeJsonResp.result.trim() === 'exists');

  const tunnelProxyResp = await sandbox.process.executeCommand(
    'test -f /tmp/tunnel-proxy.js && echo exists',
    undefined,
    undefined,
    10,
  );
  assertEqual('tunnel-proxy.js was copied (exit 0)', tunnelProxyResp.exitCode, 0);
  assert('tunnel-proxy.js exists', tunnelProxyResp.result.trim() === 'exists');

  const remoteUrlResp = await sandbox.process.executeCommand(
    'git -C /workspace/repo remote get-url origin',
    '/workspace/repo',
    undefined,
    10,
  );
  assertEqual('remote get-url exits 0', remoteUrlResp.exitCode, 0);
  // Do NOT print the full remote URL — it contains the token.
  const remoteUrl = (remoteUrlResp.result || '').trim();
  assert('remote URL contains github.com', remoteUrl.includes('github.com'));

  // --- 6. Verify tunnel proxy env ---
  console.log('\n6. tunnel proxy env');
  const tunnelEnv = getTunnelProxyEnv();
  assert('TUNNEL_RELAY_URL is set', typeof tunnelEnv.TUNNEL_RELAY_URL === 'string' && tunnelEnv.TUNNEL_RELAY_URL.length > 0);
  assert('TUNNEL_RELAY_TOKEN is set', typeof tunnelEnv.TUNNEL_RELAY_TOKEN === 'string' && tunnelEnv.TUNNEL_RELAY_TOKEN.length > 0);
  assertEqual('TUNNEL_LISTEN_PORT is 8888', tunnelEnv.TUNNEL_LISTEN_PORT, 8888);
  assert('NODE_PATH points to repo node_modules', tunnelEnv.NODE_PATH === '/workspace/repo/node_modules');
  assert('HTTPS_PROXY is set', typeof tunnelEnv.HTTPS_PROXY === 'string' && tunnelEnv.HTTPS_PROXY.length > 0);
  assert('NO_PROXY is set', typeof tunnelEnv.NO_PROXY === 'string' && tunnelEnv.NO_PROXY.length > 0);

  // --- 7. Test the reaper ---
  console.log('\n7. reaper');

  // 7a. listPipelineSandboxes — our sandbox should be present.
  const listed = await listPipelineSandboxes(daytona);
  const listedIds = listed.map(s => s.id);
  assert('listPipelineSandboxes includes our sandbox', listedIds.includes(sandboxId));

  // 7b. reapOrphanedSandboxes with our sandbox known — should skip it.
  const reapResult = await reapOrphanedSandboxes({
    daytona,
    knownSandboxIds: new Set([sandboxId]),
  });
  assert('reap did not destroy our sandbox (known)', !reapResult.destroyed.includes(sandboxId));
  assert('reap skipped our sandbox', reapResult.skipped.includes(sandboxId));
  assertEqual('reap errors is empty', reapResult.errors, []);

  // 7c. destroyRunSandboxes — should destroy our sandbox.
  const destroyResult = await destroyRunSandboxes({ daytona, runId });
  assert('destroyRunSandboxes destroyed our sandbox', destroyResult.destroyed.includes(sandboxId));
  assertEqual('destroyRunSandboxes errors is empty', destroyResult.errors, []);

  // Mark as cleaned up so the finally block doesn't double-destroy.
  sandbox = null;
  sandboxId = null;

} catch (err) {
  console.error(`\n  ERROR: ${err.message}`);
  if (err.stack) console.error(err.stack);
  failures++;
} finally {
  // --- 8. Cleanup ---
  console.log('\n8. cleanup');

  // Destroy the sandbox if it's still alive (test failed before step 7c).
  if (sandboxId && daytona) {
    try {
      await destroyRunSandboxes({ daytona, runId });
      console.log(`  \u2713 destroyed sandbox ${sandboxId}`);
    } catch (err) {
      console.error(`  \u2717 failed to destroy sandbox ${sandboxId}: ${err.message}`);
    }
  }

  // Clean up the clone dir.
  if (cloneCleanup) {
    try {
      cloneCleanup();
      console.log('  \u2713 cleaned up clone dir');
    } catch (err) {
      console.error(`  \u2717 failed to clean up clone dir: ${err.message}`);
    }
  }
}

// --- summary ---
console.log(`\n${tests - failures}/${tests} passed`);
if (failures > 0) {
  console.error(`\n\u2717 ${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n\u2713 all tests passed');
  process.exit(0);
}
