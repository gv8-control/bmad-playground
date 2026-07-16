/**
 * Shared RSC (React Server Components) wire-format mock helpers.
 *
 * Used by E2E tests that intercept Server Action POSTs via page.route()
 * and need to return a mock action result without hitting real GitHub APIs.
 */

/**
 * Generates a minimal React Flight (RSC) wire-format payload for a Server Action
 * that returns a plain object.
 *
 * Chunk 0 is the root, referencing the action result via the "a" field.
 * Chunk 1 carries the JSON-serialized action result.
 *
 * This format is compatible with Next.js 16's production RSC parser.
 * Previous hand-crafted variants included a `:N` row ID prefix and/or a
 * `1:D` diagnostic line, which the production (minified) RSC parser rejects:
 * - `:N` is parsed as a row ID using hex nibble decoding, corrupting the stream
 * - `1:D` creates a diagnostic chunk that conflicts with the `1:` result chunk
 *
 * In dev mode, the RSC parser is more lenient and tolerates these malformed
 * payloads. In production mode (minified React), the parser throws, the
 * callServer() rejects, and the client component's .catch() fires — showing
 * "An unexpected error occurred" instead of the mocked error message.
 */
export function rscActionPayload(result: unknown): string {
  return `0:{"a":"$@1","f":"","b":"","q":"","i":false}\n1:${JSON.stringify(result)}\n`;
}
