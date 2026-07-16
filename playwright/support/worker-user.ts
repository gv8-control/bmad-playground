/**
 * Per-worker test user isolation for parallel E2E test execution.
 *
 * Playwright runs with fullyParallel: true and workers: 4 in CI. Each worker
 * process gets its own TEST_WORKER_INDEX (0-based). By deriving a unique
 * githubId per worker, each worker gets its own User, RepoConnection,
 * Conversations, and Artifacts — eliminating the race condition where all
 * workers fight over a single singleton RepoConnection row (userId is @unique
 * in the Prisma schema, so there is exactly one connection per user).
 *
 * auth.setup.ts creates WORKER_USER_COUNT worker users upfront (worker-0
 * through worker-7), each with its own synthetic session stored at
 * .auth/{env}/worker-{i}/storage-state.json. The merged-fixtures authOptions
 * override selects the per-worker storage state based on workerIndex.
 */

/** Number of worker users to provision in auth.setup.ts. */
export const WORKER_USER_COUNT = 8;

/**
 * Fallback githubId for paths that don't need per-worker isolation (e.g.
 * the real OAuth flow, which only creates a single default storage state).
 * Kept for backwards compatibility — active code paths use getWorkerGithubId().
 */
export const E2E_GITHUB_ID_DEFAULT = 'e2e-test-default-99999';

/**
 * Returns the githubId for the given worker index. When no index is provided,
 * falls back to process.env.TEST_WORKER_INDEX (set by Playwright in each
 * worker process), then to '0'.
 *
 * Used in fixtures (pass testInfo.workerIndex) and in standalone helpers
 * like resetRepoConnection (omit the argument to use the env var).
 */
export function getWorkerGithubId(workerIndex?: number): string {
  const idx = workerIndex ?? Number(process.env.TEST_WORKER_INDEX ?? '0');
  return `e2e-test-worker-${idx}`;
}

/**
 * Returns the auth-session userIdentifier for the given worker index. This
 * maps to the storage state directory: .auth/{env}/worker-{i}/storage-state.json.
 */
export function getWorkerUserIdentifier(workerIndex?: number): string {
  const idx = workerIndex ?? Number(process.env.TEST_WORKER_INDEX ?? '0');
  return `worker-${idx}`;
}
