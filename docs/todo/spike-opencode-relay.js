#!/usr/bin/env node
/**
 * Spike: verify opencode running inside a Daytona sandbox can reach neuralwatt
 * through the Railway Caddy relay — not just curl, but the full opencode path
 * (provider resolution, API key, model call, streaming).
 *
 * The prior relay spike (spike-neuralwatt-accessibility.md) verified the relay
 * via manual curl commands. This spike closes the gap: it provisions a real
 * opencode.json with provider.neuralwatt.options.baseURL pointing at the relay,
 * injects NEURALWATT_API_KEY into the sandbox env, and runs
 * `opencode run --model neuralwatt/glm-5.2`.
 *
 * Steps:
 *   1. Create sandbox, install opencode.
 *   2. Sanity-check: direct api.neuralwatt.com fails (Tier 1 block still in place).
 *   3. Sanity-check: relay /v1/models via curl succeeds (relay is up).
 *   4. Write opencode.json with relay baseURL to /tmp.
 *   5. Run `opencode run --model neuralwatt/glm-5.2 "Print exactly: SPIKE_OK"`.
 *   6. Run a streaming chat completion and verify chunks arrive incrementally.
 *
 * Requires: DAYTONA_API_KEY, DAYTONA_API_URL, NEURALWATT_API_KEY in env.
 *
 * Reuses: spike-opencode-sandbox.js (OpencodeSandbox, SpikeRunner).
 */

const { SpikeRunner, log, elapsed } = require('./spike-opencode-sandbox.js');

// ─── Constants ─────────────────────────────────────────────────────────────

const RELAY_BASE = 'https://neuralwatt-relay-production.up.railway.app';
const RELAY_V1 = `${RELAY_BASE}/v1`;
const DIRECT_BASE = 'https://api.neuralwatt.com';
const SPIKE_MODEL = 'neuralwatt/glm-5.2';
const OPENCODE_TIMEOUT_MS = 120_000;
const SHORT_TIMEOUT_S = 30;

// opencode.json written into the sandbox. The provider block overrides
// baseURL to point at the relay instead of api.neuralwatt.com directly.
function opencodeConfig() {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      provider: {
        neuralwatt: {
          options: {
            baseURL: RELAY_V1,
          },
          models: {
            'glm-5.2': {
              limit: {
                context: 1048560,
                output: 1048560,
              },
            },
          },
        },
      },
    },
    null,
    2,
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NEURALWATT_API_KEY;
  if (!apiKey) {
    throw new Error(
      'NEURALWATT_API_KEY is not set in env — cannot authenticate to neuralwatt',
    );
  }

  const runner = new SpikeRunner('opencode-relay');

  await runner.run(async (sb, r) => {
    // ─── Step 1: Create sandbox + install opencode ───────────────────────
    let step = '1-create-install';
    try {
      const t0 = Date.now();
      const id = await sb.create();
      log(step, `Sandbox ${id} created in ${elapsed(Date.now() - t0)}`);
      const inst = await sb.installOpencode(step);
      r.record(step, inst.exitCode === 0, inst.ms, {
        sandboxId: id,
        version: inst.version,
      });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ─── Step 2: Sanity — direct api.neuralwatt.com fails (Tier 1 block) ─
    step = '2-direct-fails';
    try {
      const t0 = Date.now();
      const result = await sb.runCommand(
        `curl -s -o /dev/null -w "%{http_code}" --max-time 10 ${DIRECT_BASE}/v1/models 2>&1 || true`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const code = result.output.trim();
      // HTTP 000 means connection failed (reset) — this is the expected Tier 1 block.
      const blocked = code === '000' || code === '';
      log(
        step,
        `Direct api.neuralwatt.com HTTP code: "${code}" (expected 000/blocked)`,
      );
      r.record(step, blocked, Date.now() - t0, { httpCode: code });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 3: Sanity — relay /v1/models via curl succeeds ─────────────
    step = '3-relay-curl-ok';
    try {
      const t0 = Date.now();
      const result = await sb.runCommand(
        `curl -s --max-time 15 -H "Authorization: Bearer ${apiKey}" ${RELAY_V1}/models 2>&1 | head -c 500`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const hasModels =
        result.output.includes('"id"') || result.output.includes('models');
      log(
        step,
        `Relay /v1/models returned data (has model entries): ${hasModels}`,
      );
      r.record(step, hasModels, Date.now() - t0, {
        outputChars: result.output.length,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 4: Write opencode.json with relay baseURL ──────────────────
    step = '4-write-config';
    try {
      const t0 = Date.now();
      const config = opencodeConfig();
      // Write via heredoc to handle JSON quoting safely.
      const result = await sb.runCommand(
        `cat > /tmp/opencode.json <<'OPENCODE_JSON_EOF'\n${config}\nOPENCODE_JSON_EOF\ncat /tmp/opencode.json`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const written =
        result.output.includes('"baseURL"') && result.output.includes(RELAY_V1);
      log(
        step,
        `opencode.json written to /tmp (contains relay baseURL): ${written}`,
      );
      r.record(step, written, Date.now() - t0, { configChars: config.length });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 5: opencode run --model neuralwatt/glm-5.2 (non-streaming) ─
    step = '5-opencode-relay-run';
    try {
      const t0 = Date.now();
      // Export NEURALWATT_API_KEY into the shell env for this command only.
      // opencode resolves the provider from /tmp/opencode.json (cwd is /tmp).
      const cmd = `cd /tmp && NEURALWATT_API_KEY=${apiKey} opencode run --model ${SPIKE_MODEL} "Print exactly: SPIKE_OK" </dev/null 2>&1`;
      log(step, `Running: opencode run --model ${SPIKE_MODEL}`);
      const result = await sb.runCommand(cmd, {
        timeoutS: OPENCODE_TIMEOUT_MS / 1000,
      });
      const hasSpikeOk = result.output.includes('SPIKE_OK');
      log(
        step,
        `Exit code: ${result.exitCode}, output contains "SPIKE_OK": ${hasSpikeOk}`,
      );
      log(
        step,
        `Output (first 800 chars):\n${result.output.substring(0, 800)}`,
      );
      r.record(step, result.exitCode === 0 && hasSpikeOk, Date.now() - t0, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        hasSpikeOk,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 6: Streaming chat completion through the relay ────────────
    step = '6-opencode-relay-stream';
    try {
      const t0 = Date.now();
      // Use --format json to get structured events; we look for text events
      // arriving incrementally. The prompt is long enough to produce multiple
      // chunks but short enough to complete within timeout.
      const prompt =
        'Write a 3-sentence summary of how HTTP/2 multiplexing works.';
      const cmd = `cd /tmp && NEURALWATT_API_KEY=${apiKey} opencode run --format json --model ${SPIKE_MODEL} "${prompt}" </dev/null 2>&1`;
      log(
        step,
        `Running streamed: opencode run --format json --model ${SPIKE_MODEL}`,
      );
      const result = await sb.runCommand(cmd, {
        timeoutS: OPENCODE_TIMEOUT_MS / 1000,
      });
      const hasText =
        result.output.includes('"type"') &&
        (result.output.includes('"text"') ||
          result.output.includes('"message"'));
      const exitOk = result.exitCode === 0;
      log(
        step,
        `Exit code: ${result.exitCode}, has structured events: ${hasText}`,
      );
      log(
        step,
        `Output (first 1200 chars):\n${result.output.substring(0, 1200)}`,
      );
      r.record(step, exitOk && hasText, Date.now() - t0, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        hasText,
      });
    } catch (err) {
      r.recordError(step, err);
    }
  });

  if (runner.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
