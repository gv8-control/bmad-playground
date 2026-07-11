---
ech_findings: [] # set at runtime: merged JSON array of unhandled paths from all files
---

# Step 3: Edge Case Hunter (ECH)

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- ECH runs on FULL FILE SCOPE — not diff scope. The target is the entire content of each file, not just changed lines.
- ECH is method-driven, not attitude-driven. It walks every branching path and reports only unhandled ones as a JSON array.
- If ECH returns an empty array for a file, that file has no unhandled paths in scope — note that and proceed.
- Do not modify any files. This step is read-only.
- **ECH must NOT persist its own artifacts.** ECH returns its JSON array as conversational output only. It must NOT write any file to disk. The bug-hunt workflow's own step-05 handles all persistence.

## INSTRUCTIONS

1. **Prepare ECH input.** If `{tfa_findings}` is non-empty, extract the file and line references from each finding to build a focused `also_consider` string. This focuses ECH on the riskiest code — the areas where tests were found to give false confidence. Format `also_consider` as a list of areas to keep in mind during edge-case analysis, e.g.:
   > Consider the areas flagged by TFA: src/auth/handler.ts:42 (mock returns success-only shape), src/n8n/runner.ts:88 (test fake at wrong boundary).

   If `{tfa_findings}` is empty, set `also_consider` to empty (ECH will run its standard analysis without focus areas).

2. **Invoke `bmad-review-edge-case-hunter`** for each file in `{target_files}`. Launch a subagent without conversation context for each file. The subagent receives the FULL FILE CONTENT (not a diff) and the `also_consider` input.

   The subagent must load and follow the `bmad-review-edge-case-hunter` skill. Its prompt:
   > You are the Edge Case Hunter. Walk every branching path and boundary condition in the content below. Report only unhandled paths as a JSON array. Each object: {location, trigger_condition, guard_snippet, potential_consequence}. Content (full file): <file contents of {current_file}>. Also consider: {also_consider}.

   Subagents may be launched in parallel across files if supported.

3. **Subagent fallback**: If subagents are not available, generate a prompt file at `{implementation_artifacts}/bug-hunt-ech-prompt.md` containing the ECH invocation above (one section per target file with its full content), and HALT. Ask the user to run each in a separate session and paste back the JSON arrays. When results are pasted, resume from this point and proceed to instruction 4.

4. **Collect findings.** For each target file, collect the JSON array returned by ECH. Merge all arrays into a single `{ech_findings}` array. Each finding contains: `location` (file:line-range), `trigger_condition`, `guard_snippet`, and `potential_consequence`.

5. If `{ech_findings}` is empty across all files, note that to the user: "ECH found no unhandled paths in scope. This layer found nothing — proceed to CR for the remaining layers." Proceed to the next step.

### CHECKPOINT

Present an ECH summary: total finding count across all files, grouped by file. For each finding, show its location, trigger condition, and potential consequence. HALT and wait for user confirmation to proceed.

## NEXT

Read fully and follow `./step-04-cr.md`
