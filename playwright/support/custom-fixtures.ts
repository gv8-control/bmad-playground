import { test as base } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Fixed githubId that matches the one used in auth.setup.ts synthetic session.
const E2E_GITHUB_ID = 'e2e-test-default-99999';

type BmadEasyFixtures = {
  /** Ensures the synthetic E2E test user has a RepoConnection row for the duration of the test. */
  withRepoConnection: void;
};

export const test = base.extend<BmadEasyFixtures>({
  withRepoConnection: async ({ request }, use) => {
    // Upsert the test user to get its stable userId.
    const userRes = await request.post(`${BASE_URL}/api/internal/test/seed-user`, {
      data: { githubId: E2E_GITHUB_ID, githubLogin: 'e2e-test-user', name: 'E2E Test User' },
    });
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    // Create the RepoConnection for this user.
    const connRes = await request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
      data: { userId, repoUrl: 'https://github.com/test-org/test-repo' },
    });
    if (!connRes.ok()) {
      throw new Error(`repo-connections seed failed: ${connRes.status()} ${await connRes.text()}`);
    }
    const { id: connectionId } = (await connRes.json()) as { id: string };

    try {
      await use();
    } finally {
      await request.delete(`${BASE_URL}/api/internal/test/repo-connections/${connectionId}`);
    }
  },
});
