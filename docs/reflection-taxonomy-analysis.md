# Pipeline Reflection: Taxonomy and Architecture Analysis

A first-principles analysis of the reflection agent's finding taxonomy (`scripts/pipeline/reflect-prompt.mjs`) and a proposed two-agent architecture for the self-improvement loop.

---

## Part 1 — Evaluating the Current Taxonomy

### The current classification scheme

The taxonomy in `reflect-prompt.mjs` defines five categories for findings compiled by the post-story reflection agent:

1. **SIGNAL** — systemic, likely to repeat (stalling steps, late-caught defects, missing checks, halting steps)
2. **SIGNAL (transitional artifacts)** — leftover state (skipped tests, TODOs, stubs, debug statements) that a downstream step should have resolved but didn't; fault attributed to the *downstream verifier*, not the *creator*
3. **INFRA** — machinery failures (timeouts, API errors, n8n plumbing); walled off from amendments, fingerprint-prefixed `infra-`, human-only remediation
4. **NOISE** — story-specific or already-guarded; the deterministic policy waits for recurrence before acting
5. **HALTS** — steps where the human-question form fired; sub-classified into (a) genuine decision escalation, (b) infra misclassified as a question, (c) classifier ambiguity — where only (a) feeds the autonomy signal and (b)/(c) resolve back to `infra-*`

Orthogonally, every observation carries an evidence grade (confirmed/deduced/hypothesized) and a stable fingerprint for cross-run accumulation.

### What the taxonomy gets right

**The SIGNAL/NOISE axis is the correct primary cut.** A self-improving pipeline's compounding value comes only from recurring, systemic findings. Story-specific mistakes don't deserve playbook mutations. The taxonomy's insistence that NOISE is a valid terminal category — not a failure of investigation — is mature. Many reflection systems over-fit by treating every anomaly as actionable.

**The transitional-artifacts sub-category is genuinely insightful.** It correctly inverts the naive attribution. A TODO left during implementation is not necessarily a defect in the implementation step — it may be a legitimate transitional state. The defect is in the verification step that failed to treat the leftover as a failure. This prevents misdirected `update_step` amendments that would weaken the creating step rather than strengthen the verifying step. The remedy guidance (make the downstream step hard-fail on that artifact type) follows logically from the correct attribution.

**INFRA's hard wall is sound.** Conflating machinery failures with process gaps would corrupt the learning signal. A timeout doesn't mean the step's prompt is wrong. The "never propose an amendment for infra-*" rule and the gatekeeper rejection enforce this at the schema level, not just as guidance.

**The halt classification scheme is sophisticated.** It recognizes that "halts > 0" is not a single phenomenon but a trigger requiring dispatch. Only branch (a) — genuine uncovered decisions — feeds the autonomy signal. Branches (b) and (c) are machinery problems wearing process clothing. This prevents a confused optimization target: counting all halts as autonomy debt would lead to tuning prompts for problems that are actually infra misclassifications.

### Structural weakness: HALTS is not a terminal category

HALTS is presented as a peer to SIGNAL, INFRA, and NOISE, but it isn't one. It's a **routing rule** that dispatches to one of three outcomes:

- Branch (a) → SIGNAL (decision-policy-candidate-*)
- Branch (b) → INFRA (infra-phantom-halt)
- Branch (c) → INFRA (classifier ambiguity)

A finding classified as "HALTS" doesn't have a stable meaning — it resolves into SIGNAL or INFRA. This breaks mutual exclusivity at the top level. The prompt itself acknowledges this by saying "record it as an 'infra-*' observation" for branches (b) and (c), which means those findings are INFRA, not HALTS.

**Consequence:** an agent following this taxonomy literally could produce a finding labeled "HALTS" that is actually INFRA, or could be confused about whether to label a phantom halt as HALTS or INFRA. Cleaner would be: HALTS is an *investigation trigger* (like "if trends show haltsPerStory > 0"), not a *classification*. The dispatch target (SIGNAL vs INFRA) is the classification.

### Content gap: the taxonomy is deficit-only

Every category describes something wrong. There is no class for **positive signal** — findings about what's working, which guards are earning their place, which steps caught a defect class early. The `guardReports` section partially covers this for *learned* steps only (did the guard fire?), but:

- It's a separate output section, not part of the classification taxonomy
- It only covers learned steps, not core steps
- It tracks binary "fired: true/false," not "fired on a real defect" vs "fired on a false positive"
- It doesn't capture "this step caught something early that would have been expensive later" — the positive analog of SIGNAL

**Why this matters:** a self-improving system that only records failures will accumulate fixes but never develop a model of what's load-bearing. The `retire_step` amendment type exists, but the taxonomy provides no evidentiary basis for it — how would the agent know a step is safe to retire if it never records "this step caught nothing real for N runs while nothing slipped past it"? The system can detect *absence of failure* (a fingerprint stops appearing), but absence of failure is weaker than *confirmed positive coverage* — a step could stop catching things because the codebase changed, not because the defect class disappeared.

### Content gap: no false-positive / over-triggering class

If a guard step fires on something that isn't actually a defect, the taxonomy has no home for it. This matters because an accumulating pipeline can become over-guarded — brittle, slow, generating false alarms that train humans to ignore the system. There's no `OVER-FITTING` or `FALSE-ALARM` class. An over-aggressive guard that fires on every story would show up as `fired: true` in guardReports (appearing to be valuable) with no counter-signal that the fires were spurious.

### Content gap: no severity dimension

SIGNAL means "systemic and likely to repeat." But a systemic issue could be trivial (recurring cosmetic lint) or critical (recurring security gap). The taxonomy has no severity dimension. Recurrence frequency is the implicit proxy — a fingerprint appearing many times is treated as important. But this systematically under-weights rare-but-critical findings: a security gap that only appears on stories touching authentication might recur infrequently but warrant immediate action. The taxonomy's amendment rules gate on recurrence, which means rare-but-critical findings may never clear the bar for action.

### SIGNAL is overloaded

SIGNAL currently bundles: stalling steps, late-caught defects, missing checks, halting steps, coverage gaps, and decision-policy candidates. These share the property "systemic and recurring" but differ in remedy (update_step vs add_step vs human-only policy edit). The amendment-type axis (add_step / retire_step / update_step) already provides a remedy-oriented taxonomy, so the overloading in SIGNAL isn't fatal — but it means "SIGNAL" as a label carries little information beyond "this is actionable." Sub-typing SIGNAL by gap-type would make the ledger more queryable and the amendment mapping more explicit.

### What the taxonomy doesn't try to cover (defensibly)

- **Efficiency findings** (slow steps, redundant work) — arguably out of scope; this agent is about correctness, not performance. Defensible omission.
- **Cross-step handoff issues** beyond transitional artifacts — partially covered. The transitional-artifacts category is narrow (leftover state), not general handoff/contract issues. Partial gap.
- **Regressions** (previously-working guard now failing) — not distinguished from new systemic gaps. The remedy differs (a regression might mean a prompt was changed or the codebase evolved past it), but the taxonomy can't express "this used to work."

---

## Part 2 — A Model for Pipeline Reflection

### Premise

A reflection agent's job is **epistemic accounting for a self-modifying system**. The pipeline mutates itself based on what the agent records. So the agent is not just "finding bugs" — it is the sensor layer of a control system. A control system whose sensors only detect deficits will optimize for fixing gaps and develop no model of what's load-bearing, what's drifting, or what's over-accumulated. It will fix itself to death.

### The six dimensions

Every finding the agent compiles lives in six orthogonal dimensions. The current taxonomy collapses several of these into one axis (the classification), which is why it feels simultaneously too coarse in some places and overloaded in others.

| Dimension | What it answers | Current state |
|---|---|---|
| **Polarity** | What kind of finding is this? | The "classification" — overloaded, deficit-only |
| **Locus** | Where in the system? | Implicit in fingerprint/stepId |
| **Grade** | How confident are we? | Present (confirmed/deduced/hypothesized) — good |
| **Severity** | How much does this matter? | Absent |
| **Systemicity** | One-off vs recurring? | The SIGNAL/NOISE cut — right idea, wrong axis |
| **Remedy direction** | What kind of change, if any? | The amendment types — present but disconnected from classification |

The polarity dimension is the heart of the model. The others are fields on every finding. The current taxonomy's core problem is that it uses polarity as the *only* dimension and then tries to encode remedy, systemicity, and cause into the category names — which is why "SIGNAL (transitional artifacts)" and "HALTS" are doing double duty as both "what kind of finding" and "what to do about it."

### The polarity space

Six categories. Designed to be mutually exclusive and collectively exhaustive.

#### 1. DEFICIT — something failed or was missing (present tense)

Sub-typed by *locus of failure*, because the remedy follows directly from the sub-type:

| Sub-type | Meaning | Remedy direction |
|---|---|---|
| *coverage-gap* | No step looks at this class of problem | `add_step` |
| *execution-gap* | A step exists but its prompt didn't activate the right behavior | `update_step` |
| *policy-gap* | The decision policy doesn't cover this case | human-only (edit decision policy) |
| *handoff-gap* | A step produced output the downstream step didn't consume correctly (generalizes "transitional artifacts" — the transitional state is one form of handoff failure; format mismatches and contract violations are others) | `update_step` (downstream) or `add_step` |
| *infra-failure* | Machinery failed, not the process | human-only (walled from amendments) |

This replaces the current taxonomy's monolithic SIGNAL. The current taxonomy's amendment-type axis already implies this sub-typing — the model just makes it explicit so the ledger is queryable by gap-type and the remedy mapping is deterministic rather than the agent re-deriving it each time.

#### 2. REGRESSION — something that used to work stopped working

Distinct from DEFICIT because the investigation and remedy are fundamentally different:

- **Investigation**: diff against the prior working state — what changed? (A prompt edit? A codebase evolution? A model update from the provider?)
- **Remedy**: revert the change, or update the step to handle the new context — *not* add a new guard. Adding a guard for something that already had a guard produces OVER-FITTING (redundant-guard).

The current taxonomy cannot express "this used to work." Every finding is present-tense. This means a regression is indistinguishable from a new gap, and the agent will propose `add_step` when it should propose "find what changed." This is a real pathology: the system will accumulate redundant guards for problems it already solved.

#### 3. POSITIVE — something worked well

Sub-typed by what kind of positive signal:

| Sub-type | Meaning | Use |
|---|---|---|
| *guard-confirmed* | A guard step caught a real defect early | Evidence for preserving the step; basis for `retire_step` decisions (a step is safe to retire only when we have a positive record of what it *was* catching and evidence that class has disappeared) |
| *step-effective* | A step produced high-value output | Evidence for preserving when restructuring |
| *policy-resolved* | A previously-escalated decision is now covered by policy | Autonomy progress signal |

This is the most important addition. Without it:

- `retire_step` has no evidentiary basis — the agent can't distinguish "this step caught nothing because nothing was wrong" from "this step caught nothing because it stopped working"
- The system develops no model of what's load-bearing, so any restructuring is blind
- The agent's output is purely a list of complaints, which trains humans to only pay attention when something breaks

A reflection agent that only records failures is a postmortem process that only runs after incidents. It learns from disasters but never develops a model of its strengths. That's not a self-improving system — it's a damage-tracking system.

#### 4. OVER-FITTING — the system's own accumulated structure is the problem

Sub-typed:

| Sub-type | Meaning | Remedy direction |
|---|---|---|
| *false-alarm* | A guard fired on a non-defect | `update_step` (narrow the guard) or `retire_step` |
| *redundant-guard* | Two steps check the same thing | `retire_step` |
| *cost-disproportionate* | A step's cost (tokens, time, context) exceeds its value | `retire_step` or restructure |

This is the brake on unbounded accumulation. The current taxonomy has no home for this. A guard that fires on every story would show up as `fired: true` in guardReports — appearing valuable — with no counter-signal that the fires were spurious. Over time, a pipeline with no OVER-FITTING category will become over-guarded, slow, and noisy, and humans will learn to ignore it.

#### 5. AUTONOMY — signal about the human/machine decision boundary

Sub-typed:

| Sub-type | Meaning | Remedy direction |
|---|---|---|
| *genuine-escalation* | Policy doesn't cover this; agent correctly escalated | `update_step` (if prompt tuning can reduce halts) or human-only (policy edit) |
| *conservative-escalation* | Policy covers it but agent didn't apply it | `update_step` (tune prompt to apply existing policy) |
| *phantom-halt* | Infra misclassified as escalation | human-only (fix classifier) |

This reframes the current HALTS category. HALTS is not a classification — it's a dispatch trigger. Every halt resolves to one of these three sub-types, which map cleanly to DEFICIT (policy-gap), DEFICIT (execution-gap), or INFRA. The top-level polarity here is AUTONOMY because the *signal* is about the autonomy frontier, even though the remedy may overlap with DEFICIT remedies.

The key distinction from the current taxonomy: *conservative-escalation* is a new sub-type. The current model recognizes genuine escalations (policy gap) and phantom halts (infra), but doesn't distinguish "the agent escalated when it shouldn't have" from "the agent escalated correctly." Conservative-escalation is the execution-gap of autonomy — the policy was sufficient, the agent didn't apply it. This is the most actionable autonomy finding because the remedy is purely prompt tuning.

#### 6. META — observations about the pipeline's own observability

Sub-typed:

| Sub-type | Meaning | Remedy direction |
|---|---|---|
| *evidence-gap* | We couldn't confirm or refute a finding because traces/journal were insufficient | human-only (improve observability) |
| *instrumentation-gap* | We have no sensors that would detect this class of problem (usually discovered when a defect escapes to a human) | human-only (design new instrumentation) |

This is the epistemic honesty layer. The current taxonomy has no way to say "I don't know, and here's why I can't know." A hypothesized observation with a nextStep partially covers this, but it conflates "the cause is hypothesized" with "I lack the evidence to investigate." These are different: the first is about the finding's nature; the second is about the system's limits. An evidence-gap is a finding about the *pipeline's sensors*, not about the story's defects.

Without META, the system will accumulate hypothesized observations indefinitely without recognizing that the reason they stay hypothesized is that the instrumentation doesn't exist to confirm them. The nextStep pointers will point at traces that can't answer the question, and future runs will re-investigate and re-fail.

### What else the agent should compile

Beyond classified findings, the reflection agent should produce:

**Preservation record.** A list of steps, guards, and policy rules that earned their place this run — with evidence. This is the POSITIVE polarity compiled at the step level rather than the finding level. It's the input to `retire_step` decisions: a step is safe to retire only when its preservation record shows diminishing returns over N runs *and* no DEFICIT fingerprints that the step was catching have appeared downstream.

**Assumptions log.** What the agent assumed and couldn't verify. This is distinct from hypothesized findings (which are suspicions about causes). Assumptions are things the agent took as true without evidence — "I assumed the test report was complete," "I assumed the code review covered all files." If an assumption later proves wrong, the assumption log explains why the agent's conclusion was reasonable given what it thought it knew. Without this, the system can't distinguish "the agent reasoned well from bad data" from "the agent reasoned poorly from good data."

**Trajectory note (per-run, not per-finding).** A one-sentence assessment: is this run's findings consistent with the pipeline getting better, worse, or stable on each polarity axis? This is emergent from the ledger over time, but a per-run note forces the agent to synthesize rather than just enumerate. "Three DEFICIT findings, one REGRESSION, zero POSITIVE — this run looks worse than the trend" is a signal that the pipeline may be in a degrading state, even if no single finding is actionable.

### What the model fixes

| Pathology in current taxonomy | How the model addresses it |
|---|---|
| HALTS is a dispatch rule masquerading as a category | AUTONOMY is a genuine polarity (signal about the human/machine boundary); the dispatch is to remedy, not to another category |
| No home for positive signal | POSITIVE polarity + preservation record |
| No brake on over-accumulation | OVER-FITTING polarity |
| Cannot express "this used to work" | REGRESSION polarity |
| SIGNAL is overloaded (stalls, late defects, missing checks, halts, coverage gaps) | DEFICIT sub-typed by locus; each sub-type maps to a specific remedy |
| No severity dimension | Severity as a field on every finding (rare-but-critical findings can clear the recurrence bar) |
| No way to say "I can't know" | META polarity (evidence-gap, instrumentation-gap) |
| NOISE is a non-finding occupying a category slot | Removed — NOISE is the absence of a finding, not a finding; the permissive instruction ("don't feel compelled") belongs in the prompt, not the taxonomy |
| Conservative escalations invisible | AUTONOMY (conservative-escalation) sub-type |

### Trade-offs

**Cognitive load.** Six polarities with sub-types is more to hold in working memory than five flat categories. The reflection agent will make more classification decisions, which means more potential for misclassification. Mitigation: the polarity-to-remedy mapping is deterministic (each sub-type maps to exactly one remedy direction), so once the polarity is chosen, the remedy follows without additional reasoning. The agent's effort is front-loaded into classification, not spread across classification + remedy derivation.

**Some categories will be empty on most runs.** REGRESSION, OVER-FITTING, and META will rarely produce findings on a healthy pipeline. This is a feature, not a bug — empty categories are the signal that the system is healthy on those axes. But it means the agent must actively consider each polarity and conclude "no evidence this run" rather than forgetting the category exists. The prompt should frame the polarities as a *checklist of questions* ("is there evidence of regression this run?") not a *list of buckets to sort into*.

**Severity is subjective.** An LLM grading severity introduces noise. Frequency (fingerprint recurrence) is objective. The trade-off: objective-but-under-weights-rare-critical vs subjective-but-can-prioritize. Severity should be a *human-annotated* field on confirmed findings, not an LLM judgment — the agent proposes, the human calibrates. The agent can flag "this feels critical" as a hypothesis, but the severity field should be human-set on confirmation.

**The model assumes the agent can distinguish sub-types.** coverage-gap vs execution-gap requires the agent to understand whether a step's skill *should* have covered the gap — which means understanding the skill's scope. The current prompt already instructs this ("Understand the skill first to confirm its scope covers the gap"), so the model formalizes existing guidance rather than adding new capability. But *conservative-escalation* vs *genuine-escalation* requires the agent to check whether the decision policy actually covers the case — which is a real reasoning task, not a lookup. The agent may get this wrong. This is acceptable: a misclassified conservative-escalation becomes a `decision-policy-candidate-*` observation that a human reviews, which is the existing safety net.

---

## Part 3 — A Two-Agent Architecture for Reflection

### The question

Should the self-reflection system be split into two agents: one gathers intelligence, the other offers solutions?

### Direct answer

Yes — but not along the "intelligence vs solutions" boundary as the primary cut. The strongest case for splitting is about **frequency** and **context**, not about the detect/fix axis. The two agents should run at different times, with different context windows, answering different questions. The detect/fix split falls out of that as a consequence, not as the primary division.

### Why a single agent is structurally compromised

The current reflector does three things in one pass:

1. **Investigates** — reads traces, journals, ledger, trends; grades evidence; classifies findings
2. **Diagnoses** — determines cause: coverage-gap, execution-gap, policy-gap, regression, over-fitting
3. **Designs** — proposes amendments: add_step, update_step, retire_step; reasons about skill scope, playbook position, second-order effects

These are three different cognitive stances with three different context requirements. The problem isn't that one agent *can't* do all three — it's that doing them in the same session creates **structural pressures that guardrails can't fully counteract**:

**Investigation-toward-remedy bias.** An agent that knows it must propose amendments will, over time, develop a bias toward findings it can remedy. An under-evidenced gap that doesn't suggest a clear amendment gets recorded as a weak hypothesized observation; an over-evidenced gap that maps cleanly to `update_step` gets recorded as confirmed. The agent isn't reasoning poorly — it's responding to the task structure. The investigation phase is colored by the design phase before the design phase begins.

**Context dilution.** Good investigation needs narrow, deep context: this run's traces, the ledger, the trends. Good amendment design needs broad context: the full playbook, the skill library's scopes, amendment history, which steps are core vs learned, second-order effects. Loading both into one agent means either the context is too broad (attention diluted across the whole playbook when the investigation needs to focus on one step's trace) or too narrow (the amendment is proposed without understanding the playbook it mutates).

**Frequency mismatch.** Most stories produce no amendments. The current prompt acknowledges this ("write the file even if everything is empty"). Running the full investigate-diagnose-design cycle every story, when the design phase is only actionable once evidence has accumulated across runs, is premature activation. The agent is designing amendments before the evidence is ripe, which is why the prompt must repeatedly caution it to "record an observation and wait when unsure."

### The model: Investigator + Architect

#### Agent 1: The Investigator

**Runs:** After every story, always.

**Context:** Narrow. This run's journal, traces, the ledger, cross-run trends, runner-errors, the playbook (read-only, for understanding what steps exist).

**Mandate:** Detect, classify, and grade findings. Record evidence. Accumulate hypothesized observations toward confirmation. Produce a **case file**, not a proposal.

**Does NOT:** Propose amendments. Reason about skill scope. Decide whether a step should be retired. Design prompts. The investigator has no design mandate — it records what it sees, grades how confidently it sees it, and stops.

**Produces:** A case file with the polarity model — findings classified by polarity (DEFICIT, REGRESSION, POSITIVE, OVER-FITTING, AUTONOMY, META), each graded (confirmed/deduced/hypothesized), each with a stable fingerprint. Hypothesized findings include `nextStep` pointers for future investigators to widen into. The case file includes a preservation record (what guards earned their place this run) and an assumptions log.

**Key property:** The investigator can record "I see this pattern but I don't know what to do about it" without the discomfort of a design mandate. A hypothesized observation with no proposed amendment is a complete, successful output — not a half-finished job.

#### Agent 2: The Architect

**Runs:** On-demand, when evidence is ripe. Triggered by:

- A fingerprint reaching recurrence threshold (the deterministic gate the current system already uses)
- A hypothesized observation being confirmed across runs (a `nextStep` pointer was followed and confirmed)
- A guard's preservation record showing diminishing returns over N runs
- A REGRESSION finding (these are urgent — something stopped working — and should trigger the architect immediately)
- A human can also trigger it manually

**Context:** Broad. The full ledger (not just recent entries), the full playbook, the skill library (to understand scope), amendment history (to avoid re-proposing rejected amendments), the case files from recent runs.

**Mandate:** Read the accumulated evidence. Decide what, if anything, to mutate. Design amendments. Reason about second-order effects. Propose.

**Does NOT:** Investigate. Re-read traces. Gather new evidence. The architect trusts the investigator's findings as input — it works from the case file, not from the raw evidence. If the case file is insufficient to design an amendment, the architect's response is "evidence insufficient, return to investigator with a specific nextStep" — not "let me re-investigate."

**Produces:** A proposal file (the current `amendments` + `guardReports` structure) that goes to the gatekeeper.

**Key property:** The architect has no investigation mandate. Its job is design from accumulated evidence, not detection. This means it can focus its full context window on the design question — what amendment, what position, what prompt, what second-order effects — without diluting attention across trace-reading.

#### The handoff

The case file is the contract between the two agents. Its quality determines whether the split works:

```
Investigator (every story)
    |
    |  case file: findings (polarity, grade, fingerprint, evidence, nextStep)
    |  + preservation record + assumptions log
    v
Ledger (accumulates across runs)
    |
    |  trigger: fingerprint recurred / hypothesis confirmed /
    |  guard diminishing / regression detected / human
    v
Architect (on-demand)
    |
    |  proposal: amendments + guardReports
    v
Gatekeeper (deterministic validation)
    |
    v
apply-amendments.mjs
```

The handoff is asynchronous and decoupled. The investigator doesn't know when (or whether) the architect will consume its findings. The architect doesn't know which stories produced the evidence it's working from. This is a feature: the investigator accumulates without pressure to produce actionable findings, and the architect designs without pressure to find its own evidence.

### What the two-agent model fixes

| Pathology | Single-agent | Two-agent model |
|---|---|---|
| Investigation biased toward remediable findings | Structural — the agent knows it must propose | Eliminated — the investigator has no design mandate |
| Amendment proposed before evidence is ripe | The agent must decide "propose or wait" in the same session | Eliminated — the architect runs only when evidence is ripe |
| Context dilution | One agent loads both narrow (traces) and broad (playbook) context | Each agent loads only the context its job requires |
| No positive signal / no preservation record | The agent is in deficit-finding mode | The investigator records all polarities, including POSITIVE; the architect uses the preservation record for retire_step decisions |
| Re-proposing rejected amendments | The agent doesn't see amendment history | The architect's context includes amendment history — it knows what was tried and rejected |
| Premature amendment on first occurrence | The prompt says "wait for recurrence" but the agent is already running | The architect's trigger conditions enforce accumulation before activation |

### The steelman against splitting

The strongest argument against: **diagnosis and remedy are entangled.** "The review-tests step flags stale skip headers but doesn't fix them" is both an observation and a diagnosis that implies the remedy. If you split, the architect must re-derive the diagnosis from the investigator's recorded case file, and may lose the causal reasoning that led to it. This is the telephone-game problem — the architect works from a summary, not from the investigator's full mental model.

**Response:** This argument actually *supports* the split, because it forces evidence quality. If the architect can't confirm the diagnosis from the recorded evidence, then the investigator's diagnosis was under-evidenced — it was a hypothesis the investigator held in working memory but didn't write down. That's a finding about the investigation's quality, not a reason to skip the architect. The split makes the investigator's evidence discipline visible: if the architect repeatedly can't act on the case file, the investigation process needs improvement, and that's a META finding the current system has no way to surface.

The entanglement argument proves too much — it would argue against any separation of detection and response in any system. But mature systems separate these routinely (security: SIEM detects, IR team responds; medicine: diagnostics vs treatment planning; engineering: testing vs root-cause analysis). The separation works when the response role adds value beyond the detection role. Here, the architect adds whole-pipeline reasoning and second-order analysis that the investigator can't do well with narrow context.

### The intermediate option

Before committing to two agents, there's a cheaper intermediate: **a two-phase prompt within the single agent**, with a mandatory checkpoint between phases.

- **Phase 1:** Investigate and record findings. No amendment mandate. Output: the case file.
- **Checkpoint:** Review findings. Explicitly switch stance from "investigator" to "architect."
- **Phase 2:** Propose amendments for confirmed findings only. Read the playbook and skill library. Reason about second-order effects.

This captures some of the benefit (mode-switching is forced, not optional) without the cost of a second agent run. But it shares context between phases, so the investigation-toward-remedy bias may persist — the agent knows phase 2 is coming, even if it's told to ignore it. And it runs every story, which means the design phase activates even when no amendments are warranted.

**Recommendation:** Start with the two-phase prompt. If observation shows that the investigator phase still biases toward remediable findings (checkable: compare the distribution of findings' polarities and grades across runs — if DEFICIT/execution-gap is over-represented relative to what the traces actually show, the bias is real), graduate to the two-agent model. The two-agent model is the correct end state, but the two-phase prompt is a lower-risk way to validate that the split produces better findings before committing to the infrastructure cost.

---

## Risks and Unknowns

- **The reflector's system prompt** (`.opencode/agent/reflector.md`) was not read for this analysis. The methodology there may already enforce some of the separation or positive-signal recording through cognitive discipline. If so, the two-agent model formalizes existing practice rather than introducing new behavior. The structural pressures described (investigation-toward-remedy, context dilution) would still exist, but they'd be mitigated by methodology — the question becomes whether mitigation is sufficient or whether the structure should enforce what the methodology currently only advises.

- **The architect's trigger conditions are the crux.** If they're too sensitive, the architect runs too often and the system is no different from the current per-story reflector. If they're too conservative, confirmed findings sit unaddressed. The current system's recurrence threshold (fingerprint appears across runs) is a reasonable starting point, but REGRESSION findings need immediate triggering — a regression is a signal that something broke, not a pattern to accumulate.

- **The case file's schema is the load-bearing wall.** If the investigator records too little, the architect can't act. If it records too much, the architect's context is diluted (re-creating the single-agent problem). The case file should be *structured* (findings with polarity, grade, fingerprint, evidence, nextStep) not *narrative* — the architect reads findings, not prose.

- **The operational cost of a second agent is unknown.** If the pipeline runs many stories per day, doubling the reflection cost matters. If it runs a handful per week, it's negligible. The architect runs on-demand (not every story), so its cost is bounded by the trigger rate, which should be low on a healthy pipeline.

- **The two-agent model assumes the investigator and architect don't need to converse.** If the architect needs to ask the investigator "did you check X?", the asynchronous handoff breaks down and you need a conversational loop, which is a different (more complex) architecture. The case file + nextStep pointers can carry the necessary backchannel — the architect's "evidence insufficient" response is a nextStep for the next investigator run — but this is unvalidated against actual findings.

- **The model may be over-specified for a system at this scale.** If the pipeline runs a handful of stories per week, REGRESSION and OVER-FITTING findings will be rare enough that the agent rarely activates those polarities. The model is designed for a system that runs enough stories to accumulate patterns — at low volume, the current taxonomy's simplicity may be the right trade-off. The model should be adopted incrementally: DEFICIT sub-typing and POSITIVE first, then OVER-FITTING and REGRESSION once the ledger has enough history to make them meaningful, then AUTONOMY and META last.

- **The ledger schema's capacity for these changes is unverified.** The proposal file's observation schema would need `polarity`, `subType`, `severity`, and `locus` fields added. The ledger accumulation logic (fingerprint matching across runs) should still work — fingerprints are orthogonal to polarity — but the apply-amendments validator has not been read to confirm there are no assumptions about the current category names.
