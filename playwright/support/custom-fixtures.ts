import { test as base } from '@playwright/test';
import { createRepository, type TestRepository } from './factories/repository-factory';

type BmadEasyFixtures = {
  /** A repository record pre-seeded via the platform API, cleaned up after the test. */
  seededRepository: TestRepository;
};

export const test = base.extend<BmadEasyFixtures>({
  seededRepository: async ({ request }, use) => {
    const repo = createRepository();

    const response = await request.post('/api/internal/test/repositories', { data: repo });
    if (!response.ok()) {
      throw new Error(`Failed to seed repository: ${response.status()} ${await response.text()}`);
    }

    await use(repo);

    await request.delete(`/api/internal/test/repositories/${repo.id}`);
  },
});
