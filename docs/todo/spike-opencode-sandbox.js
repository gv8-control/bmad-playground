#!/usr/bin/env node
/**
 * Reusable harness for spikes that run opencode inside a Daytona sandbox.
 *
 * Provides:
 *   - OpencodeSandbox: create/provision/destroy a Daytona sandbox, install
 *     opencode, run commands via the async session API, poll for completion,
 *     retrieve logs (snapshot and streaming).
 *   - SpikeRunner: orchestrates a sequence of steps with structured result
 *     collection, timing, and guaranteed sandbox cleanup.
 *
 * Key finding baked in (spike F1): async session commands need `</dev/null`
 * or opencode hangs waiting for stdin in the PTY. The harness appends this
 * automatically — callers do not need to remember it.
 *
 * Usage as a script (runs the original spike verification):
 *   node spike-opencode-sandbox.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 *
 * Usage as a module (other spikes build on top):
 *   const { OpencodeSandbox, SpikeRunner, runOpencode } = require('./spike-opencode-sandbox.js');
 *   const sb = new OpencodeSandbox();
 *   await sb.create();
 *   const result = await sb.runOpencode('Print exactly: SPIKE_OK');
 *   await sb.destroy();
 *
 * See docs/todo/spike-opencode-sandbox.md for the full spike report.
 */

const { Daytona } = require('@daytonaio/sdk');

// ─── Constants ─────────────────────────────────────────────────────────────

const OPENCODE_MODEL = 'opencode/big-pickle';
const OPENCODE_VERSION = 'latest';
const DEFAULT_OPENCODE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3000;
const NPM_INSTALL_TIMEOUT_S = 120;
const SHORT_CMD_TIMEOUT_S = 15;
const SESSION_START_TIMEOUT_S = 30;

// ─── Utilities ─────────────────────────────────────────────────────────────

function elapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`${name} is not set in env — cannot create Daytona client`);
  }
  return val;
}

// ─── OpencodeSandbox ───────────────────────────────────────────────────────

/**
 * Wraps a single-use Daytona sandbox provisioned with opencode.
 *
 * Lifecycle: create() → installOpencode() → runOpencode() / runCommand() →
 * destroy(). Always call destroy() — use a try/finally or SpikeRunner which
 * handles this automatically.
 */
class OpencodeSandbox {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model] - opencode model to use (default: opencode/big-pickle)
   * @param {string} [opts.opencodeVersion] - npm version spec (default: 'latest')
   * @param {object} [opts.labels] - extra labels for the sandbox
   * @param {string} [opts.runId] - run identifier for labels (default: timestamp)
   */
  constructor(opts = {}) {
    this.model = opts.model || OPENCODE_MODEL;
    this.opencodeVersion = opts.opencodeVersion || OPENCODE_VERSION;
    this.runId = opts.runId || 'spike-' + Date.now();
    this.labels = { scope: 'spike', runId: this.runId, ...(opts.labels || {}) };
    this.daytona = null;
    this.sb = null;
    this.installed = false;
  }

  /**
   * Create the Daytona sandbox. Returns the sandbox id.
   * @returns {Promise<string>}
   */
  async create() {
    this.daytona = new Daytona({
      apiKey: requireEnv('DAYTONA_API_KEY'),
      apiUrl: requireEnv('DAYTONA_API_URL'),
    });
    this.sb = await this.daytona.create({ labels: this.labels });
    return this.sb.id;
  }

  /**
   * Install opencode globally via npm. Idempotent — skips if already installed.
   * @param {string} [step] - step label for logging
   * @returns {Promise<{exitCode: number, version: string, ms: number}>}
   */
  async installOpencode(step = 'install') {
    if (this.installed) {
      return { exitCode: 0, version: 'cached', ms: 0 };
    }
    if (!this.sb) {
      throw new Error('Sandbox not created — call create() first');
    }

    const t0 = Date.now();
    log(step, `Installing opencode via npm (${this.opencodeVersion})...`);
    const resp = await this.sb.process.executeCommand(
      `npm install -g opencode-ai@${this.opencodeVersion} 2>&1 | tail -5`,
      undefined, undefined, NPM_INSTALL_TIMEOUT_S,
    );
    log(step, `Install exit code: ${resp.exitCode} in ${elapsed(Date.now() - t0)}`);
    if (resp.exitCode !== 0) {
      log(step, `Install output: ${resp.result}`);
      throw new Error(`opencode install failed (exit ${resp.exitCode})`);
    }

    const verResp = await this.sb.process.executeCommand(
      'opencode --version 2>&1', undefined, undefined, SHORT_CMD_TIMEOUT_S,
    );
    const version = verResp.result.trim();
    log(step, `opencode version: ${version}`);
    this.installed = true;
    return { exitCode: 0, version, ms: Date.now() - t0 };
  }

  /**
   * Run an arbitrary shell command synchronously (blocks until exit).
   * @param {string} command
   * @param {object} [opts]
   * @param {string} [opts.cwd] - working directory
   * @param {number} [opts.timeoutS] - timeout in seconds
   * @returns {Promise<{exitCode: number, output: string, ms: number}>}
   */
  async runCommand(command, opts = {}) {
    if (!this.sb) {
      throw new Error('Sandbox not created — call create() first');
    }
    const t0 = Date.now();
    const resp = await this.sb.process.executeCommand(
      command, opts.cwd, undefined, opts.timeoutS || SHORT_CMD_TIMEOUT_S,
    );
    return { exitCode: resp.exitCode, output: resp.result, ms: Date.now() - t0 };
  }

  /**
   * Run `opencode run` via the async session API and poll until completion.
   *
   * The `</dev/null` redirect is appended automatically (spike finding F1:
   * without it, opencode hangs waiting for stdin in the PTY).
   *
   * @param {string} prompt - the prompt to pass to `opencode run`
   * @param {object} [opts]
   * @param {string} [opts.cwd] - working directory (default: /tmp)
   * @param {number} [opts.timeoutMs] - poll deadline (default: 120s)
   * @param {string} [opts.step] - step label for logging
   * @returns {Promise<{exitCode: number, output: string, sessionId: string, commandId: string, ms: number}>}
   */
  async runOpencode(prompt, opts = {}) {
    if (!this.sb) {
      throw new Error('Sandbox not created — call create() first');
    }
    const step = opts.step || 'run';
    const cwd = opts.cwd || '/tmp';
    const timeoutMs = opts.timeoutMs || DEFAULT_OPENCODE_TIMEOUT_MS;

    const sessionId = `${this.runId}-${Date.now()}`;
    log(step, `Creating session ${sessionId}...`);
    await this.sb.process.createSession(sessionId);

    // CRITICAL: </dev/null prevents opencode from hanging on stdin in the PTY.
    // Without this, the process never exits and getSessionCommand never returns
    // an exitCode. See spike report F1.
    const cmd = `cd ${cwd} && opencode run --model ${this.model} "${prompt}" </dev/null 2>&1`;

    log(step, `Executing (runAsync): ${cmd}`);
    const t0 = Date.now();
    const execResp = await this.sb.process.executeSessionCommand(
      sessionId,
      { command: cmd, runAsync: true },
      SESSION_START_TIMEOUT_S,
    );
    const commandId = execResp.cmdId;
    log(step, `Command started: cmdId=${commandId} in ${elapsed(Date.now() - t0)}`);

    // Poll until the command exits.
    const deadline = Date.now() + timeoutMs;
    let finalState = null;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const cmdState = await this.sb.process.getSessionCommand(sessionId, commandId);
      log(step, `Poll: exitCode=${cmdState.exitCode}`);
      if (cmdState.exitCode !== undefined && cmdState.exitCode !== null) {
        finalState = cmdState;
        break;
      }
    }
    if (!finalState) {
      throw new Error(`opencode run did not exit within ${timeoutMs / 1000}s timeout`);
    }

    log(step, `Command exited in ${elapsed(Date.now() - t0)}: exitCode=${finalState.exitCode}`);

    // Retrieve logs (snapshot overload).
    const logs = await this.sb.process.getSessionCommandLogs(sessionId, commandId);
    const output = logs.output || logs.stdout || '';

    // Clean up the session.
    await this.sb.process.deleteSession(sessionId).catch(() => {});

    return {
      exitCode: finalState.exitCode,
      output,
      sessionId,
      commandId,
      ms: Date.now() - t0,
    };
  }

  /**
   * Run `opencode run` via the async session API and stream logs via callbacks
   * until the process exits. The streaming overload blocks until completion.
   *
   * @param {string} prompt - the prompt to pass to `opencode run`
   * @param {function(string): void} onStdout - callback for stdout chunks
   * @param {function(string): void} [onStderr] - callback for stderr chunks
   * @param {object} [opts]
   * @param {string} [opts.cwd] - working directory (default: /tmp)
   * @param {string} [opts.step] - step label for logging
   * @returns {Promise<{exitCode: number|null, output: string, chunks: number, sessionId: string, commandId: string, ms: number}>}
   */
  async runOpencodeStreamed(prompt, onStdout, onStderr, opts = {}) {
    if (!this.sb) {
      throw new Error('Sandbox not created — call create() first');
    }
    const step = opts.step || 'stream';
    const cwd = opts.cwd || '/tmp';

    const sessionId = `${this.runId}-stream-${Date.now()}`;
    log(step, `Creating session ${sessionId}...`);
    await this.sb.process.createSession(sessionId);

    const cmd = `cd ${cwd} && opencode run --model ${this.model} "${prompt}" </dev/null 2>&1`;
    log(step, `Executing (runAsync): ${cmd}`);
    const t0 = Date.now();
    const execResp = await this.sb.process.executeSessionCommand(
      sessionId,
      { command: cmd, runAsync: true },
      SESSION_START_TIMEOUT_S,
    );
    const commandId = execResp.cmdId;
    log(step, `Command started: cmdId=${commandId}`);

    const chunks = [];
    const stdoutCb = (chunk) => { chunks.push(chunk); onStdout(chunk); };
    const stderrCb = (chunk) => { chunks.push('[stderr] ' + chunk); onStderr?.(chunk); };

    // The streaming overload blocks until the process exits.
    await this.sb.process.getSessionCommandLogs(sessionId, commandId, stdoutCb, stderrCb);

    const fullText = chunks.join('');
    log(step, `Stream completed in ${elapsed(Date.now() - t0)}: ${chunks.length} chunks, ${fullText.length} chars`);

    // Get the final exit code.
    const cmdState = await this.sb.process.getSessionCommand(sessionId, commandId);
    const exitCode = cmdState.exitCode ?? null;

    await this.sb.process.deleteSession(sessionId).catch(() => {});

    return {
      exitCode,
      output: fullText,
      chunks: chunks.length,
      sessionId,
      commandId,
      ms: Date.now() - t0,
    };
  }

  /**
   * Destroy the sandbox. Safe to call even if create() failed or was never
   * called — no-ops in that case.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async destroy() {
    if (!this.daytona || !this.sb) {
      return { ok: true };
    }
    try {
      log('cleanup', `Destroying sandbox ${this.sb.id}...`);
      await this.daytona.delete(this.sb);
      log('cleanup', 'Sandbox destroyed');
      this.sb = null;
      return { ok: true };
    } catch (err) {
      log('cleanup', `Cleanup failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}

// ─── SpikeRunner ───────────────────────────────────────────────────────────

/**
 * Orchestrates a spike: runs a sequence of steps, collects structured results,
 * and guarantees sandbox cleanup.
 *
 * Usage:
 *   const runner = new SpikeRunner('my-spike');
 *   await runner.run(async (sb) => {
 *     await sb.create();
 *     await sb.installOpencode();
 *     const result = await sb.runOpencode('Print exactly: SPIKE_OK', { step: 'verify' });
 *     runner.record('verify', result.exitCode === 0 && result.output.includes('SPIKE_OK'), result.ms);
 *   });
 */
class SpikeRunner {
  /**
   * @param {string} name - spike name (used in output)
   */
  constructor(name) {
    this.name = name;
    this.steps = [];
    this.errors = [];
    this.t0 = Date.now();
  }

  /**
   * Record a step result.
   * @param {string} step - step identifier
   * @param {boolean} ok - whether the step passed
   * @param {number} ms - duration in milliseconds
   * @param {object} [extra] - additional fields to include
   */
  record(step, ok, ms, extra = {}) {
    this.steps.push({ step, ok, ms, ...extra });
  }

  /**
   * Record an error for a step.
   * @param {string} step
   * @param {Error|string} err
   */
  recordError(step, err) {
    this.errors.push({ step, error: err.message || String(err) });
  }

  /**
   * Run a spike body with a fresh OpencodeSandbox, guaranteeing cleanup.
   * The body receives the sandbox and the runner for recording results.
   * @param {function(OpencodeSandbox, SpikeRunner): Promise<void>} body
   * @returns {Promise<object>} structured results
   */
  async run(body) {
    const sb = new OpencodeSandbox({ runId: this.name + '-' + Date.now() });
    try {
      await body(sb, this);
    } catch (err) {
      this.errors.push({ step: 'fatal', error: err.message });
    } finally {
      this.cleanup = await sb.destroy();
    }

    const results = {
      name: this.name,
      steps: this.steps,
      errors: this.errors,
      cleanup: this.cleanup,
      totalMs: Date.now() - this.t0,
    };
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    return results;
  }
}

// ─── Convenience: run opencode in a fresh sandbox (one-shot) ───────────────

/**
 * Create a sandbox, install opencode, run a single prompt, destroy the sandbox.
 * Returns the run result. For multi-step spikes, use SpikeRunner instead.
 *
 * @param {string} prompt - the prompt to pass to `opencode run`
 * @param {object} [opts] - passed to OpencodeSandbox constructor + runOpencode opts
 * @returns {Promise<{exitCode: number, output: string, ms: number}>}
 */
async function runOpencode(prompt, opts = {}) {
  const sb = new OpencodeSandbox(opts);
  try {
    await sb.create();
    await sb.installOpencode();
    return await sb.runOpencode(prompt, opts);
  } finally {
    await sb.destroy();
  }
}

// ─── Script entry point: original spike verification ───────────────────────

async function main() {
  const runner = new SpikeRunner('opencode-sandbox');

  await runner.run(async (sb, r) => {
    let step = '1-create';
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

    step = '2-install';
    try {
      const result = await sb.installOpencode(step);
      r.record(step, result.exitCode === 0, result.ms, { version: result.version });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    step = '3-async-run';
    try {
      const result = await sb.runOpencode('Print exactly: SPIKE_OK', { step, timeoutMs: 120_000 });
      const hasSpikeOk = result.output.includes('SPIKE_OK');
      log(step, `Output contains "SPIKE_OK": ${hasSpikeOk}`);
      log(step, `Full output:\n${result.output}`);
      r.record(step, result.exitCode === 0 && hasSpikeOk, result.ms, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        sessionId: result.sessionId,
        commandId: result.commandId,
      });
    } catch (err) {
      r.recordError(step, err);
    }

    step = '4-stream-logs';
    try {
      log(step, 'Testing streaming getSessionCommandLogs with callbacks...');
      const chunks = [];
      const result = await sb.runOpencodeStreamed(
        'Print exactly: SPIKE_OK',
        (chunk) => {},
        (chunk) => {},
        { step },
      );
      const hasSpikeOk = result.output.includes('SPIKE_OK');
      log(step, `Streamed output contains "SPIKE_OK": ${hasSpikeOk}`);
      r.record(step, hasSpikeOk, result.ms, {
        chunks: result.chunks,
        outputChars: result.output.length,
      });
    } catch (err) {
      r.recordError(step, err);
    }
  });

  if (runner.errors.length > 0) {
    process.exitCode = 1;
  }
}

// Run as script, export as module.
if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { OpencodeSandbox, SpikeRunner, runOpencode, elapsed, log, sleep };
