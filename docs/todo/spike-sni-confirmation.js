#!/usr/bin/env node
/**
 * Spike 4: Final confirmation — SNI-based filtering with a comprehensive
 * cross-test. Connects to the SAME working IP with different SNIs to
 * definitively prove the filter is on the SNI field.
 */

const { OpencodeSandbox, SpikeRunner, elapsed, log } = require('./spike-opencode-sandbox.js');

// Use OpenAI's IP (162.159.140.245) which we know accepts TLS
const WORKING_IP = '162.159.140.245';

const SNI_TESTS = [
  // SNI values to test against the working IP
  { sni: 'api.openai.com', expect: 'ok' },      // control — should work
  { sni: 'api.neuralwatt.com', expect: 'reset' }, // should be reset
  { sni: 'www.cloudflare.com', expect: 'reset' }, // should be reset
  { sni: 'www.shopify.com', expect: 'ok' },      // should work (shopify worked)
  { sni: 'discord.com', expect: 'reset' },        // should be reset
  { sni: 'httpbin.org', expect: 'reset' },        // should be reset
  { sni: 'api.anthropic.com', expect: 'ok' },    // should work (non-CF, but SNI test)
  { sni: 'github.com', expect: 'ok' },           // should work
  { sni: 'www.google.com', expect: 'ok' },       // test a major site
  { sni: 'registry.npmjs.org', expect: 'reset' }, // npm was failing
  { sni: 'workers.cloudflare.com', expect: 'reset' },
  { sni: 'fake-nonexistent-domain-12345.com', expect: 'ok' }, // unknown domain — should get TLS from OpenAI
];

async function main() {
  const runner = new SpikeRunner('sni-confirmation');

  await runner.run(async (sb, r) => {
    let step = '0-create';
    try {
      const t0 = Date.now();
      const id = await sb.create();
      log(step, `Created sandbox ${id} in ${elapsed(Date.now() - t0)}`);
      r.record(step, true, Date.now() - t0, { sandboxId: id });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    step = '1-sni-cross-test';
    const results = [];
    for (const test of SNI_TESTS) {
      try {
        const result = await sb.runCommand(
          `echo | timeout 8 openssl s_client -connect ${WORKING_IP}:443 -servername ${test.sni} 2>&1 | head -5`,
          { timeoutS: 12 }
        );
        const output = result.output.trim();
        const hasReset = output.includes('errno=104') || output.includes('Connection reset');
        const hasCert = output.includes('verify return:1') || output.includes('depth=');
        const status = hasReset ? 'RESET' : hasCert ? 'TLS_OK' : 'UNKNOWN';
        const match = status === (test.expect === 'ok' ? 'TLS_OK' : test.expect === 'reset' ? 'RESET' : 'TLS_OK') ? '✓' : '✗';
        log(step, `${match} SNI=${test.sni}: ${status} (expected ${test.expect})`);
        results.push({ sni: test.sni, status, expected: test.expect, output: output.substring(0, 300) });
      } catch (err) {
        log(step, `✗ SNI=${test.sni}: ERROR ${err.message}`);
        results.push({ sni: test.sni, status: 'ERROR', expected: test.expect, error: err.message });
      }
    }
    r.record(step, true, 0, results);

    // Also test: does HTTP (port 80) to neuralwatt return a Cloudflare 403?
    // This tells us if Cloudflare itself is accessible via plain HTTP
    step = '2-http-neuralwatt-body';
    try {
      const result = await sb.runCommand(
        `curl -s --max-time 10 http://api.neuralwatt.com/v1/models 2>&1`,
        { timeoutS: 15 }
      );
      log(step, `HTTP body from neuralwatt (port 80): ${result.output.substring(0, 500)}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 1000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // Check if the 403 body is a Cloudflare challenge page
    step = '3-http-neuralwatt-headers';
    try {
      const result = await sb.runCommand(
        `curl -sv --max-time 10 http://api.neuralwatt.com/v1/models 2>&1 | grep -i -E "(HTTP/|server:|cf-|cloudflare|content-type)" | head -10`,
        { timeoutS: 15 }
      );
      log(step, `HTTP headers from neuralwatt (port 80):\n${result.output}`);
      r.record(step, true, result.ms, { output: result.output });
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
