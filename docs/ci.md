# CI/CD Pipeline Guide

**Platform:** GitHub Actions  
**Config:** `.github/workflows/test.yml`  
**Stack:** fullstack — Nx monorepo (Yarn), Next.js 15 + NestJS  
**Frameworks:** Playwright (E2E) · Jest + @nestjs/testing (unit/integration)

---

## Pipeline Overview

```
push / PR / schedule
        │
      [lint]
        │
   ┌────┴────┐
[unit]    [e2e x4 shards]
              │
          [burn-in]   ← PRs and weekly schedule only
              │
          [report]    ← always runs; aggregates all results
```

| Job | Timeout | Trigger |
|-----|---------|---------|
| lint | 5 min | all |
| unit (Jest via Nx) | 15 min | all |
| e2e shard 1–4 (Playwright) | 30 min | all |
| burn-in (10× Playwright) | 60 min | PR + weekly cron |
| report | — | always |

---

## Quality Gates

| Priority | Pass rate required | Behavior |
|----------|--------------------|----------|
| P0 | 100% | Pipeline fails immediately |
| P1 | ≥ 95% | Pipeline fails; burn-in uploads artifacts |

- `fail-fast: false` on E2E matrix — all 4 shards run even if one fails, giving full visibility.
- Burn-in failure does not block merge but is highlighted in the PR summary.

---

## Blueprint Activation — Completed

All blueprint steps were activated when the Nx monorepo was scaffolded (2026-06-18):

| Step | Status |
|------|--------|
| Yarn lockfile exists | ✅ `yarn.lock` |
| Nx targets confirmed (`lint`, `test`, `serve`, `dev`) | ✅ |
| `agent-be` health endpoint (`GET /health`) | ✅ `app.controller.ts` |
| Service startup steps uncommented in `test.yml` | ✅ |
| `wait-on` added to devDependencies | ✅ |
| `BASE_URL` hardcoded to `http://localhost:3000` in pipeline | ✅ |

The pipeline is now fully active. No repository variable `BASE_URL` is needed.

### Service startup in CI

| App | Nx target | Port | Readiness check |
|-----|-----------|------|-----------------|
| `web` | `nx run web:dev` | 3000 | `http://localhost:3000` |
| `agent-be` | `nx run agent-be:serve` | 3001 | `http://localhost:3001/health` |

Both are started in the background (`&`) before `wait-on` polls for readiness (60 s timeout).

---

## Running Locally

Mirror the CI environment locally:

```bash
./scripts/ci-local.sh
```

Run only affected projects (faster for incremental development):

```bash
./scripts/test-changed.sh main
```

Run local burn-in (flaky detection):

```bash
./scripts/burn-in.sh 10
```

---

## Artifacts

Artifacts are uploaded on failure only (retention: 30 days):

| Artifact | Contents |
|----------|----------|
| `e2e-results-shard-N` | `test-results/`, `playwright-report/` per shard |
| `burn-in-failures` | `test-results/`, `playwright-report/` from failing iteration |
| `unit-test-results` | `apps/*/coverage/`, `apps/*/test-results/` |

Traces and videos are captured on failure per `playwright.config.ts` settings (`trace: 'retain-on-failure'`, `video: 'retain-on-failure'`).

---

## Troubleshooting

**Lint fails with "project not found"**  
→ Nx workspace not yet scaffolded. Run `yarn create nx-workspace` first.

**E2E fails with "page.goto: net::ERR_CONNECTION_REFUSED"**  
→ Either `BASE_URL` variable is not set, or the webServer blocks in `playwright.config.ts` need uncommenting.

**Playwright browser cache miss every run**  
→ `yarn.lock` changed or does not exist. Confirm `yarn install --immutable` succeeded.

**Burn-in iterations vary in pass/fail**  
→ Flaky test detected. Check `burn-in-failures` artifact for trace and video.

**`yarn: command not found` on runner**  
→ `corepack enable` step failed or Node.js setup ran before it. Verify the `packageManager` field in `package.json` is set to a valid Yarn version.
