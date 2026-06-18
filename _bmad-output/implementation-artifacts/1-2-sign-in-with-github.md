---
status: review
baseline_commit: bcbb72e4924ce56738f455f0446f7e9dbb0b34e2
---

# Story 1.2: Sign In with GitHub

Status: review

## Story

As a non-dev team member,
I want to sign in to bmad-easy using my GitHub account,
so that I can access the platform without creating a separate username/password.

## Acceptance Criteria

**AC-1:** Given an unauthenticated user visits the platform, when they are redirected to `/sign-in`, then they see a centered single-column layout with "Sign in with GitHub" as the sole interactive element, and clicking it initiates the GitHub OAuth flow requesting `repo` scope.

**AC-2:** Given a successful GitHub OAuth authorization, when the session is established, then the session persists across browser refreshes until logout or expiry (minimum 8 hours).

**AC-3:** Given an OAuth failure, when the user returns to the sign-in screen, then an inline error ("Sign-in failed. Try again or contact support.") appears below the re-enabled button.

**AC-4:** Given any unauthenticated request to a platform page, when it reaches the server, then it redirects to `/sign-in` (FR19).

## Tasks / Subtasks

- [x] Task 1: Install Auth.js v5 and wire the GitHub provider (AC: 1, 2)
  - [x] 1.1 Add `next-auth@^5.0.0-beta.31` to the **root** `package.json` `dependencies` section (it's a workspace-wide dependency used by `apps/web`); run `pnpm install`
  - [x] 1.2 Create `apps/web/src/lib/prisma.ts` — singleton Prisma client (see Dev Notes for exact code)
  - [x] 1.3 Create `apps/web/src/lib/auth.ts` — `NextAuth` config (GitHub provider, JWT strategy 8h, `jwt`/`session` callbacks for User upsert) (see Dev Notes)
  - [x] 1.4 Create `apps/web/src/app/api/auth/[...nextauth]/route.ts` — export `GET` and `POST` from handlers (see Dev Notes)
  - [x] 1.5 Add `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL` entries to `.env.example`

- [x] Task 2: Add Next.js middleware guard (AC: 4)
  - [x] 2.1 Create `apps/web/src/middleware.ts` — wraps `auth` from `@/lib/auth`; redirects unauthenticated users to `/sign-in`; exclude `/sign-in`, `/api/auth/*`, `/_next/*`, static files from enforcement (see Dev Notes for matcher config)

- [x] Task 3: Build the sign-in page (AC: 1, 3)
  - [x] 3.1 Load Inter and JetBrains Mono via `next/font/google` in `apps/web/src/app/layout.tsx` and expose as CSS variables (see Dev Notes) — this fulfills the deferred font-loading task from story 1.1
  - [x] 3.2 Create `apps/web/src/app/sign-in/page.tsx` — centered layout, GitHub sign-in button, error state from `searchParams.error` (see Dev Notes for full component)
  - [x] 3.3 Create `apps/web/src/app/sign-in/page.test.tsx` — unit tests: renders button, shows error message when `?error=` present (see Dev Notes)

- [x] Task 4: Replace the root page placeholder (AC: 4)
  - [x] 4.1 Replace `apps/web/src/app/page.tsx` (currently the Nx default welcome template — deferred from story 1.1) with a minimal server component that redirects to `/project-map` using `redirect()` from `next/navigation`; the middleware protects this route so only authenticated users reach it

- [x] Task 5: Verify build and tests
  - [x] 5.1 Run `pnpm exec nx run-many --target=lint --all --parallel=4` — confirm 0 lint errors
  - [x] 5.2 Run `pnpm exec nx run-many --target=test --all --parallel=4 --passWithNoTests` — confirm sign-in page tests pass
  - [x] 5.3 Run `pnpm exec nx build web` — confirm Next.js production build succeeds

## Dev Notes

### Critical: Next.js 16 searchParams is a Promise

Story 1.1 review found Next.js is actually version **16** (not 15 as specified). In Next.js 15+, `searchParams` in Server Components is async and must be awaited:

```typescript
// CORRECT for Next.js 15+
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  ...
}
```

Do NOT use the synchronous `searchParams.error` pattern from Next.js 14 — it will cause a type error and runtime warning.

### Critical: Middleware File Location

Next.js middleware MUST be at `apps/web/src/middleware.ts` (NOT inside `app/`). The architecture doc shows `app/middleware.ts` but this is incorrect for Next.js — middleware is always at the `src/` root or project root. The pre-existing `playwright/auth.setup.ts` and E2E fixtures already reference `BASE_URL`, confirming middleware at the right level.

### Critical: Auth.js v5 Beta API Differs from v4

Auth.js v5 (`next-auth@^5.0.0-beta.31`) has a fundamentally different API than v4. Do NOT follow v4 docs or examples:

- Config file exports `{ handlers, auth, signIn, signOut }` from `NextAuth()` — not a default export
- Route handler exports `{ GET, POST }` from `handlers`  
- Middleware uses `auth` as the middleware function directly
- Env vars: `AUTH_SECRET` (not `NEXTAUTH_SECRET`), `AUTH_GITHUB_ID` (not `GITHUB_CLIENT_ID`)
- `jwt` callback: `account` is only non-null on **first** sign-in — use this to upsert the User
- `session` callback receives `token` (JWT) not `user` (DB) when using `strategy: "jwt"`

### Package Installation

Add to root `package.json` `dependencies` (NOT devDependencies):

```json
"next-auth": "^5.0.0-beta.31"
```

Run `pnpm install` from repo root. Do NOT add it to `apps/web/package.json` — this is a pnpm workspace and packages belong in the root unless app-specific exclusion is needed.

### apps/web/src/lib/prisma.ts

The architecture specifies this file as the Prisma client singleton for `apps/web`. Create it now — it's needed by `auth.ts` for the User upsert, and is referenced by future stories:

```typescript
import { PrismaClient } from '@bmad-easy/database-schemas';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Important:** `PrismaClient` is imported from `@bmad-easy/database-schemas` (the path mapping from `tsconfig.base.json` resolves to `libs/database-schemas/src/index.ts`). Prisma 7 uses `prisma.config.ts` for the datasource URL (breaking change from v6 discovered in story 1.1) — the client itself still works with `DATABASE_URL` env var via the generated client's internal config.

### apps/web/src/lib/auth.ts

Full implementation with TypeScript augmentation, User upsert in `jwt` callback, and GitHub `repo` scope:

```typescript
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { prisma } from './prisma';

declare module 'next-auth' {
  interface Session {
    userId: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours (FR18 minimum)
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // `account` is non-null only on the first sign-in for this session
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as {
          id: number;
          login: string;
          name?: string | null;
          email?: string | null;
        };
        const user = await prisma.user.upsert({
          where: { githubId: String(githubProfile.id) },
          update: {
            name: githubProfile.name ?? null,
            email: githubProfile.email ?? null,
            githubLogin: githubProfile.login,
          },
          create: {
            githubId: String(githubProfile.id),
            githubLogin: githubProfile.login,
            name: githubProfile.name ?? null,
            email: githubProfile.email ?? null,
          },
        });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.userId = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },
});
```

**Why upsert in `jwt` callback (not `signIn` callback):** In Auth.js v5, `signIn` runs before the `jwt` callback and before the OAuth `profile` is available on the `token`. Using `jwt` with `account` non-null guard is the correct v5 pattern for side-effects on first sign-in.

**Why `profile` casting:** Auth.js v5's `profile` type is broad (`Profile`); GitHub's actual profile adds `login`, `id` etc. Cast is required for TS to accept these fields.

**OAuth token from GitHub:** The GitHub OAuth access token (`account.access_token`) is NOT stored in the session or JWT at this point. Story 1.3 (repository connection) stores it encrypted; story 1.2 only establishes identity. Do not be tempted to store `account.access_token` here.

### apps/web/src/app/api/auth/[...nextauth]/route.ts

```typescript
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

The directory must be created: `apps/web/src/app/api/auth/[...nextauth]/`. Note the brackets are literal in the filesystem (Next.js catch-all route segment).

### apps/web/src/middleware.ts

Use `auth` as the middleware function directly, with a custom callback that redirects unauthenticated users:

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default auth((req: NextRequest & { auth: ReturnType<typeof auth> extends Promise<infer T> ? T : never }) => {
  const isAuthenticated = !!req.auth;
  const { pathname } = req.nextUrl;

  if (!isAuthenticated) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
```

**Alternative simpler form** (if the above causes TS errors with the beta):

```typescript
export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    '/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
```

The simple `export { auth as middleware }` form relies on Auth.js internally handling the redirect to `pages.signIn` (`/sign-in`). Try this first; fall back to the custom callback form if the redirect behavior is incorrect in the beta.

**Important:** The matcher regex uses a negative lookahead. Test that `/sign-in` itself is never redirect-looped. The pattern `(?!sign-in|api/auth|...)` excludes those paths from middleware processing entirely.

### apps/web/src/app/layout.tsx (update for fonts)

Replace the existing file (which has `<html lang="en" className="dark">`) with font loading via `next/font/google`. This fulfills the deferred font-loading item from story 1.1 review:

```tsx
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'bmad-easy',
  description: 'BMAD Easy Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-bg text-text-1`}>
        {children}
      </body>
    </html>
  );
}
```

Also update `apps/web/tailwind.config.ts` — change `fontFamily` to use CSS variables (keeps `next/font` as the source of truth):

```typescript
fontFamily: {
  sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['var(--font-mono)', 'JetBrains Mono', 'Fira Mono', 'monospace'],
},
```

### apps/web/src/app/sign-in/page.tsx

Centered single-column layout per UX EXPERIENCE.md. Error state from `searchParams.error` (set by Auth.js when redirecting to the error page). `signIn("github")` is called via a Server Action inside a `<form>`:

```tsx
import { signIn } from '@/lib/auth';
import { GitHubIcon } from '@/components/icons/github-icon';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const hasError = !!error;
  const redirectTo = callbackUrl ?? '/';

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-text-1 text-2xl font-semibold tracking-tight">
            bmad-easy
          </h1>
          <p className="mt-2 text-text-2 text-sm">
            Sign in to access your BMAD platform
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('github', { redirectTo });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg font-medium text-sm"
          >
            <GitHubIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            Sign in with GitHub
          </button>
        </form>

        {hasError && (
          <p
            className="text-negative text-sm text-center"
            role="alert"
            aria-live="polite"
          >
            Sign-in failed. Try again or contact support.
          </p>
        )}
      </div>
    </main>
  );
}
```

Create `apps/web/src/components/icons/github-icon.tsx` for the GitHub SVG logo:

```tsx
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
```

**UX note:** The sign-in page does NOT use the app shell (no side nav, no `(dashboard)` route group). It is outside `app/(dashboard)/` per the architecture's routing structure.

**UX-DR16 accessibility compliance:**
- Focus ring: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg` (never suppressed on click because `focus-visible` only applies on keyboard focus)
- Error message: `role="alert"` + `aria-live="polite"` so screen readers announce it
- GitHub icon: `aria-hidden="true"` (decorative, button text already describes action)

### apps/web/src/app/sign-in/page.test.tsx

Co-located test (per architecture Structure Patterns). Unit tests only — no GitHub OAuth credentials needed:

```tsx
import { render, screen } from '@testing-library/react';
import SignInPage from './page';

jest.mock('@/lib/auth', () => ({
  signIn: jest.fn(),
}));

describe('SignInPage', () => {
  it('renders the Sign in with GitHub button', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole('button', { name: /sign in with github/i })
    ).toBeInTheDocument();
  });

  it('shows error message when error param is present', async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ error: 'OAuthCallback' }),
      })
    );
    expect(
      screen.getByText(/sign-in failed/i)
    ).toBeInTheDocument();
  });

  it('does not show error message when no error param', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.queryByRole('alert')
    ).not.toBeInTheDocument();
  });
});
```

**Testing setup note:** The test requires `@testing-library/react` and `@testing-library/jest-dom`. Check if already installed. If not, add them as devDependencies in the root `package.json`:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

The `jest.config.ts` at the root should already configure Jest with the Next.js preset. The test environment for `apps/web` should be `jsdom` (not `node`). Check `apps/web/project.json`'s test target for the Jest config path.

### apps/web/src/app/page.tsx (replace Nx default)

Replace with a server component redirect to the project map (deferred from story 1.1 review: "Replace when the first real page is implemented"):

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/project-map');
}
```

The middleware ensures only authenticated users reach this page. The redirect target `/project-map` will 404 until story 2.2 builds it — this is expected iterative behavior.

### .env.example additions

Add these entries to the existing `.env.example`:

```bash
# ─── Auth.js (next-auth v5) ────────────────────────────────────────────────────
# Generate with: openssl rand -base64 32
AUTH_SECRET=

# GitHub OAuth App credentials (https://github.com/settings/developers)
# Callback URL: http://localhost:3000/api/auth/callback/github
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# Base URL of the web app (used by Auth.js for callback URL construction)
AUTH_URL=http://localhost:3000
```

### Environment Variables for Local Dev

For local development (not committed), create `apps/web/.env.local` (gitignored):
```
AUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_GITHUB_ID=<your GitHub OAuth App client ID>
AUTH_GITHUB_SECRET=<your GitHub OAuth App client secret>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bmad_easy_dev
```

GitHub OAuth App setup: go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### Architecture Patterns to Follow

- **No global client-state library** — the sign-in page is a Server Component; `signIn()` is a Server Action (called via `form action`), not a client-side fetch
- **Tailwind custom tokens** — use `bg-bg`, `text-text-1`, `text-text-2`, `text-negative`, `bg-accent`, `text-accent-fg`, `hover:bg-accent-hover`, `ring-accent` (all defined in `tailwind.config.ts` from story 1.1)
- **Dark mode only** — `bg-bg` is already `#0D0D11`; no light mode variants needed
- **Component files: PascalCase** — `GitHubIcon.tsx` but wait — the architecture says "Component files: PascalCase (`ConversationPane.tsx`)". So name it `GitHubIcon.tsx` with a named export. Directory `icons/` is lowercase per "Non-component files: kebab-case".
- **Tests co-located** — `page.test.tsx` next to `page.tsx`, not in a separate `__tests__/` tree
- **No `class-validator`/`class-transformer`** — this story doesn't use validation DTOs; Zod validation for future Server Actions

### Previous Story Learnings Relevant to This Story

From story 1.1 completion notes and debug log:

1. **Tailwind v3** (not v4) is installed — all Tailwind class syntax is v3-compatible. The `rounded-md` class maps to the Tailwind default (6px), NOT our custom 8px token. To use the custom `8px` token, check if the Tailwind config extends `borderRadius` with a key named `md` (it does per story 1.1). In Tailwind v3, `rounded-md` uses the default scale UNLESS the config has `theme.extend.borderRadius.md = '8px'`. Verify the config and use `rounded-md` or the custom key as configured.

2. **Prisma 7 `prisma.config.ts`** — The Prisma client constructor does NOT take a `url` option directly; the datasource URL is in `libs/database-schemas/prisma.config.ts` as a `defineConfig`. The `PrismaClient` in `prisma.ts` is instantiated without a URL arg (it reads from `DATABASE_URL` env var via the config at generation time).

3. **Next.js version is 16** (not 15 as architecture specifies) — accepted per story 1.1 review. The searchParams async behavior applies.

4. **`lib/` directory exists as empty** — `apps/web/src/lib/.gitkeep` exists from story 1.1. Create `prisma.ts` and `auth.ts` alongside it. Remove `.gitkeep` when adding real files.

5. **No existing auth files** — `apps/web/src/lib/auth.ts` does not exist yet. `apps/web/src/middleware.ts` does not exist yet. Create from scratch.

6. **Root `@/*` alias** — The `apps/web` tsconfig has `@/*` mapped to `./src/*`. Use `@/lib/auth` (not relative paths) for consistency with the architecture's import patterns.

7. **`apps/web/src/app/api/hello/route.ts`** exists as a placeholder from story 1.1. Leave it; it doesn't interfere.

### Project Structure Alignment

Files created/modified in this story:

```
apps/web/src/
  app/
    layout.tsx                           ← UPDATE (add font loading)
    page.tsx                             ← REPLACE (redirect to /project-map)
    sign-in/
      page.tsx                           ← NEW
      page.test.tsx                      ← NEW
    api/
      auth/
        [...nextauth]/
          route.ts                       ← NEW
  components/
    icons/
      github-icon.tsx                    ← NEW
  lib/
    .gitkeep                             ← DELETE (replaced by real files)
    auth.ts                              ← NEW
    prisma.ts                            ← NEW
  middleware.ts                          ← NEW
tailwind.config.ts                       ← UPDATE (fontFamily CSS vars)
package.json (root)                      ← UPDATE (add next-auth)
.env.example                             ← UPDATE (add AUTH_* vars)
```

### References

- [Epics: Story 1.2 ACs](../_bmad-output/planning-artifacts/epics.md#story-12-sign-in-with-github)
- [Architecture: Auth.js v5 Package](../_bmad-output/planning-artifacts/architecture.md#key-packages-added-post-scaffold)
- [Architecture: Authentication & Security](../_bmad-output/planning-artifacts/architecture.md#authentication--security)
- [Architecture: Frontend Architecture](../_bmad-output/planning-artifacts/architecture.md#frontend-architecture)
- [Architecture: Complete Project Directory Structure](../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure)
- [Architecture: Naming Patterns](../_bmad-output/planning-artifacts/architecture.md#naming-patterns)
- [UX EXPERIENCE.md: Sign In section](../_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md#sign-in-pre-app-shell)
- [UX DESIGN.md: Accent use, Button styling](../_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md)
- [UX DESIGN.md: Accessibility floor (UX-DR16)](../_bmad-output/planning-artifacts/epics.md#story-18-build-the-persistent-app-shell)
- [Story 1.1: Completion Notes and Debug Log](../_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md)
- [Deferred Work](../_bmad-output/implementation-artifacts/deferred-work.md)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

| # | Issue | Resolution |
|---|-------|------------|
| 1 | `@prisma/client-runtime-utils` not found in pnpm strict mode | Added `@prisma/client-runtime-utils@7.8.0` as explicit root dep |
| 2 | `declare module 'next-auth/jwt'` TypeScript augmentation failed | Changed to `declare module '@auth/core/jwt'`; added `@auth/core@0.41.2` as root dep |
| 3 | TypeScript `paths` in child tsconfig replaces base paths (no merge) | Added all four `@bmad-easy/*` path mappings into `apps/web/tsconfig.json` alongside `@/*` |
| 4 | Prisma 7 `PrismaClientConstructorValidationError`: WASM engine requires adapter | Added `@prisma/adapter-pg@7.8.0` + `pg@8.21.0`; rewrote `prisma.ts` with lazy factory using `PrismaPg` adapter |
| 5 | `pg` uses Node.js `util/types` — Edge Middleware bundling fails | Split auth config: `auth.config.ts` (edge-safe, no Prisma) for middleware; `auth.ts` (Node.js) for API routes |
| 6 | Jest `moduleFileExtensions` in Nx preset excludes `tsx` in Jest 30 | Added `tsx`/`jsx` to `moduleFileExtensions` in `apps/web/jest.config.ts` |
| 7 | Jest `tsconfig.json` has `jsx: preserve` — JSX fails to compile in tests | Created `apps/web/tsconfig.spec.json` with `jsx: react-jsx` |

### Completion Notes List

- Prisma 7.8.0 uses a WASM-based client engine by default; native library engine not available in this environment. `@prisma/adapter-pg` is the correct approach for PostgreSQL in Node.js with Prisma 7.
- Auth.js v5 middleware must use an edge-compatible config (no Prisma imports). Split into `auth.config.ts` (providers + pages only) and `auth.ts` (full config with DB callbacks).
- Next.js `serverExternalPackages: ['pg', '@prisma/adapter-pg']` required to prevent Turbopack from bundling Node.js-only packages.
- Nx Jest preset v23 excludes `tsx`/`jsx` from `moduleFileExtensions` for Jest 30 — must be overridden explicitly for React component tests.
- `engineType = "library"` in Prisma schema has no effect in Prisma 7.8.0 in this environment (no native query engine binary downloaded); left in schema for potential future use.

### File List

- `apps/web/src/lib/auth.config.ts` — NEW (edge-compatible auth config for middleware)
- `apps/web/src/lib/auth.ts` — NEW (full Auth.js config with Prisma JWT callback)
- `apps/web/src/lib/prisma.ts` — NEW (lazy Prisma client factory with PrismaPg adapter)
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` — NEW (Auth.js route handler)
- `apps/web/src/middleware.ts` — NEW (session guard using edge-compatible auth config)
- `apps/web/src/app/sign-in/page.tsx` — NEW (GitHub sign-in page)
- `apps/web/src/app/sign-in/page.test.tsx` — NEW (sign-in page unit tests)
- `apps/web/src/app/layout.tsx` — UPDATED (Inter + JetBrains Mono font loading)
- `apps/web/src/app/page.tsx` — REPLACED (redirect to /project-map)
- `apps/web/src/components/icons/github-icon.tsx` — NEW (GitHub SVG icon)
- `apps/web/src/__mocks__/next-font.ts` — NEW (next/font/google mock for Jest)
- `apps/web/jest.config.ts` — NEW (Jest config with jsdom environment, tsx support)
- `apps/web/tsconfig.spec.json` — NEW (tsconfig for tests with jsx: react-jsx)
- `apps/web/tsconfig.json` — UPDATED (added @/* and @bmad-easy/* path mappings)
- `apps/web/next.config.js` — UPDATED (added serverExternalPackages for pg/adapter-pg)
- `apps/web/project.json` — UPDATED (test target now uses @nx/jest:jest executor)
- `libs/database-schemas/src/prisma/schema.prisma` — UPDATED (engineType = "library")
- `package.json` (root) — UPDATED (added next-auth, @auth/core, @prisma/client-runtime-utils, @prisma/adapter-pg, pg, @testing-library/*, jest-environment-jsdom)
- `.env.example` — UPDATED (added AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_URL)
