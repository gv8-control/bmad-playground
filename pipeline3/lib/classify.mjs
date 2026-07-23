// Outcome classification for exited opencode agent sessions.
//
// The gen-3 pipeline runs an opencode agent inside a sandboxed template
// process. When that process exits, the pass must decide what *kind* of exit
// happened before it can pick the next graph transition. This module produces
// that decision: one of COMPLETE, QUESTION, FAILED, INCOMPLETE, or UNKNOWN.
//
// Classification is a two-tier system:
//
//   1. Deterministic rules run first, against the JSON event stream
//      (opencode run --format json), the opencode raw exit code, and the
//      optional session export (opencode export). These rules catch the
//      machinery-level signals: stream truncation, provider errors, missing
//      output, non-zero exits with completed work.
//   2. If no deterministic rule fires, the agent's response text is sent to
//      the neuralwatt LLM with the gen-2 "BMAD Outcome" prompt, which decides
//      COMPLETE vs QUESTION. The LLM does not make stream-truncation calls in
//      gen-3 — if it returns INCOMPLETE, that is treated as UNKNOWN.
//
// The LLM call runs on the devcontainer (not in a sandbox), so it reaches
// api.neuralwatt.com directly — no tunnel proxy. A 15-second timeout parks
// the session as UNKNOWN for human review rather than blocking the pass.
//
// References:
//   - graph-pipeline.md, Supervision section (gen-3 refinements)
//   - spike-midstream-resume.md (two-signal truncation check)
//   - gen-2 "BMAD Outcome" n8n workflow (LLM prompt)

/**
 * The set of valid gen-3 classification outcomes.
 *
 * COMPLETE   — the agent finished its task successfully.
 * QUESTION   — the agent is blocked on a human decision before proceeding.
 * FAILED     — the agent ran and produced output, but exited non-zero.
 * INCOMPLETE — the session was truncated (stream kill, provider error).
 * UNKNOWN    — could not classify; park for human review.
 */
export const OUTCOMES = Object.freeze({
  COMPLETE: 'COMPLETE',
  QUESTION: 'QUESTION',
  FAILED: 'FAILED',
  INCOMPLETE: 'INCOMPLETE',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Thrown when the LLM call fails in a way the caller may want to distinguish
 * from a generic error (e.g. to retry vs park). Currently the public
 * classifyWithLLM swallows errors and returns UNKNOWN, so this class is
 * reserved for callers that want to surface the underlying failure.
 */
export class ClassificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClassificationError';
  }
}

/**
 * Parse the newline-delimited JSON event stream from `opencode run --format json`.
 *
 * Each non-empty line is parsed as JSON. Malformed lines are skipped (not
 * thrown) — opencode's stream is append-only and a single bad line must not
 * invalidate the whole classification. Returns only the successfully parsed
 * events, in stream order.
 *
 * @param {string} stdout - The raw stdout from the session command.
 * @returns {Array<{ type: string, ... }>} The parsed events.
 */
export function parseJsonEvents(stdout) {
  if (stdout === null || stdout === undefined) return [];
  const text = typeof stdout === 'string' ? stdout : String(stdout);
  const events = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines — the stream can gain a bad line but the
      // classifier must not crash on it.
    }
  }
  return events;
}

/**
 * Extract the agent's response text from the event stream.
 *
 * Collects every `text` event's `part.text` field and concatenates them in
 * stream order. Returns an empty string if there are no text events.
 *
 * @param {Array<{ type: string, part?: { text?: string } }>} events
 * @returns {string} The full response text.
 */
export function extractResponseText(events) {
  if (!Array.isArray(events)) return '';
  let out = '';
  for (const ev of events) {
    if (ev && ev.type === 'text' && ev.part && typeof ev.part.text === 'string') {
      out += ev.part.text;
    }
  }
  return out;
}

/**
 * Returns true if any event has `type === 'step_finish'`.
 *
 * A `step_finish` event signals that the LLM turn completed cleanly (with a
 * stop reason, cost, and token counts). Its absence is the primary
 * stream-truncation signal.
 *
 * @param {Array<{ type: string }>} events
 * @returns {boolean}
 */
export function hasStepFinish(events) {
  if (!Array.isArray(events)) return false;
  return events.some((ev) => ev && ev.type === 'step_finish');
}

/**
 * Returns true if any event has `type === 'error'`.
 *
 * An `error` event is emitted on provider/session errors (rate limits,
 * auth failures, upstream 5xx). Its presence is a provider-error signal.
 *
 * @param {Array<{ type: string }>} events
 * @returns {boolean}
 */
export function hasErrorEvent(events) {
  if (!Array.isArray(events)) return false;
  return events.some((ev) => ev && ev.type === 'error');
}

/**
 * Returns true if any event has `type === 'text'`.
 *
 * Text events carry the agent's visible response segments. Their absence
 * means the agent produced no user-facing output.
 *
 * @param {Array<{ type: string }>} events
 * @returns {boolean}
 */
export function hasTextEvents(events) {
  if (!Array.isArray(events)) return false;
  return events.some((ev) => ev && ev.type === 'text');
}

/**
 * Find the last assistant message in a parsed `opencode export` payload.
 *
 * The export is an object with a `messages` array. Each message has a `role`
 * and a `time` object whose `completed` field is set when the message was
 * fully written. Returns null if there are no assistant messages.
 *
 * @param {{ messages?: Array<{ role?: string, time?: { completed?: string | null } }> } | null | undefined} sessionExport
 * @returns {{ role?: string, time?: { completed?: string | null } } | null}
 */
function lastAssistantMessage(sessionExport) {
  if (!sessionExport || !Array.isArray(sessionExport.messages)) return null;
  for (let i = sessionExport.messages.length - 1; i >= 0; i--) {
    const msg = sessionExport.messages[i];
    if (msg && msg.role === 'assistant') return msg;
  }
  return null;
}

/**
 * Detect stream truncation using the two-signal check from
 * spike-midstream-resume.md.
 *
 * A session is stream-truncated (INCOMPLETE recovery path) when:
 *
 *   1. The opencode process was killed or exited without finishing its step:
 *        - exit code is non-zero (143 = SIGTERM, 137 = SIGKILL, or any other
 *          non-zero), OR
 *        - exit code is 0 but no `step_finish` event was emitted (the step
 *          never completed cleanly), AND
 *   2. (when sessionExport is provided) the last assistant message has
 *      `time.completed` unset — the message was never fully written, OR
 *   3. an `error` event is present in the stream (provider error).
 *
 * Signal 3 is independent: a provider error is always INCOMPLETE regardless
 * of exit code. Signals 1+2 require both halves (process-level kill AND
 * unfinished message) when the export is available; without the export only
 * the process-level signal is checked.
 *
 * @param {Object} params
 * @param {Array<{ type: string }>} params.events - Parsed JSON events array.
 * @param {number} params.exitCode - The opencode process exit code.
 * @param {{ messages?: Array<{ role?: string, time?: { completed?: string | null } }> } | null | undefined} [params.sessionExport]
 * @returns {boolean} True if this is a stream truncation.
 */
export function detectStreamTruncation({ events, exitCode, sessionExport }) {
  // Signal 3: provider error — independent of exit code and session export.
  // An error event in the stream is always a provider error (INCOMPLETE),
  // regardless of whether we have the session export to check message state.
  if (hasErrorEvent(events)) return true;

  // Signals 1+2: the two-signal check from spike-midstream-resume.md.
  // Both the process signal AND the incomplete-message check are required.
  // Without the session export, we cannot confirm the message was incomplete,
  // so we do not classify as truncation based on the process signal alone —
  // only error events (above) trigger INCOMPLETE without the export.
  //
  // In practice, the pass always has the session export available (it pulls
  // the transcript via `opencode export` before classification). The
  // sessionExport parameter is optional only for testing and for the
  // defensive case where the transcript pull fails.
  if (sessionExport === undefined || sessionExport === null) {
    return false;
  }

  // Signal 1: process-level kill or step-never-finished.
  const nonZeroExit = exitCode !== 0;
  const zeroExitNoFinish = exitCode === 0 && !hasStepFinish(events);
  const processSignal = nonZeroExit || zeroExitNoFinish;

  if (!processSignal) return false;

  // Signal 2: the last assistant message must be unfinished.
  const last = lastAssistantMessage(sessionExport);
  if (last === null) {
    // No assistant message at all — treat as truncated (the process signal
    // already fired and there is no completed message to contradict it).
    return true;
  }
  const completed = last.time && last.time.completed;
  return !completed;
}

/**
 * Run the deterministic classification rules.
 *
 * Returns a result object when a deterministic rule fires, or `null` when
 * the outcome should fall through to the LLM (COMPLETE vs QUESTION).
 *
 * Rule order (first match wins):
 *   1. detectStreamTruncation → INCOMPLETE (error event, or two-signal check
 *      with session export — conservative without export: only error events)
 *   2. no `step_finish` AND no `text` events → UNKNOWN (machinery failure)
 *   3. exitCode !== 0 AND hasStepFinish → FAILED (agent ran, completed, failed)
 *   4. otherwise → null (LLM fallback)
 *
 * Rule 1 is checked first because detectStreamTruncation is conservative:
 * without a session export, it only fires on error events (provider errors).
 * With a session export, the two-signal check (process signal AND incomplete
 * message) is specific enough to not catch FAILED or UNKNOWN cases.
 *
 * @param {Object} params
 * @param {Array<{ type: string }>} params.events
 * @param {number} params.exitCode - opencode's raw exit code
 * @param {{ messages?: Array<{ role?: string, time?: { completed?: string | null } }> } | null | undefined} [params.sessionExport]
 * @returns {{ outcome: string, response: string, evidence: string } | null}
 */
export function classifyDeterministic({ events, exitCode, sessionExport }) {
  const response = extractResponseText(events);
  const stepFinish = hasStepFinish(events);
  const textEvents = hasTextEvents(events);
  const errorEvent = hasErrorEvent(events);

  // Rule 1: stream truncation (provider error, signal kill, unfinished step).
  // detectStreamTruncation is conservative: without a session export, it
  // only fires on error events. With a session export, the two-signal check
  // (process signal AND incomplete message) is specific enough to not catch
  // FAILED or UNKNOWN cases.
  if (detectStreamTruncation({ events, exitCode, sessionExport })) {
    let timeCompleted = 'n/a';
    if (sessionExport) {
      const last = lastAssistantMessage(sessionExport);
      timeCompleted = last && last.time ? Boolean(last.time.completed) : 'no-assistant-message';
    }
    return {
      outcome: OUTCOMES.INCOMPLETE,
      response,
      evidence:
        `stream-truncation: exitCode=${exitCode}, step_finish=${stepFinish}, ` +
        `error_event=${errorEvent}, time_completed=${timeCompleted}`,
    };
  }

  // Rule 2: no step_finish and no text events — the agent produced nothing.
  // This is a machinery failure, not a stream truncation (rule 1 would have
  // caught truncation cases).
  if (!stepFinish && !textEvents) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      response: '',
      evidence: 'no step_finish and no text events — machinery failure',
    };
  }

  // Rule 3: non-zero exit with a completed step_finish — the agent ran and
  // produced output, then failed. A real failure, not a stream truncation.
  if (exitCode !== 0 && stepFinish) {
    return {
      outcome: OUTCOMES.FAILED,
      response,
      evidence: `exit code ${exitCode} with completed step_finish — agent failure`,
    };
  }

  // Rule 4: fall through to LLM.
  return null;
}

/**
 * The gen-2 "BMAD Outcome" classification prompt, ported verbatim in
 * structure. gen-3 only honours COMPLETE and QUESTION from the LLM; an
 * INCOMPLETE response is treated as UNKNOWN (the LLM should not be making
 * stream-truncation calls — that is a deterministic signal).
 *
 * @param {string} response - The agent's response text.
 * @returns {string} The full prompt.
 */
function buildClassificationPrompt(response) {
  return (
    `--- Start Input ---\n${response}\n--- End Input ---\n\n` +
    'Task: evaluate the message. Respond only with the classifier that you chose.\n' +
    'IF it:\n' +
    '  - asks for input before proceeding\n' +
    '  - reports an error\n' +
    '  - indicates that work should not proceed before addressing important issues\n' +
    'THEN respond only with QUESTION;\n' +
    'IF it:\n' +
    '  - confirms a successful operation\n' +
    '  - indicates only minor issues and does not indicate critical issues\n' +
    '  - politely asks for next steps following successful completion\n' +
    'THEN respond only with COMPLETE;\n' +
    'IF it:\n' +
    '  - is a partial or truncated response\n' +
    '  - is mid-thought text where work was interrupted\n' +
    '  - indicates work was interrupted but no question is asked\n' +
    'THEN respond only with INCOMPLETE;\n\n' +
    'Examples:\n' +
    "- 'what task do you want to do next?' -> COMPLETE\n" +
    "- 'do you want to solve these issues move onto next task?' -> QUESTION\n" +
    "- 'Now I will implement the' -> INCOMPLETE\n\n" +
    'Output: Respond with only the word COMPLETE, QUESTION, or INCOMPLETE. ' +
    'No quotes, no punctuation, no other text.'
  );
}

/**
 * Normalise the LLM's raw text response into a single uppercase word.
 *
 * Strips quotes, punctuation, and surrounding whitespace. The LLM is told to
 * return one bare word, but we defend against the usual drift ("COMPLETE.",
 * '"COMPLETE"', "COMPLETE\n", etc.).
 *
 * @param {string} raw
 * @returns {string}
 */
function normaliseLLMResponse(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^["'`]+|["'`.]+$/g, '')
    .replace(/[.!,;:?]+$/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Call the neuralwatt LLM with the classification prompt.
 *
 * Uses the OpenAI-compatible chat completions API at
 * https://api.neuralwatt.com/v1/chat/completions with model `glm-5.2`,
 * temperature 0, and a 10-token cap (we only need one word). The call has a
 * 15-second timeout — on timeout or any other error the session is parked as
 * UNKNOWN for human review rather than blocking the pass.
 *
 * gen-3 only honours COMPLETE and QUESTION from the LLM. If the LLM returns
 * INCOMPLETE (or anything else), the outcome is UNKNOWN — stream-truncation
 * is a deterministic signal, not an LLM judgement.
 *
 * @param {Object} params
 * @param {string} params.response - The agent's response text.
 * @param {string} [params.apiKey] - Defaults to process.env.NEURALWATT_API_KEY.
 * @returns {Promise<{ outcome: string, rationale: string }>}
 */
export async function classifyWithLLM({ response, apiKey } = {}) {
  const key = apiKey ?? process.env.NEURALWATT_API_KEY;
  if (!key) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      rationale: 'LLM call failed: NEURALWATT_API_KEY not set',
    };
  }

  const url = 'https://api.neuralwatt.com/v1/chat/completions';
  const body = JSON.stringify({
    model: 'glm-5.2',
    temperature: 0,
    max_tokens: 10,
    messages: [
      { role: 'system', content: 'You are a classification assistant. Respond with only one word.' },
      { role: 'user', content: buildClassificationPrompt(response) },
    ],
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout (15s)' : String(err?.message || err);
    return {
      outcome: OUTCOMES.UNKNOWN,
      rationale: `LLM call failed: ${reason}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      rationale: `LLM call failed: HTTP ${res.status} ${res.statusText}`,
    };
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      rationale: `LLM call failed: unparseable response body (${String(err?.message || err)})`,
    };
  }

  const raw = payload?.choices?.[0]?.message?.content ?? '';
  const verdict = normaliseLLMResponse(raw);

  if (verdict === OUTCOMES.COMPLETE) {
    return { outcome: OUTCOMES.COMPLETE, rationale: `LLM verdict: COMPLETE` };
  }
  if (verdict === OUTCOMES.QUESTION) {
    return { outcome: OUTCOMES.QUESTION, rationale: `LLM verdict: QUESTION` };
  }
  if (verdict === OUTCOMES.INCOMPLETE) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      rationale: 'LLM returned INCOMPLETE — not a valid gen-3 outcome',
    };
  }
  return {
    outcome: OUTCOMES.UNKNOWN,
    rationale: `LLM returned unrecognised verdict: ${JSON.stringify(raw)}`,
  };
}

/**
 * The main entry point. Classify an exited opencode session.
 *
 * The pass reads infra-failure markers (proxy-failed, install-failed,
 * session-capture-failed) before calling this function; those are handled
 * directly by the pass. This function is called only when no infra marker
 * exists — the session ran and exited.
 *
 * Two exit codes are involved:
 *   - `opencodeExitCode` — opencode's raw exit code (read from
 *     /tmp/pipeline/opencode-exit-code). Used by the deterministic rules.
 *   - `templateExitCode` — the template wrapper's process exit code
 *     (0=success, 1=agent failure, 2=push failed, 10=install, 20=proxy,
 *     66/67=session-capture). The pass normally handles 10/20/66/67 via
 *     markers before reaching here; if one slips through, it is mapped to
 *     UNKNOWN with evidence noting the infra exit code.
 *
 * Classification order:
 *   1. Infra exit codes (10/20/66/67) → UNKNOWN (defensive; markers should
 *      have caught these first).
 *   2. Deterministic rules (stream truncation, no output, non-zero exit with
 *      completed work) → INCOMPLETE / UNKNOWN / FAILED.
 *   3. LLM fallback → COMPLETE / QUESTION (or UNKNOWN on timeout/error).
 *
 * @param {Object} params
 * @param {Array<{ type: string }>} params.events - Pre-parsed JSON events.
 * @param {number} params.opencodeExitCode - opencode's raw exit code.
 * @param {number} params.templateExitCode - The template wrapper's exit code.
 * @param {{ messages?: Array<{ role?: string, time?: { completed?: string | null } }> } | null | undefined} [params.sessionExport]
 * @param {string} [params.apiKey] - neuralwatt API key.
 * @returns {Promise<{ outcome: string, response: string, evidence: string, classificationFallback: boolean }>}
 */
export async function classifyOutcome({
  events,
  opencodeExitCode,
  templateExitCode,
  sessionExport,
  apiKey,
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  const response = extractResponseText(safeEvents);

  // 1. Defensive: infra exit codes that should have been caught by markers.
  // If they reach here, park as UNKNOWN rather than guessing.
  if (templateExitCode === 10) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      response,
      evidence: 'install failure (template exit 10) — no marker found',
      classificationFallback: false,
    };
  }
  if (templateExitCode === 20) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      response,
      evidence: 'proxy failure (template exit 20) — no marker found',
      classificationFallback: false,
    };
  }
  if (templateExitCode === 66 || templateExitCode === 67) {
    return {
      outcome: OUTCOMES.UNKNOWN,
      response,
      evidence: `session-capture failure (template exit ${templateExitCode}) — no marker found`,
      classificationFallback: false,
    };
  }

  // 2. Deterministic rules.
  const det = classifyDeterministic({
    events: safeEvents,
    exitCode: opencodeExitCode,
    sessionExport,
  });
  if (det !== null) {
    return {
      outcome: det.outcome,
      response: det.response,
      evidence: det.evidence,
      classificationFallback: false,
    };
  }

  // 3. LLM fallback for COMPLETE vs QUESTION.
  // templateExitCode 2 (push failed) still classifies the outcome normally —
  // the work was done, the push is handled separately by the pass.
  const llm = await classifyWithLLM({ response, apiKey });
  return {
    outcome: llm.outcome,
    response,
    evidence: llm.rationale,
    classificationFallback: true,
  };
}
