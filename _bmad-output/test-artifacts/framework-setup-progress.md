---
stepsCompleted: ['step-01-preflight', 'step-02-select-framework', 'step-03-scaffold-framework', 'step-04-docs-and-scripts', 'step-05-validate-and-summary']
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-06-17'
workflowStatus: 'complete'
---

# Test Framework Setup Progress

## Step 01 — Preflight

### Detected Stack

**`fullstack`** — Nx monorepo (pnpm) with:
- `apps/web`: Next.js 15 BFF + frontend (Vercel deployment)
- `apps/agent-be`: NestJS agent orchestrator backend (Docker/Railway)
- `libs/shared-types`, `libs/database-schemas` (shared libraries)

Source: `_bmad-output/planning-artifacts/architecture.md`

### Prerequisite Check Results

| Check | Status | Notes |
|-------|--------|-------|
| `package.json` in project root | ❌ MISSING | Project is pre-implementation |
| No existing E2E framework | ✅ PASS | No playwright.config.*, cypress.config.*, cypress.json |
| Backend project manifest | ❌ MISSING | No pyproject.toml, pom.xml, go.mod, etc. |
| Architecture/stack context available | ✅ PASS | Full architecture.md present |

### Available Context Docs

- `_bmad-output/planning-artifacts/architecture.md` — complete, status: `complete`
- `_bmad-output/test-artifacts/test-design-architecture.md` — completed test design architecture
- `_bmad-output/test-artifacts/test-design-progress.md` — test design progress
- `_bmad-output/test-artifacts/test-design-qa.md` — QA test design

### Outcome

**HALTED:** `package.json` does not exist. Project is pre-implementation — no code has been written yet. The Nx monorepo (pnpm) has not been scaffolded.

**Available path:** Architecture is fully specified. Framework configuration can be authored against the planned monorepo structure for integration when scaffolding begins.

---

## Step 02 — Framework Selection

### Selected Frameworks

| Layer | Framework | Runner |
|-------|-----------|--------|
| E2E / browser | **Playwright** | `@playwright/test` |
| Backend unit/integration | **Jest** | `@nestjs/testing` |

### Rationale

**Playwright** — all four Playwright indicators apply: complex SaaS with real-time SSE streaming; multi-browser SaaS product; heavy API+UI integration (AG-UI event lifecycle, OAuth, sandbox provisioning); CI parallelism critical at 140–205h test effort. The `SandboxServiceFake` DI seam (B-01) pairs naturally with Playwright's `page.route()` API mocking.

**Jest + `@nestjs/testing`** — NestJS ships with Jest as its native runner. The `SANDBOX_SERVICE` DI token pattern already mandated in architecture (B-01) is purpose-built for `Test.createTestingModule()`. No alternative warranted.

---

## Step 03 — Scaffold Framework

### Files Created

**Root / Playwright E2E:**

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright config: timeouts, artifacts, reporters, CI sharding, webServer stubs |
| `.nvmrc` | Node 24 LTS |
| `.env.example` | All required env vars with documentation |
| `playwright/auth.setup.ts` | One-time GitHub OAuth session acquisition (auth project dependency) |
| `playwright/support/auth/github-auth-provider.ts` | Auth.js v5 session provider for playwright-utils auth-session |
| `playwright/support/merged-fixtures.ts` | `mergeTests` index: apiRequest + auth + intercept + recurse + log + networkErrorMonitor + custom |
| `playwright/support/custom-fixtures.ts` | `seededRepository` fixture (API seed + cleanup) |
| `playwright/support/factories/user-factory.ts` | `createUser()` with GitHub fields, faker-backed |
| `playwright/support/factories/repository-factory.ts` | `createRepository()` + `createConversation()` |
| `playwright/support/page-objects/conversation-page.ts` | Conversation UI page object: session status, chat, tool pills, working tree indicator |
| `playwright/e2e/auth/github-oauth.spec.ts` | P0-001: OAuth sign-in, unauthenticated redirect, credential health |
| `playwright/e2e/conversation/sandbox-lifecycle.spec.ts` | P0-003/P0-004: NFR-P1/P2 timing assertions, tool pills, working tree, manual commit |
| `playwright/e2e/project-map/project-map.spec.ts` | NFR-P3: Project Map load time, Daytona outage graceful degradation |

**NestJS backend:**

| File | Purpose |
|------|---------|
| `apps/agent-be/test/jest-integration.config.ts` | Jest integration config: serial (`maxWorkers: 1`), 30s timeout, path aliases |
| `apps/agent-be/test/helpers/sandbox-service.fake.ts` | `SandboxServiceFake` implementing `ISandboxService` (B-01 seam) |
| `apps/agent-be/test/helpers/test-module-builder.ts` | `buildTestModule()`: wires `SANDBOX_SERVICE` → fake automatically |
| `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` | Sandbox lifecycle integration tests + `SandboxServiceFake` control hook tests |

### Key Design Decisions

- **Auth setup project**: Playwright's `setup` project runs `auth.setup.ts` once; `chromium` project depends on it via `dependencies: ['setup']`. Session cookies persist to `playwright/auth-sessions/`.
- **`networkErrorMonitorFixture` in merged-fixtures**: Every E2E test automatically fails on backend 4xx/5xx — silent server errors can't slip through.
- **`seededRepository` fixture**: Uses a `/api/internal/test/repositories` endpoint that must be exposed by the NestJS backend in non-production environments only.
- **`SandboxServiceFake`**: Implements `ISandboxService` fully. Provides `failNextProvision()` and `setProvisionDelay()` control hooks for testing failure paths and timing.
- **`buildTestModule()`**: Automatically overrides `SANDBOX_SERVICE` with the fake in every test module — dev must never accidentally use the real Daytona provider in tests.
- **Integration tests serial**: `maxWorkers: 1` prevents DB state conflicts; each test runs against a real test database.
