#!/usr/bin/env node
/**
 * Spike: verify the CONNECT-to-WebSocket tunnel proxy approach.
 *
 * Tests whether a sandbox agent can use `api.neuralwatt.com` directly
 * (real URL, no baseURL override in opencode.json) by setting
 * HTTPS_PROXY=http://127.0.0.1:8888 and running a local tunnel proxy
 * that bridges CONNECT requests to the relay's WebSocket /tunnel endpoint.
 *
 * Steps:
 *   1. Create sandbox, install opencode.
 *   2. Sanity: direct api.neuralwatt.com fails (Tier 1 SNI block).
 *   3. Upload tunnel-proxy.js to the sandbox.
 *   4. Start tunnel proxy in background.
 *   5. Verify tunnel works: curl with HTTPS_PROXY to api.neuralwatt.com/v1/models.
 *   6. Run opencode with HTTPS_PROXY — NO opencode.json baseURL override.
 *      The agent uses the real api.neuralwatt.com URL.
 *   7. Run a streaming chat completion through the tunnel.
 *
 * Requires: DAYTONA_API_KEY, DAYTONA_API_URL, NEURALWATT_API_KEY, RELAY_AUTH_TOKEN in env.
 *
 * Reuses: spike-opencode-sandbox.js (OpencodeSandbox, SpikeRunner).
 */

const fs = require('fs');
const path = require('path');
const { Daytona } = require('@daytonaio/sdk');
const { SpikeRunner, log, elapsed } = require('./spike-opencode-sandbox.js');

// ─── Constants ─────────────────────────────────────────────────────────────

const RELAY_BASE = 'https://sandbox-relay-production.up.railway.app';
const RELAY_WS_URL = `${RELAY_BASE.replace('https://', 'wss://')}/tunnel`;
const DIRECT_BASE = 'https://api.neuralwatt.com';
const SPIKE_MODEL = 'neuralwatt/glm-5.2';
const OPENCODE_TIMEOUT_MS = 120_000;
const SHORT_TIMEOUT_S = 30;
const TUNNEL_PROXY_LOCAL = path.join(__dirname, 'tunnel-proxy.js');
const TUNNEL_PROXY_REMOTE = '/tmp/tunnel-proxy.js';
const TUNNEL_PORT = 8888;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NEURALWATT_API_KEY;
  if (!apiKey) {
    throw new Error('NEURALWATT_API_KEY is not set in env');
  }

  const relayToken = process.env.RELAY_AUTH_TOKEN || '';

  const runner = new SpikeRunner('ws-tunnel-proxy');

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

    // ─── Step 2: Sanity — direct api.neuralwatt.com fails ────────────────
    step = '2-direct-fails';
    try {
      const t0 = Date.now();
      const result = await sb.runCommand(
        `curl -s -o /dev/null -w "%{http_code}" --max-time 10 ${DIRECT_BASE}/v1/models 2>&1 || true`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const code = result.output.trim();
      const blocked = code === '000' || code === '';
      log(step, `Direct api.neuralwatt.com HTTP code: "${code}" (expected 000/blocked)`);
      r.record(step, blocked, Date.now() - t0, { httpCode: code });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 3: Upload tunnel-proxy.js to the sandbox ───────────────────
    step = '3-upload-proxy';
    try {
      const t0 = Date.now();
      const proxyCode = fs.readFileSync(TUNNEL_PROXY_LOCAL, 'utf8');
      // Use the Daytona SDK's file upload to write the script.
      await sb.sb.fs.uploadFile(TUNNEL_PROXY_LOCAL, TUNNEL_PROXY_REMOTE);
      // Verify it was written.
      const verify = await sb.runCommand(`cat ${TUNNEL_PROXY_REMOTE} | head -5`, {
        timeoutS: SHORT_TIMEOUT_S,
      });
      const uploaded = verify.output.includes('tunnel-proxy') || verify.output.includes('CONNECT');
      log(step, `tunnel-proxy.js uploaded: ${uploaded}`);
      r.record(step, uploaded, Date.now() - t0, { path: TUNNEL_PROXY_REMOTE });
    } catch (err) {
      // Fallback: write via heredoc.
      try {
        const proxyCode = fs.readFileSync(TUNNEL_PROXY_LOCAL, 'utf8');
        const result = await sb.runCommand(
          `cat > ${TUNNEL_PROXY_REMOTE} <<'TUNNEL_EOF'\n${proxyCode}\nTUNNEL_EOF\nwc -l ${TUNNEL_PROXY_REMOTE}`,
          { timeoutS: SHORT_TIMEOUT_S },
        );
        const uploaded = parseInt(result.output.trim()) > 100;
        log(step, `tunnel-proxy.js written via heredoc: ${uploaded}`);
        r.record(step, uploaded, Date.now() - t0, { path: TUNNEL_PROXY_REMOTE });
      } catch (err2) {
        r.recordError(step, err2);
      }
    }

    // ─── Step 4: Start tunnel proxy in background ────────────────────────
    step = '4-start-proxy';
    try {
      const t0 = Date.now();
      // Install ws library (the tunnel proxy depends on it).
      const installWs = await sb.runCommand('npm install -g ws 2>&1 | tail -3', { timeoutS: 30 });
      log(step, `ws install: ${installWs.output.trim()}`);
      // Start the proxy in the background with env vars.
      // NODE_PATH points to the global npm modules so the proxy can require('ws').
      const envVars = `TUNNEL_RELAY_URL="${RELAY_WS_URL}" TUNNEL_RELAY_TOKEN="${relayToken}" TUNNEL_LISTEN_PORT=${TUNNEL_PORT} TUNNEL_DEBUG=1`;
      const startCmd = `NODE_PATH=$(npm root -g) nohup env ${envVars} node ${TUNNEL_PROXY_REMOTE} > /tmp/tunnel-proxy.log 2>&1 &`;
      await sb.runCommand(startCmd, { timeoutS: SHORT_TIMEOUT_S });
      // Give it a moment to start.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Check it's running.
      const check = await sb.runCommand(
        `curl -s http://127.0.0.1:${TUNNEL_PORT}/ 2>&1; echo "---"; cat /tmp/tunnel-proxy.log 2>&1 | head -5`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const running = check.output.includes('tunnel-proxy') || check.output.includes('Listening');
      log(step, `Tunnel proxy running: ${running}`);
      log(step, `Proxy log: ${check.output.substring(0, 300)}`);
      r.record(step, running, Date.now() - t0, { port: TUNNEL_PORT });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 5: Verify tunnel — curl with HTTPS_PROXY ───────────────────
    step = '5-curl-via-tunnel';
    try {
      const t0 = Date.now();
      // NO_PROXY excludes Essential Services — the sandbox reaches them
      // directly, and the relay rejects tunnel requests for them.
      const noProxy = 'models.dev,registry.npmjs.org,registry.npmjs.com,github.com,*.githubusercontent.com,opencode.ai,*.railway.app,railway.app,railway.com';
      const result = await sb.runCommand(
        `HTTPS_PROXY=http://127.0.0.1:${TUNNEL_PORT} NO_PROXY="${noProxy}" curl -s --max-time 20 -H "Authorization: Bearer ${apiKey}" ${DIRECT_BASE}/v1/models 2>&1 | head -c 500`,
        { timeoutS: SHORT_TIMEOUT_S },
      );
      const hasModels =
        result.output.includes('"id"') || result.output.includes('models');
      log(step, `curl via tunnel returned models data: ${hasModels}`);
      log(step, `Output (first 300 chars): ${result.output.substring(0, 300)}`);
      r.record(step, hasModels, Date.now() - t0, {
        outputChars: result.output.length,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 6: opencode run with HTTPS_PROXY — NO baseURL override ─────
    //
    // This is the key test: opencode uses the REAL api.neuralwatt.com URL
    // (no opencode.json with baseURL override). The only configuration is
    // the HTTPS_PROXY env var, which Go's net/http respects natively.
    //
    // We still need an opencode.json to register the neuralwatt provider
    // (opencode doesn't have it built-in), but we do NOT set baseURL —
    // the provider uses its default endpoint (api.neuralwatt.com).
    step = '6-opencode-no-override';
    try {
      const t0 = Date.now();

      // Write a minimal opencode.json that registers neuralwatt WITHOUT
      // a baseURL override. The provider's default URL is api.neuralwatt.com.
      const config = JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          provider: {
            neuralwatt: {
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

      await sb.runCommand(
        `cat > /tmp/opencode.json <<'OPENCODE_JSON_EOF'\n${config}\nOPENCODE_JSON_EOF`,
        { timeoutS: SHORT_TIMEOUT_S },
      );

      // Run opencode with HTTPS_PROXY set — no baseURL override.
      // NEURALWATT_API_KEY is needed for auth.
      // HTTPS_PROXY routes the request through the local tunnel proxy.
      // NO_PROXY excludes Essential Services that the sandbox reaches directly.
      const noProxy = 'models.dev,registry.npmjs.org,registry.npmjs.com,github.com,*.githubusercontent.com,opencode.ai,*.railway.app,railway.app,railway.com';
      const cmd = `cd /tmp && HTTPS_PROXY=http://127.0.0.1:${TUNNEL_PORT} NO_PROXY="${noProxy}" NEURALWATT_API_KEY=${apiKey} opencode run --model ${SPIKE_MODEL} "Print exactly: SPIKE_OK" </dev/null 2>&1`;
      log(step, `Running opencode with HTTPS_PROXY (no baseURL override)`);
      const result = await sb.runCommand(cmd, {
        timeoutS: OPENCODE_TIMEOUT_MS / 1000,
      });
      const hasSpikeOk = result.output.includes('SPIKE_OK');
      log(step, `Exit code: ${result.exitCode}, output contains "SPIKE_OK": ${hasSpikeOk}`);
      log(step, `Output (first 800 chars):\n${result.output.substring(0, 800)}`);
      r.record(step, result.exitCode === 0 && hasSpikeOk, Date.now() - t0, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        hasSpikeOk,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 7: Streaming chat completion through the tunnel ───────────
    step = '7-opencode-stream';
    try {
      const t0 = Date.now();
      const prompt = 'Write a 3-sentence summary of how HTTP/2 multiplexing works.';
      const noProxy = 'models.dev,registry.npmjs.org,registry.npmjs.com,github.com,*.githubusercontent.com,opencode.ai,*.railway.app,railway.app,railway.com';
      const cmd = `cd /tmp && HTTPS_PROXY=http://127.0.0.1:${TUNNEL_PORT} NO_PROXY="${noProxy}" NEURALWATT_API_KEY=${apiKey} opencode run --format json --model ${SPIKE_MODEL} "${prompt}" </dev/null 2>&1`;
      log(step, `Running streamed opencode with HTTPS_PROXY`);
      const result = await sb.runCommand(cmd, {
        timeoutS: OPENCODE_TIMEOUT_MS / 1000,
      });
      const hasText =
        result.output.includes('"type"') &&
        (result.output.includes('"text"') ||
          result.output.includes('"message"'));
      const exitOk = result.exitCode === 0;
      log(step, `Exit code: ${result.exitCode}, has structured events: ${hasText}`);
      log(step, `Output (first 1200 chars):\n${result.output.substring(0, 1200)}`);
      r.record(step, exitOk && hasText, Date.now() - t0, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        hasText,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 8: Check tunnel proxy logs ────────────────────────────────
    step = '8-proxy-logs';
    try {
      const result = await sb.runCommand(`cat /tmp/tunnel-proxy.log 2>&1 | tail -20`, {
        timeoutS: SHORT_TIMEOUT_S,
      });
      log(step, `Proxy logs:\n${result.output}`);
      r.record(step, true, 0, { logLines: result.output.split('\n').length });
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
