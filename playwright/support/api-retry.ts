import type { APIResponse } from '@playwright/test';

/**
 * Substrings in an error message that indicate a transient network failure
 * worth retrying. These match the errors thrown by Playwright's
 * APIRequestContext (backed by Node fetch/undici) when the dev server drops a
 * connection under load — e.g. 4 parallel workers hammering seed/teardown
 * endpoints during fixture setup.
 */
const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'socket hang up',
  'fetch failed',
];

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    return TRANSIENT_ERROR_PATTERNS.some((p) => msg.includes(p));
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an API request in a retry loop for transient failures (ECONNRESET,
 * 5xx, network errors). Throws on non-transient errors (4xx) or after
 * exhausting retries.
 *
 * - Retries on thrown errors whose message matches a known transient pattern
 *   (ECONNRESET, ECONNREFUSED, ETIMEDOUT, socket hang up, fetch failed).
 * - Retries on HTTP responses with status >= 500.
 * - Does NOT retry on 4xx responses — the response is returned so the caller
 *   can run its existing `if (!res.ok())` check for genuine non-transient
 *   failures (e.g. 404, 400).
 * - On the final attempt failing, re-throws the original error (for thrown
 *   failures) or returns the final response (for 5xx that never recovered,
 *   letting the caller's `.ok()` check surface a meaningful status).
 *
 * Default: 3 attempts, 500ms initial backoff doubling each retry (500, 1000).
 */
export async function withApiRetry<T extends APIResponse>(
  fn: () => Promise<T>,
  opts?: { retries?: number; backoffMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const initialBackoff = opts?.backoffMs ?? 500;

  let lastError: unknown;
  let lastResponse: T | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fn();
      lastResponse = res;
      // 5xx is transient — retry unless this is the final attempt.
      if (res.status() >= 500 && attempt < retries) {
        console.warn(
          `[api-retry] attempt ${attempt}/${retries} got HTTP ${res.status()}, retrying...`,
        );
        await sleep(initialBackoff * 2 ** (attempt - 1));
        continue;
      }
      // 2xx/3xx/4xx (or final attempt on 5xx) — return to caller.
      return res;
    } catch (err) {
      lastError = err;
      if (isTransientError(err) && attempt < retries) {
        console.warn(
          `[api-retry] attempt ${attempt}/${retries} threw transient error: ${
            err instanceof Error ? err.message : String(err)
          }, retrying...`,
        );
        await sleep(initialBackoff * 2 ** (attempt - 1));
        continue;
      }
      // Non-transient error, or final attempt — re-throw the original.
      throw err;
    }
  }

  // Exhausted retries on 5xx responses — return the last response so the
  // caller's `if (!res.ok())` check surfaces a meaningful status.
  if (lastResponse) {
    return lastResponse;
  }
  // Unreachable: the loop either returns or throws on every path. Kept so the
  // function has a total return type for TypeScript.
  throw lastError;
}
