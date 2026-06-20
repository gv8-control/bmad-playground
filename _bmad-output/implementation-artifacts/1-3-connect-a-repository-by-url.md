---
status: done
baseline_commit: 9373d27
---

# Story 1.3: Connect a Repository by URL

Status: done

## Story

As a newly signed-in user,
I want to connect my team's GitHub repository by pasting its URL,
so that the platform can read and write BMAD artifacts there without me providing a separate token.

## Acceptance Criteria

**AC-1:** Given an authenticated user with no connected repository, when they land on `/onboarding`, then they see a single "Repository URL" input — no access-token field is shown (per architecture DL-7; supersedes EXPERIENCE.md's PAT-field description).

**AC-2:** Given a submitted Repository URL, when the platform validates it, then it checks that the OAuth access token obtained at sign-in grants write access to that repository.

**AC-3:** Given a successful validation, when the connection is established, then the OAuth access token is stored AES-256-GCM encrypted (per-user DEK + platform KEK envelope encryption, NFR-S4) and is never returned to the client after initial submission; each encryption operation generates a fresh, unique GCM nonce — verified by asserting no two stored ciphertexts for the same DEK ever share a nonce; the user is redirected to `/project-map` (final landing route wired in Epic 2, will 404 until then — expected).

**AC-4:** Given a failed validation, when the error is due to insufficient permission, an inaccessible repository, or a GitHub org OAuth App restriction (detected via the GitHub API response), then a descriptive inline error names the specific cause, including the org-restriction case explicitly rather than a generic "couldn't connect" message.

## Tasks / Subtasks

- [x] Task 1: Add Prisma models for credential and repo storage (AC: 3)
  - [x] 1.1 Add `OAuthCredential` model to `libs/database-schemas/src/prisma/schema.prisma` — stores per-user encrypted OAuth token with DEK envelope
  - [x] 1.2 Add `RepoConnection` model to the same schema — stores repo URL and credential health status per user
  - [x] 1.3 Add reverse-relations to the existing `User` model in the same file: `oauthCredential OAuthCredential?` and `repoConnection RepoConnection?` — **required** by Prisma to resolve the `@relation` back-references declared in both new models; migration will fail without them
  - [x] 1.4 Create and apply the database migration: run `cd libs/database-schemas && pnpm exec prisma migrate dev --name add_oauth_credential_and_repo_connection` — this generates a SQL migration file (committed to git) and applies it to the database. **`DATABASE_URL` must be set in your environment** (point to the Railway dev database if not running Postgres locally).
  - [x] 1.5 Regenerate the Prisma client: run `pnpm exec nx run database-schemas:generate` so the new models (`oAuthCredential`, `repoConnection`) are available in TypeScript.

- [x] Task 2: Implement AES-256-GCM encryption utilities (AC: 3)
  - [x] 2.1 Create `apps/web/src/lib/crypto.ts` — `encryptToken()` and `decryptToken()` using Node.js `crypto` module (see Dev Notes for exact implementation)
  - [x] 2.2 Create `apps/web/src/lib/crypto.test.ts` — tests for encrypt/decrypt roundtrip and nonce uniqueness assertion (see Dev Notes)

- [x] Task 3: Store the OAuth access token at sign-in (AC: 3)
  - [x] 3.1 Update `apps/web/src/lib/auth.ts` — in the `jwt` callback where `account?.provider === 'github'`, after the user upsert, also upsert `OAuthCredential` with the encrypted access token (see Dev Notes for exact change)
  - [x] 3.2 Add startup guard for `CREDENTIAL_ENCRYPTION_KEK` env var in `apps/web/src/lib/crypto.ts` (throw if missing or not a 64-hex-char string)
  - [x] 3.3 Add `CREDENTIAL_ENCRYPTION_KEK` documentation to `.env.example` (already has the key, just verify the placeholder is `REPLACE_WITH_OPENSSL_RAND_HEX_32` per story 1.2 review patch — if it shows `0000...` change it)

- [x] Task 4: Implement the repo-connection Server Action (AC: 2, 3, 4)
  - [x] 4.1 Create `apps/web/src/actions/repo-connection.actions.ts` — `connectRepository(repoUrl: string)` Server Action (see Dev Notes for full implementation). **The `actions/` directory is new — create it.**
  - [x] 4.2 Validate URL format with Zod before any API call (must be `https://github.com/{owner}/{repo}` with optional `.git` suffix or trailing slash)
  - [x] 4.3 Retrieve and decrypt the user's OAuth token from the `OAuthCredential` table using `userId` from the session
  - [x] 4.4 Call GitHub REST API `GET /repos/{owner}/{repo}` with the token; parse the `permissions.push` field
  - [x] 4.5 Handle the four distinct error cases: not found (404), insufficient permissions (`permissions.push === false`), org restriction (403 with org-restriction body/header), generic error
  - [x] 4.6 On success: upsert `RepoConnection` in Postgres with `{ repoUrl, userId, credentialHealth: 'healthy' }` and return `{ success: true }`
  - [x] 4.7 Return typed errors from the Server Action (do NOT use exceptions for expected validation failures — return `{ error: string, errorCode: string }` instead)

- [x] Task 5: Build the onboarding page (AC: 1, 3, 4)
  - [x] 5.1 Create `apps/web/src/app/(dashboard)/layout.tsx` — minimal pass-through layout that renders `{children}` only (no app shell yet — that is Story 1.8; this file is required by Next.js for the `(dashboard)` route group)
  - [x] 5.2 Create `apps/web/src/app/(dashboard)/onboarding/page.tsx` — Server Component; if the user already has a `RepoConnection`, call `redirect('/project-map')`; otherwise render `<RepositoryUrlForm />`
  - [x] 5.3 Create `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` — Client Component; form with URL input, "Validating…" state, inline error display, and success redirect (see Dev Notes for full implementation)
  - [x] 5.4 Create `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` — unit tests: renders input, shows "Validating…" on submit, shows error message on failure

- [x] Task 6: Update root page redirect logic (AC: 1)
  - [x] 6.1 Update `apps/web/src/app/page.tsx` — Server Component that reads Prisma for the current user's `RepoConnection`; if found redirect to `/project-map`, otherwise redirect to `/onboarding` (replaces the current unconditional redirect to `/project-map`)

- [x] Task 7: Verify build and tests
  - [x] 7.1 Run `pnpm exec nx run-many --target=lint --all --parallel=4` — confirm 0 errors
  - [x] 7.2 Run `pnpm exec nx run-many --target=test --all --parallel=4 --passWithNoTests` — confirm all tests pass including crypto and form tests
  - [x] 7.3 Run `pnpm exec nx build web` — confirm production build succeeds
  - [x] 7.4 Create `playwright/e2e/onboarding/connect-repo.spec.ts` — E2E test covering: authenticated user lands on `/onboarding` (redirect from `/`), submits a valid repo URL and is redirected to `/project-map`, submits an invalid URL format and sees an inline error. Reuse the authenticated session fixture from `playwright/auth.setup.ts`.

## Dev Notes

### Critical Architecture Decisions for This Story

**OAuth token storage flow (no server-to-server calls):**
The GitHub OAuth access token (`account.access_token`) is available ONLY during the Auth.js `jwt` callback when `account` is non-null (first sign-in). This story captures it there — encrypts with AES-256-GCM and upserts into `OAuthCredential`. The Server Action then retrieves and decrypts it from Postgres when the user connects a repo. This is the only time the raw token ever exists unencrypted, in server memory, briefly during the jwt callback. It is NEVER put in the JWT cookie, NEVER sent to the browser, and NEVER returned by any API.

**Why Server Action (not browser→apps/agent-be):** The architecture ultimately routes repo connection through `apps/agent-be`, but `apps/agent-be` has no real implementation yet (it's a scaffold). For this story, implement in `apps/web` Server Actions — this satisfies all ACs and the "no server-to-server calls" constraint (Server Actions run on the `apps/web` server, not via a separate service call). The `apps/agent-be` credentials module (`credentials.service.ts`) will be wired up in a later story when sandbox provisioning needs it.

**Write-access check uses REST API, not a dry-run git push:** The architecture specifies a dry-run git operation (`git push --dry-run`) to verify write access, but `apps/web` has no git tooling — git operations belong to `apps/agent-be`, which is a scaffold in this sprint. `GET /repos/{owner}/{repo}` → `permissions.push` is the pragmatic substitute for this story. Do NOT attempt a shell-out or subprocess `git` call from a Server Action.

**CREDENTIAL_ENCRYPTION_KEK:** Must be a 32-byte hex string (64 hex chars). Available as a Railway env var to BOTH services. Generate with `openssl rand -hex 32`. Validate at app startup in the crypto utility.

### Prisma Schema — New Models

Add to `libs/database-schemas/src/prisma/schema.prisma`:

```prisma
model OAuthCredential {
  id             String   @id @default(cuid())
  userId         String   @unique @map("user_id")
  encryptedDek   String   @map("encrypted_dek")   // base64: AES-256-GCM(DEK, KEK) + GCM tag appended
  dekNonce       String   @map("dek_nonce")        // base64: 12-byte random nonce for DEK encryption
  encryptedToken String   @map("encrypted_token")  // base64: AES-256-GCM(token, DEK) + GCM tag appended
  tokenNonce     String   @map("token_nonce")      // base64: 12-byte random nonce for token encryption
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("oauth_credentials")
}

model RepoConnection {
  id               String   @id @default(cuid())
  userId           String   @unique @map("user_id")  // One repo per user for MVP
  repoUrl          String   @map("repo_url")
  credentialHealth String   @default("healthy") @map("credential_health")  // "healthy" | "failed"
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("repo_connections")
}
```

Also add the reverse-relations to the existing `User` model:

```prisma
model User {
  // ... existing fields ...
  oauthCredential  OAuthCredential?
  repoConnection   RepoConnection?
}
```

### apps/web/src/lib/crypto.ts

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12; // GCM requires 12 bytes
const TAG_LENGTH = 16;   // GCM auth tag is 16 bytes

function getKek(): Buffer {
  const kek = process.env.CREDENTIAL_ENCRYPTION_KEK;
  if (!kek || !/^[0-9a-f]{64}$/i.test(kek)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEK must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32');
  }
  return Buffer.from(kek, 'hex');
}

export interface EncryptedCredential {
  encryptedDek: string;   // base64
  dekNonce: string;        // base64
  encryptedToken: string;  // base64
  tokenNonce: string;      // base64
}

// Each call generates two fresh random nonces — GCM nonce-uniqueness enforced by crypto.randomBytes
export function encryptToken(plaintext: string): EncryptedCredential {
  const kek = getKek();

  // Step 1: Generate fresh per-user DEK
  const dek = randomBytes(32);

  // Step 2: Encrypt DEK with KEK
  const dekNonce = randomBytes(NONCE_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekNonce);
  const encryptedDekBody = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();
  // Store: ciphertext + auth tag concatenated
  const encryptedDek = Buffer.concat([encryptedDekBody, dekTag]).toString('base64');

  // Step 3: Encrypt token with DEK
  const tokenNonce = randomBytes(NONCE_LENGTH);
  const tokenCipher = createCipheriv(ALGORITHM, dek, tokenNonce);
  const encryptedTokenBody = Buffer.concat([
    tokenCipher.update(Buffer.from(plaintext, 'utf8')),
    tokenCipher.final(),
  ]);
  const tokenTag = tokenCipher.getAuthTag();
  const encryptedToken = Buffer.concat([encryptedTokenBody, tokenTag]).toString('base64');

  return {
    encryptedDek,
    dekNonce: dekNonce.toString('base64'),
    encryptedToken,
    tokenNonce: tokenNonce.toString('base64'),
  };
}

export function decryptToken(credential: EncryptedCredential): string {
  const kek = getKek();

  // Step 1: Decrypt DEK using KEK
  const dekNonce = Buffer.from(credential.dekNonce, 'base64');
  const encryptedDekBuf = Buffer.from(credential.encryptedDek, 'base64');
  const dekCiphertext = encryptedDekBuf.subarray(0, encryptedDekBuf.length - TAG_LENGTH);
  const dekTag = encryptedDekBuf.subarray(encryptedDekBuf.length - TAG_LENGTH);
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekNonce);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(dekCiphertext), dekDecipher.final()]);

  // Step 2: Decrypt token using DEK
  const tokenNonce = Buffer.from(credential.tokenNonce, 'base64');
  const encryptedTokenBuf = Buffer.from(credential.encryptedToken, 'base64');
  const tokenCiphertext = encryptedTokenBuf.subarray(0, encryptedTokenBuf.length - TAG_LENGTH);
  const tokenTag = encryptedTokenBuf.subarray(encryptedTokenBuf.length - TAG_LENGTH);
  const tokenDecipher = createDecipheriv(ALGORITHM, dek, tokenNonce);
  tokenDecipher.setAuthTag(tokenTag);
  const plaintext = Buffer.concat([tokenDecipher.update(tokenCiphertext), tokenDecipher.final()]);

  return plaintext.toString('utf8');
}
```

### apps/web/src/lib/crypto.test.ts

```typescript
import { encryptToken, decryptToken } from './crypto';

// Set the KEK env var before tests
process.env.CREDENTIAL_ENCRYPTION_KEK = 'a'.repeat(64); // Valid 32-byte hex for tests

describe('encryptToken / decryptToken', () => {
  it('roundtrips a plaintext value correctly', () => {
    const token = 'gho_test_access_token_12345';
    const encrypted = encryptToken(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it('generates unique nonces on each call (GCM nonce-uniqueness)', () => {
    const enc1 = encryptToken('token');
    const enc2 = encryptToken('token');
    // Both the DEK nonce and token nonce must differ across calls
    expect(enc1.dekNonce).not.toBe(enc2.dekNonce);
    expect(enc1.tokenNonce).not.toBe(enc2.tokenNonce);
    // The ciphertexts must also differ (different DEKs + different nonces)
    expect(enc1.encryptedToken).not.toBe(enc2.encryptedToken);
  });

  it('throws if CREDENTIAL_ENCRYPTION_KEK is invalid', () => {
    const orig = process.env.CREDENTIAL_ENCRYPTION_KEK;
    process.env.CREDENTIAL_ENCRYPTION_KEK = 'tooshort';
    expect(() => encryptToken('x')).toThrow('CREDENTIAL_ENCRYPTION_KEK');
    process.env.CREDENTIAL_ENCRYPTION_KEK = orig;
  });
});
```

### auth.ts — Update Required (Task 3.1)

Two changes to `apps/web/src/lib/auth.ts`:

**1. Add this import at the very top of the file**, alongside the existing imports:

```typescript
import { encryptToken } from './crypto';
```

**2. Inside the existing `if (account?.provider === 'github' && profile)` block**, after `token.userId = user.id;`, add the credential upsert:

```typescript
// account.access_token is only available here on first sign-in — not on JWT refreshes
if (account.access_token) {
  const encrypted = encryptToken(account.access_token);
  await getPrisma().oAuthCredential.upsert({
    where: { userId: user.id },
    update: {
      encryptedDek: encrypted.encryptedDek,
      dekNonce: encrypted.dekNonce,
      encryptedToken: encrypted.encryptedToken,
      tokenNonce: encrypted.tokenNonce,
    },
    create: {
      userId: user.id,
      encryptedDek: encrypted.encryptedDek,
      dekNonce: encrypted.dekNonce,
      encryptedToken: encrypted.encryptedToken,
      tokenNonce: encrypted.tokenNonce,
    },
  });
}
```

**Why inside the `if` block:** `account` is only non-null during the very first sign-in. On every subsequent JWT refresh, `account` is null — placing this code outside the `if` block would silently skip credential storage (it also type-errors there since `account` is `Account | null` outside the narrowed scope).

**Prisma model naming:** Prisma generates `oAuthCredential` (camelCase from `OAuthCredential`). Verify this with the generated client after running the generate step.

**IMPORTANT — auth.ts runs in Node.js runtime, NOT edge:** `auth.ts` uses Node.js Prisma adapter (via `getPrisma()`), so `crypto` and Prisma are available. The EDGE-safe `auth.config.ts` does NOT import `auth.ts` — they are already split. Do NOT import `encryptToken` from `auth.config.ts`.

### apps/web/src/actions/repo-connection.actions.ts

```typescript
'use server';

import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/crypto';
import { z } from 'zod';

const connectRepoSchema = z.object({
  repoUrl: z
    .string()
    .url('Must be a valid URL')
    .regex(
      /^https:\/\/github\.com\/[^/]+\/[^/]+(\.git)?\/?$/,
      'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)'
    ),
});

type ConnectResult =
  | { success: true }
  | { error: string; errorCode: 'INVALID_URL' | 'NOT_FOUND' | 'INSUFFICIENT_PERMISSION' | 'ORG_RESTRICTION' | 'NO_CREDENTIAL' | 'UNKNOWN' };

export async function connectRepository(repoUrl: string): Promise<ConnectResult> {
  // 1. Validate URL format
  const parsed = connectRepoSchema.safeParse({ repoUrl: repoUrl.trim() });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message, errorCode: 'INVALID_URL' };
  }
  const cleanUrl = parsed.data.repoUrl.replace(/\.git\/?$/, '').replace(/\/$/, '');

  // 2. Get session
  const session = await auth();
  if (!session?.userId) {
    return { error: 'Not authenticated', errorCode: 'UNKNOWN' };
  }

  // 3. Retrieve encrypted token from DB
  const credential = await getPrisma().oAuthCredential.findUnique({
    where: { userId: session.userId },
  });
  if (!credential) {
    return { error: 'No OAuth credential found. Please sign out and sign in again.', errorCode: 'NO_CREDENTIAL' };
  }

  // 4. Decrypt the token
  const accessToken = decryptToken(credential);

  // 5. Parse owner/repo from URL
  const match = cleanUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return { error: 'Invalid GitHub repository URL format', errorCode: 'INVALID_URL' };
  }
  const [, owner, repo] = match;

  // 6. Call GitHub API to check write access
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) {
      return {
        error: "Repository not found. Check that the URL is correct and you have access to it.",
        errorCode: 'NOT_FOUND',
      };
    }

    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      const message: string = body?.message ?? '';
      // GitHub org OAuth App restriction returns 403 with a message referencing org enforcement
      const isOrgRestriction =
        message.toLowerCase().includes('organization') &&
        (message.toLowerCase().includes('oauth') ||
          message.toLowerCase().includes('application') ||
          message.toLowerCase().includes('access'));
      if (isOrgRestriction) {
        return {
          error:
            "Your GitHub organization has OAuth App access restrictions enabled. Ask an org admin to approve bmad-easy in the organization's OAuth App settings.",
          errorCode: 'ORG_RESTRICTION',
        };
      }
      return {
        error: "Access denied. You may not have permission to access this repository.",
        errorCode: 'INSUFFICIENT_PERMISSION',
      };
    }

    if (!response.ok) {
      return { error: `GitHub returned an unexpected error (${response.status}). Try again.`, errorCode: 'UNKNOWN' };
    }

    const data = await response.json();

    // Check write permission — `permissions.push` is true when the token has write access
    if (!data.permissions?.push) {
      return {
        error:
          "You don't have write access to this repository. bmad-easy requires write access to create and update BMAD artifacts.",
        errorCode: 'INSUFFICIENT_PERMISSION',
      };
    }

    // 7. Store the connection
    await getPrisma().repoConnection.upsert({
      where: { userId: session.userId },
      update: {
        repoUrl: cleanUrl,
        credentialHealth: 'healthy',
      },
      create: {
        userId: session.userId,
        repoUrl: cleanUrl,
        credentialHealth: 'healthy',
      },
    });

    return { success: true };
  } catch (err) {
    console.error('[connectRepository] Unexpected error:', err);
    return { error: 'An unexpected error occurred. Please try again.', errorCode: 'UNKNOWN' };
  }
}
```

### apps/web/src/app/(dashboard)/layout.tsx

Minimal pass-through — Story 1.8 builds the actual shell here:

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

This file is REQUIRED by Next.js for the `(dashboard)` route group to work. Do NOT add any structure here — Story 1.8 owns it.

### apps/web/src/app/(dashboard)/onboarding/page.tsx

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { RepositoryUrlForm } from '@/components/onboarding/RepositoryUrlForm';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.userId) redirect('/sign-in');

  // If user already has a repo connection, skip onboarding
  const existing = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
  });
  if (existing) redirect('/project-map');

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <div className="text-center">
          <h1 className="text-text-1 text-2xl font-semibold tracking-tight">
            Connect your repository
          </h1>
          <p className="mt-2 text-text-2 text-sm">
            Paste the URL of your BMAD-enabled GitHub repository to get started.
          </p>
        </div>
        <RepositoryUrlForm />
      </div>
    </main>
  );
}
```

### apps/web/src/components/onboarding/RepositoryUrlForm.tsx

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { connectRepository } from '@/actions/repo-connection.actions';

export function RepositoryUrlForm() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await connectRepository(url);
      if ('success' in result) {
        router.push('/project-map');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="repo-url" className="text-text-2 text-sm font-medium">
          Repository URL
        </label>
        <input
          id="repo-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/your-org/your-repo"
          required
          disabled={isPending}
          aria-describedby={error ? 'repo-url-error' : undefined}
          className="px-3 py-2.5 bg-surface border border-border rounded-md text-text-1 text-sm placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {error && (
          <p id="repo-url-error" role="alert" className="text-negative text-sm">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !url.trim()}
        className="w-full px-4 py-2.5 bg-accent text-accent-fg rounded-md text-sm font-medium hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Validating…' : 'Connect repository'}
      </button>
    </form>
  );
}
```

**Why `useTransition` over `useFormStatus`:** Server Action called directly (not via `<form action=...>`), so `useFormStatus` does not apply here. `useTransition` is the correct pattern for calling Server Actions programmatically.

**UX-DR14 compliance:** Single URL input (no token field), URL-format validation on blur is deferred (the submit-time validation covers the AC); "Validating…" read-only state is the disabled + pending button state; BMAD-not-found blocking message is handled by `connectRepository` returning a specific `errorCode` (Epic 1 story 1.4 adds BMAD validation — this story only covers write-access validation); validation-failure inline error appears below the input with `role="alert"`.

**UX-DR16 accessibility:**
- `aria-describedby` links the input to the error message when present
- Error has `role="alert"` for screen reader announcement
- Focus ring on input and button via `focus-visible:ring-2` (keyboard-only, not suppressed on click)
- Button disabled while pending (not just visually dimmed)

### apps/web/src/app/page.tsx — Update

Replace the existing file:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';

export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) redirect('/sign-in');

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
  });

  redirect(repoConnection ? '/project-map' : '/onboarding');
}
```

This replaces the unconditional `/project-map` redirect with a Prisma-aware check.

### apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositoryUrlForm } from './RepositoryUrlForm';

// Mock the Server Action
jest.mock('@/actions/repo-connection.actions', () => ({
  connectRepository: jest.fn(),
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { connectRepository } from '@/actions/repo-connection.actions';

describe('RepositoryUrlForm', () => {
  it('renders the URL input and connect button', () => {
    render(<RepositoryUrlForm />);
    expect(screen.getByLabelText(/repository url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect repository/i })).toBeInTheDocument();
  });

  it('shows Validating… while the action is pending', async () => {
    (connectRepository as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    expect(await screen.findByRole('button', { name: /validating/i })).toBeInTheDocument();
  });

  it('shows inline error when the action returns an error', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'You don\'t have write access to this repository.',
      errorCode: 'INSUFFICIENT_PERMISSION',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/write access/i)
    );
  });
});
```

### Critical Learnings from Previous Stories

**1. Next.js version is 16 (not 15):** `searchParams`, `params`, and any other async prop in Server Components must be awaited. `auth()` returns a Promise — always await it.

**2. Prisma 7 WASM client + PrismaPg adapter:** Do NOT instantiate `PrismaClient` with `new PrismaClient()` alone — it requires the PrismaPg adapter. Always use `getPrisma()` from `apps/web/src/lib/prisma.ts`. DO NOT create a second Prisma client in any new file.

**3. Auth.js v5 split config:** `auth.config.ts` is edge-safe (no Prisma, no Node.js modules). `auth.ts` is Node.js-only (has Prisma, can use Node.js `crypto`). DO NOT import from `auth.ts` in `auth.config.ts` or in `middleware.ts`. DO NOT import `encryptToken` or `getPrisma` in edge-runtime code.

**4. TypeScript paths in apps/web/tsconfig.json:** `@/*` maps to `./src/*`. `@bmad-easy/*` path mappings are in `apps/web/tsconfig.json` (NOT only in tsconfig.base.json). When generating the Prisma client after schema changes, the generated types must pick up the new models — verify by checking that `getPrisma().oAuthCredential` and `getPrisma().repoConnection` type-check correctly before writing the action.

**5. `@auth/core/jwt` import path for JWT augmentation:** If extending the JWT type, use `declare module '@auth/core/jwt'` (NOT `'next-auth/jwt'`).

**6. Jest config in apps/web:** Requires `moduleFileExtensions: ['tsx', 'ts', 'jsx', 'js', ...]` and `tsconfig.spec.json` with `jsx: react-jsx`. Check `apps/web/jest.config.ts` — it already exists from story 1.2. No need to recreate; just add new tests alongside existing ones.

**7. Server Actions MUST have `'use server'` directive at the top of the file.** For a file containing only Server Actions, put `'use server'` as the first line.

**8. GitHub API `permissions` field:** Only present if the authenticated user has a personal relationship to the repo (collaborator, owner, or fork). For repos the user doesn't own, `permissions` may be `null` even on a successful 200 response. Handle this: if `permissions` is absent, treat as insufficient permission OR do a secondary check. In practice, for repos with access via OAuth `repo` scope, `permissions.push` should be populated. Add a defensive check: `if (data.permissions === null || data.permissions === undefined)` return an error asking the user to verify access.

**9. No `(dashboard)` route group exists yet:** This story creates it. The empty `layout.tsx` is essential — Next.js will 500 without it for route groups.

**10. The `CREDENTIAL_ENCRYPTION_KEK` validation in `crypto.ts`:** Runs at call time (not at module load time, since Next.js bundles modules but runs server code lazily). The startup guard in `getKek()` runs on the first call to `encryptToken` or `decryptToken`. This is fine for runtime validation.

**11. `Session.userId` is typed as optional (`userId?: string`):** This was established in Story 1.2. Always guard with `?.` — e.g. `session?.userId` — before using it. Never access `session.userId` directly without a null/undefined guard.

**12. `connectRepository` uses REST API `permissions.push`, not a dry-run git push:** The architecture specifies a dry-run git operation for write-access validation, but `apps/web` has no git tooling (git operations belong to `apps/agent-be`). REST API permissions check (`GET /repos/{owner}/{repo}` → `permissions.push`) is the intentional implementation for this story. A proper dry-run will be wired when `apps/agent-be`'s credentials module is active. Do NOT attempt to shell out `git push --dry-run` from a Server Action.

**13. Token re-sign-in path for already-onboarded users:** The OAuth credential upsert in the `jwt` callback runs on every GitHub sign-in (when `account` is non-null). If a user is already onboarded (`RepoConnection` exists), the root `page.tsx` redirects to `/project-map` — bypassing `/onboarding` — but the credential is still refreshed at sign-in time. Forced re-authentication for revoked credentials is out of scope for this story; Story 1.6 handles that recovery flow.

**14. `credentialHealth` column is a raw `String`, not a Prisma enum:** Valid values are `"healthy"` and `"failed"`. A Prisma enum was not used to keep the migration simple and to leave room for future statuses without another migration. The shared type `libs/shared-types/credential-health.types.ts` defines the TypeScript union; import from there in any code that reads or writes this field to enforce the constraint at the TypeScript level rather than the DB level.

**15. `RepoConnection` stores `repoUrl` only — no `repoName` field:** Downstream stories that need the display name must parse it from `repoUrl` (e.g. `url.split('/').slice(-1)[0]`). A dedicated `repoName` column was deferred to avoid speculation about future schema needs. Do NOT add it in this story.

### Project Structure — Files Created/Modified

```
libs/database-schemas/src/prisma/
  schema.prisma                          ← UPDATE (add OAuthCredential, RepoConnection models)

apps/web/src/
  lib/
    auth.ts                              ← UPDATE (add OAuthCredential upsert in jwt callback)
    crypto.ts                            ← NEW (AES-256-GCM encrypt/decrypt utilities)
    crypto.test.ts                       ← NEW (roundtrip + nonce uniqueness tests)
  actions/
    repo-connection.actions.ts           ← NEW (connectRepository Server Action)
  app/
    page.tsx                             ← UPDATE (Prisma-aware redirect to /onboarding or /project-map)
    (dashboard)/
      layout.tsx                         ← NEW (minimal pass-through; Story 1.8 adds the real shell)
      onboarding/
        page.tsx                         ← NEW (Server Component; renders RepositoryUrlForm)
  components/
    onboarding/
      RepositoryUrlForm.tsx              ← NEW (Client Component form)
      RepositoryUrlForm.test.tsx         ← NEW (unit tests)
.env.example                             ← VERIFY (CREDENTIAL_ENCRYPTION_KEK placeholder is non-functional)
```

### ATDD Artifacts

- Checklist: `_bmad-output/test-artifacts/atdd-checklist-1-3-connect-a-repository-by-url.md`
- Unit tests (crypto): `apps/web/src/lib/crypto.test.ts`
- Integration tests (auth credential storage): `apps/web/src/lib/auth.credential.spec.ts`
- Integration tests (Server Action): `apps/web/src/actions/repo-connection.actions.spec.ts`
- Component tests: `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx`
- E2E tests: `playwright/e2e/onboarding/onboarding.spec.ts`

### References

- [Epics: Story 1.3 ACs](../_bmad-output/planning-artifacts/epics.md#story-13-connect-a-repository-by-url)
- [Architecture: Authentication & Security](../_bmad-output/planning-artifacts/architecture.md#authentication--security) — DEK+KEK envelope encryption spec
- [Architecture: API & Communication Patterns #5](../_bmad-output/planning-artifacts/architecture.md#api--communication-patterns) — no server-to-server rule
- [Architecture: Complete Directory Structure](../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure)
- [Architecture: Technical Constraints](../_bmad-output/planning-artifacts/architecture.md#technical-constraints--dependencies) — org OAuth restriction, dry-run check
- [Architecture: Naming Patterns](../_bmad-output/planning-artifacts/architecture.md#naming-patterns)
- [UX EXPERIENCE.md: Onboarding](../_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md#pre-app-shell)
- [Epics: UX-DR14 — Onboarding](../_bmad-output/planning-artifacts/epics.md#ux-design-requirements) — URL-only model, supersedes EXPERIENCE.md PAT flow
- [Story 1.2: Dev Notes and Completion Notes](../_bmad-output/implementation-artifacts/1-2-sign-in-with-github.md#dev-notes) — Auth.js v5 patterns, Prisma 7 adapter, Jest config, TypeScript paths
- [Story 1.2: File List](../_bmad-output/implementation-artifacts/1-2-sign-in-with-github.md#file-list) — all existing files to NOT duplicate

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Zod v4 changed `.errors` to `.issues` — fixed `connectRepository` to use `parsed.error.issues[0].message` then further simplified to a single fixed GitHub-format error message to satisfy the `[P1]` test that expects github.com in all invalid-URL errors.
- `useTransition` in jsdom causes `isPending` to remain `true` after async callback resolves, breaking two form tests. Replaced with explicit `useState` loading state — semantically equivalent for production, fully predictable in tests.
- Postgres not running locally, so `prisma migrate dev` could not be executed. Migration SQL created manually from schema diff; `prisma generate` succeeded without a live DB and regenerated the client with both new models.

### Completion Notes List

- AES-256-GCM envelope encryption (`crypto.ts`): per-call fresh DEK + KEK-wrapped DEK, each with independent random 12-byte nonces — GCM nonce-uniqueness verified by 20-call set-size assertion.
- OAuth token stored encrypted in `OAuthCredential` table on every GitHub sign-in (jwt callback, `account` non-null path only). Token never placed in JWT cookie or returned to client.
- `connectRepository` Server Action: Zod URL validation → session guard → DB credential lookup → decrypt → GitHub REST `permissions.push` check → upsert `RepoConnection`. Returns typed result union; no exceptions for expected failures.
- Onboarding page: URL-only form (no token/PAT field, AC-1/DL-7). Inline per-cause error messages for NOT_FOUND, INSUFFICIENT_PERMISSION, ORG_RESTRICTION (AC-4). Success redirects to /project-map (AC-3).
- Root `page.tsx` now Prisma-aware: redirects authenticated users to `/onboarding` or `/project-map` based on `RepoConnection` presence.
- All 68 unit/integration tests pass; 0 lint errors; production build succeeds.

### File List

libs/database-schemas/src/prisma/schema.prisma
libs/database-schemas/src/prisma/migrations/20260619000000_add_oauth_credential_and_repo_connection/migration.sql
libs/database-schemas/src/generated/client/index.d.ts
libs/database-schemas/src/generated/client/index.js
apps/web/src/lib/crypto.ts
apps/web/src/lib/crypto.test.ts
apps/web/src/lib/auth.ts
apps/web/src/lib/auth.credential.spec.ts
apps/web/src/actions/repo-connection.actions.ts
apps/web/src/actions/repo-connection.actions.spec.ts
apps/web/src/app/page.tsx
apps/web/src/app/(dashboard)/layout.tsx
apps/web/src/app/(dashboard)/onboarding/page.tsx
apps/web/src/components/onboarding/RepositoryUrlForm.tsx
apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx
playwright/e2e/onboarding/onboarding.spec.ts

## Change Log

- 2026-06-19: Implemented story 1.3 — AES-256-GCM credential encryption, OAuthCredential+RepoConnection Prisma models, connectRepository Server Action, onboarding page with RepositoryUrlForm, Prisma-aware root redirect. 68 tests pass, 0 lint errors, production build green.
- 2026-06-20: Addressed 11 code review patches — decryptToken moved inside try/catch, .catch() added to form handleSubmit, GitHub 401 handler added, URL regex tightened to reject # and ?, buffer length guards added to decryptToken, open redirect fixed for //, TEST_ENV guard added to internal test routes, auth.ts logs error when access_token absent, migration DROP CONSTRAINT IF EXISTS added, .env.example KEK placeholder corrected. 96 tests pass.

## Review Findings

### Decision Needed

- [x] [Review][Decision] Resolved 2026-06-20: Implemented `page.route()` mocking for NOT_FOUND, INSUFFICIENT_PERMISSION, and success-redirect E2E tests. Server Action POST requests (bearing `Next-Action` header) are intercepted and fulfilled with mock React Flight wire-format payloads. 11 previously-skipped tests are now active; 2 remain skipped (ORG_RESTRICTION and token-visibility require real GitHub org/credentials). Validate RSC payload format against a running dev server.

### Patches

- [x] [Review][Patch] Migration missing DROP INDEX for `github_login_key` — `schema.prisma` removes `@unique` from `githubLogin` but `20260619000000_add_oauth_credential_and_repo_connection/migration.sql` contains no `ALTER TABLE users DROP CONSTRAINT users_github_login_key`. Running this migration against an existing DB leaves a unique constraint that doesn't match the schema, causing upsert failures when a second user takes a recycled GitHub login. [`libs/database-schemas/src/prisma/migrations/20260619000000_add_oauth_credential_and_repo_connection/migration.sql`]
- [x] [Review][Patch] `decryptToken` called outside `try/catch` in `connectRepository` — if decryption fails (rotated KEK, corrupted DB row), the throw escapes the Server Action entirely; Next.js returns a 500 and the form client has no errorCode to act on, leaving `isPending` stuck. Move `decryptToken(credential)` inside the `try` block. [`apps/web/src/actions/repo-connection.actions.ts:56`]
- [x] [Review][Patch] `RepositoryUrlForm.handleSubmit` missing `.catch()` — `connectRepository(url).then(...)` has no rejection handler; any unhandled Server Action exception (including the decryptToken throw above) leaves `isPending` permanently `true` and shows no inline error. [`apps/web/src/components/onboarding/RepositoryUrlForm.tsx:19`]
- [x] [Review][Patch] `/api/internal/test` routes reachable unauthenticated in non-production environments — middleware explicitly excludes `api/internal/test` from auth checks, and route guard is only `NODE_ENV === 'production'`. In staging or Docker-compose dev environments, unauthenticated callers can create or delete arbitrary users and repo connections. Add a secondary guard (e.g., a shared internal secret header or a stricter environment check). [`apps/web/src/app/api/internal/test/seed-user/route.ts:5`, `apps/web/src/middleware.ts:8`]
- [x] [Review][Patch] `callbackUrl` open redirect allows protocol-relative URLs — `raw.startsWith('/')` passes for `//evil.com`, which browsers treat as an off-site redirect. Reject values starting with `//`: `const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';`. [`apps/web/src/app/sign-in/page.tsx:9`]
- [x] [Review][Patch] GitHub `401` response not handled — a revoked or expired token returns 401, which falls to the `!response.ok` branch returning `errorCode: 'UNKNOWN'` with no actionable message. Add a dedicated 401 branch returning `errorCode: 'NO_CREDENTIAL'` with a message instructing the user to sign out and sign in again. [`apps/web/src/actions/repo-connection.actions.ts:73`]
- [x] [Review][Patch] URL with `#` or `?` passes Zod/regex validation and is stored in DB — `[^/]+` in the regex matches `#` and `?`, so `https://github.com/owner/repo#anchor` and `https://github.com/owner/repo?q=1` pass validation and are stored as `repoUrl`. Tighten the regex to `[^/#?]+`. [`apps/web/src/actions/repo-connection.actions.ts:13`]
- [x] [Review][Patch] `decryptToken` has no buffer length guard before slicing — if `encryptedDek` decodes to fewer than 16 bytes, `subarray(0, length - 16)` returns an empty buffer and `setAuthTag` receives garbage bytes. Add: `if (encryptedDekBuf.length < TAG_LENGTH) throw new Error('Malformed encryptedDek: too short')`. (Guard uses `< TAG_LENGTH`, not `<=`, since exactly TAG_LENGTH bytes is valid for empty-string ciphertext.) [`apps/web/src/lib/crypto.ts:57`]
- [x] [Review][Patch] Silent skip when `account.access_token` is falsy in jwt callback — if GitHub omits the token (revoked scope), sign-in succeeds but no credential is stored; the user reaches the app and every `connectRepository` call returns `NO_CREDENTIAL` with no recovery path. Log an error and either abort sign-in or surface a warning. [`apps/web/src/lib/auth.ts:65`]
- [x] [Review][Patch] `seededRepository` Playwright fixture references non-existent `/api/internal/test/repositories` route — verified: the current fixture is named `withRepoConnection` and already uses the correct `/api/internal/test/repo-connections` route (which exists). Finding was stale; no code change required. [`playwright/support/custom-fixtures.ts:20`]
- [x] [Review][Patch] `.env.example` `CREDENTIAL_ENCRYPTION_KEK` placeholder should be `REPLACE_WITH_OPENSSL_RAND_HEX_32` — currently empty string. Story 1.2 review explicitly required a non-functional placeholder to prevent accidental key reuse. An empty value is non-functional but does not communicate intent. [`.env.example`]

### Deferred

- [x] [Review][Defer] DEK not zeroed after use in `decryptToken` — the plaintext DEK remains on the heap until GC; standard practice is `dek.fill(0)` in a `finally` block — deferred, pre-existing
- [x] [Review][Defer] Org-restriction detection via heuristic GitHub message substring matching — fragile if GitHub changes its error message wording — deferred, forward-looking
- [x] [Review][Defer] `data.permissions` absent or degraded for organization repos accessed via team membership — these repos may return 200 with no `permissions` field, causing a misleading `INSUFFICIENT_PERMISSION` error — deferred, documented in Dev Notes #8
- [x] [Review][Defer] `callbackUrl` in `auth.config.ts` is set to `pathname` only — query string parameters are stripped on the auth redirect; currently no protected pages use query params — deferred, forward-looking
- [x] [Review][Defer] `/api/internal/test/repo-connections/[id]` DELETE has no Prisma P2025 error handling — a DELETE with a non-existent ID throws an unhandled 500, causing misleading test teardown failures — deferred, test infrastructure
- [x] [Review][Defer] `syntheticSession` in `playwright/auth.setup.ts` mints real JWT tokens from `AUTH_SECRET` — if `AUTH_SECRET` leaks from CI environment, arbitrary valid sessions can be forged — deferred, inherent to synthetic session architecture

### Patches (Review 2 — 2026-06-20)

- [x] [Review][Patch] No fetch timeout on GitHub API call — `connectRepository` calls `fetch` without a timeout or `AbortController`; a slow or unreachable GitHub API suspends the Server Action indefinitely, holding a DB connection. Add `signal: AbortSignal.timeout(10_000)` to the fetch options. [`apps/web/src/actions/repo-connection.actions.ts:65`]
- [x] [Review][Patch] URL regex allows percent-encoded characters in owner/repo segments — `[^/#?]+` matches `%20` and other percent-encoded sequences; a URL like `https://github.com/owner%20name/repo` passes Zod validation and is sent to the GitHub API, returning a misleading 404. Tighten to `[a-zA-Z0-9._-]+` to match valid GitHub name characters. [`apps/web/src/actions/repo-connection.actions.ts:13`]
- [x] [Review][Patch] `withRepoConnection` fixture teardown not failure-safe — if setup throws after the `RepoConnection` is created but before `use()` is called, the `DELETE` cleanup is skipped, leaking a DB row and leaving future test runs with stale state. Wrap `await use()` in a `try/finally` block and move the `DELETE` call into `finally`. [`playwright/support/custom-fixtures.ts:26`]

### Deferred (Review 2 — 2026-06-20)

- [x] [Review][Defer] Nonce length not validated in `decryptToken` — `dekNonce` and `tokenNonce` are decoded from Base64 without asserting exactly 12 bytes; a corrupt nonce throws an unhelpful native OpenSSL error rather than a descriptive `Error`. Caught by the outer try/catch as `UNKNOWN`. — deferred, pre-existing
- [x] [Review][Defer] `encryptedDek` minimum-size guard too weak — the `< TAG_LENGTH` (16-byte) guard passes for an exactly-16-byte input, yielding a zero-byte ciphertext slice; a valid DEK ciphertext is at least 48 bytes (32-byte DEK + 16-byte GCM tag). Currently caught by the outer try/catch. — deferred, pre-existing
- [x] [Review][Defer] Parallel E2E workers share fixed `E2E_GITHUB_ID` — concurrent `withRepoConnection` fixture runs mutate the same DB row; one test's teardown deletes the other's fixture mid-run. Safe with sequential workers (current config). — deferred, forward-looking
- [x] [Review][Defer] No unit test for `decryptToken` failure path inside `connectRepository` — a KEK-rotated or tampered `OAuthCredential` row throws inside the try block and is caught as `UNKNOWN`; no test verifies this behavior. — deferred, test infrastructure
- [x] [Review][Defer] Middleware permanently exempts `/api/internal/test` from auth — the TEST_ENV route-level guard is the sole protection layer; if TEST_ENV is accidentally set in a non-local environment the routes are fully exposed without authentication. — deferred, test infrastructure design

### Deferred (Review 3 — 2026-06-20)

_Note: Edge Case Hunter layer failed (process exited); findings from Blind Hunter and Acceptance Auditor only. 8 findings dismissed (false positives or already addressed in working tree)._

- [x] [Review][Defer] `withRepoConnection` fixture only deletes the `RepoConnection` row — the seeded `User` and its `OAuthCredential` accumulate across test runs; upserts are idempotent so correctness is unaffected, but orphaned credential rows remain in the database indefinitely. — deferred, test infrastructure
- [x] [Review][Defer] `credential_health` TEXT column has no DB-level CHECK constraint — valid values `"healthy"` / `"failed"` are enforced only at the TypeScript layer; a typo (e.g. `"Healthy"`) is silently stored without a constraint violation. — deferred, forward-looking
- [x] [Review][Defer] `CREDENTIAL_ENCRYPTION_KEK` validated lazily on first call, not at process startup — spec wording says "startup guard" but Next.js lazy module loading means validation runs on the first sign-in; misconfiguration surfaces as a user-facing error rather than a boot failure. Documented as intentional in Dev Notes #10. — deferred, intentional design choice

### Deferred (Review 4 — 2026-06-20)

_0 patches · 0 decisions · 5 new deferred · 14 dismissed. All Review 2 patches confirmed applied in working tree (not yet committed)._

- [x] [Review][Defer] `encryptToken` thrown error escapes jwt callback with no application-level catch — if `CREDENTIAL_ENCRYPTION_KEK` is missing or invalid, `getKek()` throws inside the NextAuth jwt callback; NextAuth catches the error and redirects to `/sign-in?error=…`; users see "Sign-in failed" with no actionable message and no application log of the KEK issue at the catch site. A startup env-var assertion or a try/catch with a specific log would surface the root cause immediately. — deferred, complement to existing "KEK lazy validation" defer; startup validation is the proper fix. [`apps/web/src/lib/auth.ts:49`]
- [x] [Review][Defer] Silent repository replacement — `repoConnection.upsert` overwrites an existing connection without user confirmation; guarded in practice by the onboarding redirect, but reachable via direct navigation to `/onboarding`. Intentional upsert semantics for MVP; a confirmation step belongs in a future story when repo-change is a designed user flow. [`apps/web/src/actions/repo-connection.actions.ts:126`]
- [x] [Review][Defer] Internal test routes return 500 on malformed or missing JSON body — `request.json()` is called without a try/catch in all three test routes; a request with no `Content-Type: application/json` or invalid JSON body yields an opaque 500 to the caller instead of a descriptive error. Test-only risk; the E2E fixture always sends valid JSON. [`apps/web/src/app/api/internal/test/seed-user/route.ts:9`]
- [x] [Review][Defer] Migration CREATE TABLE statements are not idempotent — `CREATE TABLE "oauth_credentials"` and `CREATE TABLE "repo_connections"` have no `IF NOT EXISTS` guard; if either table was partially pre-created manually, `prisma migrate deploy` fails and the migration is permanently marked failed in `_prisma_migrations`. In normal Prisma workflow this never occurs; idempotency is guaranteed by the migration table, not by SQL guards. — deferred, Prisma migration design. [`libs/database-schemas/src/prisma/migrations/20260619000000_add_oauth_credential_and_repo_connection/migration.sql`]
- [x] [Review][Defer] GitHub API 429 (rate limited) treated as generic UNKNOWN — the `!response.ok` catch-all returns "GitHub returned an unexpected error (429). Try again." with no retry guidance; `Retry-After` header is ignored. Rare in the current single-user MVP; a retry strategy belongs in a resilience story. [`apps/web/src/actions/repo-connection.actions.ts:109`]
