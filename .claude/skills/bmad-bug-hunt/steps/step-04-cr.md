---
cr_findings: [] # set at runtime: list of CR triaged findings
---

# Step 4: Code Review (CR)

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- CR runs its own full parallel review (Blind Hunter + diff-scoped ECH + Acceptance Auditor).
- The bug-hunt workflow delegates to CR and waits for CR's findings.
- If there is no diff (existing code), CR handles it via its file-list mode.
- If CR finds nothing, note that and proceed.
- Do not modify any files. This step is read-only.
- **CR must NOT persist its own artifacts.** The CR subagent must run CR steps 1–3 only (gather context, parallel review, triage). It must NOT run CR step-04 (present and act). Specifically, the CR subagent must NOT: write findings to any story file, append to `deferred-work.md`, or sync `sprint-status.yaml`. The bug-hunt workflow's own step-05 handles all persistence — CR returns triaged findings only.

## INSTRUCTIONS

1. **Prepare CR context.** Build a context summary from `{tfa_findings}` and `{ech_findings}` so CR's review is informed by what the earlier steps found. Format:

   ```
   Prior bug-hunt findings (inform your review but run independently):

   TFA findings:
   - <finding summary with path:line> (or "none")

   ECH findings:
   - <finding location, trigger_condition, potential_consequence> (or "none")
   ```

2. **Invoke `bmad-code-review`** on the target. Launch a subagent without conversation context. Pass it `{target_files}`, `{target_description}`, `{has_diff}`, and the prior findings context from instruction 1.

   The subagent must load and follow the `bmad-code-review` skill — but ONLY steps 1 through 3 (gather context, parallel review, triage). Do NOT run CR step-04 (present and act). Its prompt:
   > You are running a code review as part of a bug hunt. Target: {target_description}. Target files: {target_files}. Has diff: {has_diff}. <prior findings context>. Run bmad-code-review steps 1–3 ONLY: gather context, parallel review (Blind Hunter via bmad-review-adversarial-general, diff-scoped ECH via bmad-review-edge-case-hunter, Acceptance Auditor inline), and triage. STOP after triage — do NOT run step-04 (present and act). Do NOT write to any story file. Do NOT append to deferred-work.md. Do NOT sync sprint-status.yaml. Return ONLY your triaged findings list. If there is no diff, use file-list mode to review the full content of each target file.

3. **Subagent fallback**: If subagents are not available, generate a prompt file at `{implementation_artifacts}/bug-hunt-cr-prompt.md` containing the CR invocation above, and HALT. Ask the user to run the `bmad-code-review` skill in a separate session with the target files and pasted findings context, then paste back the triaged findings. When results are pasted, resume from this point and proceed to instruction 4.

4. **Collect CR findings.** Set `{cr_findings}` to the triaged findings returned by CR. These are in CR's normalized format: each finding has `id`, `source`, `title`, `detail`, `location`, and a classification bucket (`decision_needed`, `patch`, `defer`, or `dismiss`). Drop `dismiss` findings — record the dismiss count for the consolidation summary.

5. If `{cr_findings}` is empty after dropping dismissed findings, note that to the user: "CR found no actionable findings. This layer found nothing — proceed to consolidation." Proceed to the next step.

### CHECKPOINT

Present a CR summary: finding count, classification breakdown (decision-needed, patch, defer), and a one-line description of each finding with its bucket and location. HALT and wait for user confirmation to proceed.

## NEXT

Read fully and follow `./step-05-consolidate.md`
