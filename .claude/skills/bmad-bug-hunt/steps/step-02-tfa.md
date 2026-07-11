---
tfa_findings: [] # set at runtime: list of fidelity findings from TFA
tfa_verdict: '' # set at runtime: "fidelity-confirmed" or "false-confidence-found"
---

# Step 2: Test Fidelity Audit (TFA)

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- TFA audits whether tests exercise the real external contract or a fabricated assumption.
- If no test files exist for the target area, TFA finds nothing — note that and proceed. Absence of false-green tests does not mean tests are good; it means this layer found nothing.
- Do not modify any files. This step is read-only.
- **TFA must NOT persist its own artifacts.** The TFA subagent returns its fidelity report as conversational output only. It must NOT write any file to disk. The bug-hunt workflow's own step-05 handles all persistence.

## INSTRUCTIONS

1. **Invoke `bmad-agent-fidelity-auditor`** on the target area. This is a delegated sub-skill invocation. Launch a subagent without conversation context. Pass it `{target_files}` and `{target_description}`.

   The subagent must load and follow the TFA procedure at:
   `{project-root}/.claude/skills/bmad-agent-fidelity-auditor/references/audit-test-fidelity.md`

   The subagent's prompt:
   > You are the Test Fidelity Auditor (Vera). Audit test fidelity for the following target: {target_description}. Target files: {target_files}. Follow the procedure in references/audit-test-fidelity.md from the bmad-agent-fidelity-auditor skill. Produce a structured fidelity report: scope, contract consumers identified, findings (each with path:line and gap classification), and a verdict.

2. **Subagent fallback**: If subagents are not available, generate a prompt file at `{implementation_artifacts}/bug-hunt-tfa-prompt.md` containing the TFA invocation above, and HALT. Ask the user to run it in a separate session (ideally a different LLM) and paste back the fidelity report. When the report is pasted, resume from this point and proceed to instruction 3.

3. **Collect the fidelity report.** Extract from the report:
   - `{tfa_verdict}` — set to `"fidelity-confirmed"` or `"false-confidence-found"` based on the report's verdict.
   - `{tfa_findings}` — set to the list of findings from the report. Each finding should contain at minimum: the code path, the test (or absence of test), what the test assumes, what the real contract is, the gap classification (A, B, or C), and `path:line` references.

4. If TFA finds no false-green tests (verdict = `"fidelity-confirmed"` or no findings), note that to the user: "TFA found no fidelity gaps in this target area. This layer found nothing — proceed to ECH and CR for the remaining layers." Proceed to the next step.

### CHECKPOINT

Present a TFA summary: verdict, finding count, and a one-line description of each finding with its `path:line` reference. HALT and wait for user confirmation to proceed.

## NEXT

Read fully and follow `./step-03-ech.md`
