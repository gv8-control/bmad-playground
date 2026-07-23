// Per-claim sandbox provisioning for pipeline worker sandboxes.
//
// One single-use Daytona sandbox per claim attempt, created on demand at
// claim time and destroyed after collection (see Sandbox lifecycle in the
// plan). There is no warm pool: creation from a cached image is near-instant
// (24h caching — spike-baked-node-modules.md F5), so pre-provisioning ahead
// of claims would buy seconds against hour-long runs at the cost of a pool
// subsystem.
//
// The only capacity control is `maxConcurrentSandboxes` in the policy block,
// enforced at claim time. This module does NOT enforce the cap — the
// dispatcher's claim step does (it calls provisionSandbox only when capacity
// is available). This module creates, provisions, and returns the sandbox;
// the dispatcher journals it and supervises it.
//
// What this module does (in order):
//   1. Create a sandbox from the worker image, with labels and resources.
//   2. Copy .env* files from the devcontainer into the sandbox.
//   3. Copy opencode.json into the sandbox (freshness guarantee — the
//      snapshot's bake is a cold-start optimization, not a freshness guarantee).
//   4. Copy the tunnel proxy script into the sandbox.
//   5. Set the git remote URL to the authenticated HTTPS URL (with token).
//   6. git fetch + git checkout to the claim's base commit.
//
// What this module does NOT do:
//   - Start the tunnel proxy (that's the in-sandbox command template's job,
//     step 3 of the Path).
//   - Run the per-claim install command (same — the in-sandbox command
//     template runs `yarn install --immutable` before the node's command).
//   - Start the opencode session (same — the in-sandbox command template).
//   - Enforce the capacity cap (the dispatcher's claim step does this).
//   - Destroy the sandbox (the collection step does this after the session
//     exits and the transcript is pulled).

import { Daytona } from '@daytonaio/sdk';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_REPO } from './snapshot.mjs';

// Resources: the platform max (spike-snapshot-resources.md).
// cpu/memory as cgroup-v2 quotas; disk as overlay size.
// nproc / free -m report host-level values, not the cgroup limits.
const DEFAULT_RESOURCES = { cpu: 4, memory: 8, disk: 10 };

// The label key used to scope pipeline sandboxes (spike-label-scoping.md).
const SCOPE_LABEL = 'pipeline';

// The tunnel proxy script path — lives in docs/todo/ (verified by the
// spike-ws-tunnel-proxy spike). The provisioning module copies it into
// the sandbox at /tmp/tunnel-proxy.js.
const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(moduleDir, '../..');
const TUNNEL_PROXY_SRC = join(repoRoot, 'docs/todo/tunnel-proxy.js');
const TUNNEL_PROXY_DEST = '/tmp/tunnel-proxy.js';

// The relay URL for the tunnel proxy. The relay is deployed to Railway
// (sandbox-relay-production.up.railway.app — spike-ws-tunnel-proxy.md).
const RELAY_BASE = 'https://sandbox-relay-production.up.railway.app';
const RELAY_WS_URL = RELAY_BASE.replace('https://', 'wss://') + '/tunnel';

// Essential Services that the sandbox reaches directly (no tunnel needed).
// The tunnel proxy's NO_PROXY env var excludes these so the proxy doesn't
// try to tunnel them (the relay refuses to tunnel allowlisted domains).
// This list matches the spike-verified set (spike-ws-tunnel-proxy.js L150)
// plus localhost/127.0.0.1 to prevent proxy self-loops.
const ESSENTIAL_SERVICES_NO_PROXY = [
  'localhost',
  '127.0.0.1',
  'models.dev',
  'registry.npmjs.org',
  'registry.npmjs.com',
  'github.com',
  '*.githubusercontent.com',
  'opencode.ai',
  '*.railway.app',
  'railway.app',
  'railway.com',
].join(',');

/**
 * Create a Daytona client from environment variables.
 *
 * Reads DAYTONA_API_KEY and DAYTONA_API_URL from the environment (same
 * env vars the devcontainer's create.sh/start.sh use for the CLI login).
 *
 * @returns {Daytona} the Daytona client
 * @throws if DAYTONA_API_KEY or DAYTONA_API_URL is not set
 */
export function createDaytonaClient() {
  const apiKey = process.env.DAYTONA_API_KEY;
  const apiUrl = process.env.DAYTONA_API_URL;
  if (!apiKey) throw new Error('DAYTONA_API_KEY is not set in env');
  if (!apiUrl) throw new Error('DAYTONA_API_URL is not set in env');
  return new Daytona({ apiKey, apiUrl });
}

/**
 * Provision a worker sandbox for a claim.
 *
 * Creates a single-use Daytona sandbox from the worker image, copies env
 * files and config into it, sets the authenticated git remote, and checks
 * out the claim's base commit. The sandbox is ready for the in-sandbox
 * command template to start the tunnel proxy and run the node's command.
 *
 * @param {object} opts
 * @param {Daytona} [opts.daytona] — an existing Daytona client (creates
 *   one if not provided)
 * @param {Image} opts.image — the Declarative Builder image (from
 *   buildWorkerImage)
 * @param {string} opts.runId — the pipeline run identifier (for labeling)
 * @param {string} opts.baseRef — the git ref to check out as the claim's
 *   base. Must be a ref that exists on origin after fetch: a remote-tracking
 *   branch (e.g. `origin/main`, `origin/pipeline/<runId>/<chainId>`) or a
 *   commit SHA. Local branch names without the `origin/` prefix will fail
 *   because the snapshot only has remote-tracking branches.
 * @param {string} [opts.repoUrl] — the authenticated HTTPS clone URL for
 *   the repo (with token embedded). If not provided, reads GITHUB_TOKEN
 *   from env and constructs it.
 * @param {object} [opts.resources=DEFAULT_RESOURCES] — resource limits
 * @param {number} [opts.autoStopInterval=0] — auto-stop interval in minutes
 *   (0 means disabled — the dispatcher manages sandbox lifecycle)
 * @returns {Promise<{ sandbox: Sandbox, sandboxId: string, repoPath: string }>}
 *   the created sandbox, its ID, and the repo path inside it
 */
export async function provisionSandbox({
  daytona,
  image,
  runId,
  baseRef,
  repoUrl,
  resources = DEFAULT_RESOURCES,
  autoStopInterval = 0,
}) {
  if (!image) throw new Error('provisionSandbox: image is required');
  if (!runId) throw new Error('provisionSandbox: runId is required');
  if (!baseRef) throw new Error('provisionSandbox: baseRef is required');

  const client = daytona || createDaytonaClient();

  // Construct the authenticated repo URL if not provided.
  // The sandbox fetches from origin, so it needs read access to the repo.
  // The token is embedded in the URL (standard git HTTPS auth).
  const authenticatedRepoUrl = repoUrl || buildAuthenticatedRepoUrl();

  // Step 1: create the sandbox from the image.
  // Labels are set at creation (spike-label-scoping.md: on the returned
  // Sandbox instance immediately, no separate labeling call, no window
  // where a sandbox exists without its labels).
  // autoStopInterval=0 disables auto-stop (the dispatcher manages lifecycle).
  // autoDeleteInterval is left at default (disabled) — parked sandboxes
  // must not be auto-deleted (see Sandbox lifecycle in the plan).
  const sandbox = await client.create(
    {
      image,
      labels: { scope: SCOPE_LABEL, runId },
      resources,
      autoStopInterval,
    },
    {
      timeout: 900, // 15 min — first build can be slow (spike F5: ~30s first build)
      onSnapshotCreateLogs: (chunk) => {
        // Stream build logs so a slow/failing build is visible.
        process.stderr.write(chunk);
      },
    },
  );

  const sandboxId = sandbox.id;

  try {
    // Step 2: copy .env* files from the devcontainer into the sandbox.
    // These are gitignored, small, and contain secrets — never in the repo,
    // never in the snapshot. The dispatcher holds them and pushes per-sandbox
    // at provision time (see Credentials under Sandbox lifecycle in the plan).
    await copyEnvFiles(sandbox);

    // Step 3: copy opencode.json into the sandbox.
    // The file is committed in the repo and travels with the clone, but the
    // dispatcher copies it explicitly: the snapshot's bake is a cold-start
    // optimization, not a freshness guarantee, and an opencode.json baked
    // stale would silently pin old context limits (see Per-claim in the plan).
    await copyOpencodeJson(sandbox);

    // Step 4: copy the tunnel proxy script into the sandbox.
    // The in-sandbox command template starts it before the agent runs.
    await copyTunnelProxy(sandbox);

    // Step 5: set the authenticated git remote URL.
    // The snapshot baked the public HTTPS URL (no token); per-claim
    // provisioning sets the authenticated URL so `git fetch` works.
    const remoteResp = await sandbox.process.executeCommand(
      `git -C ${SANDBOX_REPO} remote set-url origin ${authenticatedRepoUrl}`,
      SANDBOX_REPO,
      undefined,
      30,
    );
    if (remoteResp.exitCode !== 0) {
      throw new ProvisioningError(
        `git remote set-url failed (exit ${remoteResp.exitCode}): ${remoteResp.result}`,
        sandboxId,
      );
    }

    // Step 6: fetch + checkout the claim's base.
    // fetch gets the latest from origin; checkout moves HEAD to the claim's
    // base commit. The base is either the trunk branch (for a chain's first
    // node or the first node after a merge point) or the chain branch head
    // (for a successor within a segment).
    //
    // node_modules is gitignored, so git operations don't touch it — the
    // baked deps survive fetch+checkout (spike Strategy A verification).
    const fetchResp = await sandbox.process.executeCommand(
      `git -C ${SANDBOX_REPO} fetch origin`,
      SANDBOX_REPO,
      undefined,
      60,
    );
    if (fetchResp.exitCode !== 0) {
      throw new ProvisioningError(
        `git fetch failed (exit ${fetchResp.exitCode}): ${fetchResp.result}`,
        sandboxId,
      );
    }

    const checkoutResp = await sandbox.process.executeCommand(
      `git -C ${SANDBOX_REPO} checkout ${baseRef}`,
      SANDBOX_REPO,
      undefined,
      30,
    );
    if (checkoutResp.exitCode !== 0) {
      throw new ProvisioningError(
        `git checkout ${baseRef} failed (exit ${checkoutResp.exitCode}): ${checkoutResp.result}`,
        sandboxId,
      );
    }

    return { sandbox, sandboxId, repoPath: SANDBOX_REPO };
  } catch (err) {
    // If provisioning fails after sandbox creation, destroy the sandbox
    // so it doesn't leak. The dispatcher's reconcile step would catch
    // it eventually (orphaned sandbox detection), but cleaning up
    // immediately is better — same pattern as the product's SandboxService
    // (delete on installBinaries failure).
    try {
      await client.delete(sandbox);
    } catch {
      // best-effort cleanup; the reaper will catch it
    }
    throw err;
  }
}

/**
 * Build the authenticated HTTPS clone URL for the repo.
 *
 * Uses GITHUB_TOKEN from the environment (the same token opencode.json
 * references as {env:GITHUB_TOKEN}). The token is embedded in the URL
 * (standard git HTTPS auth: https://x-access-token:<token>@github.com/...).
 *
 * @returns {string} the authenticated HTTPS URL
 * @throws if GITHUB_TOKEN is not set
 */
function buildAuthenticatedRepoUrl() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set — cannot construct authenticated repo URL');
  return `https://x-access-token:${token}@github.com/gv8-control/bmad-playground.git`;
}

/**
 * Copy all .env* files from the devcontainer root into the sandbox repo dir.
 *
 * These are gitignored, small, and contain secrets. The transfer is safe:
 * pipeline sandboxes run our own agents on our own code — they are not a
 * lower-trust tier (see Credentials under Sandbox lifecycle in the plan).
 *
 * Uses the Daytona FileSystem API (uploadFile) to push each file.
 */
async function copyEnvFiles(sandbox) {
  const envFiles = readdirSync(repoRoot)
    .filter(f => f.startsWith('.env') && !f.endsWith('.example'))
    .map(f => join(repoRoot, f));

  for (const envFile of envFiles) {
    if (!existsSync(envFile)) continue;
    const content = readFileSync(envFile);
    const remotePath = join(SANDBOX_REPO, basename(envFile));
    await sandbox.fs.uploadFile(content, remotePath);
  }
}

/**
 * Copy opencode.json from the devcontainer root into the sandbox repo dir.
 *
 * The file is committed in the repo and travels with the clone, but we
 * copy it explicitly to guarantee freshness (the snapshot's bake may be
 * stale — 24h caching window).
 */
async function copyOpencodeJson(sandbox) {
  const srcPath = join(repoRoot, 'opencode.json');
  if (!existsSync(srcPath)) return; // no opencode.json — nothing to copy
  const content = readFileSync(srcPath);
  const remotePath = join(SANDBOX_REPO, 'opencode.json');
  await sandbox.fs.uploadFile(content, remotePath);
}

/**
 * Copy the tunnel proxy script into the sandbox at /tmp/tunnel-proxy.js.
 *
 * The in-sandbox command template starts it with:
 *   node /tmp/tunnel-proxy.js &
 * before running opencode (see spike-ws-tunnel-proxy.md).
 */
async function copyTunnelProxy(sandbox) {
  if (!existsSync(TUNNEL_PROXY_SRC)) {
    throw new Error(`Tunnel proxy script not found at ${TUNNEL_PROXY_SRC}`);
  }
  const content = readFileSync(TUNNEL_PROXY_SRC);
  await sandbox.fs.uploadFile(content, TUNNEL_PROXY_DEST);
}

/**
 * Get the tunnel proxy environment variables for the sandbox.
 *
 * The in-sandbox command template uses these to start the proxy:
 *   NODE_PATH=/workspace/repo/node_modules node /tmp/tunnel-proxy.js &
 * before running opencode (see spike-ws-tunnel-proxy.md).
 *
 * NODE_PATH points at the repo's node_modules so `require('ws')` resolves.
 * The snapshot bakes `ws` globally via `npm install -g`, but Node does not
 * search the global modules dir by default — the spike established
 * NODE_PATH=$(npm root -g) as the fix. Since `ws` is also a project dep
 * (in package.json), pointing NODE_PATH at the repo's node_modules is
 * equivalent and more robust (the baked install is the same one the
 * agent's code uses).
 *
 * The dispatcher passes these as env vars to the session command.
 *
 * @returns {{ TUNNEL_RELAY_URL: string, TUNNEL_RELAY_TOKEN: string, TUNNEL_LISTEN_PORT: number, HTTPS_PROXY: string, NO_PROXY: string, NODE_PATH: string }}
 * @throws if RELAY_AUTH_TOKEN is not set in env
 */
export function getTunnelProxyEnv() {
  const relayToken = process.env.RELAY_AUTH_TOKEN;
  if (!relayToken) {
    throw new Error('RELAY_AUTH_TOKEN is not set — tunnel proxy cannot authenticate to the relay');
  }
  return {
    TUNNEL_RELAY_URL: RELAY_WS_URL,
    TUNNEL_RELAY_TOKEN: relayToken,
    TUNNEL_LISTEN_PORT: 8888,
    // NODE_PATH so `require('ws')` resolves from the repo's node_modules
    // (the snapshot bakes ws globally too, but Node doesn't search the
    // global dir by default — spike-ws-tunnel-proxy.js L125-127).
    NODE_PATH: join(SANDBOX_REPO, 'node_modules'),
    // The agent's command sets HTTPS_PROXY so opencode's HTTP CONNECT
    // requests go through the tunnel proxy. NO_PROXY excludes Essential
    // Services (which the sandbox reaches directly and the relay refuses
    // to tunnel).
    HTTPS_PROXY: 'http://127.0.0.1:8888',
    NO_PROXY: ESSENTIAL_SERVICES_NO_PROXY,
  };
}

/**
 * Error class for provisioning failures.
 *
 * Carries the sandboxId so the caller can attempt cleanup or report which
 * sandbox failed. The dispatcher's reconcile step would catch an orphaned
 * sandbox eventually, but this lets the caller clean up immediately.
 */
export class ProvisioningError extends Error {
  constructor(message, sandboxId) {
    super(message);
    this.name = 'ProvisioningError';
    this.sandboxId = sandboxId;
  }
}
