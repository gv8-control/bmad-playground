// Snapshot image definition for pipeline worker sandboxes.
//
// Defines the Daytona Declarative Builder image that bakes the repo clone,
// dependencies, opencode, and toolchain into a single snapshot. Sandboxes
// are created from this image on-demand at claim time via
// daytona.create({ image, resources, labels }).
//
// Strategy A (verified — see docs/todo/spike-baked-node-modules.md):
// bake a shallow clone + `yarn install` during the image build. The clone
// is prepared locally (where git credentials are available) and uploaded
// via addLocalDir; yarn install runs during the server-side build (network
// is available — spike finding F4). A bare `git clone` has no node_modules
// (gitignored), so the install step is what produces them (spike F3).
//
// Ownership (spike finding F1): the base image sets USER daytona (uid 1001);
// COPY'd files are root-owned; RUN steps execute as daytona and cannot chown.
// The `user: 'root'` create param is ignored. Fix: switch to root via
// dockerfileCommands, chown, switch back — the documented Daytona pattern.
//
// Resources (spike finding — see docs/todo/spike-snapshot-resources.md):
// the snapshot path REJECTS `resources` with a hard API error. Sandboxes
// must be created from the image (not a snapshot) to control resources.
// The provisioning module handles this — this module only defines the image.
//
// The image does NOT bake secrets. The .env* files, API keys, and the
// tunnel proxy's relay token are injected at claim time by the provisioning
// module. The opencode.json is committed in the repo and travels with the
// clone, but the provisioning module copies it explicitly (the snapshot's
// bake is a cold-start optimization, not a freshness guarantee).

import { Image } from '@daytonaio/sdk';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The base image: Node + git + npm (spike-verified).
// daytonaio/sandbox:0.8.0 sets USER daytona (uid 1001), shell is zsh.
const BASE_IMAGE = 'daytonaio/sandbox:0.8.0';

// Paths inside the sandbox image.
export const SANDBOX_REPO = '/workspace/repo';

// The Yarn version the project uses (from package.json's packageManager field).
// Corepack enable requires sudo (shims write to /usr/bin — spike-yarn-berry-disk.md F2).
const YARN_VERSION = '4.17.0';

// The `ws` package version for the tunnel proxy (spike-ws-tunnel-proxy.md).
const WS_VERSION = '8.18.0';

/**
 * Prepare a local shallow clone of the repo for baking into the snapshot.
 *
 * Creates a temporary directory, clones the repo with --depth 1 (using the
 * local git credentials — SSH keys or cached HTTPS credentials), and returns
 * the path. The caller is responsible for cleaning up the temp directory
 * after the snapshot build completes.
 *
 * The clone's remote URL is reset to the public HTTPS URL (no token) so
 * no credentials are baked into the image. Per-claim provisioning re-sets
 * the remote URL with a fresh token at claim time.
 *
 * @param {object} opts
 * @param {string} opts.repoUrl — the git URL to clone from (SSH or HTTPS,
 *   using whatever credentials the local environment provides)
 * @param {string} [opts.branch='main'] — the branch to clone
 * @returns {{ cloneDir: string, cleanup: () => void }} the path to the
 *   temporary clone and a cleanup function
 */
export function prepareCloneForBaking({ repoUrl, branch = 'main' }) {
  if (!repoUrl) throw new Error('prepareCloneForBaking: repoUrl is required');

  const cloneDir = mkdtempSync(join(tmpdir(), 'pipeline3-snapshot-'));
  const cleanup = () => {
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  };

  try {
    // Shallow clone — keeps the context archive small for addLocalDir.
    execSync(
      `git clone --depth 1 --branch ${branch} --no-tags "${repoUrl}" "${cloneDir}"`,
      { stdio: 'pipe', timeout: 120_000 },
    );

    // Reset the remote URL to the public HTTPS URL (no credentials baked).
    // The per-claim provisioning module sets the authenticated remote URL
    // at claim time, so the snapshot never carries a token.
    execSync(
      `git -C "${cloneDir}" remote set-url origin https://github.com/gv8-control/bmad-playground.git`,
      { stdio: 'pipe' },
    );

    // Remove node_modules if present (from a local clone) — the build
    // installs deps fresh via `yarn install` during the server-side build.
    // This ensures the snapshot is reproducible from the lockfile, not a
    // local artifact (spike F3: addLocalDir does NOT filter by .gitignore,
    // so a local node_modules would be copied in — we want a clean install).
    if (existsSync(join(cloneDir, 'node_modules'))) {
      rmSync(join(cloneDir, 'node_modules'), { recursive: true, force: true });
    }

    return { cloneDir, cleanup };
  } catch (err) {
    cleanup();
    throw new Error(`prepareCloneForBaking: clone failed: ${err.message}`);
  }
}

/**
 * Build the Declarative Builder Image for pipeline worker sandboxes.
 *
 * The image bakes:
 *   1. Corepack + Yarn 4 (the project's package manager). Corepack enable
 *      requires sudo (shims write to /usr/bin — spike-yarn-berry-disk.md F2).
 *   2. opencode at the pinned version (npm install -g opencode-ai@<version>).
 *   3. The `ws` npm package globally (the tunnel proxy depends on it — see
 *      spike-ws-tunnel-proxy.md).
 *   4. A shallow clone of the repo at /workspace/repo, uploaded via
 *      addLocalDir from the local clone prepared by prepareCloneForBaking().
 *   5. `yarn install --immutable` during the build (network available —
 *      spike F4) to produce node_modules.
 *   6. chown of /workspace/repo to uid 1001 (spike F1).
 *
 * @param {object} opts
 * @param {string} opts.cloneDir — local path to the prepared shallow clone
 *   (from prepareCloneForBaking)
 * @param {string} opts.opencodeVersion — the opencode version to install
 *   (from policy.json's `opencodeVersion` field)
 * @returns {Image} the Declarative Builder image, ready for daytona.create()
 */
export function buildWorkerImage({ cloneDir, opencodeVersion }) {
  if (!cloneDir) throw new Error('buildWorkerImage: cloneDir is required');
  if (!opencodeVersion) throw new Error('buildWorkerImage: opencodeVersion is required');
  if (!existsSync(cloneDir)) {
    throw new Error(`buildWorkerImage: cloneDir does not exist: ${cloneDir}`);
  }

  return Image
    .base(BASE_IMAGE)
    // Bake the shallow clone into the image at /workspace/repo.
    // addLocalDir uses tar.create (no .gitignore filtering — spike F3),
    // so we cleaned node_modules in prepareCloneForBaking to ensure a
    // fresh `yarn install` during the build.
    .addLocalDir(cloneDir, SANDBOX_REPO)
    .dockerfileCommands([
      // Step 1: system installs as root.
      'USER root',
      `RUN corepack enable && corepack prepare yarn@${YARN_VERSION} --activate`,
      `RUN npm install -g opencode-ai@${opencodeVersion} ws@${WS_VERSION}`,
      // Step 2: chown baked files to the daytona user (uid 1001).
      // COPY creates root-owned files; RUN steps execute as the current
      // USER. Without this chown, git cannot write to .git (fetch/checkout
      // fail) and the daytona user cannot traverse root-owned dirs
      // (spike-baked-node-modules.md F1).
      `RUN chown -R 1001:1001 ${SANDBOX_REPO}`,
      // Step 3: install deps as the daytona user.
      // yarn install runs during the server-side build (network available —
      // spike F4). --immutable fails on lockfile drift, matching npm ci
      // semantics. The install produces node_modules inside the baked clone;
      // per-claim provisioning fetches to current (node_modules is gitignored,
      // so git operations don't touch it — spike Strategy A verification).
      'USER 1001',
      `RUN cd ${SANDBOX_REPO} && yarn install --immutable`,
    ]);
}
