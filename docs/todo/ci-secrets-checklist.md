# CI Secrets & Variables Checklist

Platform: GitHub Actions  
Location: **GitHub → repository → Settings → Secrets and variables → Actions**

---

## Repository Variables (non-secret)

| Name | Required | Description | When to set |
|------|----------|-------------|-------------|
| `BASE_URL` | Yes (until webServer enabled) | Staging/test environment URL for Playwright E2E | Before first E2E run; remove once `playwright.config.ts` webServer blocks are uncommented |

---

## Repository Secrets (sensitive)

No pipeline secrets are required at launch. The following will be needed as the application is built:

| Name | Required | Description | When to set |
|------|----------|-------------|-------------|
| `DATABASE_URL` | At integration test implementation | Test database connection string | When NestJS integration tests are written |
| `GITHUB_TEST_USER_TOKEN` | At E2E auth implementation | PAT for GitHub OAuth test user | When `playwright/e2e/auth/github-oauth.spec.ts` is activated |
| `DAYTONA_API_KEY` | At sandbox E2E implementation | Daytona Cloud API key for sandbox provisioning tests | When sandbox lifecycle tests are activated |

---

## Notes

- **No secrets should appear in CI configuration files.** All sensitive values must be stored in GitHub secrets and referenced via `${{ secrets.NAME }}`.
- **`GITHUB_TOKEN`** is automatically provided by GitHub Actions with `contents: read` and `pull-requests: read` permissions — no manual setup needed.
- Rotate secrets that are compromised immediately via the same Settings path.
- For test user credentials (GitHub OAuth), use a dedicated machine account rather than a personal account.
