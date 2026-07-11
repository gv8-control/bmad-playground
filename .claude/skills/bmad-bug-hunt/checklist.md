# Bug Hunt Skill Checklist

Validate the `bmad-bug-hunt` skill against this checklist before shipping.

## SKILL.md structure

- [ ] SKILL.md has frontmatter with `name: bmad-bug-hunt` and `description`
- [ ] SKILL.md has a Goal statement
- [ ] SKILL.md has a Role: "You are an elite bug-hunting orchestrator."
- [ ] SKILL.md has Conventions (bare paths, {skill-root}, {project-root}, {skill-name})
- [ ] SKILL.md has On Activation section (resolve workflow block, prepend steps, persistent facts, config, greet, append steps)
- [ ] SKILL.md loads config: `project_name`, `planning_artifacts`, `implementation_artifacts`, `user_name`, `communication_language`, `document_output_language`, `date`, `project_context`
- [ ] SKILL.md has Workflow Architecture section (step-file, micro-file, JIT loading, sequential, state, append-only)
- [ ] SKILL.md has Step Processing Rules (READ COMPLETELY, FOLLOW SEQUENCE, WAIT FOR INPUT, LOAD NEXT)
- [ ] SKILL.md has Critical Rules (NEVER load multiple, ALWAYS read, NEVER skip, ALWAYS follow, ALWAYS halt)
- [ ] SKILL.md FIRST STEP points to `./steps/step-01-gather-context.md`

## customize.toml

- [ ] customize.toml has `# DO NOT EDIT -- overwritten on every update.` header
- [ ] customize.toml has `[workflow]` section
- [ ] customize.toml has `activation_steps_prepend = []`
- [ ] customize.toml has `activation_steps_append = []`
- [ ] customize.toml has `persistent_facts` with `file:{project-root}/**/project-context.md`
- [ ] customize.toml has `on_complete = ""`

## Step files

- [ ] Step files follow sequential architecture (step-01 through step-05)
- [ ] Each step file has frontmatter with runtime variables
- [ ] Each step file has RULES section
- [ ] Each step file has INSTRUCTIONS section
- [ ] Each step file has CHECKPOINT section with HALT
- [ ] Each step file has NEXT section pointing to the next step (except step-05)
- [ ] Each step halts at checkpoint and waits for user confirmation

## TFA invocation (step-02)

- [ ] TFA invocation correctly references `bmad-agent-fidelity-auditor` skill
- [ ] TFA step delegates to subagent or follows `references/audit-test-fidelity.md` inline
- [ ] TFA step sets `tfa_findings` and `tfa_verdict` runtime variables
- [ ] TFA step handles "no findings" case and proceeds

## ECH invocation (step-03)

- [ ] ECH invocation correctly references `bmad-review-edge-case-hunter` skill
- [ ] ECH runs on FULL FILE SCOPE (not diff scope)
- [ ] ECH receives TFA findings as `also_consider` input
- [ ] ECH step sets `ech_findings` runtime variable (merged JSON array)
- [ ] ECH step handles empty array case and proceeds

## CR invocation (step-04)

- [ ] CR invocation correctly references `bmad-code-review` skill
- [ ] CR receives TFA + ECH findings as context
- [ ] CR step sets `cr_findings` runtime variable
- [ ] CR step drops dismissed findings and records count
- [ ] CR step handles "no findings" case and proceeds

## Consolidation (step-05)

- [ ] Consolidation step normalizes all three finding formats (TFA report, ECH JSON, CR triaged markdown)
- [ ] Consolidation step deduplicates findings with merged sources (e.g., `tfa+ech`)
- [ ] Consolidation step classifies findings: critical, high, medium, low
- [ ] Output report path uses `{implementation_artifacts}/bug-hunt-{slug}.md`
- [ ] Report includes summary (total, by severity, layer results)
- [ ] Report presents top 3 critical/high findings
- [ ] Next-steps menu offers `bmad-quick-dev`, `bmad-investigate`, or done

## Subagent fallback

- [ ] Each sub-skill invocation step documents the subagent fallback (prompt files + HALT)
- [ ] Fallback generates prompt files in `{implementation_artifacts}`
- [ ] Fallback asks user to run in separate session and paste results back
