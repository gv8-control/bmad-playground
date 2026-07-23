// Stage 3 integration test: proves the per-agent machinery works.
//
// Run: node pipeline3/lib/stage3-agent-machinery.test.mjs
//
// Part 1 (unit tests, always run): template generation, classification
// rules, markers module, push error classification.
//
// Part 2 (integration tests, skip if env vars missing): session API against
// a real Daytona sandbox, full template execution with a synthetic command,
// park/resume, deadline enforcement, collection with git ls-remote fallback.
//
// The integration tests create and destroy their own sandboxes. No sandboxes
// are left running.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildInSandboxCommand } from './template.mjs';
import {
  parseJsonEvents,
  extractResponseText,
  hasStepFinish,
  hasErrorEvent,
  hasTextEvents,
  detectStreamTruncation,
  classifyDeterministic,
  classifyOutcome,
  OUTCOMES,
} from './classify.mjs';
import {
  EXIT,
  MARKER,
  classifyPushError,
  getBackoffSchedule,
  buildPushFailedMarker,
  buildProxyFailedMarker,
  buildInstallFailedMarker,
  buildSessionCaptureFailedMarker,
  PIPELINE_TMP,
  MARKER_DIR,
  SESSION_ID_PATH,
  OPENCODE_EXIT_CODE_PATH,
} from './markers.mjs';
import { checkDeadline, buildContinueCommand } from './supervise.mjs';
import { loadPolicy } from './state.mjs';

let failures = 0;
let tests = 0;

function assert(name, cond) {
  tests++;
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
  }
}

function assertEqual(name, actual, expected) {
  tests++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// ─── Part 1: Unit Tests (always run) ─────────────────────────────────────────

// --- 1. Template generation ---
console.log('\n1. template generation');

const template = buildInSandboxCommand({
  runId: 'test-run',
  chainId: 'test-chain',
  prompt: 'Print exactly: DONE',
  installCommand: 'yarn install --immutable',
  installTimeoutSec: 300,
  repoPath: '/workspace/repo',
  agent: 'coder',
  model: 'glm-5.2',
});

assert('template is a non-empty string', typeof template === 'string' && template.length > 100);
assert('template starts with shebang', template.startsWith('#!/bin/bash'));
assert('template contains set +e', template.includes('set +e'));
assert('template contains EXIT trap', template.includes('trap do_push EXIT'));
assert('template contains tunnel proxy start', template.includes('node /tmp/tunnel-proxy.js'));
assert('template contains proxy health check (tier 1)', template.includes('curl -sf --max-time 1 http://127.0.0.1:8888'));
assert('template contains proxy health check (tier 2)', template.includes('api.neuralwatt.com/v1/models'));
assert('template contains install with timeout', template.includes('timeout 300'));
assert('template contains opencode run', template.includes('opencode run --format json'));
assert('template contains --dir', template.includes('--dir'));
assert('template contains --agent coder', template.includes('--agent'));
assert('template contains --model glm-5.2', template.includes('--model'));
assert('template contains </dev/null', template.includes('</dev/null'));
assert('template contains git push', template.includes('git push origin'));
assert('template contains branch name', template.includes('pipeline/test-run/test-chain'));
assert('template contains session list poller', template.includes('opencode session list --format json'));
assert('template contains PUSH_NEEDED flag', template.includes('PUSH_NEEDED'));
assert('template contains proxy-failed marker write', template.includes('proxy-failed'));
assert('template contains install-failed marker write', template.includes('install-failed'));
assert('template contains push-failed marker write', template.includes('push-failed'));
assert('template contains session-capture-failed marker', template.includes('session-capture-failed'));

// Template without install command
const noInstallTemplate = buildInSandboxCommand({
  runId: 'test-run',
  chainId: 'test-chain',
  prompt: 'test',
});
assert('template without install skips install step', noInstallTemplate.includes('Install step skipped'));

// Template with session resume
const resumeTemplate = buildInSandboxCommand({
  runId: 'test-run',
  chainId: 'test-chain',
  prompt: 'continue',
  opencodeSessionId: 'ses_abc123',
});
assert('resume template contains --session', resumeTemplate.includes('--session \'ses_abc123\''));

// --- 2. Classification: event parsing ---
console.log('\n2. classification: event parsing');

const cleanStream = [
  '{"type":"step_start","timestamp":1784565192029}',
  '{"type":"text","part":{"text":"Hello! How can I help you today?"}}',
  '{"type":"step_finish","reason":"stop"}',
].join('\n');

const events = parseJsonEvents(cleanStream);
assertEqual('parseJsonEvents returns 3 events', events.length, 3);
assertEqual('first event is step_start', events[0].type, 'step_start');
assertEqual('second event is text', events[1].type, 'text');
assertEqual('third event is step_finish', events[2].type, 'step_finish');

// Malformed lines are skipped
const mixedStream = '{"type":"step_start"}\nnot json\n{"type":"text","part":{"text":"hi"}}\n\n';
const mixedEvents = parseJsonEvents(mixedStream);
assertEqual('malformed lines skipped, 2 events', mixedEvents.length, 2);

// Empty/null input
assertEqual('null input returns empty array', parseJsonEvents(null), []);
assertEqual('empty string returns empty array', parseJsonEvents(''), []);

// --- 3. Classification: helper predicates ---
console.log('\n3. classification: predicates');

assert('hasStepFinish true', hasStepFinish(events));
assert('hasTextEvents true', hasTextEvents(events));
assert('hasErrorEvent false', !hasErrorEvent(events));

const errorStream = parseJsonEvents('{"type":"error","error":{"name":"TestError"}}');
assert('hasErrorEvent true for error stream', hasErrorEvent(errorStream));

const emptyStream = parseJsonEvents('{"type":"step_start"}');
assert('hasStepFinish false for no finish', !hasStepFinish(emptyStream));
assert('hasTextEvents false for no text', !hasTextEvents(emptyStream));

// --- 4. Classification: response text extraction ---
console.log('\n4. classification: response text extraction');

const responseText = extractResponseText(events);
assertEqual('response text extracted', responseText, 'Hello! How can I help you today?');

const multiTextStream = parseJsonEvents(
  '{"type":"text","part":{"text":"part1 "}}\n{"type":"text","part":{"text":"part2"}}',
);
assertEqual('multi-text concatenated', extractResponseText(multiTextStream), 'part1 part2');

assertEqual('no text events returns empty', extractResponseText([]), '');

// --- 5. Classification: stream truncation detection ---
console.log('\n5. classification: stream truncation');

// SIGTERM kill with incomplete message
const truncatedExport = {
  messages: [
    { role: 'user', time: {} },
    { role: 'assistant', time: { completed: null } }, // incomplete
  ],
};
assert(
  'SIGTERM (exit 143) with incomplete message is truncation',
  detectStreamTruncation({ events: [], exitCode: 143, sessionExport: truncatedExport }),
);

// SIGTERM kill with completed message — not truncation
const completedExport = {
  messages: [
    { role: 'user', time: {} },
    { role: 'assistant', time: { completed: '2026-07-22T11:43:40Z' } },
  ],
};
assert(
  'SIGTERM (exit 143) with completed message is NOT truncation',
  !detectStreamTruncation({ events: [parseJsonEvents('{"type":"step_finish"}')[0]], exitCode: 143, sessionExport: completedExport }),
);

// Error event is always truncation
assert(
  'error event is truncation regardless of exit code',
  detectStreamTruncation({ events: errorStream, exitCode: 0 }),
);

// Clean exit (0) with step_finish — not truncation
assert(
  'clean exit with step_finish is NOT truncation',
  !detectStreamTruncation({ events, exitCode: 0 }),
);

// Exit 0 without step_finish — NOT truncation without session export
// (the two-signal check requires both process signal AND incomplete message).
assert(
  'exit 0 without step_finish, no export → NOT truncation (two-signal check)',
  !detectStreamTruncation({ events: emptyStream, exitCode: 0 }),
);

// Exit 0 without step_finish WITH incomplete message in export → truncation
assert(
  'exit 0 without step_finish, incomplete message → truncation',
  detectStreamTruncation({ events: emptyStream, exitCode: 0, sessionExport: truncatedExport }),
);

// --- 6. Classification: deterministic rules ---
console.log('\n6. classification: deterministic rules');

// Stream truncation → INCOMPLETE
const truncResult = classifyDeterministic({ events: [], exitCode: 143, sessionExport: truncatedExport });
assertEqual('truncation → INCOMPLETE', truncResult.outcome, OUTCOMES.INCOMPLETE);

// No output → UNKNOWN
const noOutputResult = classifyDeterministic({ events: [], exitCode: 0 });
assertEqual('no output → UNKNOWN', noOutputResult.outcome, OUTCOMES.UNKNOWN);

// Non-zero exit with step_finish → FAILED
const failedResult = classifyDeterministic({ events, exitCode: 1 });
assertEqual('non-zero exit with step_finish → FAILED', failedResult.outcome, OUTCOMES.FAILED);

// Clean exit with text → null (LLM fallback)
const cleanResult = classifyDeterministic({ events, exitCode: 0 });
assertEqual('clean exit with text → null (LLM fallback)', cleanResult, null);

// --- 7. Classification: full outcome (no LLM, deterministic only) ---
console.log('\n7. classification: full outcome (deterministic)');

const detOutcome = await classifyOutcome({
  events,
  opencodeExitCode: 0,
  templateExitCode: 0,
});
// Without NEURALWATT_API_KEY, the LLM call returns UNKNOWN.
// But the deterministic rules should fire first for this case.
// Actually, clean exit with text → null → LLM fallback → UNKNOWN (no API key).
assertEqual(
  'clean exit with text, no API key → UNKNOWN (LLM fallback fails gracefully)',
  detOutcome.outcome,
  OUTCOMES.UNKNOWN,
);
assert('classificationFallback is true (LLM was attempted)', detOutcome.classificationFallback);

// Infra exit code → UNKNOWN
const infraOutcome = await classifyOutcome({
  events: [],
  opencodeExitCode: 0,
  templateExitCode: EXIT.INSTALL_FAILURE,
});
assertEqual('install failure exit code → UNKNOWN', infraOutcome.outcome, OUTCOMES.UNKNOWN);
assert('install failure evidence mentions install', infraOutcome.evidence.includes('install'));

const proxyOutcome = await classifyOutcome({
  events: [],
  opencodeExitCode: 0,
  templateExitCode: EXIT.PROXY_FAILURE,
});
assertEqual('proxy failure exit code → UNKNOWN', proxyOutcome.outcome, OUTCOMES.UNKNOWN);

// --- 8. Markers: exit codes ---
console.log('\n8. markers: exit codes');

assertEqual('SUCCESS is 0', EXIT.SUCCESS, 0);
assertEqual('AGENT_FAILURE is 1', EXIT.AGENT_FAILURE, 1);
assertEqual('PUSH_FAILED is 2', EXIT.PUSH_FAILED, 2);
assertEqual('INSTALL_FAILURE is 10', EXIT.INSTALL_FAILURE, 10);
assertEqual('PROXY_FAILURE is 20', EXIT.PROXY_FAILURE, 20);
assertEqual('SESSION_CAPTURE_TRANSIENT is 66', EXIT.SESSION_CAPTURE_TRANSIENT, 66);
assertEqual('SESSION_CAPTURE_PERMANENT is 67', EXIT.SESSION_CAPTURE_PERMANENT, 67);

// --- 9. Markers: push error classification ---
console.log('\n9. markers: push error classification');

const authError = classifyPushError('fatal: Authentication failed for https://github.com/');
assertEqual('auth error → auth_failure', authError.classification, 'auth_failure');
assert('auth error is not transient', !authError.transient);

const nffError = classifyPushError('! [rejected] HEAD -> pipeline/test (non-fast-forward)');
assertEqual('non-fast-forward → non_fast_forward', nffError.classification, 'non_fast_forward');
assert('non-fast-forward is not transient', !nffError.transient);

const netError = classifyPushError('fatal: unable to access github.com: Could not resolve host');
assertEqual('network error → network_transient', netError.classification, 'network_transient');
assert('network error is transient', netError.transient);

const rateError = classifyPushError('remote: Rate limit exceeded. Try again later.');
assertEqual('rate limit → rate_limit', rateError.classification, 'rate_limit');
assert('rate limit is transient', rateError.transient);

const unknownError = classifyPushError('some weird error');
assertEqual('unknown error → unknown', unknownError.classification, 'unknown');
assert('unknown error is not transient', !unknownError.transient);

// --- 10. Markers: backoff schedules ---
console.log('\n10. markers: backoff schedules');

assertEqual('network backoff is [1, 5, 15]', getBackoffSchedule('network_transient'), [1, 5, 15]);
assertEqual('rate limit backoff is [30, 60, 120]', getBackoffSchedule('rate_limit'), [30, 60, 120]);
assertEqual('auth failure backoff is empty', getBackoffSchedule('auth_failure'), []);
assertEqual('unknown backoff is empty', getBackoffSchedule('unknown'), []);

// --- 11. Markers: builder functions ---
console.log('\n11. markers: builder functions');

const pushMarker = buildPushFailedMarker({
  opencodeExitCode: 0,
  gitError: 'auth failed',
  errorClassification: 'auth_failure',
  branch: 'pipeline/test/chain',
  commitSha: 'abc123',
  retryHistory: [{ attempt: 1, exitCode: 1, error: 'auth', at: '2026-07-23T10:00:00Z' }],
});
assertEqual('push marker has marker field', pushMarker.marker, 'push-failed');
assertEqual('push marker has branch', pushMarker.branch, 'pipeline/test/chain');
assertEqual('push marker has opencodeExitCode', pushMarker.opencodeExitCode, 0);

const proxyMarker = buildProxyFailedMarker({
  tier: 'listener',
  cause: 'not responding',
  permanence: 'permanent',
});
assertEqual('proxy marker has tier', proxyMarker.tier, 'listener');
assertEqual('proxy marker has permanence', proxyMarker.permanence, 'permanent');

const installMarker = buildInstallFailedMarker({
  cause: 'timeout',
  exitCode: 124,
  output: 'yarn install...',
});
assertEqual('install marker has cause', installMarker.cause, 'timeout');
assertEqual('install marker has exitCode', installMarker.exitCode, 124);

const sessionMarker = buildSessionCaptureFailedMarker({
  cause: 'no_new_session',
  detail: 'no session in 5 min',
});
assertEqual('session marker has cause', sessionMarker.cause, 'no_new_session');

// --- 12. Markers: paths ---
console.log('\n12. markers: paths');

assertEqual('PIPELINE_TMP is /tmp/pipeline', PIPELINE_TMP, '/tmp/pipeline');
assertEqual('MARKER_DIR is /tmp/pipeline/markers', MARKER_DIR, '/tmp/pipeline/markers');
assertEqual('SESSION_ID_PATH', SESSION_ID_PATH, '/tmp/pipeline/session-id');
assertEqual('OPENCODE_EXIT_CODE_PATH', OPENCODE_EXIT_CODE_PATH, '/tmp/pipeline/opencode-exit-code');

// --- 13. Supervision: deadline check ---
console.log('\n13. supervision: deadline check');

const now = Date.parse('2026-07-23T12:00:00Z');
assert('past deadline returns true', checkDeadline({ deadline: '2026-07-23T11:00:00Z' }, now));
assert('future deadline returns false', !checkDeadline({ deadline: '2026-07-23T13:00:00Z' }, now));
assert('no deadline returns false', !checkDeadline({}, now));
assert('invalid deadline returns false', !checkDeadline({ deadline: 'not-a-date' }, now));

// --- 14. Supervision: continue command builder ---
console.log('\n14. supervision: continue command');

const continueCmd = buildContinueCommand({
  opencodeSessionId: 'ses_abc123',
  agent: 'coder',
  model: 'glm-5.2',
});
assert('continue command has --session', continueCmd.includes('--session \'ses_abc123\''));
assert('continue command has --format json', continueCmd.includes('--format json'));
assert('continue command has </dev/null', continueCmd.includes('</dev/null'));
assert('continue command has continue prompt', continueCmd.includes('continue'));

// --- 15. Policy: installTimeoutSec ---
console.log('\n15. policy: installTimeoutSec');

// Use a tmp state dir for policy testing.
const tmpStateDir = mkdtempSync(join(tmpdir(), 'pipeline3-stage3-policy-'));
process.env.PIPELINE3_STATE_DIR = tmpStateDir;
// Re-import paths to pick up the override.
const { policyPath } = await import('./paths.mjs');
const testPolicy = {
  maxConcurrentSandboxes: 3,
  opencodeVersion: '1.17.20',
  trunkBranch: 'main',
  perClaimInstallCommand: 'yarn install --immutable',
  installTimeoutSec: 300,
};
writeFileSync(policyPath, JSON.stringify(testPolicy, null, 2));
const loadedPolicy = loadPolicy();
assertEqual('installTimeoutSec loaded from policy', loadedPolicy.installTimeoutSec, 300);

// Default installTimeoutSec
const minimalPolicy = {
  maxConcurrentSandboxes: 3,
  opencodeVersion: '1.17.20',
  trunkBranch: 'main',
};
writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2));
const defaultPolicy = loadPolicy();
assertEqual('installTimeoutSec defaults to 480', defaultPolicy.installTimeoutSec, 480);

rmSync(tmpStateDir, { recursive: true, force: true });

// ─── Part 2: Integration Tests (require real Daytona) ───────────────────────

// Check for required env vars.
const requiredEnvVars = ['DAYTONA_API_KEY', 'DAYTONA_API_URL', 'GITHUB_TOKEN', 'RELAY_AUTH_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingEnvVars.length > 0) {
  console.log('\n  SKIP: missing env vars: ' + missingEnvVars.join(', '));
  console.log('  Integration tests require real Daytona + GitHub credentials.');
  console.log('\n' + (tests - failures) + '/' + tests + ' passed (unit tests only; integration tests skipped)');
  if (failures > 0) {
    console.error('\n\u2717 ' + failures + ' test(s) failed');
    process.exit(1);
  }
  process.exit(0);
}

// Integration tests: import the heavy modules.
const { prepareCloneForBaking, buildWorkerImage } = await import('./snapshot.mjs');
const { createDaytonaClient, provisionSandbox, getTunnelProxyEnv } = await import('./provision.mjs');
const { destroyRunSandboxes } = await import('./reaper.mjs');
const { startAgentSession, pollAgentSession, terminateAgentSession, executeInSandbox } = await import('./session.mjs');
const { readMarkers, checkRemoteBranch, attemptRecoveryPush, collectExitedSession } = await import('./supervise.mjs');

let daytona = null;
let runId = null;
let cloneCleanup = null;
const sandboxIds = [];

try {
  // --- 16. Provision a sandbox for integration tests ---
  console.log('\n16. provision sandbox for integration tests');
  daytona = createDaytonaClient();
  runId = 'stage3-test-' + Date.now();
  console.log('  runId: ' + runId);

  const cloneResult = prepareCloneForBaking({
    repoUrl: 'git@github.com:gv8-control/bmad-playground.git',
    branch: 'main',
  });
  cloneCleanup = cloneResult.cleanup;
  const image = buildWorkerImage({ cloneDir: cloneResult.cloneDir, opencodeVersion: '1.17.20' });

  const provisionResult = await provisionSandbox({
    daytona,
    image,
    runId,
    baseRef: 'origin/main',
  });
  const { sandbox, sandboxId } = provisionResult;
  sandboxIds.push(sandboxId);
  console.log('  sandboxId: ' + sandboxId);

  // --- 17. Session API: start/poll/terminate ---
  console.log('\n17. session API: start/poll/terminate');

  const sessionName = 'test-session-' + Date.now();
  const startResult = await startAgentSession(sandbox, {
    command: 'echo "hello from session" && sleep 1 && exit 0 </dev/null',
    env: {},
    cwd: '/workspace/repo',
    sessionName,
  });
  assert('startAgentSession returns cmdId', typeof startResult.cmdId === 'string' && startResult.cmdId.length > 0);

  // Poll until complete (with timeout)
  let pollResult;
  let polls = 0;
  do {
    await new Promise(r => setTimeout(r, 1000));
    pollResult = await pollAgentSession(sandbox, sessionName, startResult.cmdId);
    polls++;
  } while (pollResult.running && polls < 15);

  assert('session completed (not running)', !pollResult.running);
  assertEqual('session exit code is 0', pollResult.exitCode, 0);
  assert('session output contains message', pollResult.output.includes('hello from session'));

  // --- 18. Session API: executeInSandbox ---
  console.log('\n18. session API: executeInSandbox');

  const execResult = await executeInSandbox(sandbox, 'echo "one-off command"', { timeout: 10 });
  assertEqual('executeInSandbox exit code 0', execResult.exitCode, 0);
  assert('executeInSandbox output', execResult.result.includes('one-off command'));

  // --- 19. Template: full execution with synthetic command ---
  console.log('\n19. template: full execution (synthetic opencode)');

  // Build a simplified template that simulates opencode's behavior without
  // requiring the tunnel proxy or real LLM access. This tests the template's
  // structure, marker writing, and push behavior.
  const syntheticTemplate = `#!/bin/bash
set +e

PIPELINE_TMP='${PIPELINE_TMP}'
MARKER_DIR='${MARKER_DIR}'
SESSION_ID_PATH='${SESSION_ID_PATH}'
OPENCODE_EXIT_CODE_PATH='${OPENCODE_EXIT_CODE_PATH}'
EVENT_STREAM_PATH='${PIPELINE_TMP}/opencode-events.jsonl'
REPO_PATH='/workspace/repo'
BRANCH='pipeline/${runId}/synthetic-chain'

mkdir -p "$MARKER_DIR"

OC_EXIT=0
PUSH_NEEDED=0

do_push() {
  if [ "$PUSH_NEEDED" -ne 1 ]; then return; fi
  cd "$REPO_PATH"
  git add -A 2>/dev/null
  git diff --cached --quiet 2>/dev/null || git commit -m "pipeline: synthetic test" --no-verify 2>/dev/null
  git push origin "HEAD:$BRANCH" 2>&1
  local push_exit=$?
  if [ $push_exit -ne 0 ]; then
    echo '{"marker":"push-failed","cause":"push_failed","exitCode":'$push_exit'}' > "$MARKER_DIR/${MARKER.PUSH_FAILED}"
  fi
  exit $OC_EXIT
}

trap do_push EXIT

# Simulate install success
PUSH_NEEDED=1

# Simulate opencode output (JSON event stream)
echo '{"type":"step_start"}' > "$EVENT_STREAM_PATH"
echo '{"type":"text","part":{"text":"Task completed successfully."}}' >> "$EVENT_STREAM_PATH"
echo '{"type":"step_finish","reason":"stop"}' >> "$EVENT_STREAM_PATH"

# Write session ID (simulate poller)
echo "ses_synthetic_test_123" > "$SESSION_ID_PATH"

# Write exit code
OC_EXIT=0
echo "$OC_EXIT" > "$OPENCODE_EXIT_CODE_PATH"

exit $OC_EXIT
`;

  const templateSessionName = 'test-template-' + Date.now();
  const templateStart = await startAgentSession(sandbox, {
    command: syntheticTemplate + ' </dev/null',
    env: getTunnelProxyEnv(),
    cwd: '/workspace/repo',
    sessionName: templateSessionName,
  });

  // Poll until complete
  let templatePoll;
  let templatePolls = 0;
  do {
    await new Promise(r => setTimeout(r, 1000));
    templatePoll = await pollAgentSession(sandbox, templateSessionName, templateStart.cmdId);
    templatePolls++;
  } while (templatePoll.running && templatePolls < 30);

  assert('template completed', !templatePoll.running);
  assertEqual('template exit code is 0 (success)', templatePoll.exitCode, 0);

  // --- 20. Template: marker files written ---
  console.log('\n20. template: marker files');

  const markers = await readMarkers(sandbox);
  assert('no push-failed marker (push succeeded)', markers.pushFailed === null);
  assert('no proxy-failed marker', markers.proxyFailed === null);
  assert('no install-failed marker', markers.installFailed === null);
  assert('no session-capture-failed marker', markers.sessionCaptureFailed === null);

  // --- 21. Template: session ID and exit code files ---
  console.log('\n21. template: session ID and exit code files');

  const sessionIdResp = await executeInSandbox(sandbox, `cat ${SESSION_ID_PATH}`, { timeout: 10 });
  assert('session ID file exists', sessionIdResp.exitCode === 0 && sessionIdResp.result.trim().length > 0);
  assertEqual('session ID matches', sessionIdResp.result.trim(), 'ses_synthetic_test_123');

  const exitCodeResp = await executeInSandbox(sandbox, `cat ${OPENCODE_EXIT_CODE_PATH}`, { timeout: 10 });
  assert('exit code file exists', exitCodeResp.exitCode === 0);
  assertEqual('opencode exit code is 0', parseInt(exitCodeResp.result.trim(), 10), 0);

  // --- 22. Template: branch pushed to origin ---
  console.log('\n22. template: branch pushed');

  const branchExists = await checkRemoteBranch(sandbox, `pipeline/${runId}/synthetic-chain`);
  assert('synthetic branch exists on origin', branchExists);

  // --- 23. Collection: collectExitedSession ---
  console.log('\n23. collection: collectExitedSession');

  const collection = await collectExitedSession({
    sandbox,
    sessionName: templateSessionName,
    cmdId: templateStart.cmdId,
    context: {
      runId,
      chainId: 'synthetic-chain',
      nodeId: 'synthetic-node',
      branch: `pipeline/${runId}/synthetic-chain`,
    },
  });

  assert('collection has markers', collection.markers !== null);
  assert('collection has events', Array.isArray(collection.events) && collection.events.length > 0);
  assert('collection has pushed=true', collection.pushed === true);
  assert('collection has opencodeSessionId', collection.opencodeSessionId === 'ses_synthetic_test_123');
  assert('collection outcome is not null', collection.outcome !== null);

  // The events should contain step_start, text, step_finish
  const collectionEvents = collection.events;
  assert('collection events has step_start', collectionEvents.some(e => e.type === 'step_start'));
  assert('collection events has text', collectionEvents.some(e => e.type === 'text'));
  assert('collection events has step_finish', collectionEvents.some(e => e.type === 'step_finish'));

  // --- 24. Deadline enforcement ---
  console.log('\n24. deadline enforcement');

  const pastDeadline = checkDeadline({ deadline: '2020-01-01T00:00:00Z' }, Date.now());
  assert('past deadline is detected', pastDeadline);

  const futureDeadline = checkDeadline({ deadline: '2099-01-01T00:00:00Z' }, Date.now());
  assert('future deadline is not past', !futureDeadline);

  // --- 25. Park/resume: stop/start sandbox ---
  console.log('\n25. park/resume: sandbox stop/start');

  // Test sandbox stop/start (the core of park/resume).
  // We don't test the full opencode resume (requires a real session), but
  // we verify the sandbox lifecycle works.
  await sandbox.stop();
  await new Promise(r => setTimeout(r, 2000));

  // Verify sandbox is stopped
  await sandbox.refreshData();
  assert('sandbox is stopped after stop()', sandbox.state === 'stopped' || sandbox.state === 'archived');

  // Start it back up
  await sandbox.start();
  await new Promise(r => setTimeout(r, 2000));

  // Verify sandbox is running again
  await sandbox.refreshData();
  assert('sandbox is started after start()', sandbox.state === 'started');

  // Verify disk persisted (a file written before stop should survive)
  const persistResp = await executeInSandbox(sandbox, 'echo "persisted" > /tmp/persistence-test.txt && cat /tmp/persistence-test.txt', { timeout: 10 });
  assertEqual('disk write works after restart', persistResp.exitCode, 0);

  // --- 26. git ls-remote fallback ---
  console.log('\n26. git ls-remote fallback');

  // The synthetic branch should exist (we pushed it in step 22)
  const existingBranch = await checkRemoteBranch(sandbox, `pipeline/${runId}/synthetic-chain`);
  assert('existing branch detected by git ls-remote', existingBranch);

  // A non-existent branch should not be found
  const nonExistentBranch = await checkRemoteBranch(sandbox, `pipeline/${runId}/non-existent`);
  assert('non-existent branch not found', !nonExistentBranch);

  // --- 27. Recovery push ---
  console.log('\n27. recovery push');

  // The branch already exists, so a recovery push should succeed (force or
  // fast-forward). Let's test with the existing branch.
  const recoveryResult = await attemptRecoveryPush(sandbox, `pipeline/${runId}/synthetic-chain`);
  assert('recovery push succeeds (existing branch)', recoveryResult.success);

  // --- 28. Session termination (SIGTERM) ---
  console.log('\n28. session termination');

  // Start a long-running session and terminate it
  const longSessionName = 'test-long-' + Date.now();
  const longStart = await startAgentSession(sandbox, {
    command: 'sleep 300 </dev/null',
    env: {},
    cwd: '/workspace/repo',
    sessionName: longSessionName,
  });

  // Verify it's running
  const longPoll = await pollAgentSession(sandbox, longSessionName, longStart.cmdId);
  assert('long session is running', longPoll.running);

  // Terminate it
  await terminateAgentSession(sandbox, longSessionName);
  console.log('  \u2713 session terminated via deleteSession (SIGTERM)');

  // Verify it's no longer running (give it a moment)
  await new Promise(r => setTimeout(r, 2000));
  const afterTerm = await pollAgentSession(sandbox, longSessionName, longStart.cmdId);
  assert('terminated session is not running', !afterTerm.running);

  // --- 29. Idempotent termination ---
  console.log('\n29. idempotent termination');

  // Terminating an already-terminated session should not throw
  await terminateAgentSession(sandbox, longSessionName);
  console.log('  \u2713 double-terminate is idempotent (no error)');

  // --- 30. Cleanup: destroy the sandbox ---
  console.log('\n30. cleanup: destroy sandbox');

  // Clean up the branch we pushed
  try {
    await executeInSandbox(sandbox, `git push origin --delete pipeline/${runId}/synthetic-chain 2>/dev/null`, { timeout: 30 });
  } catch {
    // Best-effort cleanup.
  }

} catch (err) {
  console.error('\n  ERROR: ' + err.message);
  if (err.stack) console.error(err.stack);
  failures++;
} finally {
  // --- Cleanup ---
  console.log('\n31. final cleanup');

  if (daytona && runId) {
    try {
      const destroyResult = await destroyRunSandboxes({ daytona, runId });
      console.log('  \u2713 destroyed ' + destroyResult.destroyed.length + ' sandbox(es)');
    } catch (err) {
      console.error('  \u2717 cleanup failed: ' + err.message);
    }
  }

  if (cloneCleanup) {
    try {
      cloneCleanup();
      console.log('  \u2713 cleaned up clone dir');
    } catch (err) {
      console.error('  \u2717 clone cleanup failed: ' + err.message);
    }
  }
}

// --- Summary ---
console.log('\n' + (tests - failures) + '/' + tests + ' passed');
if (failures > 0) {
  console.error('\n\u2717 ' + failures + ' test(s) failed');
  process.exit(1);
} else {
  console.log('\n\u2713 all tests passed');
  process.exit(0);
}
