# CI/CD Pipeline Guide

**Platform:** GitHub Actions  
**Config:** `.github/workflows/test.yml`  
**Stack:** fullstack — Nx monorepo (pnpm), Next.js 15 + NestJS  
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

## Blueprint Activation Checklist

This pipeline was authored before the Nx monorepo was scaffolded. Work through these steps once `pnpm create nx-workspace` is complete:

### 1. Verify pnpm lockfile exists

```bash
ls pnpm-lock.yaml   # must exist for cache key to work
```

### 2. Confirm Nx targets

```bash
pnpm exec nx show projects   # should list apps/web, apps/agent-be, libs/*
pnpm exec nx run-many --target=lint --all --dry-run
pnpm exec nx run-many --target=test --all --dry-run
```

### 3. Uncomment webServer blocks in `playwright.config.ts`

The commented-out `webServer` section starts both `apps/web` and `apps/agent-be`. Remove the `//` prefix once the apps are runnable.

### 4. Uncomment service startup steps in `test.yml`

In both the `e2e` and `burn-in` jobs, uncomment the `Start web app`, `Start agent-be`, and `Wait for services` steps. Remove the `BASE_URL` variable from GitHub repository variables once localhost is used.

### 5. Set up GitHub repository variable `BASE_URL`

Until the webServer blocks are active, point the E2E tests at a deployed staging environment:

- **GitHub → Settings → Secrets and variables → Actions → Variables → New repository variable**
- Name: `BASE_URL`
- Value: `https://staging.bmad-easy.example.com` (replace with your staging URL)

### 6. Configure `wait-on` package

Add to the workspace root (or as an Nx tool dep):

```bash
pnpm add -Dw wait-on
```

### 7. Push and trigger first run

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test pipeline"
git push
```

Open a PR to trigger the pipeline.

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
→ Nx workspace not yet scaffolded. Run `pnpm create nx-workspace` first.

**E2E fails with "page.goto: net::ERR_CONNECTION_REFUSED"**  
→ Either `BASE_URL` variable is not set, or the webServer blocks in `playwright.config.ts` need uncommenting.

**Playwright browser cache miss every run**  
→ `pnpm-lock.yaml` changed or does not exist. Confirm `pnpm install --frozen-lockfile` succeeded.

**Burn-in iterations vary in pass/fail**  
→ Flaky test detected. Check `burn-in-failures` artifact for trace and video.

**`pnpm: command not found` on runner**  
→ `pnpm/action-setup@v4` step failed. Verify PNPM_VERSION env var is set to a valid version (`9`).
