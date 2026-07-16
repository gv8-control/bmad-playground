/**
 * Shared guard for test-only API endpoints under /api/internal/test/*.
 *
 * These endpoints seed test data (users, repo connections, conversations,
 * artifacts) and must never be accessible in a real production deployment.
 *
 * The guard allows endpoints when:
 *   - TEST_ENV is set (explicit opt-in), AND
 *   - Either NODE_ENV is not 'production', OR CI is 'true' (E2E tests run
 *     against a production build in CI — the build sets NODE_ENV=production,
 *     but CI=true differentiates a test server from a real production deployment).
 */
export function isTestEndpointEnabled(): boolean {
  if (!process.env.TEST_ENV) return false;
  if (process.env.NODE_ENV === 'production' && process.env.CI !== 'true') return false;
  return true;
}
