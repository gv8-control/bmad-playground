/**
 * CORS options for the agent-be bootstrap.
 *
 * `CORS_ALLOWED_ORIGINS` is an optional, comma-separated env var. It is deliberately
 * NOT added to `env.validation.ts` (Zod schema) — per project-context rule 152,
 * optional-with-fallback vars are excluded so Zod doesn't make them required.
 * Reads directly from `process.env` with a dev fallback.
 */

const DEFAULT_ORIGINS = ['http://localhost:3000'];

export interface CorsOptions {
  origin: string[];
  credentials: true;
}

export function resolveCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) {
    return { origin: [...DEFAULT_ORIGINS], credentials: true };
  }

  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .map((o) => o.replace(/\/+$/, ''));

  // Wildcard subdomain patterns (e.g. `https://*.example.com`) are not supported.
  // Browsers reject them when `credentials: true` is set, so fail at boot rather
  // than silently passing an unusable origin through.
  const wildcardSubdomain = origins.find((o) => o.includes('*.'));
  if (wildcardSubdomain) {
    throw new Error(
      `CORS_ALLOWED_ORIGINS contains an unsupported wildcard subdomain pattern: "${wildcardSubdomain}". ` +
        'Wildcard subdomains are incompatible with credentials:true. List explicit origins instead.',
    );
  }

  const filtered = origins.filter((o) => o !== '*');

  return {
    origin: filtered.length > 0 ? filtered : [...DEFAULT_ORIGINS],
    credentials: true,
  };
}
