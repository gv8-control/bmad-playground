/**
 * Shared guard for test-only API endpoints under /api/internal/test/*.
 *
 * These endpoints seed test data (users, repo connections, conversations,
 * artifacts) and must never be accessible in a real production deployment.
 *
 * The guard allows endpoints when:
 *   - TEST_ENV is set (explicit opt-in), AND
 *   - Either NODE_ENV is not 'production', OR
 *     ALLOW_TEST_ENDPOINTS_IN_PRODUCTION is 'true' (E2E tests run against a
 *     production build — `next start` sets NODE_ENV=production, so an explicit
 *     opt-in signal is required to keep the test endpoints reachable).
 *
 * ALLOW_TEST_ENDPOINTS_IN_PRODUCTION is never ambient on any deployment
 * platform (unlike CI, which is set by Railway, Docker, and GitHub Actions).
 * It must be set explicitly on CI jobs that run E2E against a production
 * build, making the exposure surface deliberate and visible.
 */
export function isTestEndpointEnabled(): boolean {
  if (!process.env.TEST_ENV) return false;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION !== 'true') return false;
  return true;
}
