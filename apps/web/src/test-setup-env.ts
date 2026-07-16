/**
 * Centralized test environment setup for the web app.
 *
 * Sets TEST_ENV='ci' before each test so that test-only API endpoints
 * (under /api/internal/test/*) are enabled during unit tests.
 *
 * Individual tests that need to verify the guard's behavior in the
 * absence of TEST_ENV (e.g. "returns 404 when TEST_ENV is unset")
 * delete process.env.TEST_ENV inside the test body — this beforeEach
 * re-sets it for the next test automatically.
 */
beforeEach(() => {
  process.env.TEST_ENV = 'ci';
});
