import { request as playwrightRequest } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Fixed githubId that matches the one used in auth.setup.ts synthetic session.
const E2E_GITHUB_ID = 'e2e-test-default-99999';

/**
 * Deletes any existing RepoConnection for the E2E test user.
 *
 * Uses the upsert-then-delete pattern: the POST /repo-connections route upserts
 * by userId (unique), returning the connection id whether it already existed or
 * was just created. The DELETE /repo-connections/[id] route then removes it.
 * This guarantees the user has NO connection after the call, clearing stale
 * state from prior test runs that may not have cleaned up properly.
 *
 * Intended for use in beforeAll hooks of test files whose tests expect the
 * authenticated user to have no RepoConnection (e.g. onboarding flow tests).
 */
export async function resetRepoConnection(): Promise<void> {
  const request = await playwrightRequest.newContext();
  try {
    const userRes = await request.post(`${BASE_URL}/api/internal/test/seed-user`, {
      data: { githubId: E2E_GITHUB_ID, githubLogin: 'e2e-test-user', name: 'E2E Test User' },
    });
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    const connRes = await request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
      data: { userId, repoUrl: 'https://github.com/test-org/test-repo' },
    });
    if (!connRes.ok()) {
      throw new Error(`repo-connections upsert failed: ${connRes.status()} ${await connRes.text()}`);
    }
    const { id: connectionId } = (await connRes.json()) as { id: string };

    await request.delete(`${BASE_URL}/api/internal/test/repo-connections/${connectionId}`);
  } finally {
    await request.dispose();
  }
}
