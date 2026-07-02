/**
 * Startup-time defense-in-depth: the /api/internal/test/* routes already
 * check NODE_ENV/TEST_ENV per-request (see seed-user/route.ts), but a
 * misconfigured production deploy with TEST_ENV set should fail loudly at
 * boot rather than silently expose those test-only endpoints.
 */
export function assertTestEnvNotInProduction(): void {
  if (process.env.TEST_ENV && process.env.NODE_ENV === 'production') {
    throw new Error(
      'TEST_ENV must not be set in a production environment (NODE_ENV=production) — refusing to start',
    );
  }
}
