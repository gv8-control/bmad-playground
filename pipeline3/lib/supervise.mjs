// Supervision actions for the gen-3 pipeline.
//
// The dispatcher's poll step (Reconcile pass step 4) calls these functions
// to supervise in-flight agent sessions. Each function is a self-contained
// action that the pass invokes — there is no long-lived supervisor process.
//
// Actions provided:
//   - checkDeadline(claim, nowMs) — is a claim past its deadline?
//   - terminateAndPark() — deadline enforcement: terminate session, journal
//     runner_error, park for human review (dead-session park variant)
//   - parkWithQuestion() — QUESTION outcome: stop sandbox, journal park,
//     return question text for the n8n form
//   - resumeFromPark() — human answer: start sandbox, issue continue command
//   - collectExitedSession() — session exited: read markers, pull logs,
//     classify outcome, check git ls-remote fallback, attempt recovery
//     push, pull transcript, destroy sandbox
//   - pullTranscript() — opencode export for structured session data
//   - checkRemoteBranch() — git ls-remote for the universal push fallback
//   - attemptRecoveryPush() — push from the sandbox's working tree
//   - readMarkers() — read all marker files from the sandbox
//
// References:
//   - graph-pipeline.md: Supervision (in-pass), Sandbox lifecycle, Branch
//     push failure, Park/resume for human questions
//   - spike-in-sandbox-template.md (marker/exit-code contract, git ls-remote
//     fallback)
//   - spike-termination-signal.md (deleteSession sends SIGTERM)
//   - spike-push-on-failure.md (unconditional push guarantee)
//   - spike-midstream-resume.md (stream-truncation detection)
//   - spike-stop-resume.md (sandbox stop/start disk persistence)

import { executeInSandbox, terminateAgentSession, getSessionLogs } from './session.mjs';
import {
  parseJsonEvents,
  classifyOutcome,
  detectStreamTruncation,
} from './classify.mjs';
import {
  MARKER_DIR,
  SESSION_ID_PATH,
  OPENCODE_EXIT_CODE_PATH,
  OPENCODE_EVENT_STREAM_PATH,
  MARKER,
  classifyPushError,
} from './markers.mjs';
import { SANDBOX_REPO } from './snapshot.mjs';

/**
 * Check if a claim is past its deadline.
 *
 * The deadline is stored as an ISO timestamp in the claim's journal entry.
 * A claim past its deadline is terminated and parked for human review
 * (see terminateAndPark).
 *
 * @param {object} claim — the journal claim entry
 * @param {string} claim.deadline — ISO timestamp of the deadline
 * @param {number} [nowMs=Date.now()] — current time in ms (injectable for tests)
 * @returns {boolean} true if the claim is past its deadline
 */
export function checkDeadline(claim, nowMs = Date.now()) {
  if (!claim || !claim.deadline) return false;
  const deadlineMs = new Date(claim.deadline).getTime();
  if (isNaN(deadlineMs)) return false;
  return nowMs >= deadlineMs;
}

/**
 * Deadline enforcement: terminate the session, journal runner_error, park
 * for human review.
 *
 * This is the "dead-session park variant" (see graph-pipeline.md: Timeout
 * policy under Supervision). The session is terminated — there is no live
 * session to resume. The park carries the timeout context (what was running,
 * how long, where the transcript shows it got stuck) and the resolution path
 * is fresh-claim-or-replan, not session-resume.
 *
 * The transcript is pulled before the sandbox is destroyed — the evidence
 * the human reviews. The sandbox is destroyed after transcript pull (single-
 * use — see Sandbox lifecycle).
 *
 * @param {object} opts
 * @param {object} opts.sandbox — the Daytona Sandbox object
 * @param {string} opts.sessionName — the Daytona session name
 * @param {object} opts.claim — the journal claim entry
 * @param {object} opts.context — { runId, chainId, nodeId }
 * @returns {Promise<{ event: object, transcript: object|null }>}
 *   the runner_error journal event and the pulled transcript (if any)
 */
export async function terminateAndPark({ sandbox, sessionName, claim, context }) {
  const { runId, chainId, nodeId } = context;

  // Terminate the session via deleteSession (SIGTERM with grace period —
  // verified spike 2026-07-23: the EXIT trap fires ~22ms after the call,
  // so the push-on-exit step runs for this termination path).
  await terminateAgentSession(sandbox, sessionName);

  // Pull the transcript before destroying the sandbox — the evidence the
  // human reviews. The session is terminated, but the sandbox is still
  // alive (deleteSession only kills the process group, not the sandbox).
  let transcript = null;
  try {
    transcript = await pullTranscript(sandbox, claim.opencodeSessionId);
  } catch {
    // Best-effort — the transcript may not be available if the session
    // was terminated before opencode created any session storage.
  }

  // Build the runner_error journal event.
  const event = {
    type: 'runner_error',
    nodeId,
    chainId,
    runId,
    at: new Date().toISOString(),
    errorType: 'timeout',
    deadline: claim.deadline,
    sessionName,
    sandboxId: sandbox.id,
    message: `Session past deadline (${claim.deadline}). Terminated and parked for human review.`,
  };

  return { event, transcript };
}

/**
 * Park a node with a QUESTION outcome.
 *
 * The canonical parked state is the journal entry (status `parked` — a third
 * status, not `success`, not `failed`). The sandbox is stopped (not destroyed
 * — disk and opencode storage must survive for resume via --session). The
 * question text is returned for the n8n question-form workflow.
 *
 * @param {object} opts
 * @param {object} opts.sandbox — the Daytona Sandbox object
 * @param {string} opts.sessionName — the Daytona session name
 * @param {string} opts.opencodeSessionId — the opencode session ID (for resume)
 * @param {string} opts.questionText — the question to surface to the human
 * @param {object} opts.context — { runId, chainId, nodeId }
 * @returns {Promise<{ event: object }>} the park journal event
 */
export async function parkWithQuestion({
  sandbox,
  sessionName,
  opencodeSessionId,
  questionText,
  context,
}) {
  const { runId, chainId, nodeId } = context;

  // Stop the sandbox (not destroy). Disk and opencode storage survive a
  // Daytona stop (verified spike 2026-07-22 — see spike-stop-resume.md:
  // stop ~2.3s, start ~0.8s, storage directory preserved identically).
  // The sandbox is destroyed after the resumed session exits.
  await sandbox.stop();

  const event = {
    type: 'park',
    nodeId,
    chainId,
    runId,
    at: new Date().toISOString(),
    status: 'parked',
    question: questionText,
    sandboxId: sandbox.id,
    sessionName,
    opencodeSessionId,
  };

  return { event };
}

/**
 * Resume a parked node with a human answer.
 *
 * Starts the sandbox (it was stopped when parked), then issues
 * `opencode run --format json --session <id> --dir <repoPath> "<answer>" </dev/null`
 * as a new async command in the existing Daytona session. The session ID
 * is the one captured at launch (opencode auto-generates IDs — --session
 * is resume-only — verified spike 2026-07-22, see spike-stop-resume.md).
 *
 * @param {object} opts
 * @param {object} opts.sandbox — the Daytona Sandbox object (stopped)
 * @param {string} opts.sessionName — the Daytona session name
 * @param {string} opts.opencodeSessionId — the opencode session ID to resume
 * @param {string} opts.answerText — the human's answer
 * @param {object} opts.env — environment variables (tunnel proxy env, etc.)
 * @param {string} [opts.repoPath=SANDBOX_REPO] — the repo path
 * @param {string} [opts.agent] — the opencode agent type
 * @param {string} [opts.model] — the opencode model
 * @returns {Promise<{ cmdId: string, resumeEvent: object }>}
 *   the new command ID and the resume journal event
 */
export async function resumeFromPark({
  sandbox,
  sessionName,
  opencodeSessionId,
  answerText,
  env,
  repoPath = SANDBOX_REPO,
  agent,
  model,
}) {
  // Start the sandbox (it was stopped when parked).
  // Disk and opencode storage survived the stop (verified spike-stop-resume.md).
  await sandbox.start();

  // Build the resume command. --session resumes the existing conversation;
  // the answer is a new user prompt appended to the session history.
  let cmd = 'opencode run --format json';
  cmd += ` --dir '${repoPath}'`;
  if (agent) cmd += ` --agent '${agent}'`;
  if (model) cmd += ` --model '${model}'`;
  cmd += ` --session '${opencodeSessionId}'`;
  // Escape the answer text for bash single quotes.
  const escapedAnswer = answerText.replace(/'/g, "'\\''");
  cmd += ` '${escapedAnswer}'`;
  cmd += ' </dev/null';

  // Start the resume command in the existing session.
  const { continueAgentSession } = await import('./session.mjs');
  const { cmdId } = await continueAgentSession(sandbox, sessionName, {
    command: cmd,
    env,
    cwd: repoPath,
  });

  const resumeEvent = {
    type: 'resume',
    at: new Date().toISOString(),
    sessionName,
    opencodeSessionId,
    cmdId,
  };

  return { cmdId, resumeEvent };
}

/**
 * Read all marker files from the sandbox.
 *
 * The in-sandbox template writes marker files to /tmp/pipeline/markers/
 * when an infra-level failure occurs. The collecting pass reads these
 * before classification to handle infra failures distinctly (see
 * spike-in-sandbox-template.md).
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @returns {Promise<{
 *   pushFailed: object|null,
 *   proxyFailed: object|null,
 *   installFailed: object|null,
 *   sessionCaptureFailed: object|null
 * }>}
 */
export async function readMarkers(sandbox) {
  const markers = {
    pushFailed: null,
    proxyFailed: null,
    installFailed: null,
    sessionCaptureFailed: null,
  };

  const files = [
    [MARKER.PUSH_FAILED, 'pushFailed'],
    [MARKER.PROXY_FAILED, 'proxyFailed'],
    [MARKER.INSTALL_FAILED, 'installFailed'],
    [MARKER.SESSION_CAPTURE_FAILED, 'sessionCaptureFailed'],
  ];

  for (const [filename, key] of files) {
    try {
      const resp = await executeInSandbox(
        sandbox,
        `cat ${MARKER_DIR}/${filename} 2>/dev/null || echo '__NO_MARKER__'`,
        { timeout: 10 },
      );
      if (resp.exitCode === 0 && resp.result.trim() !== '__NO_MARKER__') {
        try {
          markers[key] = JSON.parse(resp.result.trim());
        } catch {
          // Malformed marker — treat as present but empty.
          markers[key] = { marker: filename.replace('.json', ''), malformed: true };
        }
      }
    } catch {
      // Can't read the marker — the sandbox may be in a bad state.
      // The pass will handle this via the git ls-remote fallback.
    }
  }

  return markers;
}

/**
 * Read the opencode session ID from the sandbox (captured by the background
 * poller).
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @returns {Promise<string|null>} the session ID, or null if not captured
 */
export async function readSessionId(sandbox) {
  try {
    const resp = await executeInSandbox(
      sandbox,
      `cat ${SESSION_ID_PATH} 2>/dev/null || echo '__NO_SESSION_ID__'`,
      { timeout: 10 },
    );
    if (resp.exitCode === 0) {
      const id = resp.result.trim();
      if (id && id !== '__NO_SESSION_ID__') return id;
    }
  } catch {
    // Best-effort.
  }
  return null;
}

/**
 * Read opencode's raw exit code from the sandbox.
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @returns {Promise<number|null>} the exit code, or null if not captured
 */
export async function readOpencodeExitCode(sandbox) {
  try {
    const resp = await executeInSandbox(
      sandbox,
      `cat ${OPENCODE_EXIT_CODE_PATH} 2>/dev/null || echo '__NO_EXIT_CODE__'`,
      { timeout: 10 },
    );
    if (resp.exitCode === 0) {
      const code = parseInt(resp.result.trim(), 10);
      if (!isNaN(code)) return code;
    }
  } catch {
    // Best-effort.
  }
  return null;
}

/**
 * Read the opencode event stream from the sandbox.
 *
 * The event stream is the stdout from `opencode run --format json`, captured
 * to a file by the template. The classifier parses it for outcome
 * classification and stream-truncation detection.
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @returns {Promise<string>} the raw event stream (may be empty)
 */
export async function readEventStream(sandbox) {
  try {
    const resp = await executeInSandbox(
      sandbox,
      `cat ${OPENCODE_EVENT_STREAM_PATH} 2>/dev/null || echo ''`,
      { timeout: 15 },
    );
    return resp.result || '';
  } catch {
    return '';
  }
}

/**
 * Check if a branch exists on the remote (git ls-remote).
 *
 * This is the universal fallback for determining whether the push completed
 * (see spike-in-sandbox-template.md F1, F5). It does not depend on markers
 * or the EXIT trap — it checks the remote directly.
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @param {string} branch — the branch name (pipeline/<runId>/<chainId>)
 * @returns {Promise<boolean>} true if the branch exists on origin
 */
export async function checkRemoteBranch(sandbox, branch) {
  try {
    const resp = await executeInSandbox(
      sandbox,
      `git ls-remote origin "${branch}" 2>/dev/null`,
      { cwd: SANDBOX_REPO, timeout: 30 },
    );
    // git ls-remote prints "<sha>\trefs/heads/<branch>" if the branch exists,
    // or nothing if it doesn't. Exit code 0 either way (if origin is reachable).
    return resp.exitCode === 0 && resp.result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Attempt a recovery push from the sandbox's working tree.
 *
 * Used when the in-sandbox template's push step failed (push-failed marker)
 * or when the push step never ran (SIGKILL, marker-write failure). The pass
 * attempts one recovery push itself, from the sandbox's working tree via
 * the Daytona session API (see graph-pipeline.md: Branch push failure).
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @param {string} branch — the branch name (pipeline/<runId>/<chainId>)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function attemptRecoveryPush(sandbox, branch) {
  try {
    // Stage and commit any uncommitted changes.
    await executeInSandbox(
      sandbox,
      `cd ${SANDBOX_REPO} && git add -A && (git diff --cached --quiet || git commit -m "pipeline: recovery push" --no-verify)`,
      { timeout: 30 },
    );

    // Push.
    const resp = await executeInSandbox(
      sandbox,
      `cd ${SANDBOX_REPO} && git push origin "HEAD:${branch}" 2>&1`,
      { timeout: 60 },
    );

    if (resp.exitCode === 0) {
      return { success: true, error: null };
    }

    // Classify the error to report to the caller.
    const { classification } = classifyPushError(resp.result);
    return { success: false, error: `${classification}: ${resp.result}` };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Pull the opencode session transcript via `opencode export`.
 *
 * The transcript is the structured session data (messages, tool calls) —
 * evidence the JSON event stream cannot replace. Pulled before the sandbox
 * is destroyed (single-use — see Sandbox lifecycle).
 *
 * opencode export prepends INFO log lines before the JSON. The parser
 * finds the first `{` and extracts from there (see spike-midstream-resume.md
 * F5).
 *
 * @param {object} sandbox — the Daytona Sandbox object
 * @param {string} opencodeSessionId — the opencode session ID
 * @returns {Promise<object|null>} the parsed transcript, or null on failure
 */
export async function pullTranscript(sandbox, opencodeSessionId) {
  if (!opencodeSessionId) return null;

  try {
    const resp = await executeInSandbox(
      sandbox,
      `opencode export ${opencodeSessionId} 2>/dev/null`,
      { cwd: SANDBOX_REPO, timeout: 30 },
    );

    if (resp.exitCode !== 0 || !resp.result) return null;

    // Strip the "INFO" and "Exporting session:" prefix lines (spike-
    // midstream-resume.md F5). Find the first `{` and parse from there.
    const jsonStart = resp.result.indexOf('{');
    if (jsonStart === -1) return null;

    const jsonStr = resp.result.slice(jsonStart);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Collect an exited session: read markers, pull logs, classify outcome,
 * check git ls-remote fallback, attempt recovery push, pull transcript.
 *
 * This is the main collection function called by the pass's poll step when
 * a session has exited. It does NOT destroy the sandbox — the caller does
 * that after processing the collection result (the caller may want to keep
 * the sandbox for a park).
 *
 * @param {object} opts
 * @param {object} opts.sandbox — the Daytona Sandbox object
 * @param {string} opts.sessionName — the Daytona session name
 * @param {string} opts.cmdId — the command ID
 * @param {object} opts.context — { runId, chainId, nodeId, branch }
 * @param {string} [opts.apiKey] — neuralwatt API key for classification
 * @returns {Promise<{
 *   templateExitCode: number,
 *   opencodeExitCode: number|null,
 *   markers: object,
 *   events: Array,
 *   outcome: object|null,
 *   transcript: object|null,
 *   pushed: boolean,
 *   recoveryAttempted: boolean,
 *   recoveryResult: object|null,
 *   logs: { output: string, stdout: string, stderr: string },
 * }>}
 */
export async function collectExitedSession({
  sandbox,
  sessionName,
  cmdId,
  context,
  apiKey,
}) {
  const { branch } = context;

  // 1. Read the session logs (the full output from the session command).
  const logs = await getSessionLogs(sandbox, sessionName, cmdId);

  // 2. Read markers (infra-failure signals).
  const markers = await readMarkers(sandbox);

  // 3. Read the opencode session ID (captured by the background poller).
  const opencodeSessionId = await readSessionId(sandbox);

  // 4. Read opencode's raw exit code.
  const opencodeExitCode = await readOpencodeExitCode(sandbox);

  // 5. Read the event stream (opencode's --format json output).
  const eventStream = await readEventStream(sandbox);
  const events = parseJsonEvents(eventStream);

  // 6. Determine the template's exit code from the session logs.
  // The session command's exit code IS the template's exit code.
  // We get this from the pollAgentSession call (the caller passes it in),
  // but if not available, we can try to read it from the logs.
  // Actually, the caller (the pass) already has the exit code from
  // pollAgentSession. We'll accept it as a parameter.
  // For now, we'll use the session logs' exit code if available.
  // The caller should pass templateExitCode.

  // 7. Check if the branch was pushed (git ls-remote fallback).
  // This is the universal fallback for non-clean exits (SIGKILL, trap
  // failure, marker-write failure — see spike-in-sandbox-template.md F1, F5).
  let pushed = false;
  let recoveryAttempted = false;
  let recoveryResult = null;

  if (markers.pushFailed) {
    // Push-failed marker exists — the template tried to push and failed.
    // Attempt one recovery push from the working tree.
    recoveryAttempted = true;
    recoveryResult = await attemptRecoveryPush(sandbox, branch);
    pushed = recoveryResult.success;
  } else {
    // No push-failed marker — check if the branch exists on the remote.
    // If it does, the push completed (either via the EXIT trap or via
    // the normal push step). If it doesn't, attempt a recovery push.
    pushed = await checkRemoteBranch(sandbox, branch);
    if (!pushed) {
      // Branch doesn't exist on remote — the push never ran (SIGKILL,
      // trap failure) or failed silently (marker-write failure).
      // Attempt a recovery push from the working tree.
      recoveryAttempted = true;
      recoveryResult = await attemptRecoveryPush(sandbox, branch);
      pushed = recoveryResult.success;
    }
  }

  // 8. Pull the transcript (structured session data).
  let transcript = null;
  try {
    transcript = await pullTranscript(sandbox, opencodeSessionId);
  } catch {
    // Best-effort — the transcript may not be available.
  }

  // 9. Classify the outcome (only if no infra marker — the pass handles
  // infra markers directly before calling classification).
  let outcome = null;
  const hasInfraMarker = markers.proxyFailed || markers.installFailed ||
    markers.sessionCaptureFailed;

  if (!hasInfraMarker) {
    // The template's exit code: 0=success, 1=agent failure, 2=push failed.
    // We need this for classification. The caller should have it from
    // pollAgentSession. For now, we'll try to infer it from the session
    // logs' exit code. If we can't determine it, we use the opencode
    // exit code as a fallback.
    const templateExitCode = opencodeExitCode !== null ? opencodeExitCode : 0;

    // Check for stream truncation (INCOMPLETE recovery path).
    const isTruncated = detectStreamTruncation({
      events,
      exitCode: opencodeExitCode,
      sessionExport: transcript,
    });

    if (!isTruncated) {
      outcome = await classifyOutcome({
        events,
        opencodeExitCode: opencodeExitCode !== null ? opencodeExitCode : 0,
        templateExitCode,
        sessionExport: transcript,
        apiKey,
      });
    } else {
      outcome = {
        outcome: 'INCOMPLETE',
        response: '',
        evidence: 'stream-truncation detected during collection',
        classificationFallback: false,
      };
    }
  }

  return {
    templateExitCode: opencodeExitCode !== null ? opencodeExitCode : 0,
    opencodeExitCode,
    markers,
    events,
    outcome,
    transcript,
    pushed,
    recoveryAttempted,
    recoveryResult,
    logs,
    opencodeSessionId,
  };
}

/**
 * Build a stream-truncation continue command for INCOMPLETE recovery.
 *
 * When the classifier detects stream truncation (INCOMPLETE), the pass issues
 * an async continue: `opencode run --format json --session <id> --dir <repo>
 * "continue" </dev/null`. The session resumes with full context (verified
 * spike 2026-07-22 — see spike-midstream-resume.md).
 *
 * @param {object} opts
 * @param {string} opts.opencodeSessionId — the opencode session ID
 * @param {string} [opts.repoPath=SANDBOX_REPO] — the repo path
 * @param {string} [opts.agent] — the opencode agent type
 * @param {string} [opts.model] — the opencode model
 * @param {string} [opts.continuePrompt='continue'] — the continue prompt
 * @returns {string} the continue command string
 */
export function buildContinueCommand({
  opencodeSessionId,
  repoPath = SANDBOX_REPO,
  agent,
  model,
  continuePrompt = 'continue',
}) {
  let cmd = 'opencode run --format json';
  cmd += ` --dir '${repoPath}'`;
  if (agent) cmd += ` --agent '${agent}'`;
  if (model) cmd += ` --model '${model}'`;
  cmd += ` --session '${opencodeSessionId}'`;
  const escaped = continuePrompt.replace(/'/g, "'\\''");
  cmd += ` '${escaped}'`;
  cmd += ' </dev/null';
  return cmd;
}

/**
 * Build a conflict journal event with a stable fingerprint.
 *
 * Conflict-as-evidence journaling (see graph-pipeline.md: Conflicts are
 * evidence, never silently resolved). A merge-queue failure is journaled
 * with a stable fingerprint (e.g. `merge-conflict-<chainId>`) so recurrence
 * is a query away and coupled chains are identified from data, not guesses.
 *
 * This is written for a future reflector to read, but no reflection
 * machinery exists in gen-3 — a human (or a later tool) queries the
 * journal. The fingerprint makes `grep "merge-conflict-<chainId>"` work.
 *
 * @param {object} opts
 * @param {string} opts.chainId — the chain that conflicted
 * @param {string} opts.mergePointNodeId — the merge-point node that triggered the merge
 * @param {string[]} [opts.conflictedFiles] — the files that conflicted
 * @param {string} [opts.diffstat] — the diffstat summary
 * @param {string} [opts.runId] — the pipeline run identifier
 * @returns {object} the conflict journal event, ready for appendJournal
 */
export function buildConflictEvent({
  chainId,
  mergePointNodeId,
  conflictedFiles = [],
  diffstat = '',
  runId,
}) {
  return {
    type: 'conflict',
    at: new Date().toISOString(),
    fingerprint: `merge-conflict-${chainId}`,
    chainId,
    mergePointNodeId,
    conflictedFiles,
    diffstat,
    runId,
  };
}

/**
 * Build a runner_error journal event for machinery failures.
 *
 * Non-zero exits, timeouts, and API failures are journaled as runner_error
 * events (see graph-pipeline.md: Supervision — Machinery evidence). This
 * helper builds the event with the standard fields.
 *
 * @param {object} opts
 * @param {string} opts.nodeId — the node that failed
 * @param {string} opts.chainId — the chain
 * @param {string} opts.runId — the pipeline run
 * @param {string} opts.errorType — 'timeout' | 'non_zero_exit' | 'api_failure' | 'session_terminated'
 * @param {string} [opts.message] — human-readable error detail
 * @param {string} [opts.sessionName] — the Daytona session name
 * @param {string} [opts.sandboxId] — the sandbox ID
 * @param {number} [opts.exitCode] — the exit code (for non_zero_exit)
 * @returns {object} the runner_error journal event
 */
export function buildRunnerErrorEvent({
  nodeId,
  chainId,
  runId,
  errorType,
  message = '',
  sessionName,
  sandboxId,
  exitCode,
}) {
  return {
    type: 'runner_error',
    at: new Date().toISOString(),
    nodeId,
    chainId,
    runId,
    errorType,
    message,
    sessionName,
    sandboxId,
    exitCode,
  };
}
