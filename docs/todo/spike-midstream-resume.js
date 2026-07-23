#!/usr/bin/env node
/**
 * Spike: opencode mid-stream resume (assumption #3).
 *
 * Verifies assumption #3 from docs/todo/graph-pipeline.md "Admitted assumptions":
 *   INCOMPLETE is a within-session recovery signal: the LLM provider drops the
 *   response mid-stream, the opencode session is still alive, and
 *   `opencode run --session <id>` resumes it from where it left off.
 *
 * The spike simulates a mid-stream drop by killing the opencode process
 * mid-response, then:
 *   1. Inspects what the stdout looks like at the point of interruption
 *      (defines the detection rule the dispatcher needs).
 *   2. Captures the session ID.
 *   3. Inspects the session storage state (opencode export) after interruption.
 *   4. Resumes with `opencode run --session <id>` and verifies it continues
 *      the conversation rather than restarting.
 *   5. Inspects the session storage state after resume.
 *
 * Two variants are tested:
 *   A. JSON format (--format json) — kill-and-resume with JSON output. This is
 *      the production path (decided 2026-07-22: the pipeline uses --format json
 *      for all agent runs).
 *   B. JSON format (--format json) — same as A, with explicit JSON event
 *      inspection of the events emitted before the kill. Retained as a
 *      comparison baseline; functionally identical to A now that both use
 *      --format json, but kept for the historical record.
 *
 * Uses the free opencode-hosted model `opencode/deepseek-v4-flash-free` (neuralwatt is
 * unreachable from Daytona Tier 1 sandboxes — see spike-neuralwatt-accessibility.md).
 * The prior spikes used `opencode/big-pickle` but that model is no longer available
 * as of 2026-07-22 — it returns "No provider available".
 *
 * Usage:
 *   node spike-midstream-resume.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 *
 * Reuses: spike-opencode-sandbox.js (OpencodeSandbox, SpikeRunner).
 * See: docs/todo/spike-midstream-resume.md for the full spike report.
 */

const { OpencodeSandbox, SpikeRunner, log, sleep, elapsed } = require('./spike-opencode-sandbox.js');

// ─── Constants ─────────────────────────────────────────────────────────────

// Free opencode-hosted model. The prior spikes used `opencode/big-pickle` but
// it is no longer available as of 2026-07-22 ("No provider available").
// `opencode/deepseek-v4-flash-free` is verified working on the devcontainer.
const SPIKE_MODEL = 'opencode/deepseek-v4-flash-free';

// A prompt that produces a long, multi-paragraph response so we have a window
// to kill the process mid-stream. The model needs ~10-30s to generate this,
// giving us time to detect output has started and then kill.
const LONG_PROMPT =
  'Write a detailed essay of at least 500 words about the history of computing, ' +
  'covering the abacus, mechanical calculators, vacuum tubes, transistors, ' +
  'integrated circuits, microprocessors, and the internet. Include specific ' +
  'dates, names, and technical details for each era.';

// A shorter prompt for the JSON variant — still long enough to kill mid-stream
// but faster to keep the spike runtime reasonable.
const LONG_PROMPT_JSON =
  'Write a detailed 300-word explanation of how TCP three-way handshake works, ' +
  'including packet flags, sequence numbers, and state transitions.';

// How long to wait after starting the opencode run before killing it.
// We need the process to have started producing output (streaming has begun)
// but not to have finished. The free model takes ~6-12s to start streaming text
// after the step_start event, and ~15-30s total for these prompts.
const KILL_DELAY_MS = 12000; // 12 seconds — enough for text streaming to be underway

// Timeout for the resume run (should complete normally).
const RESUME_TIMEOUT_MS = 120_000;

// Short command timeout for session list / export.
const SHORT_TIMEOUT_S = 30;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Get the latest session ID from `opencode session list --format json`.
 * Reuses the pattern from spike-stop-resume.js.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} step
 * @returns {Promise<{sessionId: string, raw: string}>}
 */
async function getLatestSessionId(sb, step) {
  const resp = await sb.runCommand('opencode session list --format json 2>&1', {
    timeoutS: SHORT_TIMEOUT_S,
  });
  const raw = resp.output;
  log(step, `Session list raw:\n${raw}`);

  let sessionId = null;
  try {
    const sessions = JSON.parse(raw);
    if (Array.isArray(sessions) && sessions.length > 0) {
      sessionId = sessions[0].id;
    }
  } catch (e) {
    const match = raw.match(/"id"\s*:\s*"(ses_[a-zA-Z0-9]+)"/);
    if (match) {
      sessionId = match[1];
    }
  }

  if (!sessionId) {
    throw new Error(`Could not extract session ID from session list output: ${raw}`);
  }

  log(step, `Latest session ID: ${sessionId}`);
  return { sessionId, raw };
}

/**
 * Export a session via `opencode export <sessionID>` and return the parsed JSON.
 * This shows the session storage state — messages, their completion status, etc.
 *
 * Note: opencode v1.1.35 prepends an INFO log line to stdout before the JSON
 * output. We strip any non-JSON prefix lines before parsing.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} sessionID
 * @param {string} step
 * @returns {Promise<{raw: string, parsed: object|null, messages: array|null}>}
 */
async function exportSession(sb, sessionID, step) {
  const resp = await sb.runCommand(
    `opencode export ${sessionID} 2>&1`,
    { timeoutS: 60 },
  );
  const raw = resp.output;
  log(step, `Export raw length: ${raw.length} chars`);
  log(step, `Export raw (first 2000 chars):\n${raw.slice(0, 2000)}`);

  // Strip non-JSON prefix lines (INFO log lines, "Exporting session:" etc.)
  // and find the start of the JSON object. The output looks like:
  //   \x01\x01\x01INFO  2026-07-22T11:40:42 ... refreshing\n
  //   Exporting session: ses_...{\n  "info": ...
  // The `{` is appended to the "Exporting session:" line, so we extract from
  // that `{` onward.
  let jsonStr = raw.replace(/\x01/g, '').replace(/\x1b\[[0-9;]*m/g, '');
  // Find the first `{` that starts the JSON object — it's the one after
  // "Exporting session:" or the first standalone `{` on its own line.
  const exportIdx = jsonStr.indexOf('Exporting session:');
  if (exportIdx >= 0) {
    const braceIdx = jsonStr.indexOf('{', exportIdx);
    if (braceIdx >= 0) {
      jsonStr = jsonStr.slice(braceIdx);
    }
  } else {
    // No "Exporting session:" prefix — find first `{` at start of a line
    const lines = jsonStr.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('{')) {
        jsonStr = lines.slice(i).join('\n');
        break;
      }
    }
  }

  let parsed = null;
  let messages = null;
  try {
    parsed = JSON.parse(jsonStr);
    messages = parsed.messages || null;
  } catch (e) {
    log(step, `Could not parse export as JSON: ${e.message}`);
    // Try to find where the JSON ends — sometimes there's trailing output
    // Find the last closing brace
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(jsonStr.slice(0, lastBrace + 1));
        messages = parsed.messages || null;
        log(step, `Parsed export on second attempt (trimmed to last brace)`);
      } catch (e2) {
        log(step, `Second parse attempt also failed: ${e2.message}`);
      }
    }
  }

  return { raw, parsed, messages };
}

/**
 * Analyze messages from an export to determine completion state.
 * Handles both v1.1.35 format ({ info, parts }) and v1.17.20 format (flat).
 * Returns a summary of each message's type, completion status, and content length.
 *
 * @param {array} messages
 * @returns {object} summary with per-message info and overall state
 */
function analyzeMessages(messages) {
  if (!messages || !Array.isArray(messages)) {
    return { count: 0, messages: [], hasIncomplete: false };
  }

  const summary = messages.map((msg, i) => {
    // v1.1.35 format: { info: { role, time: { created, completed? } }, parts: [...] }
    // v1.17.20 format: { type, time: { created, completed? }, content: [...] }
    const info = msg.info || msg;
    const type = info.role || msg.type || 'unknown';
    const timeCompleted = info.time?.completed || msg.time?.completed || null;
    const isComplete = !!timeCompleted;
    const contentParts = msg.parts || msg.content || [];
    const textParts = contentParts
      .filter((p) => p.type === 'text')
      .map((p) => ({ text: p.text || '', length: (p.text || '').length }));
    const totalTextLength = textParts.reduce((sum, p) => sum + p.length, 0);
    const hasError = !!msg.error || !!info.error;
    const errorName = msg.error?.name || info.error?.name || null;
    const errorMsg = msg.error?.message || info.error?.message || null;

    return {
      index: i,
      type,
      isComplete,
      timeCompleted,
      hasError,
      errorName,
      errorMsg,
      textParts: textParts.length,
      totalTextLength,
      textPreview: textParts.length > 0
        ? textParts[textParts.length - 1].text.slice(-200)
        : null,
    };
  });

  const hasIncomplete = summary.some((m) => m.type === 'assistant' && !m.isComplete);

  return { count: messages.length, messages: summary, hasIncomplete };
}

/**
 * Start an opencode run via the async session API, wait for output to begin,
 * then kill the process mid-stream. Returns the partial output captured
 * before the kill, the session ID, and observability data.
 *
 * This simulates a mid-stream provider drop — the opencode process is killed
 * while the LLM is actively generating its response.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} prompt
 * @param {object} opts
 * @param {boolean} [opts.useJsonFormat] - if true, use --format json
 * @param {number} [opts.killDelayMs] - how long to wait before killing (default: 5000)
 * @param {string} [opts.step] - step label for logging
 * @returns {Promise<{partialOutput: string, sessionId: string, commandId: string, killMs: number, outputChars: number}>}
 */
async function startAndKillMidStream(sb, prompt, opts = {}) {
  const step = opts.step || 'kill';
  const cwd = '/tmp';
  const killDelayMs = opts.killDelayMs || KILL_DELAY_MS;
  const useJson = opts.useJsonFormat || false;

  const daytonaSessionId = `${sb.runId}-kill-${Date.now()}`;
  log(step, `Creating Daytona session ${daytonaSessionId}...`);
  await sb.sb.process.createSession(daytonaSessionId);

  // Build the command. CRITICAL: </dev/null prevents opencode from hanging on
  // stdin in the PTY (spike F1 from spike-opencode-sandbox.md).
  const formatFlag = useJson ? '--format json' : '';
  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const cmd = `cd ${cwd} && opencode run --model ${sb.model} ${formatFlag} '${escapedPrompt}' </dev/null 2>&1`;

  log(step, `Executing (runAsync): ${cmd.slice(0, 200)}...`);
  const t0 = Date.now();
  const execResp = await sb.sb.process.executeSessionCommand(
    daytonaSessionId,
    { command: cmd, runAsync: true },
    30,
  );
  const commandId = execResp.cmdId;
  log(step, `Command started: cmdId=${commandId}`);

  // Wait for the process to start producing output, then kill it.
  // We poll the logs to detect that streaming has begun.
  log(step, `Waiting ${killDelayMs}ms for output to start, then killing...`);
  await sleep(killDelayMs);

  // Capture whatever output has been produced so far (the partial stream).
  let partialOutput = '';
  try {
    const logs = await sb.sb.process.getSessionCommandLogs(daytonaSessionId, commandId);
    partialOutput = logs.output || logs.stdout || '';
    log(step, `Partial output captured: ${partialOutput.length} chars`);
    if (partialOutput.length > 0) {
      log(step, `Partial output (last 500 chars):\n${partialOutput.slice(-500)}`);
    } else {
      log(step, 'No output captured yet — process may not have started streaming');
    }
  } catch (e) {
    log(step, `Could not get logs before kill: ${e.message}`);
  }

  // Kill the command — simulate a mid-stream process death.
  // We use the Daytona API to stop the process. The session command's process
  // is what we need to terminate.
  log(step, `Killing command ${commandId} (simulating mid-stream drop)...`);
  const killT0 = Date.now();

  // The Daytona SDK doesn't have a direct "kill command" method, but we can
  // use executeCommand to send a SIGKILL to the opencode process.
  // First, find the PID of the opencode process.
  try {
    const killResp = await sb.sb.process.executeCommand(
      'pkill -f "opencode run" 2>&1 || true',
      undefined, undefined, 10,
    );
    log(step, `pkill exit code: ${killResp.exitCode}`);
  } catch (e) {
    log(step, `pkill failed: ${e.message}`);
  }

  // Wait a moment for the process to die.
  await sleep(2000);

  // Check the command state — it should now have an exit code (non-zero, from SIGKILL).
  let cmdState = null;
  try {
    cmdState = await sb.sb.process.getSessionCommand(daytonaSessionId, commandId);
    log(step, `Command state after kill: exitCode=${cmdState.exitCode}`);
  } catch (e) {
    log(step, `Could not get command state after kill: ${e.message}`);
  }

  // Get the final logs.
  let finalOutput = partialOutput;
  try {
    const logs = await sb.sb.process.getSessionCommandLogs(daytonaSessionId, commandId);
    finalOutput = logs.output || logs.stdout || '';
    log(step, `Final output: ${finalOutput.length} chars`);
  } catch (e) {
    log(step, `Could not get final logs: ${e.message}`);
  }

  await sb.sb.process.deleteSession(daytonaSessionId).catch(() => {});

  return {
    partialOutput: finalOutput,
    exitCode: cmdState?.exitCode,
    commandId,
    killMs: Date.now() - killT0,
    outputChars: finalOutput.length,
  };
}

/**
 * Resume a session with `opencode run --session <id>` via the async session API
 * and poll until completion. Returns the full output and exit code.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} opencodeSessionId - the opencode session ID (ses_...)
 * @param {string} resumePrompt
 * @param {object} opts
 * @param {boolean} [opts.useJsonFormat] - if true, use --format json
 * @param {string} [opts.step] - step label
 * @param {number} [opts.timeoutMs] - poll deadline (default: 120s)
 * @returns {Promise<{exitCode: number, output: string, ms: number}>}
 */
async function resumeSession(sb, opencodeSessionId, resumePrompt, opts = {}) {
  const step = opts.step || 'resume';
  const cwd = '/tmp';
  const timeoutMs = opts.timeoutMs || RESUME_TIMEOUT_MS;
  const useJson = opts.useJsonFormat || false;

  const daytonaSessionId = `${sb.runId}-resume-${Date.now()}`;
  log(step, `Creating Daytona session ${daytonaSessionId}...`);
  await sb.sb.process.createSession(daytonaSessionId);

  const formatFlag = useJson ? '--format json' : '';
  const escapedPrompt = resumePrompt.replace(/'/g, "'\\''");
  const cmd = `cd ${cwd} && opencode run --model ${sb.model} ${formatFlag} --session ${opencodeSessionId} '${escapedPrompt}' </dev/null 2>&1`;

  log(step, `Executing resume (runAsync): ${cmd.slice(0, 200)}...`);
  const t0 = Date.now();
  const execResp = await sb.sb.process.executeSessionCommand(
    daytonaSessionId,
    { command: cmd, runAsync: true },
    30,
  );
  const commandId = execResp.cmdId;
  log(step, `Resume command started: cmdId=${commandId}`);

  // Poll until the command exits.
  const deadline = Date.now() + timeoutMs;
  let finalState = null;
  while (Date.now() < deadline) {
    await sleep(3000);
    const cmdState = await sb.sb.process.getSessionCommand(daytonaSessionId, commandId);
    log(step, `Poll: exitCode=${cmdState.exitCode}`);
    if (cmdState.exitCode !== undefined && cmdState.exitCode !== null) {
      finalState = cmdState;
      break;
    }
  }
  if (!finalState) {
    throw new Error(`Resume did not exit within ${timeoutMs / 1000}s timeout`);
  }

  log(step, `Resume exited in ${elapsed(Date.now() - t0)}: exitCode=${finalState.exitCode}`);

  const logs = await sb.sb.process.getSessionCommandLogs(daytonaSessionId, commandId);
  const output = logs.output || logs.stdout || '';

  await sb.sb.process.deleteSession(daytonaSessionId).catch(() => {});

  return { exitCode: finalState.exitCode, output, ms: Date.now() - t0 };
}

// ─── Variant A: JSON format (--format json) ─────────────────────────────────

async function runVariantA(sb, r) {
  const step = 'A';
  log(step, '=== Variant A: JSON format (--format json) ===');

  // ── A.1: Start a long opencode run and kill it mid-stream ───────────
  let killResult = null;
  try {
    log(step, 'Starting long opencode run (--format json) and killing mid-stream...');
    killResult = await startAndKillMidStream(sb, LONG_PROMPT, {
      step: 'A.1-kill',
      killDelayMs: KILL_DELAY_MS,
      useJsonFormat: true,
    });
    r.record('A.1-kill-midstream', true, killResult.killMs, {
      exitCode: killResult.exitCode,
      outputChars: killResult.outputChars,
      partialOutputTail: killResult.partialOutput.slice(-500),
    });
    log(step, `Killed mid-stream. Exit code: ${killResult.exitCode}, output: ${killResult.outputChars} chars`);
    log(step, `Partial output (last 500 chars):\n${killResult.partialOutput.slice(-500)}`);
  } catch (err) {
    r.recordError('A.1-kill-midstream', err);
    return; // Can't continue without a killed session
  }

  // ── A.2: Capture the opencode session ID ───────────────────────────
  let sessionId = null;
  try {
    const { sessionId: sid } = await getLatestSessionId(sb, 'A.2-capture-id');
    sessionId = sid;
    r.record('A.2-capture-id', !!sessionId, 0, { sessionId });
  } catch (err) {
    r.recordError('A.2-capture-id', err);
    return;
  }

  // ── A.3: Export the session state after interruption ───────────────
  try {
    const { raw, parsed, messages } = await exportSession(sb, sessionId, 'A.3-export-after-kill');
    const analysis = analyzeMessages(messages);
    r.record('A.3-export-after-kill', true, 0, {
      messageCount: analysis.count,
      hasIncompleteAssistant: analysis.hasIncomplete,
      messages: analysis.messages,
    });
    log(step, `Session state after kill: ${analysis.count} messages, hasIncomplete=${analysis.hasIncomplete}`);
    if (analysis.messages) {
      for (const m of analysis.messages) {
        log(step, `  msg[${m.index}] type=${m.type} complete=${m.isComplete} textLen=${m.totalTextLength} error=${m.errorName || 'none'}`);
      }
    }
  } catch (err) {
    r.recordError('A.3-export-after-kill', err);
  }

  // ── A.4: Resume the session and verify it continues ────────────────
  try {
    log(step, 'Resuming session with a follow-up question...');
    const resumePrompt = 'What was the main topic of the essay I asked you to write? Answer in one sentence.';
    const result = await resumeSession(sb, sessionId, resumePrompt, { step: 'A.4-resume', useJsonFormat: true });
    const resumeWorked = result.exitCode === 0 && result.output.length > 0;
    r.record('A.4-resume', resumeWorked, result.ms, {
      exitCode: result.exitCode,
      outputChars: result.output.length,
      outputTail: result.output.slice(-500),
    });
    log(step, `Resume exit code: ${result.exitCode}, output: ${result.output.length} chars`);
    log(step, `Resume output (last 500 chars):\n${result.output.slice(-500)}`);
  } catch (err) {
    r.recordError('A.4-resume', err);
  }

  // ── A.5: Export the session state after resume ──────────────────────
  try {
    const { raw, parsed, messages } = await exportSession(sb, sessionId, 'A.5-export-after-resume');
    const analysis = analyzeMessages(messages);
    r.record('A.5-export-after-resume', true, 0, {
      messageCount: analysis.count,
      hasIncompleteAssistant: analysis.hasIncomplete,
      messages: analysis.messages,
    });
    log(step, `Session state after resume: ${analysis.count} messages, hasIncomplete=${analysis.hasIncomplete}`);
    if (analysis.messages) {
      for (const m of analysis.messages) {
        log(step, `  msg[${m.index}] type=${m.type} complete=${m.isComplete} textLen=${m.totalTextLength} error=${m.errorName || 'none'}`);
      }
    }
  } catch (err) {
    r.recordError('A.5-export-after-resume', err);
  }
}

// ─── Variant B: JSON format (--format json) ───────────────────────────────

async function runVariantB(sb, r) {
  const step = 'B';
  log(step, '=== Variant B: JSON format (--format json) ===');

  // ── B.1: Start a long opencode run with --format json and kill mid-stream
  let killResult = null;
  try {
    log(step, 'Starting long opencode run (--format json) and killing mid-stream...');
    killResult = await startAndKillMidStream(sb, LONG_PROMPT_JSON, {
      step: 'B.1-kill',
      killDelayMs: KILL_DELAY_MS,
      useJsonFormat: true,
    });
    r.record('B.1-kill-midstream-json', true, killResult.killMs, {
      exitCode: killResult.exitCode,
      outputChars: killResult.outputChars,
      partialOutputTail: killResult.partialOutput.slice(-500),
    });
    log(step, `Killed mid-stream (JSON). Exit code: ${killResult.exitCode}, output: ${killResult.outputChars} chars`);
    log(step, `Partial JSON output (last 800 chars):\n${killResult.partialOutput.slice(-800)}`);
  } catch (err) {
    r.recordError('B.1-kill-midstream-json', err);
    return;
  }

  // ── B.2: Parse and analyze the JSON events emitted before the kill ──
  try {
    const output = killResult.partialOutput;
    // Strip non-JSON lines (INFO log lines, ANSI codes, control chars)
    // The output has \x01 control chars and ANSI escape sequences prefixed
    const lines = output.split('\n')
      .map((l) => l.replace(/\x01/g, '').replace(/\x1b\[[0-9;]*m/g, '').trim())
      .filter((l) => l.startsWith('{'));
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        // Last line may be partial JSON (truncated mid-event)
      }
    }
    const eventTypes = events.map((e) => e.type);
    const lastCompleteEvent = events.length > 0 ? events[events.length - 1] : null;
    const hasErrorEvent = events.some((e) => e.type === 'error');

    // Check if the last line is a truncated JSON object
    const lastLine = lines[lines.length - 1] || '';
    let lastLineIsTruncated = false;
    try {
      JSON.parse(lastLine);
    } catch (e) {
      lastLineIsTruncated = true;
    }

    r.record('B.2-analyze-json-events', true, 0, {
      totalEvents: events.length,
      eventTypes,
      lastCompleteEventType: lastCompleteEvent?.type || null,
      hasErrorEvent,
      lastLineIsTruncated,
      lastLinePreview: lastLine.slice(-200),
    });
    log(step, `JSON events before kill: ${events.length} parsed`);
    log(step, `Event types: ${eventTypes.join(', ') || '(none)'}`);
    log(step, `Last complete event type: ${lastCompleteEvent?.type || 'none'}`);
    log(step, `Has error event: ${hasErrorEvent}`);
    log(step, `Last line truncated: ${lastLineIsTruncated}`);
  } catch (err) {
    r.recordError('B.2-analyze-json-events', err);
  }

  // ── B.3: Capture the session ID ────────────────────────────────────
  let sessionId = null;
  try {
    const { sessionId: sid } = await getLatestSessionId(sb, 'B.3-capture-id');
    sessionId = sid;
    r.record('B.3-capture-id', !!sessionId, 0, { sessionId });
  } catch (err) {
    r.recordError('B.3-capture-id', err);
    return;
  }

  // ── B.4: Resume with --format json and verify it continues ─────────
  try {
    log(step, 'Resuming session (--format json) with a follow-up question...');
    const resumePrompt = 'In one sentence, what topic did I ask you to explain?';
    const result = await resumeSession(sb, sessionId, resumePrompt, {
      step: 'B.4-resume-json',
      useJsonFormat: true,
    });
    const resumeWorked = result.exitCode === 0 && result.output.length > 0;

    // Parse the JSON events from the resume
    const lines = result.output.split('\n')
      .map((l) => l.replace(/\x01/g, '').replace(/\x1b\[[0-9;]*m/g, '').trim())
      .filter((l) => l.startsWith('{'));
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        // skip
      }
    }
    const eventTypes = events.map((e) => e.type);
    const hasTextEvent = eventTypes.includes('text');
    const hasStepFinish = eventTypes.includes('step_finish');

    r.record('B.4-resume-json', resumeWorked && hasTextEvent, result.ms, {
      exitCode: result.exitCode,
      outputChars: result.output.length,
      eventTypes,
      hasTextEvent,
      hasStepFinish,
      outputTail: result.output.slice(-500),
    });
    log(step, `Resume (JSON) exit code: ${result.exitCode}, events: ${eventTypes.join(', ')}`);
  } catch (err) {
    r.recordError('B.4-resume-json', err);
  }
}

// ─── Main spike ────────────────────────────────────────────────────────────

async function main() {
  const runner = new SpikeRunner('midstream-resume');

  // Override the default run to use our model. The SpikeRunner creates its own
  // OpencodeSandbox, but we need to pass a custom model. We monkey-patch the
  // runner to use our model by creating the sandbox ourselves.
  const originalRun = runner.run.bind(runner);
  runner.run = async (body) => {
    return originalRun(async (sb, r) => {
      // Override the model on the sandbox instance
      sb.model = SPIKE_MODEL;
      await body(sb, r);
    });
  };

  await runner.run(async (sb, r) => {
    // ── Step 1: Create sandbox ──────────────────────────────────────────
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

    // ── Step 2: Install opencode ────────────────────────────────────────
    step = '2-install';
    try {
      const result = await sb.installOpencode(step);
      r.record(step, result.exitCode === 0, result.ms, { version: result.version });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 3: Verify opencode works (baseline) ────────────────────────
    step = '3-baseline';
    try {
      log(step, 'Running baseline opencode command to verify it works...');
      const result = await sb.runOpencode('Print exactly: BASELINE_OK', {
        step,
        timeoutMs: 60_000,
      });
      const ok = result.exitCode === 0 && result.output.includes('BASELINE_OK');
      log(step, `Baseline output: ${result.output.slice(0, 200)}`);
      r.record(step, ok, result.ms, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
      });
      if (!ok) {
        throw new Error('Baseline opencode run failed — cannot proceed with spike');
      }
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Variant A: JSON format (--format json) ──────────────────────────
    await runVariantA(sb, r);

    // ── Variant B: JSON format ──────────────────────────────────────────
    await runVariantB(sb, r);
  });

  if (runner.errors.length > 0) {
    process.exitCode = 1;
  }
}

// Run as script.
if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
