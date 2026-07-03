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
- A finding is SIGNAL if it is systemic and likely to repeat on future stories (a step that consistently stalls, a class of defect the reviews keep catching late, a missing check that caused rework).
- A finding is INFRA if the machinery failed rather than the development process: opencode runner errors (timeouts, context-length or provider API errors, terminated runs), n8n plumbing failures. Record it as an observation with fingerprint prefix "infra-". Never propose an amendment for it — a playbook step cannot fix the machinery; recurring infra fingerprints are reviewed and fixed by a human.
- A finding is NOISE if it is specific to this story's content or already guarded by an existing step. Most findings are noise. Not every mistake is guaranteed to repeat; the deterministic policy will only add a guard step once the same fingerprint recurs across runs, so your job is honest recording, not eager fixing.

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
- Propose add_step ONLY when the ledger already shows the fingerprint recurring, or this run makes it recur. Prefer recording an observation and waiting.
- You may propose update_step for a step with "origin": "core" (prompt tuning only) when its evidence recurs the same way a guard step's would. Never propose retire_step or add_step positioned to replace a "core" step — core steps can be tuned but never removed by the machine.
- Record runner/infrastructure failures as observations with fingerprint prefix "infra-" (e.g. "infra-context-overflow", "infra-opencode-timeout"). Never cite infra-* fingerprints as amendment evidence; the gatekeeper rejects them because machinery fixes are human-only.
- If the journal shows the run halted for human decisions, or step responses show recorded autonomous decisions (per _bmad-output/decision-policy.md), and the same decision class keeps recurring across runs, record it as an observation with fingerprint prefix "decision-policy-candidate-". Never propose decision-policy changes as amendments; only a human edits that policy.
- Do not edit playbook.json, ledger.jsonl, journal.jsonl, or any project file yourself. Your only write is the proposal file.

End your response with exactly: PROPOSAL WRITTEN`;

process.stdout.write(prompt + '\n');
