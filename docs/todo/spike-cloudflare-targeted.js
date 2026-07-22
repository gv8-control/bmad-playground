#!/usr/bin/env node
/**
 * Follow-up spike: test more Cloudflare-fronted sites to determine if the
 * TLS reset is universal to all Cloudflare IPs or specific to certain
 * Cloudflare customers/zones.
 *
 * Reuses OpencodeSandbox harness.
 */

const { OpencodeSandbox, SpikeRunner, elapsed, log } = require('./spike-opencode-sandbox.js');

// Test sites: mix of Cloudflare-fronted and non-Cloudflare
const TEST_SITES = [
  // Cloudflare-fronted (confirmed via ipinfo)
  { name: 'neuralwatt', url: 'https://api.neuralwatt.com/v1/models', cf: true },
  { name: 'cloudflare.com', url: 'https://www.cloudflare.com', cf: true },
  { name: 'httpbin.org', url: 'https://httpbin.org/get', cf: true },
  // OpenAI is behind Cloudflare BUT got HTTP 421 (TLS succeeded!)
  { name: 'openai', url: 'https://api.openai.com', cf: true },
  // Non-Cloudflare
  { name: 'anthropic', url: 'https://api.anthropic.com', cf: false },
  { name: 'npm', url: 'https://registry.npmjs.org', cf: false },
  // More Cloudflare-fronted sites to test
  { name: 'discord', url: 'https://discord.com', cf: true },
  { name: 'shopify', url: 'https://www.shopify.com', cf: true },
  { name: 'kaggle', url: 'https://www.kaggle.com', cf: false },
  { name: 'github', url: 'https://github.com', cf: false },
  // Cloudflare's own services
  { name: 'workers.dev', url: 'https://workers.cloudflare.com', cf: true },
  { name: '1.1.1.1', url: 'https://1.1.1.1', cf: true },
];

async function main() {
  const runner = new SpikeRunner('cloudflare-targeted-test');

  await runner.run(async (sb, r) => {
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

    step = '1-test-sites';
    const results = {};
    for (const site of TEST_SITES) {
      try {
        // Use curl with verbose to capture TLS + HTTP details
        const result = await sb.runCommand(
          `curl -sv --max-time 10 ${site.url} 2>&1 | grep -E "(Trying|Connected|TLS|HTTP/|reset|errno|SSL_connect|Recv failure|ALPN)" | head -15`,
          { timeoutS: 20 }
        );
        const output = result.output.trim();
        const tlsOk = output.includes('SSL connection using') || output.includes('TLSv1.3 (IN), TLS handshake, Server hello');
        const hasReset = output.includes('Connection reset by peer') || output.includes('errno=104') || output.includes('Recv failure');
        const hasHttp = output.includes('HTTP/');
        const status = hasHttp ? output.match(/HTTP\/[\d.]+\s+(\d+)/)?.[1] : null;

        log(step, `${site.name} (cf=${site.cf}): ${tlsOk ? 'TLS OK' : 'TLS FAIL'}${hasReset ? ' (reset)' : ''}${hasHttp ? ` HTTP ${status}` : ''}`);
        results[site.name] = { cf: site.cf, tlsOk, hasReset, hasHttp, status, output: output.substring(0, 800) };
      } catch (err) {
        log(step, `${site.name}: ERROR ${err.message}`);
        results[site.name] = { cf: site.cf, error: err.message };
      }
    }
    r.record(step, true, 0, results);

    // Also get the egress IP
    step = '2-egress-ip';
    try {
      const result = await sb.runCommand(
        'curl -s --max-time 10 https://ipinfo.io/json 2>&1 || echo "FAILED"',
        { timeoutS: 15 }
      );
      log(step, `Egress info: ${result.output.substring(0, 500)}`);
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
