// Build the post-story reflection prompt. The 'Develop Epic' loop feeds this
// to an opencode run after every story; the agent writes a proposal file that
// apply-amendments.mjs validates deterministically. Keeping the prompt here
// (not in an n8n node) makes it reviewable and versionable with the process.
//
//   node scripts/pipeline/reflect-prompt.mjs <story-id> <run-id>
import { fail } from './lib.mjs';

const story = (process.argv[2] ?? '').trim();
const runId = (process.argv[3] ?? '').trim();
if (!story || !runId) fail('Usage: reflect-prompt.mjs <story-id> <run-id>');

const prompt = `You are the reflection step of an automated BMAD development pipeline. Story ${story} just finished a full playbook run (run id: ${runId}). Your job is to decide what, if anything, the pipeline should learn from this run.

Gather evidence first:
1. Run: node scripts/pipeline/journal.mjs story ${story}
2. Run: node scripts/pipeline/journal.mjs trends
3. Read: _bmad-output/pipeline/playbook.json (the step sequence and its policy)
4. Read the last ~30 lines of _bmad-output/pipeline/ledger.jsonl if it exists (previously recorded findings)
5. Read the last ~20 lines of _bmad-output/pipeline/runner-errors.jsonl if it exists (failures captured by the step runner: opencode errors, timeouts, terminated runs)

Base your judgment only on the evidence above — this run's journal, cross-run trends, and the ledger. Do not pull findings from unrelated reports or past pipeline generations.

Then judge signal versus noise:
- A finding is SIGNAL if it is systemic and likely to repeat on future stories (a step that consistently stalls, a class of defect the reviews keep catching late, a missing check that caused rework, a step that keeps halting for human input the decision policy should have covered).
- A finding is SIGNAL when an artifact is left in a transitional state that a downstream step should have resolved but didn't — skipped tests, TODO markers, placeholder stubs, commented-out code, debug statements left in production paths. The step that created the transitional artifact is not at fault; the gap is the downstream review or verification step that should have treated the leftover as a failure and resolved it. When the same class of leftover recurs across stories, propose an update_step to make the downstream step hard-fail on that artifact type. To find these, scan the journal step_end responseExcerpts for keywords like "skip", "todo", "stub", "placeholder", "FIXME", "not implemented", "future work", "next step", "accepted gap" — then check whether a later step resolved them. If not, that is signal.
- A finding is INFRA if the machinery failed rather than the development process: opencode runner errors (timeouts, context-length or provider API errors, terminated runs), n8n plumbing failures. Record it as an observation with fingerprint prefix "infra-". Never propose an amendment for it — a playbook step cannot fix the machinery; recurring infra fingerprints are reviewed and fixed by a human.
- A finding is NOISE if it is specific to this story's content or already guarded by an existing step. Most findings are noise. Not every mistake is guaranteed to repeat; the deterministic policy will only add a guard step once the same fingerprint recurs across runs, so your job is honest recording, not eager fixing.
- A finding is AUTONOMY if the trends show steps with halts > 0 — the agent asked a human to make a decision instead of resolving it via _bmad-output/decision-policy.md. Examine the journal step_end responseExcerpt for those steps to understand what was escalated. If the same decision class recurs across runs, record it as a "decision-policy-candidate-*" observation. If a step's prompt could be tuned to reduce halts (e.g. by pointing it more explicitly at the decision policy), propose an update_step amendment. Fewer halts over time means the pipeline is becoming more autonomous.

Write EXACTLY one file: _bmad-output/pipeline/proposals/${runId}.json with this shape (all arrays may be empty; write the file even if everything is empty):
{
  "story": "${story}",
  "runId": "${runId}",
  "observations": [
    { "fingerprint": "<stable-kebab-case-id-for-this-class-of-finding>", "summary": "<one sentence>", "evidence": "<where you saw it>" }
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
