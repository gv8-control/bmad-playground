#!/usr/bin/env node
/**
 * Spike: verify snapshot with baked node_modules + fresh clone (assumption #4).
 *
 * Verifies assumption #4 from docs/todo/graph-pipeline.md "Admitted assumptions":
 *   The per-claim provisioning recipe names two strategies for getting baked
 *   `node_modules` into a fresh clone — (A) bake the shallow clone itself into
 *   the snapshot (per-sandbox provisioning then fetches instead of cloning),
 *   or (B) move the baked `node_modules` into the fresh clone — and verifies
 *   neither. This spike builds a snapshot via the Declarative Builder with
 *   node_modules baked in, creates a sandbox from it, runs git operations, and
 *   checks whether node_modules is present and usable. Both strategies are tried.
 *
 * The spike uses a MINIMAL FIXTURE repo (package.json with esbuild + lodash)
 * instead of the real repo's 1.8 GB node_modules. The mechanics being verified
 * — does a baked clone survive `git fetch`/`git checkout` with node_modules
 * intact, and does moving a baked node_modules into a fresh clone leave it
 * usable — do not depend on the repo's specific deps. esbuild carries a
 * platform-specific native binary (esbuild-linux-x64), so it doubles as a
 * native-binary-survives-the-bake check; lodash is pure JS. The devcontainer and
 * the sandbox are both linux-x64, so the baked esbuild binary matches the
 * sandbox runtime.
 *
 * Test sequence:
 *   0. Prepare a local fixture: a git repo with 2 commits + node_modules, and a
 *      bare remote at commit 2. The baked clone (Strategy A) is pinned at
 *      commit 1 so `git fetch` has something to update.
 *   A. Strategy A — bake the clone into the snapshot:
 *      1. Build an Image (Image.base + addLocalDir of the clone-at-c1 + bare
 *         remote) and create a sandbox from it (server-side snapshot build).
 *      2. `git fetch origin` then `git checkout origin/main` — moves HEAD to
 *         commit 2 (feature.txt appears).
 *      3. Verify node_modules still present (gitignored, untouched by git).
 *      4. Verify `node -e "require('esbuild')"` and `require('lodash')` work.
 *      5. Destroy sandbox A.
 *   B. Strategy B — move baked node_modules into a fresh clone:
 *      1. Build an Image (Image.base + addLocalDir of node_modules + bare
 *         remote) and create a sandbox from it.
 *      2. `git clone --depth 1 /opt/remote.git /workspace/repo` — fresh clone,
 *         no node_modules.
 *      3. Verify node_modules absent in the fresh clone.
 *      4. `cp -r /opt/baked-node_modules /workspace/repo/node_modules`.
 *      5. Verify `node -e "require('esbuild')"` and `require('lodash')` work.
 *      6. Destroy sandbox B.
 *
 * Reuses: spike-opencode-sandbox.js (log, sleep, elapsed, requireEnv).
 * Uses the Daytona SDK directly for image-based sandbox creation (the harness's
 * OpencodeSandbox creates from the default snapshot; this spike needs custom
 * images).
 *
 * Usage:
 *   node spike-baked-node-modules.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 *
 * See: docs/todo/spike-baked-node-modules.md for the full spike report.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

const BASE_IMAGE = 'daytonaio/sandbox:0.8.0'; // has Node + npm + git (prior spikes)
const FIXTURE_ROOT = '/tmp/spike-baked-fixture';
const REPO_DIR = path.join(FIXTURE_ROOT, 'repo'); // work tree, HEAD at commit 2
const CLONE_C1_DIR = path.join(FIXTURE_ROOT, 'repo-at-c1'); // baked clone at commit 1
const REMOTE_DIR = path.join(FIXTURE_ROOT, 'remote.git'); // bare remote at commit 2
const BAKED_NM_DIR = path.join(FIXTURE_ROOT, 'baked-node_modules'); // node_modules to bake for Strategy B

const IMAGE_BUILD_TIMEOUT_S = 900; // 15 min — first build can be slow
const SANDBOX_CMD_TIMEOUT_S = 120; // for git/node commands inside the sandbox
const POLL_INTERVAL_MS = 5000;

// Paths inside the sandbox image
const SBX_REPO = '/workspace/repo';
const SBX_REMOTE = '/opt/remote.git';
const SBX_BAKED_NM = '/opt/baked-node_modules';

// ─── Result collection ─────────────────────────────────────────────────────

const results = { steps: [], errors: [], t0: Date.now() };

function record(step, ok, ms, extra = {}) {
  results.steps.push({ step, ok, ms, ...extra });
  log(step, `${ok ? 'PASS' : 'FAIL'} (${elapsed(ms)})`);
}

function recordError(step, err) {
  results.errors.push({ step, error: err.message || String(err) });
  log(step, `ERROR: ${err.message || err}`);
}

// ─── Fixture preparation (local, on the devcontainer) ─────────────────────

/**
 * Build a local fixture git repo with two commits and installed node_modules,
 * plus a bare remote at commit 2 and a clone pinned at commit 1. All baked
 * into the snapshot images via addLocalDir.
 */
function prepareFixture() {
  const step = '0-fixture';
  const t0 = Date.now();
  try {
    log(step, `Preparing fixture under ${FIXTURE_ROOT}...`);
    execSync(`rm -rf ${FIXTURE_ROOT} && mkdir -p ${FIXTURE_ROOT}`);

    // 1. Create the repo work tree.
    execSync(`mkdir -p ${REPO_DIR}`);
    fs.writeFileSync(
      path.join(REPO_DIR, 'package.json'),
      JSON.stringify(
        {
          name: 'spike-fixture',
          version: '1.0.0',
          private: true,
          dependencies: { esbuild: '^0.24.0', lodash: '^4.17.21' },
        },
        null,
        2,
      ) + '\n',
    );
    fs.writeFileSync(
      path.join(REPO_DIR, 'index.js'),
      "const esbuild = require('esbuild');\nconst _ = require('lodash');\nconsole.log('FIXTURE_OK', _.VERSION, typeof esbuild.build);\n",
    );
    fs.writeFileSync(path.join(REPO_DIR, '.gitignore'), 'node_modules/\n');

    // 2. git init + commit 1.
    execSync(`git -C ${REPO_DIR} init -q -b main`, { stdio: 'pipe' });
    execSync(`git -C ${REPO_DIR} config user.email spike@example.com`, { stdio: 'pipe' });
    execSync(`git -C ${REPO_DIR} config user.name spike`, { stdio: 'pipe' });
    execSync(`git -C ${REPO_DIR} add -A`, { stdio: 'pipe' });
    execSync(`git -C ${REPO_DIR} commit -q -m "commit 1: package.json + index.js"`, { stdio: 'pipe' });
    const c1 = execSync(`git -C ${REPO_DIR} rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
    log(step, `Commit 1: ${c1}`);

    // 3. Install deps (produces node_modules). esbuild pulls esbuild-linux-x64.
    log(step, 'Installing fixture deps (esbuild + lodash)...');
    execSync(`npm install --prefix ${REPO_DIR} --no-audit --no-fund 2>&1 | tail -3`, {
      stdio: 'pipe',
      timeout: 120_000,
    });
    const nmCount = execSync(`ls ${REPO_DIR}/node_modules | wc -l`, { stdio: 'pipe' }).toString().trim();
    log(step, `node_modules entries: ${nmCount}`);

    // 4. Commit 2: add a tracked file (feature.txt) so fetch has something to update.
    fs.writeFileSync(path.join(REPO_DIR, 'feature.txt'), 'added in commit 2\n');
    execSync(`git -C ${REPO_DIR} add -A && git -C ${REPO_DIR} commit -q -m "commit 2: feature.txt"`, {
      stdio: 'pipe',
    });
    const c2 = execSync(`git -C ${REPO_DIR} rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
    log(step, `Commit 2: ${c2}`);

    // 5. Bare remote at commit 2. Materialize the main ref as a loose file so
    //    refs/heads/ is non-empty — tar.create skips empty dirs, and git's
    //    repo detection requires refs/ to exist, so a bare repo with only
    //    packed-refs breaks after baking (verified: refs/ missing after COPY →
    //    "does not appear to be a git repository").
    execSync(`git clone -q --bare ${REPO_DIR} ${REMOTE_DIR}`, { stdio: 'pipe' });
    const remoteMain = execSync(`git -C ${REMOTE_DIR} rev-parse main`, { stdio: 'pipe' }).toString().trim();
    // Write a loose ref file directly — update-ref on a bare repo keeps refs
    // packed, and we need refs/heads/ to contain a file so tar preserves it.
    execSync(`mkdir -p ${REMOTE_DIR}/refs/heads && echo '${remoteMain}' > ${REMOTE_DIR}/refs/heads/main`, { stdio: 'pipe' });
    // Sanity: verify the bare repo is valid locally before baking.
    const remoteHead = execSync(`git --git-dir=${REMOTE_DIR} rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
    const refsHead = execSync(`cat ${REMOTE_DIR}/refs/heads/main 2>/dev/null || echo MISSING`, { stdio: 'pipe' }).toString().trim();
    log(step, `Bare remote created at ${REMOTE_DIR}, HEAD=${remoteHead}, refs/heads/main=${refsHead}`);

    // 6. Clone pinned at commit 1 (the baked clone for Strategy A). Set its
    //    origin to the in-sandbox bare-remote path so `git fetch` resolves.
    //    NOTE: git clone does NOT copy gitignored node_modules, so we copy it
    //    in from the work tree — the baked clone must carry node_modules to
    //    test the "bake the clone" strategy. (The real pipeline would `npm
    //    install` during the snapshot build; copying here is equivalent and
    //    avoids build-time network dependency.)
    execSync(`git clone -q ${REPO_DIR} ${CLONE_C1_DIR}`, { stdio: 'pipe' });
    execSync(`git -C ${CLONE_C1_DIR} checkout -q ${c1}`, { stdio: 'pipe' });
    execSync(`git -C ${CLONE_C1_DIR} remote set-url origin ${SBX_REMOTE}`, { stdio: 'pipe' });
    execSync(`cp -r ${REPO_DIR}/node_modules ${CLONE_C1_DIR}/node_modules`, { stdio: 'pipe' });
    log(step, `Baked clone at commit 1 (with node_modules): ${CLONE_C1_DIR}`);

    // 7. Copy node_modules out for Strategy B's baked-node_modules.
    execSync(`cp -r ${REPO_DIR}/node_modules ${BAKED_NM_DIR}`, { stdio: 'pipe' });
    log(step, `Baked node_modules copied to ${BAKED_NM_DIR}`);

    // Sanity: verify esbuild is requireable locally.
    execSync(`node -e "require('esbuild'); require('lodash'); console.log('LOCAL_REQUIRE_OK')"`, {
      stdio: 'pipe',
      cwd: REPO_DIR,
    });

    record(step, true, Date.now() - t0, { c1, c2, nodeModulesEntries: nmCount });
    return { c1, c2 };
  } catch (err) {
    recordError(step, err);
    throw err;
  }
}

// ─── Daytona helpers ──────────────────────────────────────────────────────

function newDaytona() {
  return new Daytona({
    apiKey: requireEnv('DAYTONA_API_KEY'),
    apiUrl: requireEnv('DAYTONA_API_URL'),
  });
}

/**
 * Create a sandbox from a declarative Image. Streams snapshot-build logs.
 * @param {Daytona} daytona
 * @param {Image} image
 * @param {string} runId
 * @returns {Promise<Sandbox>}
 */
async function createFromImage(daytona, image, runId) {
  const t0 = Date.now();
  log('create', `Building snapshot from image and creating sandbox (runId=${runId})...`);
  const sb = await daytona.create(
    {
      image,
      labels: { scope: 'spike', runId },
      resources: { cpu: 2, memory: 4, disk: 10 },
      autoStopInterval: 0,
    },
    {
      timeout: IMAGE_BUILD_TIMEOUT_S,
      onSnapshotCreateLogs: (chunk) => {
        // Stream build logs so a slow/failing build is visible.
        process.stdout.write(chunk);
      },
    },
  );
  log('create', `Sandbox ${sb.id} ready in ${elapsed(Date.now() - t0)}`);
  return sb;
}

/**
 * Run a shell command synchronously inside the sandbox (blocks until exit).
 * @returns {Promise<{exitCode: number, output: string, ms: number}>}
 */
async function runInSandbox(sb, command, step, opts = {}) {
  const t0 = Date.now();
  const resp = await sb.process.executeCommand(
    command,
    opts.cwd,
    undefined,
    opts.timeoutS || SANDBOX_CMD_TIMEOUT_S,
  );
  log(step, `exit=${resp.exitCode} in ${elapsed(Date.now() - t0)}`);
  return { exitCode: resp.exitCode, output: resp.result, ms: Date.now() - t0 };
}

// ─── Strategy A: bake the clone into the snapshot ─────────────────────────

async function strategyA(daytona) {
  log('A', '=== Strategy A: bake the shallow clone into the snapshot ===');

  let sb = null;
  try {
    // Build the image: base + baked clone (at c1, with node_modules) + bare remote.
    // The base image (daytonaio/sandbox:0.8.0) sets USER daytona (uid 1001), so
    // COPY'd files are root-owned but RUN steps execute as daytona — daytona
    // cannot chown root-owned files or write to root-owned dirs. The fix is to
    // switch to root for the chown (via dockerfileCommands), then switch back.
    // The `user: 'root'` create param is ignored (verified: sandbox runs as
    // uid 1001 daytona regardless), so chown in the build is the real fix.
    const image = Image.base(BASE_IMAGE)
      .addLocalDir(CLONE_C1_DIR, SBX_REPO)
      .addLocalDir(REMOTE_DIR, SBX_REMOTE)
      .dockerfileCommands([
        'USER root',
        `RUN chown -R 1001:1001 ${SBX_REPO} ${SBX_REMOTE}`,
        'USER 1001',
      ]);

    sb = await createFromImage(daytona, image, 'baked-nm-A');

    // A-0: diagnostics — who am I, what's on disk, who owns it, bare repo state.
    {
      const step = 'A0-diag';
      const r = await runInSandbox(
        sb,
        `echo "=== id ===" && id && echo "=== repo ls ===" && ls -la ${SBX_REPO} && echo "=== node_modules ls ===" && ls -la ${SBX_REPO}/node_modules 2>&1 | head -8 && echo "=== bare repo ls ===" && ls -la ${SBX_REMOTE} && echo "=== bare objects ===" && ls -la ${SBX_REMOTE}/objects 2>&1 && echo "=== bare refs ===" && ls -laR ${SBX_REMOTE}/refs 2>&1 && echo "=== bare config ===" && cat ${SBX_REMOTE}/config && echo "=== bare rev-parse ===" && git --git-dir=${SBX_REMOTE} rev-parse HEAD 2>&1`,
        step,
      );
      log(step, `diag output:\n${r.output}`);
      record(step, r.exitCode === 0, r.ms, { output: r.output });
    }

    // A-1: verify the baked clone is present and at commit 1.
    let step = 'A1-baked-clone-present';
    let r = await runInSandbox(sb, `test -d ${SBX_REPO}/.git && echo GIT_OK && git -C ${SBX_REPO} log --oneline -1`, step);
    const hasGit = r.output.includes('GIT_OK');
    record(step, hasGit && r.exitCode === 0, r.ms, { output: r.output.trim() });

    // A-2: verify node_modules is present in the baked clone.
    step = 'A2-node_modules-present';
    r = await runInSandbox(sb, `test -d ${SBX_REPO}/node_modules/esbuild && echo NM_OK && ls ${SBX_REPO}/node_modules | wc -l`, step);
    const hasNm = r.output.includes('NM_OK');
    record(step, hasNm && r.exitCode === 0, r.ms, { output: r.output.trim() });

    // A-3: git fetch + checkout origin/main (moves HEAD to commit 2).
    step = 'A3-fetch-checkout';
    r = await runInSandbox(
      sb,
      `cd ${SBX_REPO} && git fetch origin 2>&1 && git checkout -q origin/main 2>&1 && echo FETCH_CHECKOUT_OK`,
      step,
      { timeoutS: 60 },
    );
    const fetched = r.output.includes('FETCH_CHECKOUT_OK');
    record(step, fetched && r.exitCode === 0, r.ms, { output: r.output.trim() });

    // A-4: verify commit-2 file appeared (proves fetch+checkout worked).
    step = 'A4-feature-txt-appeared';
    r = await runInSandbox(sb, `test -f ${SBX_REPO}/feature.txt && echo FEATURE_OK`, step);
    record(step, r.output.includes('FEATURE_OK') && r.exitCode === 0, r.ms);

    // A-5: verify node_modules SURVIVED the git operations (the core claim).
    step = 'A5-node_modules-survived';
    r = await runInSandbox(sb, `test -d ${SBX_REPO}/node_modules/esbuild && echo NM_SURVIVED`, step);
    record(step, r.output.includes('NM_SURVIVED') && r.exitCode === 0, r.ms);

    // A-6: verify baked deps are USABLE after git ops (native binary + pure JS).
    step = 'A6-require-works';
    r = await runInSandbox(
      sb,
      `cd ${SBX_REPO} && node -e "const e=require('esbuild');const _=require('lodash');console.log('REQUIRE_OK',_.VERSION,typeof e.build)"`,
      step,
    );
    record(step, r.output.includes('REQUIRE_OK') && r.exitCode === 0, r.ms, { output: r.output.trim() });
  } catch (err) {
    recordError('strategyA', err);
  } finally {
    if (sb) {
      try {
        await daytona.delete(sb);
        log('A-cleanup', `Sandbox ${sb.id} destroyed`);
      } catch (e) {
        log('A-cleanup', `Destroy failed: ${e.message}`);
      }
    }
  }
}

// ─── Strategy B: move baked node_modules into a fresh clone ───────────────

async function strategyB(daytona) {
  log('B', '=== Strategy B: move baked node_modules into a fresh clone ===');

  let sb = null;
  try {
    // Build the image: base + baked node_modules + bare remote.
    // Switch to root to create /workspace and chown baked dirs to uid 1001
    // (daytona user), then switch back — see Strategy A for the rationale.
    const image = Image.base(BASE_IMAGE)
      .addLocalDir(BAKED_NM_DIR, SBX_BAKED_NM)
      .addLocalDir(REMOTE_DIR, SBX_REMOTE)
      .dockerfileCommands([
        'USER root',
        `RUN mkdir -p /workspace && chown -R 1001:1001 /workspace ${SBX_BAKED_NM} ${SBX_REMOTE}`,
        'USER 1001',
      ]);

    sb = await createFromImage(daytona, image, 'baked-nm-B');

    // B-0: diagnostics — who am I, what's on disk, who owns it.
    {
      const step = 'B0-diag';
      const r = await runInSandbox(
        sb,
        `echo "=== id ===" && id && echo "=== baked-nm ls ===" && ls -la ${SBX_BAKED_NM} 2>&1 | head -8 && echo "=== remote.git ls ===" && ls -la ${SBX_REMOTE} 2>&1 | head -8`,
        step,
      );
      log(step, `diag output:\n${r.output}`);
      record(step, r.exitCode === 0, r.ms, { output: r.output });
    }

    // B-1: verify baked node_modules is present at the staging path.
    let step = 'B1-baked-nm-present';
    let r = await runInSandbox(sb, `test -d ${SBX_BAKED_NM}/esbuild && echo BAKED_NM_OK`, step);
    record(step, r.output.includes('BAKED_NM_OK') && r.exitCode === 0, r.ms);

    // B-2: fresh shallow clone — no node_modules.
    step = 'B2-fresh-clone';
    r = await runInSandbox(
      sb,
      `git clone --depth 1 ${SBX_REMOTE} ${SBX_REPO} 2>&1 && echo CLONE_OK`,
      step,
      { timeoutS: 60 },
    );
    record(step, r.output.includes('CLONE_OK') && r.exitCode === 0, r.ms, { output: r.output.trim() });

    // B-3: verify node_modules is ABSENT in the fresh clone.
    step = 'B3-node_modules-absent';
    r = await runInSandbox(sb, `test -d ${SBX_REPO}/node_modules && echo NM_PRESENT || echo NM_ABSENT`, step);
    record(step, r.output.includes('NM_ABSENT') && r.exitCode === 0, r.ms, { output: r.output.trim() });

    // B-4: move baked node_modules into the fresh clone.
    step = 'B4-move-node_modules';
    r = await runInSandbox(sb, `cp -r ${SBX_BAKED_NM} ${SBX_REPO}/node_modules && echo MOVED_OK`, step, { timeoutS: 60 });
    record(step, r.output.includes('MOVED_OK') && r.exitCode === 0, r.ms);

    // B-5: verify moved deps are USABLE (native binary + pure JS).
    step = 'B5-require-works';
    r = await runInSandbox(
      sb,
      `cd ${SBX_REPO} && node -e "const e=require('esbuild');const _=require('lodash');console.log('REQUIRE_OK',_.VERSION,typeof e.build)"`,
      step,
    );
    record(step, r.output.includes('REQUIRE_OK') && r.exitCode === 0, r.ms, { output: r.output.trim() });
  } catch (err) {
    recordError('strategyB', err);
  } finally {
    if (sb) {
      try {
        await daytona.delete(sb);
        log('B-cleanup', `Sandbox ${sb.id} destroyed`);
      } catch (e) {
        log('B-cleanup', `Destroy failed: ${e.message}`);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  log('main', 'Spike: baked node_modules + fresh clone (assumption #4)');

  prepareFixture();

  const daytona = newDaytona();

  await strategyA(daytona);
  await strategyB(daytona);

  const totalMs = Date.now() - results.t0;
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify({ ...results, totalMs }, null, 2));

  const failed = results.steps.filter((s) => !s.ok);
  if (failed.length > 0 || results.errors.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failed.length} step(s) failed, ${results.errors.length} error(s)`);
  } else {
    console.log('\nAll steps passed.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
