import { test as base } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Fixed githubId that matches the one used in auth.setup.ts synthetic session.
const E2E_GITHUB_ID = 'e2e-test-default-99999';

const SEED_ARTIFACTS = [
  {
    path: '_bmad-output/planning-artifacts/prds/prd.md',
    type: 'prd',
    title: 'bmad-easy Product Requirements',
    status: 'completed',
    lastModifiedAt: '2026-07-01T10:00:00.000Z',
    content: `---
title: bmad-easy Product Requirements
status: completed
---

# Product Requirements Overview

This document defines the **core capabilities** for bmad-easy.

The platform delivers *real-time collaboration* features.

## Key Features

- Repository connection
- Artifact browsing
- Markdown rendering

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js |
| Backend | NestJS |

## Code Example

\`\`\`typescript
const artifact = await prisma.artifact.findFirst();
\`\`\`

Inline \`code\` is also supported.
`,
  },
  {
    path: '_bmad-output/planning-artifacts/architecture.md',
    type: 'architecture',
    title: 'bmad-easy Architecture',
    status: 'in-progress',
    lastModifiedAt: '2026-07-02T14:00:00.000Z',
    content: '# Architecture',
  },
  {
    path: '_bmad-output/planning-artifacts/epics.md',
    type: 'epics',
    title: 'Epic Breakdown',
    status: 'completed',
    lastModifiedAt: '2026-06-28T09:00:00.000Z',
    content: '# Epics',
  },
];

type SeededArtifact = {
  id: string;
  path: string;
  type: string;
  title: string;
  status: string;
  lastModifiedAt: string;
  content: string;
};

type BmadEasyFixtures = {
  /** Ensures the synthetic E2E test user has a RepoConnection row for the duration of the test. */
  withRepoConnection: { connectionId: string };
  /** Seeds Artifact rows for the RepoConnection, so the Project Map has data without triggering a GitHub sync. Returns the seeded artifacts with their generated IDs. */
  withArtifacts: SeededArtifact[];
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
      await use({ connectionId });
    } finally {
      await request.delete(`${BASE_URL}/api/internal/test/repo-connections/${connectionId}`);
    }
  },

  withArtifacts: async ({ request, withRepoConnection }, use) => {
    const { connectionId } = withRepoConnection;

    await request.delete(`${BASE_URL}/api/internal/test/artifacts`, {
      data: { repoConnectionId: connectionId },
    });

    const seedRes = await request.post(`${BASE_URL}/api/internal/test/artifacts`, {
      data: { repoConnectionId: connectionId, artifacts: SEED_ARTIFACTS },
    });
    if (!seedRes.ok()) {
      throw new Error(`artifacts seed failed: ${seedRes.status()} ${await seedRes.text()}`);
    }
    const { ids } = (await seedRes.json()) as { ids: string[] };
    const artifacts: SeededArtifact[] = SEED_ARTIFACTS.map((a, i) => ({ ...a, id: ids[i] }));

    try {
      await use(artifacts);
    } finally {
      await request.delete(`${BASE_URL}/api/internal/test/artifacts`, {
        data: { repoConnectionId: connectionId },
      });
    }
  },
});
