#!/usr/bin/env node
/**
 * Spike: investigate why neuralwatt API is unreachable from Daytona sandboxes.
 *
 * Reuses the OpencodeSandbox harness from spike-opencode-sandbox.js.
 * Runs a battery of network diagnostics inside a sandbox to pinpoint
 * exactly where the failure occurs: DNS, TCP, TLS, HTTP, or application layer.
 *
 * Usage:
 *   node docs/todo/spike-neuralwatt-accessibility.js
 *
 * Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 * Optionally: NEURALWATT_API_KEY (to test authenticated requests).
 *
 * Output: structured JSON results printed to stdout + human-readable log.
 */

const { OpencodeSandbox, SpikeRunner, elapsed, log, sleep } = require('./spike-opencode-sandbox.js');

const NEURALWATT_HOST = 'api.neuralwatt.com';
const NEURALWATT_URL = `https://${NEURALWATT_HOST}/v1/models`;
const NEURALWATT_PORT = 443;

// Control sites — Cloudflare-fronted and non-Cloudflare
const CONTROL_SITES = {
  // Non-Cloudflare (should work per F2)
  'api.anthropic.com': 'https://api.anthropic.com',
  'api.openai.com': 'https://api.openai.com',
  'registry.npmjs.org': 'https://registry.npmjs.org',
  // Cloudflare-fronted (may fail per F2)
  'httpbin.org': 'https://httpbin.org/get',
  'cloudflare.com': 'https://www.cloudflare.com',
};

// Timeout for each diagnostic command (seconds)
const CMD_TIMEOUT_S = 30;

async function main() {
  const runner = new SpikeRunner('neuralwatt-accessibility');

  await runner.run(async (sb, r) => {
    // ─── Step 0: Create sandbox ──────────────────────────────────────────
    let step = '0-create';
    try {
      log(step, 'Creating sandbox...');
      const t0 = Date.now();
      const id = await sb.create();
      log(step, `Created sandbox ${id} in ${elapsed(Date.now() - t0)}`);
      r.record(step, true, Date.now() - t0, { sandboxId: id });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ─── Step 1: Get sandbox egress IP ───────────────────────────────────
    step = '1-egress-ip';
    try {
      const result = await sb.runCommand(
        'curl -s --max-time 10 https://ifconfig.me 2>&1 || echo "CURL_FAILED"',
        { timeoutS: CMD_TIMEOUT_S }
      );
      const egressIp = result.output.trim();
      log(step, `Sandbox egress IP: ${egressIp}`);
      r.record(step, true, result.ms, { egressIp });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 2: DNS resolution for neuralwatt ───────────────────────────
    step = '2-dns';
    try {
      const result = await sb.runCommand(
        `dig +short ${NEURALWATT_HOST} 2>&1 || nslookup ${NEURALWATT_HOST} 2>&1 || host ${NEURALWATT_HOST} 2>&1`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      log(step, `DNS resolution:\n${result.output}`);
      r.record(step, result.exitCode === 0, result.ms, { dnsOutput: result.output });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 3: TCP connection test ─────────────────────────────────────
    step = '3-tcp';
    try {
      // Test TCP connectivity to port 443
      const result = await sb.runCommand(
        `timeout 10 bash -c 'echo > /dev/tcp/${NEURALWATT_HOST}/${NEURALWATT_PORT}' 2>&1 && echo "TCP_OK" || echo "TCP_FAILED"`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      const tcpOk = result.output.includes('TCP_OK');
      log(step, `TCP to ${NEURALWATT_HOST}:${NEURALWATT_PORT}: ${tcpOk ? 'OK' : 'FAILED'}`);
      r.record(step, tcpOk, result.ms, { tcpOk, output: result.output });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 4: TLS handshake test (openssl s_client) ────────────────────
    step = '4-tls';
    try {
      const result = await sb.runCommand(
        `echo | timeout 15 openssl s_client -connect ${NEURALWATT_HOST}:${NEURALWATT_PORT} -servername ${NEURALWATT_HOST} 2>&1 | head -40`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      const tlsHandshakeOk = result.output.includes('Verify return code') || result.output.includes('SSL handshake has read');
      const hasReset = result.output.includes('Connection reset by peer') || result.output.includes('errno=104');
      log(step, `TLS handshake: ${tlsHandshakeOk ? 'OK' : 'FAILED'}${hasReset ? ' (Connection reset by peer)' : ''}`);
      r.record(step, tlsHandshakeOk, result.ms, {
        tlsOk: tlsHandshakeOk,
        connectionReset: hasReset,
        output: result.output.substring(0, 2000),
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 5: curl verbose to neuralwatt (capture full TLS + HTTP) ────
    step = '5-curl-verbose-neuralwatt';
    try {
      const result = await sb.runCommand(
        `curl -sv --max-time 15 ${NEURALWATT_URL} 2>&1 | head -60`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      const hasResponse = result.output.includes('HTTP/') || result.output.includes('< ');
      const hasReset = result.output.includes('Connection reset by peer') || result.output.includes('errno=104');
      const hasTimeout = result.output.includes('timed out') || result.output.includes('Operation timed out');
      log(step, `curl to neuralwatt: ${hasResponse ? 'HTTP response' : 'no HTTP response'}${hasReset ? ' (reset)' : ''}${hasTimeout ? ' (timeout)' : ''}`);
      r.record(step, hasResponse, result.ms, {
        hasHttpResponse: hasResponse,
        connectionReset: hasReset,
        timedOut: hasTimeout,
        output: result.output.substring(0, 3000),
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 6: curl with custom User-Agent (browser-like) ───────────────
    step = '6-curl-useragent';
    try {
      const result = await sb.runCommand(
        `curl -sv --max-time 15 -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" ${NEURALWATT_URL} 2>&1 | head -60`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      const hasResponse = result.output.includes('HTTP/') || result.output.includes('< ');
      const hasReset = result.output.includes('Connection reset by peer') || result.output.includes('errno=104');
      log(step, `curl with browser UA: ${hasResponse ? 'HTTP response' : 'no HTTP response'}${hasReset ? ' (reset)' : ''}`);
      r.record(step, hasResponse, result.ms, {
        hasHttpResponse: hasResponse,
        connectionReset: hasReset,
        output: result.output.substring(0, 3000),
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 7: Control sites — non-Cloudflare ──────────────────────────
    step = '7-control-non-cf';
    const nonCfResults = {};
    for (const [name, url] of Object.entries(CONTROL_SITES)) {
      if (name === 'httpbin.org' || name === 'cloudflare.com') continue; // Cloudflare sites tested next
      try {
        const result = await sb.runCommand(
          `curl -s --max-time 10 -o /dev/null -w "%{http_code} %{time_total}s" ${url} 2>&1`,
          { timeoutS: CMD_TIMEOUT_S }
        );
        const parts = result.output.trim().split(/\s+/);
        const httpCode = parts[0] || '000';
        const timeTotal = parts[1] || '?';
        const ok = httpCode && httpCode !== '000' && !httpCode.startsWith('5');
        log(step, `${name} (${url}): HTTP ${httpCode} in ${timeTotal}`);
        nonCfResults[name] = { httpCode, timeTotal, ok };
      } catch (err) {
        log(step, `${name}: ERROR ${err.message}`);
        nonCfResults[name] = { error: err.message, ok: false };
      }
    }
    r.record(step, Object.values(nonCfResults).every(v => v.ok), 0, nonCfResults);

    // ─── Step 8: Control sites — Cloudflare-fronted ──────────────────────
    step = '8-control-cf';
    const cfResults = {};
    for (const [name, url] of Object.entries(CONTROL_SITES)) {
      if (name !== 'httpbin.org' && name !== 'cloudflare.com') continue;
      try {
        const result = await sb.runCommand(
          `curl -sv --max-time 10 ${url} 2>&1 | tail -20`,
          { timeoutS: CMD_TIMEOUT_S }
        );
        const hasResponse = result.output.includes('HTTP/') || result.output.includes('< ');
        const hasReset = result.output.includes('Connection reset by peer') || result.output.includes('errno=104');
        log(step, `${name} (${url}): ${hasResponse ? 'HTTP response' : 'no response'}${hasReset ? ' (reset)' : ''}`);
        cfResults[name] = { hasResponse, connectionReset: hasReset, output: result.output.substring(0, 1000) };
      } catch (err) {
        log(step, `${name}: ERROR ${err.message}`);
        cfResults[name] = { error: err.message };
      }
    }
    r.record(step, Object.values(cfResults).some(v => v.hasResponse), 0, cfResults);

    // ─── Step 9: Node.js fetch to neuralwatt (opencode's transport) ──────
    step = '9-node-fetch';
    try {
      const nodeScript = `
        (async () => {
          try {
            const resp = await fetch('${NEURALWATT_URL}', {
              signal: AbortSignal.timeout(15000),
              headers: { 'User-Agent': 'node-fetch-diagnostic' },
            });
            console.log('STATUS:', resp.status);
            console.log('HEADERS:', JSON.stringify(Object.fromEntries(resp.headers.entries())));
            const body = await resp.text();
            console.log('BODY_LEN:', body.length);
            console.log('BODY_HEAD:', body.substring(0, 500));
          } catch (err) {
            console.log('ERROR:', err.message);
            console.log('ERROR_CODE:', err.code || 'N/A');
            console.log('ERROR_CAUSE:', err.cause ? JSON.stringify(err.cause) : 'N/A');
          }
        })();
      `;
      const result = await sb.runCommand(
        `node -e '${nodeScript.replace(/'/g, "'\\''")}' 2>&1`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      const hasStatus = result.output.includes('STATUS:');
      const hasError = result.output.includes('ERROR:');
      log(step, `Node.js fetch: ${hasStatus ? 'got HTTP status' : 'errored'}`);
      r.record(step, hasStatus, result.ms, {
        hasStatus,
        hasError,
        output: result.output.substring(0, 2000),
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 10: Check if neuralwatt resolves to Cloudflare IPs ─────────
    step = '10-ip-analysis';
    try {
      const result = await sb.runCommand(
        `echo "=== neuralwatt ===" && dig +short ${NEURALWATT_HOST} 2>&1 && echo "=== anthropic ===" && dig +short api.anthropic.com 2>&1 && echo "=== openai ===" && dig +short api.openai.com 2>&1 && echo "=== cloudflare check ===" && curl -s --max-time 5 "https://ipinfo.io/$(dig +short ${NEURALWATT_HOST} | head -1)/json" 2>&1 | head -20`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      log(step, `IP analysis:\n${result.output}`);
      r.record(step, result.exitCode === 0, result.ms, { output: result.output });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 11: TLS fingerprint test — curl with different TLS versions ─
    step = '11-tls-versions';
    try {
      // Test TLS 1.2 vs 1.3
      const result = await sb.runCommand(
        `echo "=== TLS 1.2 ===" && echo | timeout 10 openssl s_client -connect ${NEURALWATT_HOST}:${NEURALWATT_PORT} -servername ${NEURALWATT_HOST} -tls1_2 2>&1 | head -5 && echo "=== TLS 1.3 ===" && echo | timeout 10 openssl s_client -connect ${NEURALWATT_HOST}:${NEURALWATT_PORT} -servername ${NEURALWATT_HOST} -tls1_3 2>&1 | head -5 && echo "=== curl tlsv1.2 ===" && curl -sv --tlsv1.2 --max-time 10 ${NEURALWATT_URL} 2>&1 | head -10 && echo "=== curl tlsv1.3 ===" && curl -sv --tlsv1.3 --max-time 10 ${NEURALWATT_URL} 2>&1 | head -10`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      log(step, `TLS version test output:\n${result.output.substring(0, 2000)}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 3000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 12: Authenticated request to neuralwatt (if API key present) ─
    step = '12-authed-request';
    const apiKey = process.env.NEURALWATT_API_KEY;
    if (apiKey) {
      try {
        // Copy the API key into the sandbox env for this command
        const result = await sb.runCommand(
          `curl -sv --max-time 15 -H "Authorization: Bearer ${apiKey}" ${NEURALWATT_URL} 2>&1 | head -60`,
          { timeoutS: CMD_TIMEOUT_S }
        );
        const hasResponse = result.output.includes('HTTP/') || result.output.includes('< ');
        const hasReset = result.output.includes('Connection reset by peer') || result.output.includes('errno=104');
        log(step, `Authenticated request: ${hasResponse ? 'HTTP response' : 'no response'}${hasReset ? ' (reset)' : ''}`);
        r.record(step, hasResponse, result.ms, {
          hasResponse,
          connectionReset: hasReset,
          output: result.output.substring(0, 3000),
        });
      } catch (err) {
        r.recordError(step, err);
      }
    } else {
      log(step, 'NEURALWATT_API_KEY not set — skipping authenticated request');
      r.record(step, true, 0, { skipped: 'no API key' });
    }

    // ─── Step 13: Test from devcontainer (control — should work) ──────────
    step = '13-devcontainer-control';
    // This step runs locally, not in the sandbox — just record a note
    log(step, 'Devcontainer control test runs separately (see report)');
    r.record(step, true, 0, { note: 'Run manually: curl -sv https://api.neuralwatt.com/v1/models from devcontainer' });

    // ─── Step 14: Check Daytona network tier / settings ───────────────────
    step = '14-network-info';
    try {
      const result = await sb.runCommand(
        `echo "=== /etc/resolv.conf ===" && cat /etc/resolv.conf 2>&1 && echo "=== ip route ===" && ip route 2>&1 && echo "=== iptables -L (if available) ===" && iptables -L 2>&1 | head -20`,
        { timeoutS: CMD_TIMEOUT_S }
      );
      log(step, `Network info:\n${result.output.substring(0, 1500)}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 2000) });
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
