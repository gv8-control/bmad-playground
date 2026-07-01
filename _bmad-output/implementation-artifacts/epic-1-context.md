# Epic 1 Context: Authentication & Repository Connection

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use. This epic also delivers the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD, persistent app shell) that every later epic builds on — nothing here is throwaway setup.

## Stories

- Story 1.1: Scaffold the Platform Monorepo and CI Pipeline
- Story 1.2: Sign In with GitHub
- Story 1.3: Connect a Repository by URL
- Story 1.4: Validate BMAD Initialization in the Connected Repository
- Story 1.5: Resolve Git Identity for Commit Attribution
- Story 1.6: Detect and Recover from Credential Failures
- Story 1.7: Enforce Authenticated, Full Access for All MVP Users
- Story 1.8: Build the Persistent App Shell
- Story 1.9: Document and Validate the KEK Rotation Runbook

## Requirements & Constraints

- Repository connection is by URL only, using the `repo`-scoped OAuth token from sign-in to validate write access — no access-token/PAT field anywhere in onboarding (supersedes an earlier two-field UX draft).
- BMAD validation requires `_bmad/`, `_bmad-output/`, `.claude/` present and BMAD version 6.x before activation; empty `_bmad-output/` is valid. Each failure mode (missing prerequisite, missing/empty `.claude/skills/`, unsupported version) gets its own blocking message with a documentation link — never a generic failure.
- Write-access validation uses a dry-run git operation; a GitHub org OAuth App restriction must be surfaced as its own explicit error cause, not a generic "couldn't connect."
- Commits must be attributed to the individual user's own GitHub identity, never a shared platform identity. Missing primary email falls back to `{github_username}@users.noreply.github.com`. The OAuth token itself must never appear in the identity record.
- Credential health flips to `failed` within one git operation cycle of any 401/403, with no silent failures; re-authorization restores `healthy` without disconnecting the repository. Every credential lookup passes a tenant authorization check before resolution — tokens never resolve across users. (Visual failed-status display on the Project Map and real-time SSE propagation are out of scope here — Epic 2 and Epic 3 respectively.)
- All routes require authentication (redirect to `/sign-in`); all authenticated MVP users get full feature access, no paywall/trial/billing gate. This is the baseline later feature-specific limits (e.g. Epic 3's concurrent-Conversation cap) build on, not a limit itself.
- OAuth tokens are AES-256-GCM encrypted at rest, never returned to the client after initial submission; every encryption operation uses a fresh, verifiably-unique GCM nonce.

## Technical Decisions

- **Scaffold:** Nx workspace via Yarn (Corepack-pinned, `nodeLinker: node-modules`) generating `apps/web` (Next.js 15, App Router, Tailwind, Turbopack, TS strict), `apps/agent-be` (NestJS), `libs/shared-types`, `libs/database-schemas`. `yarn.lock` committed; CI installs with `yarn install --immutable`.
- **Data layer:** one shared Prisma schema/client in `libs/database-schemas` consumed by both apps against a single Railway Postgres instance (eliminates schema drift structurally). Models PascalCase singular mapped to snake_case tables (`@@map`); columns camelCase mapped to snake_case (`@map`). No caching layer.
- **Boundary JWT:** separate from Auth.js's internal session JWE; long-lived, re-minted per page load; `Authorization` header for REST, query param for SSE (`EventSource` can't set headers); logs sanitized to strip it.
- **OAuth token encryption:** per-user DEK + platform KEK envelope encryption (AES-256-GCM); KEK is a Railway env var for MVP; rotation runbook required, GCM nonce-uniqueness enforced.
- **Access control:** a live `user.active` Postgres check (`active-user.guard.ts`) on every privileged `apps/agent-be` request via a `@User()` decorator — single enforcement point, not re-implemented per controller. Only rejects a deactivated user's *next* request; active termination of an already-open session (NFR-S3) is explicitly deferred post-MVP.
- **API conventions:** plain REST/JSON NestJS controllers; plural-noun endpoints; raw resource body on success (no wrapper); errors as `{ code, message, meta }`; ISO 8601 dates; camelCase JSON throughout. `@nestjs/throttler` for simple rate limiting, no per-tenant tiering.
- **Frontend data flow:** no global client-state library — Server Components/Server Actions read Postgres directly; local React state for ephemeral UI only; no client-side revalidation anywhere (manual reload is the refresh mechanism platform-wide). shadcn/ui (Radix + Tailwind).
- **Conventions:** component files PascalCase, non-component files kebab-case, tests co-located (`*.spec.ts`), `apps/web` components organized flat by feature not by type.
- **Infra:** `apps/web` on Vercel; `apps/agent-be` (Docker) + Postgres on Railway; production only, no staging; CI (GitHub Actions) gates on lint + all available test suites; deploy is a manual trigger, not automatic on merge.
- **Design tokens (dark-mode only):** near-black canvas, violet accent reserved for primary interactive elements (focus rings, primary buttons, active nav, links), semantic colors for positive/caution/negative states (committed / unsaved / error — never color alone). Inter for UI text, JetBrains Mono for code only, no font weight above 600. 4px spacing unit; side nav fixed 240px. These become the Tailwind theme in Story 1.1 and are consumed by the app shell in Story 1.8.

## UX & Interaction Patterns

- Sign-in (`/sign-in`): centered single-column layout, "Sign in with GitHub" as the sole interactive element, no separate sign-up screen; inline error with button re-enabled on OAuth failure.
- Onboarding (`/onboarding`): single "Repository URL" input, validated on blur; states for cold, validating, BMAD-not-found (blocking + doc link), validation-failure (inline error naming the cause), success redirect toward the Project Map.
- Persistent app shell (all authenticated pages): 240px fixed side navigation (wordmark, "New Conversation," last-5 Conversations, Project Map + Artifact Browser links, bottom-pinned Settings avatar); three-zone independent scroll model; depth-1 pages show a "← Project Map" breadcrumb; no animated route transitions.
- Accessibility floor (via the app shell, applies everywhere): visible 2px focus ring never suppressed on click; route changes move focus to `h1`/first interactive element; modals trap and return focus; state never color-only; `aria-live="polite"` on chat stream/working-tree indicator; `role="status"` on loading/save messages; `prefers-reduced-motion` respected; `aria-label`s on icon-only controls.
- Responsive: desktop-first, 1024px minimum; 768–1023px collapses side nav into an off-canvas drawer (overlay, not reflow; same focus-trap behavior); below 768px out of scope for MVP.
- Re-auth flow opens as an inline modal, not a page navigation.

## Cross-Story Dependencies

- Story 1.1 (scaffold, Tailwind theme) is a hard prerequisite for every other story in this epic and all later epics.
- Story 1.3 depends on Story 1.2 (needs an authenticated session/OAuth token). Story 1.4 runs immediately after Story 1.3's write-access check.
- Story 1.5 only produces a consumable identity record here; sandbox git-config injection and end-to-end commit-author verification happen in Epic 3 (Stories 3.1 and 3.10).
- Story 1.6 depends on Story 1.3's credential storage. Visual failed-status display moves to Epic 2; real-time SSE propagation moves to Epic 3 (Story 3.7).
- Story 1.7 is the baseline Epic 3's concurrent-Conversation cap builds on.
- Story 1.8 (app shell) is inherited by every page in Epic 2 and Epic 3 — they do not rebuild navigation, scroll model, or accessibility floor.
- Story 1.9 depends on the KEK/envelope-encryption mechanism established in Story 1.3.
- The post-onboarding redirect target (Story 1.3) is the Project Map, whose route is actually built in Epic 2.
