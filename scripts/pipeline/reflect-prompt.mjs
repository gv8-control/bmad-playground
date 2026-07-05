// Build the post-story reflection prompt. The 'Develop Epic' loop feeds this
// to a reflector agent run after every story; the agent writes a proposal file
// that apply-amendments.mjs validates deterministically. Keeping the prompt here
// (not in an n8n node) makes it reviewable and versionable with the process.
//
// The agent's system prompt (.opencode/agent/reflector.md) defines the forensic
// methodology: evidence grading (confirmed/deduced/hypothesized), signal-vs-noise
// stance, hypothesis discipline, "follow evidence into actual artifacts", and the
// autonomy boundary (never self-mend machinery, never widen own authority). This
// prompt defines the per-run task: which story, which evidence sources, which
// output schema, which amendment rules. Don't duplicate methodology here.
//
//   node scripts/pipeline/reflect-prompt.mjs <story-id> <run-id>
import { fail } from './lib.mjs';

const story = (process.argv[2] ?? '').trim();
const runId = (process.argv[3] ?? '').trim();
if (!story || !runId) fail('Usage: reflect-prompt.mjs <story-id> <run-id>');

const prompt = `Story ${story} just finished a full playbook run (run id: ${runId}). Decide what, if anything, the pipeline should learn from this run.

Gather evidence first:
1. Run: node scripts/pipeline/journal.mjs story ${story}
2. Run: node scripts/pipeline/journal.mjs trends
3. Read: _bmad-output/pipeline/playbook.json (the step sequence and its policy)
4. Read the last ~30 lines of _bmad-output/pipeline/ledger.jsonl if it exists (previously recorded findings)
5. Read the last ~20 lines of _bmad-output/pipeline/runner-errors.jsonl if it exists (failures captured by the step runner: opencode errors, timeouts, terminated runs)
6. Run: node scripts/pipeline/trace-view.mjs ${runId} <stepId> for any step whose journal excerpt surfaces a candidate signal. Default view is cheap; widen on suspicion, not eagerly. Read docs/expanded-trace-plan/trace-view-usage.md for the flag reference and widening guidance.

Follow evidence into actual artifacts: when a journal responseExcerpt surfaces a candidate signal (a suspicious keyword, a contradiction, an unresolved deferral), read the actual artifact the step produced — story files under _bmad-output/implementation-artifacts/, test reports and ATDD checklists under _bmad-output/test-artifacts/, code-review findings in the story file's review section. Confirm before recording. The responseExcerpt is a pointer into the trace (and a fallback when no trace exists) — never the evidence itself. If trace-view reports no trace for a step (recording failure, schema change, pre-feature run), fall back to the journal excerpt + produced artifacts; do not treat a missing trace as a finding by itself. You can cite trace locations in observation evidence (e.g. traces/${runId}/<stepId>.json, message <msgId>).

Worked example — investigating a candidate signal with trace-view:
Suppose the journal excerpt for the review-tests step mentions "1 stale skip comment found." That is a candidate signal (transitional artifact). Investigate progressively:
1. Run: node scripts/pipeline/trace-view.mjs ${runId} review-tests
   Output ends with [view: default, 1 of 232 shown, 1703 bytes]. 1 of 232 means there is far more to read. The default view shows the agent's final message, which says "no action needed for this story" — but the journal said it found a stale skip comment. Widen.
2. Run: node scripts/pipeline/trace-view.mjs ${runId} review-tests --grep "skip"
   Returns matching lines with message IDs: msg_a1b2c3 part 2 L14: "1 stale skip comment found in agent.service.unit.spec.ts:14" and L15: "header claims tests are skipped but they are active." Now you have a message ID to resume from.
3. Run: node scripts/pipeline/trace-view.mjs ${runId} review-tests --from msg_a1b2c3
   Returns text parts from that message onward. You see the agent identified the stale header but concluded "not blocking — deferred." The step flagged the transitional artifact but did not resolve it.
4. The manifest shows this step had subagents. Run: node scripts/pipeline/trace-view.mjs ${runId} review-tests --subagents
   The child reviewer also flagged the stale header but did not fix it.
Record the finding with the trace pointer in evidence, and grade it:
{ "fingerprint": "stale-skip-headers-unresolved", "summary": "review-tests flags stale skip headers but does not fix them, leaving transitional artifacts that misrepresent test state", "evidence": "traces/${runId}/review-tests.json, message msg_a1b2c3 — agent identified stale skip comment in agent.service.unit.spec.ts:14 but concluded 'not blocking — deferred'; child subagent flagged the same header without fixing it", "grade": "confirmed" }
When you cannot fully confirm the cause from the available evidence, record a hypothesized observation with a nextStep that points at the trace location a future run should widen into. For example, if the default view shows a contradiction (agent claimed "No HALT needed" but the journal shows halts > 0), and you can see the mid-stream reasoning but not the tool calls that triggered the halt:
{ "fingerprint": "halt-mismatch-on-ac-contradiction", "summary": "agent concluded no halt was needed but the journal shows halts > 0 for this step", "evidence": "traces/${runId}/review-tests.json, message msg_d4e5f6 — final message says 'No HALT needed — covered by DP-2' but journal step_end shows halts: 1", "grade": "hypothesized", "hypothesis": "the decision the agent escalated may not actually be covered by DP-2 as claimed — the agent may have misapplied the policy rule", "nextStep": "widen into traces/${runId}/review-tests.json message msg_d4e5f6 with --include machinery to see the tool calls that led to the halt; cross-check the escalated decision against _bmad-output/decision-policy.md DP-2" }
A hypothesized observation with a trace pointer in nextStep accumulates toward confirmation across runs — a future reflector can follow that pointer directly instead of re-discovering the signal from scratch.

Base your judgment only on the evidence above — this run's journal, cross-run trends, the ledger, runner-errors, step traces (via trace-view), and the actual step artifacts you read to confirm a candidate signal. Do not pull findings from unrelated reports or past pipeline generations.

Then classify each finding:
- SIGNAL — systemic and likely to repeat on future stories (a step that consistently stalls, a class of defect the reviews keep catching late, a missing check that caused rework, a step that keeps halting for human input the decision policy should have covered).
- SIGNAL (transitional artifacts) — an artifact is left in a transitional state that a downstream step should have resolved but didn't — skipped tests, TODO markers, placeholder stubs, commented-out code, debug statements left in production paths. The step that created the transitional artifact is not at fault; the gap is the downstream review or verification step that should have treated the leftover as a failure and resolved it. When the same class of leftover recurs across stories, propose an update_step to make the downstream step hard-fail on that artifact type. To find these, scan the journal step_end responseExcerpts for keywords like "skip", "todo", "stub", "placeholder", "FIXME", "not implemented", "future work", "next step", "accepted gap" — then read the actual artifact to check whether a later step resolved them. If not, that is signal.
- INFRA — the machinery failed rather than the development process: opencode runner errors (timeouts, context-length or provider API errors, terminated runs), n8n plumbing failures. Record it as an observation with fingerprint prefix "infra-". Never propose an amendment for it — a playbook step cannot fix the machinery; recurring infra fingerprints are reviewed and fixed by a human.
- NOISE — specific to this story's content or already guarded by an existing step. Most findings are noise. Not every mistake is guaranteed to repeat; the deterministic policy will only add a guard step once the same fingerprint recurs across runs, so your job is honest recording, not eager fixing.
- AUTONOMY — the trends show steps with halts > 0 — the agent asked a human to make a decision instead of resolving it via _bmad-output/decision-policy.md. Examine the journal step_end responseExcerpt for those steps to understand what was escalated. If the same decision class recurs across runs, record it as a "decision-policy-candidate-*" observation. If a step's prompt could be tuned to reduce halts (e.g. by pointing it more explicitly at the decision policy), propose an update_step amendment. Fewer halts over time means the pipeline is becoming more autonomous.

Write EXACTLY one file: _bmad-output/pipeline/proposals/${runId}.json with this shape (all arrays may be empty; write the file even if everything is empty):
{
  "story": "${story}",
  "runId": "${runId}",
  "observations": [
    {
      "fingerprint": "<stable-kebab-case-id-for-this-class-of-finding>",
      "summary": "<one sentence>",
      "evidence": "<where you saw it — journal event, file path:line, ledger entry, runner-errors line>",
      "grade": "confirmed|deduced|hypothesized",
      "hypothesis": "<required if hypothesized: the suspected cause — omit or empty for confirmed/deduced>",
      "nextStep": "<required if hypothesized: what would confirm or refute this — omit or empty for confirmed/deduced>"
    }
  ],
  "amendments": [
    { "type": "add_step", "step": { "id": "<kebab-id>", "label": "<short label>", "skill": "<bmad-* skill>", "agent": "planner|coder", "prompt": "<initial prompt>" }, "position": { "before": "<existing-step-id>" } | { "after": "<existing-step-id>" }, "evidenceFingerprints": ["<fingerprint>"], "rationale": "<one sentence>" },
    { "type": "retire_step", "stepId": "<learned-step-id>", "rationale": "<one sentence>" },
    { "type": "update_step", "stepId": "<step-id>", "prompt": "<new prompt>", "rationale": "<one sentence>" }
  ],
  "guardReports": [
    { "stepId": "<learned-step-id>", "fired": true|false, "note": "<did this learned guard step catch anything real this run?>" }
  ]
}

Rules:
- Reuse an existing fingerprint from the ledger when the finding is the same class; invent a new one only for genuinely new classes.
- Grade every observation. Confirmed observations cite directly observed evidence. Deduced observations show the logical chain from confirmed evidence. Hypothesized observations state what would confirm or refute them — do not silently absorb uncertainty by recording nothing; a hypothesized observation with a nextStep accumulates toward confirmation across runs.
- Include a guardReports entry for EVERY step with "origin": "learned" in the playbook (there may be none).
- When a fingerprint recurs, identify which remedy or remedies the gap requires:
  - update_step — when an existing step's skill should have caught the gap but its prompt didn't activate that behavior. Understand the skill first to confirm its scope covers the gap. Reserve this for clear prompt improvements: tuning a core step's prompt is permanent (the machine cannot retire core steps).
  - add_step — when no existing step's skill covers the gap and a new guard is needed at a specific position. Understand the candidate skill first. Learned steps auto-retire after a clean streak, making them safer for experimental checks.
- A single gap may require both tuning an existing step's prompt AND adding a new guard step. Propose each as a separate amendment. Prefer recording an observation and waiting when unsure which remedy fits. If no existing bmad-* skill covers the gap, record an observation and let a human decide whether a new step (or a new skill) is warranted. Never propose retire_step or add_step positioned to replace a "core" step — core steps can be tuned but never removed by the machine.
- When writing the prompt for an add_step or update_step, never name code-specific identifiers or syntax (e.g. test.skip(), it.todo(), console.log(), print()). Express the behavior in plain terms instead — "skipped tests", "leftover debug statements". Prompts must state what the agent should do, not how a particular framework spells it, so they stay portable across languages and frameworks.
- Record runner/infrastructure failures as observations with fingerprint prefix "infra-" (e.g. "infra-context-overflow", "infra-opencode-timeout"). Never cite infra-* fingerprints as amendment evidence; the gatekeeper rejects them because machinery fixes are human-only.
- If the trends show haltsPerStory > 0 for this story, or halts > 0 for any step, examine the journal step_end responseExcerpt for those steps to understand what decisions were escalated to a human. If the same decision class recurs across runs, record it as an observation with fingerprint prefix "decision-policy-candidate-". If a step's prompt could be tuned to reduce halts (e.g. by pointing it more explicitly at the decision policy), propose an update_step amendment. Never propose decision-policy changes as amendments; only a human edits that policy.
- Do not edit playbook.json, ledger.jsonl, journal.jsonl, or any project file yourself. Your only write is the proposal file.

End your response with exactly: PROPOSAL WRITTEN`;

process.stdout.write(prompt + '\n');
