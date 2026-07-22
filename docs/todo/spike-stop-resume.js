#!/usr/bin/env node
/**
 * Spike: verify sandbox stop/start disk persistence + opencode session resume.
 *
 * Verifies assumption #2 from docs/todo/graph-pipeline.md "Admitted assumptions":
 *   stop sandbox → disk survives → start sandbox → `opencode run --session <id>`
 *   resumes the session with prior context intact.
 *
 * The park/resume chain in the pipeline plan depends on this. If disk does not
 * survive stop/start, or sessions are not resumable after a restart, park/resume
 * needs a different design (e.g. never stop the sandbox, or serialize session
 * state to git).
 *
 * Test sequence:
 *   1. Create a container sandbox, install opencode.
 *   2. Run `opencode run` with a prompt that establishes a memorable secret word.
 *   3. Capture the auto-generated session ID via `opencode session list --format json`.
 *   4. Verify the opencode storage path exists on disk (DB or storage dir, version-dependent).
 *   5. Stop the sandbox (sandbox.stop()).
 *   6. Verify state is "stopped".
 *   7. Wait (simulates a parked question waiting for a human answer).
 *   8. Start the sandbox (sandbox.start()).
 *   9. Verify state is "started".
 *  10. Verify the storage path still exists after the stop/start cycle.
 *  11. Run `opencode run --session <id>` with a prompt asking it to recall the secret.
 *  12. PASS if the resumed session recalls the secret word — proves both disk
 *      persistence AND session resume with context.
 *
 * Uses the free opencode-hosted model `opencode/big-pickle` (neuralwatt is
 * unreachable from Daytona Tier 1 sandboxes — see spike-neuralwatt-accessibility.md).
 *
 * Usage:
 *   node spike-stop-resume.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 *
 * Reuses: spike-opencode-sandbox.js (OpencodeSandbox, SpikeRunner).
 * See: docs/todo/spike-stop-resume.md for the full spike report.
 */

const { OpencodeSandbox, SpikeRunner, log, sleep, elapsed } = require('./spike-opencode-sandbox.js');

// ─── Constants ─────────────────────────────────────────────────────────────

const SECRET_WORD = 'BANANA_42';
const START_PROMPT = `Remember this secret word for later: ${SECRET_WORD}. Now print exactly: SESSION_STARTED`;
const RESUME_PROMPT = `What was the secret word I asked you to remember at the start of this session? Print only the word, nothing else.`;

const STOP_START_TIMEOUT_S = 120; // stop/start can take a while
const STORAGE_CHECK_TIMEOUT_S = 15;
const RESUME_OPENCODE_TIMEOUT_MS = 120_000;
// Wait between stop and start — simulates a parked question waiting for a human
// answer. The docs guarantee filesystem persistence until deletion (auto-archive
// defaults to 7 days, auto-delete is disabled by default), so the wait duration
// does not change the disk-persistence guarantee. We use a short wait to keep the
// spike fast while still testing the "gap" scenario.
const PARK_WAIT_MS = 60_000; // 60 seconds

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Get the sandbox state, refreshing from the API first.
 * @param {OpencodeSandbox} sb
 * @returns {Promise<string>}
 */
async function getSandboxState(sb) {
  await sb.sb.refreshData();
  return sb.sb.state || 'unknown';
}

/**
 * Check whether the opencode storage path exists on the sandbox disk and capture
 * its layout. opencode v1.17.20 uses a SQLite DB at
 * ~/.local/share/opencode/opencode.db; the older v1.1.35 the plan references
 * reportedly used JSON files in ~/.local/share/opencode/storage/. We check for
 * both so the spike works regardless of which version installs in the sandbox.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} step
 * @returns {Promise<{dbExists: boolean, storageDirExists: boolean, listing: string, dbPath: string, storagePath: string}>}
 */
async function checkOpencodeStorage(sb, step) {
  // Check for the SQLite DB (v1.17.20+) and the storage dir (v1.1.35).
  // Use a single command to check both and list the opencode data dir.
  const cmd = `echo "=== opencode data dir ===" && ls -la ~/.local/share/opencode/ 2>&1 && echo "=== DB check ===" && test -f ~/.local/share/opencode/opencode.db && echo "DB_EXISTS" || echo "DB_ABSENT" && echo "=== storage dir check ===" && test -d ~/.local/share/opencode/storage && echo "STORAGE_DIR_EXISTS" || echo "STORAGE_DIR_ABSENT" && echo "=== opencode version ===" && opencode --version 2>&1`;
  const resp = await sb.runCommand(cmd, { timeoutS: STORAGE_CHECK_TIMEOUT_S });
  const listing = resp.output;

  const dbExists = listing.includes('DB_EXISTS');
  const storageDirExists = listing.includes('STORAGE_DIR_EXISTS');

  log(step, `Storage check: dbExists=${dbExists}, storageDirExists=${storageDirExists}`);
  log(step, `opencode data dir listing:\n${listing}`);

  return {
    dbExists,
    storageDirExists,
    listing,
    dbPath: '~/.local/share/opencode/opencode.db',
    storagePath: '~/.local/share/opencode/storage/',
  };
}

/**
 * Capture the most recent session ID from `opencode session list --format json`.
 * opencode auto-generates session IDs (format: ses_<hex>) — they are NOT
 * user-specifiable. The pipeline must capture the ID after the first run and
 * persist it for later resume.
 *
 * @param {OpencodeSandbox} sb
 * @param {string} step
 * @returns {Promise<{sessionId: string, raw: string}>}
 */
async function getLatestSessionId(sb, step) {
  const resp = await sb.runCommand('opencode session list --format json 2>&1', {
    timeoutS: STORAGE_CHECK_TIMEOUT_S,
  });
  const raw = resp.output;
  log(step, `Session list raw:\n${raw}`);

  let sessionId = null;
  try {
    const sessions = JSON.parse(raw);
    if (Array.isArray(sessions) && sessions.length > 0) {
      // Sessions are returned newest-first.
      sessionId = sessions[0].id;
    }
  } catch (e) {
    // JSON parse failed — try to extract with a regex as a fallback.
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

// ─── Main spike ────────────────────────────────────────────────────────────

async function main() {
  const runner = new SpikeRunner('stop-resume');

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

    // ── Step 3: Run initial opencode session (establishes a secret word) ─
    step = '3-initial-run';
    let sessionId = null;
    try {
      log(step, `Running initial opencode prompt to establish secret word "${SECRET_WORD}"...`);
      const result = await sb.runOpencode(START_PROMPT, { step, timeoutMs: RESUME_OPENCODE_TIMEOUT_MS });
      const hasStarted = result.output.includes('SESSION_STARTED');
      log(step, `Output contains "SESSION_STARTED": ${hasStarted}`);
      log(step, `Full output:\n${result.output}`);
      r.record(step, result.exitCode === 0 && hasStarted, result.ms, {
        exitCode: result.exitCode,
        outputChars: result.output.length,
        // The session ID used internally by runOpencode is its own tracking ID,
        // NOT the opencode session ID. We need to capture the real one next.
      });

      if (!hasStarted) {
        throw new Error('Initial run did not produce SESSION_STARTED output');
      }
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 4: Capture the opencode session ID ─────────────────────────
    step = '4-capture-session-id';
    try {
      const { sessionId: sid, raw } = await getLatestSessionId(sb, step);
      sessionId = sid;
      r.record(step, !!sessionId, 0, { sessionId });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 5: Verify opencode storage exists on disk (before stop) ────
    step = '5-storage-before-stop';
    let storageBefore;
    try {
      storageBefore = await checkOpencodeStorage(sb, step);
      const storageExists = storageBefore.dbExists || storageBefore.storageDirExists;
      r.record(step, storageExists, 0, storageBefore);
      if (!storageExists) {
        throw new Error('No opencode storage found on disk before stop — cannot test persistence');
      }
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 6: Stop the sandbox ────────────────────────────────────────
    step = '6-stop';
    try {
      log(step, 'Stopping sandbox...');
      const t0 = Date.now();
      await sb.sb.stop(STOP_START_TIMEOUT_S);
      const state = await getSandboxState(sb);
      log(step, `Sandbox state after stop: ${state} (in ${elapsed(Date.now() - t0)})`);
      r.record(step, state === 'stopped', Date.now() - t0, { state });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 7: Wait (simulates parked question waiting for human answer) ─
    step = '7-park-wait';
    try {
      log(step, `Waiting ${PARK_WAIT_MS / 1000}s to simulate a parked question...`);
      const t0 = Date.now();
      await sleep(PARK_WAIT_MS);
      // Verify the sandbox is still stopped during the wait.
      const state = await getSandboxState(sb);
      log(step, `Sandbox state after wait: ${state}`);
      r.record(step, state === 'stopped', Date.now() - t0, { state });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 8: Start the sandbox ───────────────────────────────────────
    step = '8-start';
    try {
      log(step, 'Starting sandbox...');
      const t0 = Date.now();
      await sb.sb.start(STOP_START_TIMEOUT_S);
      const state = await getSandboxState(sb);
      log(step, `Sandbox state after start: ${state} (in ${elapsed(Date.now() - t0)})`);
      r.record(step, state === 'started', Date.now() - t0, { state });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 9: Verify opencode storage still exists (after start) ──────
    step = '9-storage-after-start';
    let storageAfter;
    try {
      storageAfter = await checkOpencodeStorage(sb, step);
      const storageExists = storageAfter.dbExists || storageAfter.storageDirExists;

      // Compare with before: the same storage mechanism should survive.
      const dbPersisted = storageBefore.dbExists === storageAfter.dbExists && storageAfter.dbExists;
      const storageDirPersisted =
        storageBefore.storageDirExists === storageAfter.storageDirExists &&
        storageAfter.storageDirExists;

      log(step, `DB persisted: ${dbPersisted}, storage dir persisted: ${storageDirPersisted}`);
      r.record(step, storageExists, 0, {
        ...storageAfter,
        dbPersisted,
        storageDirPersisted,
      });
    } catch (err) {
      r.recordError(step, err);
      throw err;
    }

    // ── Step 10: Resume the session and verify it recalls the secret ───
    step = '10-resume-session';
    try {
      log(step, `Resuming session ${sessionId} and asking it to recall the secret word...`);

      // Use the async session API with --session to resume. The harness's
      // runOpencode builds its own command, but it doesn't support --session.
      // We build the command manually here, reusing the harness's session API
      // pattern (createSession + executeSessionCommand + poll + getLogs).
      const cwd = '/tmp';
      const resumeSessionId = `${sb.runId}-resume-${Date.now()}`;
      log(step, `Creating Daytona session ${resumeSessionId} for the resume command...`);
      await sb.sb.process.createSession(resumeSessionId);

      // CRITICAL: </dev/null prevents opencode from hanging on stdin (spike F1).
      // --session resumes the existing opencode session; the positional arg is
      // the new prompt appended to the conversation.
      const cmd = `cd ${cwd} && opencode run --model ${sb.model} --session ${sessionId} "${RESUME_PROMPT}" </dev/null 2>&1`;
      log(step, `Executing (runAsync): ${cmd}`);

      const t0 = Date.now();
      const execResp = await sb.sb.process.executeSessionCommand(
        resumeSessionId,
        { command: cmd, runAsync: true },
        30, // SESSION_START_TIMEOUT_S
      );
      const commandId = execResp.cmdId;
      log(step, `Resume command started: cmdId=${commandId}`);

      // Poll until the command exits.
      const deadline = Date.now() + RESUME_OPENCODE_TIMEOUT_MS;
      let finalState = null;
      while (Date.now() < deadline) {
        await sleep(3000);
        const cmdState = await sb.sb.process.getSessionCommand(resumeSessionId, commandId);
        log(step, `Poll: exitCode=${cmdState.exitCode}`);
        if (cmdState.exitCode !== undefined && cmdState.exitCode !== null) {
          finalState = cmdState;
          break;
        }
      }
      if (!finalState) {
        throw new Error(`Resume command did not exit within ${RESUME_OPENCODE_TIMEOUT_MS / 1000}s timeout`);
      }

      log(step, `Resume command exited in ${elapsed(Date.now() - t0)}: exitCode=${finalState.exitCode}`);

      const logs = await sb.sb.process.getSessionCommandLogs(resumeSessionId, commandId);
      const output = logs.output || logs.stdout || '';
      log(step, `Resume output:\n${output}`);

      await sb.sb.process.deleteSession(resumeSessionId).catch(() => {});

      // The session must recall the secret word — this proves both:
      //   (a) disk survived the stop/start cycle (the session DB/file was readable)
      //   (b) opencode run --session resumes with prior context (it recalled the word)
      const recalledSecret = output.includes(SECRET_WORD);
      log(step, `Output contains secret word "${SECRET_WORD}": ${recalledSecret}`);

      r.record(step, finalState.exitCode === 0 && recalledSecret, Date.now() - t0, {
        exitCode: finalState.exitCode,
        outputChars: output.length,
        sessionId,
        recalledSecret,
        output: output.slice(-500), // tail for the report
      });
    } catch (err) {
      r.recordError(step, err);
    }

    // ── Step 11: Verify session list still shows the session ───────────
    step = '11-session-list-after-resume';
    try {
      const { sessionId: latestId, raw } = await getLatestSessionId(sb, step);
      // After resume, the session should still exist (and likely be the most recent).
      const sessionStillExists = raw.includes(sessionId);
      log(step, `Original session ${sessionId} still in session list: ${sessionStillExists}`);
      r.record(step, sessionStillExists, 0, { sessionId, latestId });
    } catch (err) {
      r.recordError(step, err);
    }
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
