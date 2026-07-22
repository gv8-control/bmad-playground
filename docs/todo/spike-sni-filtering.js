#!/usr/bin/env node
/**
 * Spike 3: Determine if the TLS reset is SNI-based filtering or IP-based.
 *
 * Key question from spike 2: some Cloudflare sites work (OpenAI, Shopify),
 * others fail (neuralwatt, cloudflare.com, discord). Is the filtering based
 * on the SNI (Server Name Indication) in the TLS Client Hello, or on the
 * destination IP, or on something else?
 *
 * Tests:
 * 1. Connect to a working Cloudflare IP with neuralwatt SNI
 * 2. Connect to a failing Cloudflare IP with OpenAI SNI
 * 3. Test with no SNI at all
 * 4. Test HTTP (port 80) to neuralwatt to see if non-TLS works
 * 5. Get the actual egress IP via a non-Cloudflare service
 */

const { OpencodeSandbox, SpikeRunner, elapsed, log } = require('./spike-opencode-sandbox.js');

async function main() {
  const runner = new SpikeRunner('sni-filtering-test');

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

    // ─── Step 1: Get egress IP via a non-Cloudflare service ──────────────
    step = '1-egress-ip';
    try {
      // Use icanhazip.com (not Cloudflare) or try AWS checkip
      const result = await sb.runCommand(
        `echo "=== icanhazip ===" && curl -s --max-time 5 https://icanhazip.com 2>&1 && echo "=== aws checkip ===" && curl -s --max-time 5 https://checkip.amazonaws.com 2>&1 && echo "=== ifconfig.me ===" && curl -s --max-time 5 https://ifconfig.me 2>&1`,
        { timeoutS: 20 }
      );
      log(step, `Egress IP: ${result.output.trim()}`);
      r.record(step, true, result.ms, { output: result.output });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 2: SNI test — connect to OpenAI's Cloudflare IP with neuralwatt SNI ─
    step = '2-sni-openai-ip-neuralwatt-sni';
    try {
      // OpenAI's IP: 162.159.140.245 (TLS works normally)
      // But send neuralwatt.com as SNI
      const result = await sb.runCommand(
        `echo | timeout 10 openssl s_client -connect 162.159.140.245:443 -servername api.neuralwatt.com 2>&1 | head -15`,
        { timeoutS: 15 }
      );
      const hasReset = result.output.includes('errno=104') || result.output.includes('Connection reset');
      const hasCert = result.output.includes('Verify return code') || result.output.includes('Server certificate');
      log(step, `OpenAI IP + neuralwatt SNI: ${hasReset ? 'RESET' : hasCert ? 'TLS OK' : 'unknown'}`);
      r.record(step, true, result.ms, { hasReset, hasCert, output: result.output.substring(0, 1000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 3: SNI test — connect to neuralwatt's IP with OpenAI SNI ────
    step = '3-sni-neuralwatt-ip-openai-sni';
    try {
      // neuralwatt's IP: 104.26.7.80 (TLS fails normally)
      // But send api.openai.com as SNI
      const result = await sb.runCommand(
        `echo | timeout 10 openssl s_client -connect 104.26.7.80:443 -servername api.openai.com 2>&1 | head -15`,
        { timeoutS: 15 }
      );
      const hasReset = result.output.includes('errno=104') || result.output.includes('Connection reset');
      const hasCert = result.output.includes('Verify return code') || result.output.includes('Server certificate');
      log(step, `neuralwatt IP + OpenAI SNI: ${hasReset ? 'RESET' : hasCert ? 'TLS OK' : 'unknown'}`);
      r.record(step, true, result.ms, { hasReset, hasCert, output: result.output.substring(0, 1000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 4: No SNI test ─────────────────────────────────────────────
    step = '4-no-sni';
    try {
      // Connect to neuralwatt's IP with no SNI (openssl -noservername)
      const result = await sb.runCommand(
        `echo | timeout 10 openssl s_client -connect 104.26.7.80:443 -noservername 2>&1 | head -15`,
        { timeoutS: 15 }
      );
      const hasReset = result.output.includes('errno=104') || result.output.includes('Connection reset');
      const hasCert = result.output.includes('Verify return code') || result.output.includes('Server certificate');
      log(step, `neuralwatt IP + no SNI: ${hasReset ? 'RESET' : hasCert ? 'TLS OK' : 'unknown'}`);
      r.record(step, true, result.ms, { hasReset, hasCert, output: result.output.substring(0, 1000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 5: HTTP (port 80) to neuralwatt ─────────────────────────────
    step = '5-http-port-80';
    try {
      // Test if plain HTTP works (no TLS)
      const result = await sb.runCommand(
        `curl -sv --max-time 10 http://api.neuralwatt.com/v1/models 2>&1 | head -20`,
        { timeoutS: 15 }
      );
      const hasResponse = result.output.includes('HTTP/') || result.output.includes('< ');
      const hasRedirect = result.output.includes('301') || result.output.includes('302');
      log(step, `HTTP (port 80) to neuralwatt: ${hasResponse ? 'got response' : 'no response'}${hasRedirect ? ' (redirect)' : ''}`);
      r.record(step, hasResponse, result.ms, { hasResponse, hasRedirect, output: result.output.substring(0, 1500) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 6: Test more IPs to find the pattern ───────────────────────
    step = '6-ip-pattern';
    try {
      // Test specific Cloudflare IP ranges
      const result = await sb.runCommand(
        `echo "=== 104.16.x.x (npm/cloudflare.com) ===" && echo | timeout 5 openssl s_client -connect 104.16.123.96:443 -servername www.cloudflare.com 2>&1 | head -3 && echo "=== 104.26.x.x (neuralwatt) ===" && echo | timeout 5 openssl s_client -connect 104.26.7.80:443 -servername api.neuralwatt.com 2>&1 | head -3 && echo "=== 162.159.x.x (openai) ===" && echo | timeout 5 openssl s_client -connect 162.159.140.245:443 -servername api.openai.com 2>&1 | head -3 && echo "=== 172.64.x.x (shopify) ===" && echo | timeout 5 openssl s_client -connect 172.64.145.93:443 -servername www.shopify.com 2>&1 | head -3 && echo "=== 172.67.x.x (neuralwatt alt) ===" && echo | timeout 5 openssl s_client -connect 172.67.73.70:443 -servername api.neuralwatt.com 2>&1 | head -3`,
        { timeoutS: 40 }
      );
      log(step, `IP pattern test:\n${result.output}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 2000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 7: Check what ASNs the working vs failing IPs belong to ────
    step = '7-asn-check';
    try {
      const result = await sb.runCommand(
        `echo "=== neuralwatt 104.26.7.80 ===" && curl -s --max-time 5 "https://ipinfo.io/104.26.7.80" 2>&1 | head -5 && echo "=== openai 162.159.140.245 ===" && curl -s --max-time 5 "https://ipinfo.io/162.159.140.245" 2>&1 | head -5 && echo "=== shopify 172.64.145.93 ===" && curl -s --max-time 5 "https://ipinfo.io/172.64.145.93" 2>&1 | head -5 && echo "=== cloudflare.com 104.16.123.96 ===" && curl -s --max-time 5 "https://ipinfo.io/104.16.123.96" 2>&1 | head -5`,
        { timeoutS: 30 }
      );
      log(step, `ASN check:\n${result.output}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 2000) });
    } catch (err) {
      r.recordError(step, err);
    }

    // ─── Step 8: Test with --resolve to force IP ──────────────────────────
    step = '8-resolve-test';
    try {
      // Force neuralwatt to resolve to OpenAI's IP
      const result = await sb.runCommand(
        `echo "=== neuralwatt -> openai IP ===" && curl -sv --max-time 10 --resolve api.neuralwatt.com:443:162.159.140.245 https://api.neuralwatt.com/v1/models 2>&1 | head -20 && echo "=== openai -> neuralwatt IP ===" && curl -sv --max-time 10 --resolve api.openai.com:443:104.26.7.80 https://api.openai.com 2>&1 | head -20`,
        { timeoutS: 25 }
      );
      log(step, `Resolve test:\n${result.output.substring(0, 2000)}`);
      r.record(step, true, result.ms, { output: result.output.substring(0, 3000) });
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
