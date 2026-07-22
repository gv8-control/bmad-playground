#!/usr/bin/env node
/**
 * Spike: do Daytona snapshots honor `resources` params?
 *
 * The graph-pipeline plan prescribes: "Create from image, not snapshot, to
 * control resources — snapshots ignore resource params." That claim was never
 * tested directly; spike-baked-node-modules used the image path only. The
 * Daytona docs show `resources` only on the image create path, and the SDK's
 * `CreateSandboxFromSnapshotParams` type omits `resources` — but the SDK
 * *runtime* forwards `resources` to the API regardless of which branch
 * (snapshot vs image) is taken (the `if ('resources' in params)` check is
 * independent of the snapshot/image branch in Daytona.create). So the open
 * question is purely about API behavior: does the API honor, silently ignore,
 * or reject `cpu/memory/disk` when `snapshot` is set?
 *
 * Test: create two sandboxes with identical `resources: { cpu: 4, memory: 8,
 * disk: 10 }` (the org max), one from a named snapshot, one from a declarative
 * image. For each: confirm the create call succeeds (no API error), then
 * measure actual allocation inside the sandbox (`nproc`, `free -m`, `df -h /`)
 * and record whether the values match the request.
 *
 * Path 1 uses the default named snapshot `daytona-small` (defaults 1 vCPU / 1
 * GiB / 3 GiB — maximal contrast with the 4/8/10 request, so honored vs
 * ignored is unambiguous). Default and custom named snapshots share the same
 * create API path, so this tests the behavior for any named snapshot.
 *
 * Path 2 uses a declarative image (`Image.base('daytonaio/sandbox:0.8.0')`) —
 * the path the plan currently prescribes — as the control.
 *
 * Reuses: spike-opencode-sandbox.js (log, sleep, elapsed, requireEnv).
 *
 * Usage:
 *   node spike-snapshot-resources.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 *
 * See: docs/todo/spike-snapshot-resources.md for the full spike report.
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

const BASE_IMAGE = 'daytonaio/sandbox:0.8.0'; // has Node + git (prior spikes)
const NAMED_SNAPSHOT = 'daytona-small'; // default snapshot: 1 vCPU / 1 GiB / 3 GiB
const REQUESTED = { cpu: 4, memory: 8, disk: 10 }; // org max
const IMAGE_BUILD_TIMEOUT_S = 900; // 15 min — first build can be slow
const SANDBOX_CMD_TIMEOUT_S = 60;

// ─── Result collection ─────────────────────────────────────────────────────

const results = { paths: [], t0: Date.now() };

function recordPath(name, fields) {
  results.paths.push({ name, ...fields });
}

// ─── Daytona helpers ──────────────────────────────────────────────────────

function newDaytona() {
  return new Daytona({
    apiKey: requireEnv('DAYTONA_API_KEY'),
    apiUrl: requireEnv('DAYTONA_API_URL'),
  });
}

/**
 * Measure actual resource allocation inside a sandbox.
 * Returns { nproc, memTotalMib, diskTotalGib, raw }.
 */
async function measureAllocation(sb) {
  const resp = await sb.process.executeCommand(
    `echo "=== nproc ===" && nproc && echo "=== free -m ===" && free -m && echo "=== df -h / ===" && df -h /`,
    undefined,
    undefined,
    SANDBOX_CMD_TIMEOUT_S,
  );
  const out = resp.result || '';
  const nprocMatch = out.match(/=== nproc ===\s*\n(\d+)/);
  const memMatch = out.match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
  const diskMatch = out.match(/\/\s+(\d+\.?\d*)G/);
  const nproc = nprocMatch ? parseInt(nprocMatch[1], 10) : null;
  // free -m "total" column is the first number after "Mem:"
  const memTotalMatch = out.match(/Mem:\s+(\d+)/);
  const memTotalMib = memTotalMatch ? parseInt(memTotalMatch[1], 10) : null;
  const diskTotalGib = diskMatch ? parseFloat(diskMatch[1]) : null;
  return { nproc, memTotalMib, diskTotalGib, raw: out, exitCode: resp.exitCode };
}

/**
 * Extract the resources echoed on the returned Sandbox instance (if any).
 */
function echoedResources(sb) {
  // The SDK Sandbox wraps a SandboxInstance; resources may be on the instance.
  const inst = sb.instance || sb;
  const r = inst.resources || inst.resource || (inst.sandbox && inst.sandbox.resources);
  if (!r) return null;
  return { cpu: r.cpu, memory: r.memory, disk: r.disk };
}

// ─── Path 1: named snapshot with resources ─────────────────────────────────

async function pathSnapshot(daytona) {
  const name = 'snapshot';
  log(name, `=== Path 1: create from named snapshot '${NAMED_SNAPSHOT}' with resources ${JSON.stringify(REQUESTED)} ===`);
  let sb = null;
  let createError = null;
  let createMs = null;
  try {
    const t0 = Date.now();
    try {
      sb = await daytona.create({
        snapshot: NAMED_SNAPSHOT,
        resources: REQUESTED,
        labels: { scope: 'spike', runId: 'snapshot-resources-1' },
        autoStopInterval: 0,
      });
      createMs = Date.now() - t0;
      log(name, `create SUCCEEDED in ${elapsed(createMs)} (sandbox ${sb.id})`);
    } catch (err) {
      createMs = Date.now() - t0;
      createError = err;
      log(name, `create FAILED in ${elapsed(createMs)}: ${err.message || err}`);
      recordPath(name, {
        createOk: false,
        createError: err.message || String(err),
        createMs,
      });
      return;
    }

    // Give the sandbox a moment to be fully ready before measuring.
    await sleep(3000);

    const measured = await measureAllocation(sb);
    log(name, `measured: nproc=${measured.nproc} mem=${measured.memTotalMib}MiB disk=${measured.diskTotalGib}GiB (exit ${measured.exitCode})`);
    const echoed = echoedResources(sb);
    if (echoed) log(name, `echoed resources on instance: ${JSON.stringify(echoed)}`);

    const honored =
      measured.nproc === REQUESTED.cpu &&
      measured.memTotalMib !== null &&
      Math.abs(measured.memTotalMib - REQUESTED.memory * 1024) <= 256 && // 8 GiB ~ 8192 MiB
      measured.diskTotalGib !== null &&
      Math.abs(measured.diskTotalGib - REQUESTED.disk) <= 1.5;

    recordPath(name, {
      createOk: true,
      createMs,
      sandboxId: sb.id,
      requested: REQUESTED,
      measured: {
        nproc: measured.nproc,
        memTotalMib: measured.memTotalMib,
        diskTotalGib: measured.diskTotalGib,
      },
      echoedResources: echoed,
      honored,
      rawMeasure: measured.raw,
    });
  } finally {
    if (sb) {
      try {
        await daytona.delete(sb);
        log(name, `sandbox ${sb.id} destroyed`);
      } catch (e) {
        log(name, `destroy failed: ${e.message}`);
      }
    }
  }
}

// ─── Path 2: declarative image with resources (control) ───────────────────

async function pathImage(daytona) {
  const name = 'image';
  log(name, `=== Path 2: create from declarative image with resources ${JSON.stringify(REQUESTED)} ===`);
  let sb = null;
  let createError = null;
  let createMs = null;
  try {
    const t0 = Date.now();
    try {
      const image = Image.base(BASE_IMAGE);
      sb = await daytona.create(
        {
          image,
          resources: REQUESTED,
          labels: { scope: 'spike', runId: 'snapshot-resources-2' },
          autoStopInterval: 0,
        },
        {
          timeout: IMAGE_BUILD_TIMEOUT_S,
          onSnapshotCreateLogs: (chunk) => {
            process.stdout.write(chunk);
          },
        },
      );
      createMs = Date.now() - t0;
      log(name, `create SUCCEEDED in ${elapsed(createMs)} (sandbox ${sb.id})`);
    } catch (err) {
      createMs = Date.now() - t0;
      createError = err;
      log(name, `create FAILED in ${elapsed(createMs)}: ${err.message || err}`);
      recordPath(name, {
        createOk: false,
        createError: err.message || String(err),
        createMs,
      });
      return;
    }

    await sleep(3000);

    const measured = await measureAllocation(sb);
    log(name, `measured: nproc=${measured.nproc} mem=${measured.memTotalMib}MiB disk=${measured.diskTotalGib}GiB (exit ${measured.exitCode})`);
    const echoed = echoedResources(sb);
    if (echoed) log(name, `echoed resources on instance: ${JSON.stringify(echoed)}`);

    const honored =
      measured.nproc === REQUESTED.cpu &&
      measured.memTotalMib !== null &&
      Math.abs(measured.memTotalMib - REQUESTED.memory * 1024) <= 256 &&
      measured.diskTotalGib !== null &&
      Math.abs(measured.diskTotalGib - REQUESTED.disk) <= 1.5;

    recordPath(name, {
      createOk: true,
      createMs,
      sandboxId: sb.id,
      requested: REQUESTED,
      measured: {
        nproc: measured.nproc,
        memTotalMib: measured.memTotalMib,
        diskTotalGib: measured.diskTotalGib,
      },
      echoedResources: echoed,
      honored,
      rawMeasure: measured.raw,
    });
  } finally {
    if (sb) {
      try {
        await daytona.delete(sb);
        log(name, `sandbox ${sb.id} destroyed`);
      } catch (e) {
        log(name, `destroy failed: ${e.message}`);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  log('main', 'Spike: do Daytona snapshots honor `resources` params?');
  const daytona = newDaytona();

  await pathSnapshot(daytona);
  await pathImage(daytona);

  const totalMs = Date.now() - results.t0;
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify({ ...results, totalMs }, null, 2));

  const anyFailure = results.paths.some((p) => !p.createOk);
  if (anyFailure) {
    process.exitCode = 1;
    console.error('\nAt least one create path failed.');
  } else {
    console.log('\nBoth create paths completed.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
