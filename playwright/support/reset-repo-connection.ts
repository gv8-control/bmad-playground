import { request as playwrightRequest } from '@playwright/test';
import { withApiRetry } from './api-retry';
import { getWorkerGithubId } from './worker-user';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

/**
 * Deletes any existing RepoConnection for the E2E test user.
 *
 * Uses the upsert-then-delete pattern: the POST /repo-connections route upserts
 * by userId (unique), returning the connection id whether it already existed or
 * was just created. The DELETE /repo-connections/[id] route then removes it.
 * This guarantees the user has NO connection after the call, clearing stale
 * state from prior test runs that may not have cleaned up properly.
 *
 * Intended for use in beforeEach hooks of test files whose tests expect the
 * authenticated user to have no RepoConnection (e.g. onboarding flow tests).
 */
export async function resetRepoConnection(): Promise<void> {
  const request = await playwrightRequest.newContext();
  try {
    const userRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/seed-user`, {
        data: { githubId: getWorkerGithubId(), githubLogin: 'e2e-test-user', name: 'E2E Test User' },
      }),
    );
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    const connRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
        data: { userId, repoUrl: 'https://github.com/test-org/test-repo' },
      }),
    );
    if (!connRes.ok()) {
      throw new Error(`repo-connections upsert failed: ${connRes.status()} ${await connRes.text()}`);
    }
    const { id: connectionId } = (await connRes.json()) as { id: string };

    await withApiRetry(() =>
      request.delete(`${BASE_URL}/api/internal/test/repo-connections/${connectionId}`),
    );
  } finally {
    await request.dispose();
  }
}

/**
 * Ensures the E2E test user has a RepoConnection (creates one if none exists).
 *
 * Intended for use in afterAll hooks of test files that use resetRepoConnection
 * in beforeEach — so that subsequent test files (which may require a connection
 * to exist for conversation seeding) are not left without one.
 */
export async function seedRepoConnection(): Promise<void> {
  const request = await playwrightRequest.newContext();
  try {
    const userRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/seed-user`, {
        data: { githubId: getWorkerGithubId(), githubLogin: 'e2e-test-user', name: 'E2E Test User' },
      }),
    );
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    // Upsert by userId (unique) — creates if missing, updates if exists.
    const connRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
        data: { userId, repoUrl: 'https://github.com/test-org/test-repo' },
      }),
    );
    if (!connRes.ok()) {
      throw new Error(`repo-connections upsert failed: ${connRes.status()} ${await connRes.text()}`);
    }
  } finally {
    await request.dispose();
  }
}
