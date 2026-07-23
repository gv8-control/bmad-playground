// Daytona session API wrapper for the gen-3 pipeline.
//
// The pipeline supervises opencode agent sessions running inside Daytona
// sandboxes. Each claim runs an opencode session as a long-lived async
// command inside a named Daytona "command session" (a process group the
// SDK tracks by a caller-chosen name). The supervision loop polls the
// command's state, reads its output, and terminates it on timeout or
// completion.
//
// This module wraps the Daytona SDK's `sandbox.process` session API to
// give the supervision code a clean, narrow interface. It does not own
// sandbox lifecycle (provision.mjs / reaper.mjs do that) and it does not
// construct the in-sandbox command string (template.mjs does that,
// including the load-bearing `</dev/null` stdin redirect — see note 1
// below). It only translates caller intent into SDK calls and wraps
// failures in a typed error.
//
// SDK surface used (verified by spike-termination-signal.md, 2026-07-23):
//   - sandbox.process.createSession(sessionId)
//       Creates a named command session. The sessionId is a caller-chosen
//       string (NOT the opencode session ID — it's a Daytona session name
//       like `pipeline-<runId>-<chainId>`).
//   - sandbox.process.executeSessionCommand(sessionId, { command, runAsync: true }, timeout)
//       Starts an async command in the session. Returns `{ cmdId }`. With
//       `runAsync: true`, the call returns immediately and the command
//       runs in the background.
//   - sandbox.process.getSessionCommand(sessionId, cmdId)
//       Returns the current state. `{ exitCode: undefined }` while the
//       command is still running, `{ exitCode: <number> }` once done.
//   - sandbox.process.getSessionCommandLogs(sessionId, cmdId)
//       Returns `{ output, stdout, stderr }` — a snapshot of output so
//       far. Safe to call while the command is running.
//   - sandbox.process.deleteSession(sessionId)
//       Terminates the session's process group with SIGTERM (verified
//       spike 2026-07-23 — the bash EXIT trap fires ~22 ms after this
//       call). The sandbox itself stays alive.
//   - sandbox.process.executeCommand(command, cwd, env, timeout)
//       Runs a command synchronously (not in a session). Returns
//       `{ result, exitCode }`. Used for one-off commands like
//       `git ls-remote`, `opencode session list`, `opencode export`.
//
// What this module does NOT do:
//   - Append `</dev/null` to the command (the caller / template.mjs owns
//     that — see note 1).
//   - Decide when to terminate (the supervision loop owns policy).
//   - Destroy the sandbox (the collection step / reaper owns that).
//   - Enforce timeouts on the polling cadence (the supervision loop owns
//     the poll interval and the wall-clock budget).

/**
 * Error class for session failures.
 *
 * Carries the sessionName so the caller can report which session failed
 * and attempt cleanup (e.g. terminateAgentSession on a half-started
 * session). Distinct from ProvisioningError (sandbox creation failures)
 * and DaytonaNotFoundError (sandbox-not-found at the SDK level).
 */
export class SessionError extends Error {
  /**
   * @param {string} message — what went wrong
   * @param {string} sessionName — the Daytona session name involved
   */
  constructor(message, sessionName) {
    super(message);
    this.name = 'SessionError';
    this.sessionName = sessionName;
  }
}

/**
 * Start an opencode agent session inside a Daytona sandbox.
 *
 * Creates a named Daytona command session and starts the in-sandbox
 * command async (runAsync: true). The command runs in the background;
 * this call returns as soon as the SDK acknowledges the start.
 *
 * The command string MUST already include `</dev/null` — see note 1 in
 * the module header. `executeSessionCommand` with `runAsync: true` runs
 * the command in a PTY; opencode detects the TTY and hangs waiting for
 * interactive input unless stdin is redirected from /dev/null. This
 * module does not add the redirect; the caller (template.mjs) is
 * responsible for including it in the command string.
 *
 * @param {object} sandbox — the Daytona Sandbox object (from provisionSandbox)
 * @param {object} opts
 * @param {string} opts.command — the full bash command string (the
 *   in-sandbox template). Must include `</dev/null`.
 * @param {object} opts.env — environment variables object (from
 *   getTunnelProxyEnv + others). Passed as a plain object of key-value
 *   strings; the Daytona SDK merges it with the sandbox's default env.
 * @param {string} opts.cwd — working directory (typically '/workspace/repo')
 * @param {string} opts.sessionName — a caller-chosen name for the
 *   Daytona session (e.g. `pipeline-<runId>-<chainId>`). NOT the
 *   opencode session ID.
 * @returns {Promise<{ sessionName: string, cmdId: string }>} the
 *   session name and the command ID for the started command
 * @throws {SessionError} if createSession or executeSessionCommand fails
 */
export async function startAgentSession(sandbox, opts) {
  const { command, env, cwd, sessionName } = opts;
  if (!sandbox) throw new SessionError('startAgentSession: sandbox is required', sessionName);
  if (!command) throw new SessionError('startAgentSession: command is required', sessionName);
  if (!sessionName) throw new SessionError('startAgentSession: sessionName is required', sessionName);

  // Step 1: create the named command session. createSession is
  // idempotent-ish in practice but the supervision loop never calls this
  // twice for the same name — a session is created once per claim and
  // reused for the resume path via continueAgentSession (which does NOT
  // re-create the session, only starts a new command in it).
  try {
    await sandbox.process.createSession(sessionName);
  } catch (err) {
    throw new SessionError(
      `createSession failed for "${sessionName}": ${err.message || String(err)}`,
      sessionName,
    );
  }

  // Step 2: start the command async. runAsync: true is what makes this
  // a supervision target — the call returns immediately with a cmdId
  // and the command runs in the background. The supervision loop polls
  // getSessionCommand to observe completion.
  //
  // The env is passed as the third positional arg's sibling — the SDK
  // signature is executeSessionCommand(sessionId, { command, runAsync },
  // timeout) and env is set on the command object. (Verified against the
  // spike harness, which passes env the same way provision.mjs passes it
  // to executeCommand.)
  try {
    const resp = await sandbox.process.executeSessionCommand(
      sessionName,
      { command, runAsync: true, env, cwd },
      // No timeout here — the supervision loop owns the wall-clock budget
      // and terminates via deleteSession when it expires. Passing a
      // timeout to executeSessionCommand would let the SDK kill the
      // command itself, bypassing the EXIT-trap push-on-exit path.
      undefined,
    );
    if (!resp || !resp.cmdId) {
      throw new SessionError(
        `executeSessionCommand returned no cmdId for "${sessionName}"`,
        sessionName,
      );
    }
    return { sessionName, cmdId: resp.cmdId };
  } catch (err) {
    // If executeSessionCommand failed, the session shell exists but has
    // no running command. The caller should terminateAgentSession to
    // clean up the empty session before retrying.
    throw new SessionError(
      `executeSessionCommand failed for "${sessionName}": ${err.message || String(err)}`,
      sessionName,
    );
  }
}

/**
 * Poll a running agent session command.
 *
 * Returns the current state of the command started by startAgentSession
 * or continueAgentSession. The supervision loop calls this on its poll
 * cadence to detect completion and stream output.
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @param {string} sessionName — the Daytona session name
 * @param {string} cmdId — the command ID (from startAgentSession / continueAgentSession)
 * @returns {Promise<{ running: boolean, exitCode: number | undefined, output: string }>}
 *   `running` is true while exitCode is undefined; `output` is the stdout
 *   snapshot so far (from getSessionCommandLogs)
 * @throws {SessionError} if getSessionCommand fails (e.g. session was
 *   deleted out from under the poller)
 */
export async function pollAgentSession(sandbox, sessionName, cmdId) {
  if (!sandbox) throw new SessionError('pollAgentSession: sandbox is required', sessionName);
  if (!sessionName) throw new SessionError('pollAgentSession: sessionName is required', sessionName);
  if (!cmdId) throw new SessionError('pollAgentSession: cmdId is required', sessionName);

  // getSessionCommand returns { exitCode } — undefined while the command
  // is still running, a number once it has exited. This is the
  // load-bearing signal for the supervision loop's completion check.
  let cmdState;
  try {
    cmdState = await sandbox.process.getSessionCommand(sessionName, cmdId);
  } catch (err) {
    throw new SessionError(
      `getSessionCommand failed for "${sessionName}/${cmdId}": ${err.message || String(err)}`,
      sessionName,
    );
  }

  const exitCode = cmdState?.exitCode;
  const running = exitCode === undefined;

  // getSessionCommandLogs returns { output, stdout, stderr }. The
  // supervision loop streams `output` (the combined view) to the run
  // transcript; stdout/stderr are available for finer-grained handling
  // if needed. Safe to call while the command is running — it returns
  // whatever output has accumulated so far.
  //
  // A logs failure is not fatal to the poll — the command may have
  // just exited and the logs endpoint may be racing the session
  // teardown. If logs can't be fetched, return empty output rather than
  // throwing; the exitCode is the authoritative completion signal.
  let output = '';
  try {
    const logs = await sandbox.process.getSessionCommandLogs(sessionName, cmdId);
    output = logs?.output ?? '';
  } catch {
    // Non-fatal: see comment above. The supervision loop will see the
    // exitCode and proceed to collection, which re-reads logs via
    // getSessionLogs (and that call DOES surface a failure, since at
    // collection time the session should still be readable).
  }

  return { running, exitCode, output };
}

/**
 * Resume an opencode session with a new prompt.
 *
 * Used for park/resume (a node is parked mid-run and later resumed with
 * a fresh prompt) and for stream-truncation recovery (the agent's output
 * stream was truncated, so the supervision loop re-issues the last
 * answer as a new prompt to continue the session).
 *
 * The session must already exist (created by startAgentSession). This
 * function starts a new async command in the existing session and
 * returns a new cmdId; the old cmdId is no longer valid for polling.
 *
 * As with startAgentSession, the command string MUST include `</dev/null`
 * — the caller is responsible for that.
 *
 * @param {object} sandbox — the Sandbox object
 * @param {string} sessionName — the Daytona session name (must already exist)
 * @param {object} opts
 * @param {string} opts.command — the resume command (e.g.
 *   `opencode run --format json --session <ses_id> --dir /workspace/repo "<answer>" </dev/null`)
 * @param {object} opts.env — environment variables
 * @param {string} opts.cwd — working directory
 * @returns {Promise<{ cmdId: string }>} a new command ID for the resumed command
 * @throws {SessionError} if executeSessionCommand fails
 */
export async function continueAgentSession(sandbox, sessionName, opts) {
  const { command, env, cwd } = opts;
  if (!sandbox) throw new SessionError('continueAgentSession: sandbox is required', sessionName);
  if (!sessionName) throw new SessionError('continueAgentSession: sessionName is required', sessionName);
  if (!command) throw new SessionError('continueAgentSession: command is required', sessionName);

  try {
    const resp = await sandbox.process.executeSessionCommand(
      sessionName,
      { command, runAsync: true, env, cwd },
      undefined,
    );
    if (!resp || !resp.cmdId) {
      throw new SessionError(
        `executeSessionCommand returned no cmdId for "${sessionName}"`,
        sessionName,
      );
    }
    return { cmdId: resp.cmdId };
  } catch (err) {
    throw new SessionError(
      `executeSessionCommand failed for "${sessionName}": ${err.message || String(err)}`,
      sessionName,
    );
  }
}

/**
 * Terminate an agent session via deleteSession (SIGTERM).
 *
 * `deleteSession` sends SIGTERM to the session's process group with a
 * grace period (verified spike 2026-07-23 — the bash EXIT trap fires
 * ~22 ms after the call, so the in-sandbox template's push-on-exit
 * step runs for this termination path). The sandbox itself stays alive;
 * sandbox destruction is a separate concern (reaper.mjs / collection step).
 *
 * This function is idempotent: if the session doesn't exist (already
 * exited and cleaned up, or never created), it returns void without
 * error. The Daytona SDK does not export a typed error for
 * session-not-found the way it does for sandbox-not-found
 * (DaytonaNotFoundError), so a string check on the error message is the
 * pragmatic approach (see note 4 in the module header).
 *
 * @param {object} sandbox — the Sandbox object
 * @param {string} sessionName — the Daytona session name
 * @returns {Promise<void>}
 * @throws {SessionError} only on unexpected errors (NOT on "session not found")
 */
export async function terminateAgentSession(sandbox, sessionName) {
  if (!sandbox) throw new SessionError('terminateAgentSession: sandbox is required', sessionName);
  if (!sessionName) throw new SessionError('terminateAgentSession: sessionName is required', sessionName);

  try {
    await sandbox.process.deleteSession(sessionName);
  } catch (err) {
    if (isSessionNotFound(err)) {
      // The session already exited and was cleaned up, or was never
      // created. Termination is idempotent — this is success.
      return;
    }
    throw new SessionError(
      `deleteSession failed for "${sessionName}": ${err.message || String(err)}`,
      sessionName,
    );
  }
}

/**
 * Get the current output of a session command.
 *
 * Returns the full { output, stdout, stderr } snapshot from
 * getSessionCommandLogs. Used at collection time to pull the complete
 * transcript after the command has exited (pollAgentSession returns only
 * the combined `output` for streaming; this surfaces the split streams).
 *
 * @param {object} sandbox — the Sandbox object
 * @param {string} sessionName — the Daytona session name
 * @param {string} cmdId — the command ID
 * @returns {Promise<{ output: string, stdout: string, stderr: string }>}
 *   the current output snapshot (empty strings if no output yet)
 * @throws {SessionError} if getSessionCommandLogs fails
 */
export async function getSessionLogs(sandbox, sessionName, cmdId) {
  if (!sandbox) throw new SessionError('getSessionLogs: sandbox is required', sessionName);
  if (!sessionName) throw new SessionError('getSessionLogs: sessionName is required', sessionName);
  if (!cmdId) throw new SessionError('getSessionLogs: cmdId is required', sessionName);

  try {
    const logs = await sandbox.process.getSessionCommandLogs(sessionName, cmdId);
    return {
      output: logs?.output ?? '',
      stdout: logs?.stdout ?? '',
      stderr: logs?.stderr ?? '',
    };
  } catch (err) {
    throw new SessionError(
      `getSessionCommandLogs failed for "${sessionName}/${cmdId}": ${err.message || String(err)}`,
      sessionName,
    );
  }
}

/**
 * Run a one-off command synchronously in the sandbox (not in a session).
 *
 * Wraps `sandbox.process.executeCommand` for commands that should block
 * until completion and return their output inline — e.g. `git ls-remote`
 * (the universal fallback for reading the branch head after a
 * force-stop/OOM where the EXIT trap didn't fire), `opencode session list`
 * (discovering existing sessions), `opencode export` (pulling a
 * transcript). These are short, bounded commands, unlike the long-lived
 * agent session command.
 *
 * @param {object} sandbox — the Sandbox object
 * @param {string} command — the command string
 * @param {object} [opts]
 * @param {string} [opts.cwd] — working directory (optional, defaults to
 *   undefined — the SDK uses the sandbox's default cwd)
 * @param {object} [opts.env] — environment variables (optional)
 * @param {number} [opts.timeout=30] — timeout in seconds (optional,
 *   defaults to 30)
 * @returns {Promise<{ result: string, exitCode: number }>} the command's
 *   stdout (`result`) and exit code
 * @throws {SessionError} if executeCommand fails or returns no exitCode
 */
export async function executeInSandbox(sandbox, command, opts = {}) {
  if (!sandbox) throw new SessionError('executeInSandbox: sandbox is required', undefined);
  if (!command) throw new SessionError('executeInSandbox: command is required', undefined);

  const { cwd, env, timeout = 30 } = opts;

  try {
    const resp = await sandbox.process.executeCommand(command, cwd, env, timeout);
    // executeCommand returns { result, exitCode }. result is the
    // combined stdout (the SDK does not split streams for the
    // synchronous path). exitCode is a number — 0 on success.
    if (resp?.exitCode === undefined) {
      throw new SessionError(
        `executeCommand returned no exitCode for: ${command}`,
        undefined,
      );
    }
    return {
      result: resp.result ?? '',
      exitCode: resp.exitCode,
    };
  } catch (err) {
    // Re-throw SessionError as-is (from the exitCode check above).
    if (err instanceof SessionError) throw err;
    throw new SessionError(
      `executeCommand failed for: ${command}: ${err.message || String(err)}`,
      undefined,
    );
  }
}

/**
 * Check if a session error is a "not found" error.
 *
 * The Daytona SDK does not export a typed error for session-not-found
 * (unlike DaytonaNotFoundError for sandbox-not-found). The pragmatic
 * approach is a string check on the error name and message for "not
 * found" or a 404 status code. This mirrors the heuristic the product's
 * older code used before the F1 fix introduced DaytonaNotFoundError for
 * sandboxes; sessions still rely on the string check.
 *
 * Kept module-private — only terminateAgentSession needs this.
 */
function isSessionNotFound(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  if (msg.includes('not found')) return true;
  if (msg.includes('does not exist')) return true;
  // 404 may appear in the message or as a statusCode property.
  if (err.statusCode === 404) return true;
  if (msg.includes('404')) return true;
  return false;
}
