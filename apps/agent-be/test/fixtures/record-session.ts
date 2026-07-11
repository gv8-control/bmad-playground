/**
 * One-time recording script for the SDK contract replay fixture.
 *
 * Runs a real `@anthropic-ai/claude-agent-sdk` `query()` session with a minimal
 * prompt that triggers a Bash tool call, and dumps every `SDKMessage` yielded by
 * the iterator to `sdk-session-replay.jsonl` — one JSON object per line.
 *
 * This is the recording step prescribed by architecture.md and
 * docs/sdk-contract-testing-gap.md ("record one real SDK session ... commit it
 * as a test fixture. Replay it through the real AgentService").
 *
 * Re-run after an SDK upgrade to refresh the fixture:
 *   dotenv -e .env -- ts-node --transpile-only \
 *     apps/agent-be/test/fixtures/record-session.ts
 *
 * If a real recording is not possible (no API key, network failure, tool did
 * not fire), leave the existing recorded fixture (`sdk-session-replay.jsonl`)
 * in place. The unit-test fixture builders in
 * `apps/agent-be/src/streaming/agent.service.unit.spec.ts` construct
 * `SDKMessage`s as full object literals with explicit `: SDKMessage` return
 * types — the `agent-be:typecheck` target enforces this via `tsc --noEmit`
 * against the real SDK declarations.
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const OUTFILE = join(__dirname, 'sdk-session-replay.jsonl');
const PROMPT =
  'Use the Bash tool to run this exact command and report its output: echo hello';

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot record a real session.');
  }

  mkdirSync(dirname(OUTFILE), { recursive: true });
  const stream = createWriteStream(OUTFILE, { flags: 'w' });

  const counts: Record<string, number> = {};
  let total = 0;

  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 80_000);

    const agentQuery = query({
      prompt: PROMPT,
      options: {
        cwd: '/tmp',
        abortController: abort,
        env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
        includePartialMessages: true,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    for await (const msg of agentQuery) {
      const line = JSON.stringify(msg);
      stream.write(line + '\n');
      total += 1;
      const key = msg.type === 'result' ? `result:${(msg as { subtype?: string }).subtype}` : msg.type;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    clearTimeout(timer);
    await agentQuery.interrupt?.().catch(() => undefined);
  } finally {
    stream.end();
  }

  console.log(`Recorded ${total} SDKMessage(s) to ${OUTFILE}`);
  console.log(JSON.stringify(counts, null, 2));

  const sawAssistant = (counts['assistant'] ?? 0) > 0;
  const sawUser = (counts['user'] ?? 0) > 0;
  const sawResultSuccess = (counts['result:success'] ?? 0) > 0;
  const sawStreamEvent = (counts['stream_event'] ?? 0) > 0;
  if (!(sawStreamEvent && sawAssistant && sawUser && sawResultSuccess)) {
    console.warn(
      'WARNING: recording is incomplete (missing some of: stream_event, assistant, user, result:success). ' +
        'Falling back to the hand-built type-checked fixture is recommended.',
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Recording failed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
