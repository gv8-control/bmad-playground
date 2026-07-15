import { test as base } from '@playwright/test';
import { withApiRetry } from './api-retry';
import { getWorkerGithubId } from './worker-user';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

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

type SeededConversation = {
  id: string;
  title: string;
};

type SeededTurn = {
  id: string;
  role: string;
  content: string;
};

type SeededConversationWithTurns = {
  id: string;
  title: string;
  turns: SeededTurn[];
};

type BmadEasyFixtures = {
  /** Ensures the synthetic E2E test user has a RepoConnection row for the duration of the test. */
  withRepoConnection: { connectionId: string };
  /** Seeds Artifact rows for the RepoConnection, so the Project Map has data without triggering a GitHub sync. Returns the seeded artifacts with their generated IDs. */
  withArtifacts: SeededArtifact[];
  /** Seeds Conversation rows (with titles) for the E2E test user, so the side nav has data. Returns the seeded conversations with their generated IDs. */
  withConversations: SeededConversation[];
  /** Seeds a single Conversation with Turn rows so the resume page has chat history from Postgres. Returns the seeded conversation with its turns. */
  withConversationAndTurns: SeededConversationWithTurns;
};

export const test = base.extend<BmadEasyFixtures>({
  withRepoConnection: async ({ request }, use) => {
    // Upsert the test user to get its stable userId.
    const userRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/seed-user`, {
        data: { githubId: getWorkerGithubId(), githubLogin: 'e2e-test-user', name: 'E2E Test User' },
      }),
    );
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    // Create the RepoConnection for this user.
    const connRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
        data: { userId, repoUrl: 'https://github.com/test-org/test-repo' },
      }),
    );
    if (!connRes.ok()) {
      throw new Error(`repo-connections seed failed: ${connRes.status()} ${await connRes.text()}`);
    }
    const { id: connectionId } = (await connRes.json()) as { id: string };

    try {
      await use({ connectionId });
    } finally {
      await withApiRetry(() =>
        request.delete(`${BASE_URL}/api/internal/test/repo-connections/${connectionId}`),
      );
    }
  },

  withArtifacts: async ({ request, withRepoConnection }, use) => {
    const { connectionId } = withRepoConnection;

    await withApiRetry(() =>
      request.delete(`${BASE_URL}/api/internal/test/artifacts`, {
        data: { repoConnectionId: connectionId },
      }),
    );

    const seedRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/artifacts`, {
        data: { repoConnectionId: connectionId, artifacts: SEED_ARTIFACTS },
      }),
    );
    if (!seedRes.ok()) {
      throw new Error(`artifacts seed failed: ${seedRes.status()} ${await seedRes.text()}`);
    }
    const { ids } = (await seedRes.json()) as { ids: string[] };
    const artifacts: SeededArtifact[] = SEED_ARTIFACTS.map((a, i) => ({ ...a, id: ids[i] }));

    try {
      await use(artifacts);
    } finally {
      await withApiRetry(() =>
        request.delete(`${BASE_URL}/api/internal/test/artifacts`, {
          data: { repoConnectionId: connectionId },
        }),
      );
    }
  },

  withConversations: async ({ request, withRepoConnection }, use) => {
    const seedConversations = [
      { title: 'PRD Planning Session', lastActiveAt: '2026-07-04T10:00:00.000Z' },
      { title: 'Architecture Review', lastActiveAt: '2026-07-04T11:00:00.000Z' },
      { title: 'Sprint Retrospective', lastActiveAt: '2026-07-04T12:00:00.000Z' },
    ];

    const userRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/seed-user`, {
        data: { githubId: getWorkerGithubId(), githubLogin: 'e2e-test-user', name: 'E2E Test User' },
      }),
    );
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    const seedRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/conversations`, {
        data: { userId, conversations: seedConversations },
      }),
    );
    if (!seedRes.ok()) {
      throw new Error(`conversations seed failed: ${seedRes.status()} ${await seedRes.text()}`);
    }
    const { ids } = (await seedRes.json()) as { ids: string[] };
    const conversations: SeededConversation[] = seedConversations.map((c, i) => ({
      id: ids[i],
      title: c.title,
    }));

    try {
      await use(conversations);
    } finally {
      await withApiRetry(() =>
        request.delete(`${BASE_URL}/api/internal/test/conversations`, {
          data: { userId },
        }),
      );
    }
  },

  withConversationAndTurns: async ({ request, withRepoConnection }, use) => {
    const userRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/seed-user`, {
        data: { githubId: getWorkerGithubId(), githubLogin: 'e2e-test-user', name: 'E2E Test User' },
      }),
    );
    if (!userRes.ok()) {
      throw new Error(`seed-user failed: ${userRes.status()} ${await userRes.text()}`);
    }
    const { userId } = (await userRes.json()) as { userId: string };

    const convRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/conversations`, {
        data: {
          userId,
          conversations: [{ title: 'Resume E2E Conversation', lastActiveAt: '2026-07-04T12:00:00.000Z' }],
        },
      }),
    );
    if (!convRes.ok()) {
      throw new Error(`conversation seed failed: ${convRes.status()} ${await convRes.text()}`);
    }
    const { ids: convIds } = (await convRes.json()) as { ids: string[] };
    const conversationId = convIds[0];

    const seedTurns = [
      { role: 'user', content: 'What does the PRD say about auth?', createdAt: '2026-07-04T11:00:00.000Z' },
      { role: 'assistant', content: 'The PRD specifies GitHub OAuth via Auth.js v5 with an 8-hour JWT session.', createdAt: '2026-07-04T11:01:00.000Z' },
      { role: 'user', content: 'And the database?', createdAt: '2026-07-04T11:05:00.000Z' },
      { role: 'assistant', content: 'PostgreSQL with Prisma, single shared schema in libs/database-schemas.', createdAt: '2026-07-04T11:06:00.000Z' },
    ];

    const turnsRes = await withApiRetry(() =>
      request.post(`${BASE_URL}/api/internal/test/conversations/${conversationId}/turns`, {
        data: { turns: seedTurns },
      }),
    );
    if (!turnsRes.ok()) {
      throw new Error(`turns seed failed: ${turnsRes.status()} ${await turnsRes.text()}`);
    }
    const { ids: turnIds } = (await turnsRes.json()) as { ids: string[] };
    const turns: SeededTurn[] = seedTurns.map((t, i) => ({ id: turnIds[i], role: t.role, content: t.content }));

    const conversation: SeededConversationWithTurns = {
      id: conversationId,
      title: 'Resume E2E Conversation',
      turns,
    };

    try {
      await use(conversation);
    } finally {
      await withApiRetry(() =>
        request.delete(`${BASE_URL}/api/internal/test/conversations/${conversationId}/turns`),
      );
      await withApiRetry(() =>
        request.delete(`${BASE_URL}/api/internal/test/conversations`, {
          data: { userId },
        }),
      );
    }
  },
});
