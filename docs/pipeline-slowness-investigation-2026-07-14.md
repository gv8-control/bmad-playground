# Pipeline Slowness Investigation — 2026-07-14

## Summary

Recent BMAD pipeline sessions are slow primarily because of **timeout kills**, not organic LLM provider slowness or context overflow. The slowness emerges from the interaction of four compounding factors: `reasoningEffort: "max"` on all agents, exhaustive skill designs that load growing artifacts, a 90-minute runner timeout that is too short for the most expensive steps, and a missing timeout on the question form that causes multi-hour stalls.

The user's hypothesis — "excessive BMAD artifact presence rather than slow LLM provider" — is directionally correct but imprecise. Artifacts are not overflowing the context window (estimated ~150K tokens vs 1M limit). The provider is not uniformly slow (most steps complete in 2–15 minutes). The slowness is the product of the interaction between artifact volume, reasoning depth, and structural step design.

---

## Observations

### 1. The "slowness" is primarily timeout kills, not organic LLM slowness

The opencode runner uses `timeout --kill-after=60 5400 opencode run` — a **90-minute hard timeout** (confirmed in `n8n/workflows/C8qzMFk2e00sLHJg.json`). The journal shows **24 steps across 18 stories** that hit this exact 90-minute wall (all at ~5,400,000ms, `rc:124`):

| Step | Timeouts | Recent trend |
|------|----------|-------------|
| `review-code` | 5 | 4 of last 8 runs (3.9, 4.10, 4.11, 5.1, 5.5-a1) |
| `create-story` | 2 | 4.11 (90 min), 4.9-a2 (171 min) |
| `e2e-tests` | 2 | 5.5-a1 (90 min), 5.5-a2 (150 min) |
| `implement-story` | 3 | 4.3, 4.4, 4.5 |
| `validate-story` | 1 | 5.3 (190 min stall) |
| Others | 11 | scattered |

Steps that complete within the timeout are **not slow** — most finish in 2–15 minutes. The user perceives "slowness" because each timeout kill wastes 90 minutes, the pipeline retries failed steps (doubling time), and multiple timeouts per story compound (story 4.11 had 2 timeouts = 180 min of dead time alone).

### 2. A second, distinct slowness pattern: multi-hour stalls

Five steps ran for **190–518 minutes** (3–8.6 hours). All had `halts > 0`:

- `validate-story` 5.1: 429 min, halts=1
- `validate-story-2` 3.7: 431 min, halts=1
- `validate-story-2` 4.1: 425 min, halts=1
- `review-nfrs` 4.5: 519 min, halts=1
- `update-project-context` 4.8: 273 min, halts=1
- `prepare-tests` 4.3: 274 min, halts=1

These are **stalls** — the question form fired (the pipeline doc acknowledges: *"the human-question form inside BMAD Session (OpenCode) has no timeout, so an unanswered question stalls the loop indefinitely"*) and nobody answered for hours. The ledger confirms many of these are `infra-phantom-halt` — the question form fires spuriously because salvaged timeout output gets misclassified as `QUESTION`.

### 3. `reasoningEffort: "max"` on all three agents

```json
// opencode.json
"coder": { "reasoningEffort": "max" }
// .opencode/agent/planner.md
reasoningEffort: max
// .opencode/agent/reviewer.md
reasoningEffort: max
```

This has been set since the gen-2 pipeline launched (commit `d10a327`, not a recent change). It means the model generates **maximum reasoning tokens before every action**. This is the primary amplifier: more context in → more reasoning out → more time per step.

### 4. Artifacts have grown significantly

| Artifact | Size | Growth |
|----------|------|--------|
| `epics.md` | 150K | 92K → 150K (+63%) |
| `deferred-work.md` | 102K | 80K → 102K (+28%) |
| `project-context.md` | 421 lines | 400 → 421 (slow growth) |
| Story spec files | 55–113K each | growing per story |
| `journal.jsonl` | 760K (866 events) | growing per story |
| `ledger.jsonl` | 208K (168 entries) | growing per story |
| `traces/` | 86MB | growing per story |

### 5. What each step loads into context

**`create-story`** (planner agent, max reasoning):
- `project-context.md` (persistent fact, 421 lines)
- `epics.md` (147K, whole load via discover-inputs)
- `architecture.md` (64K, whole load)
- PRD (49K, selective load)
- UX design (59K, selective load)
- Previous story file (up to 113K)
- `deferred-work.md` (102K, from playbook prompt)
- `decision-policy.md` (4K, from playbook prompt)
- Architecture files being modified (reads each completely)
- Web research for latest tech specifics
- Last 5 git commits

Estimated input: ~150K tokens (within the 1M limit, but substantial).

**`review-code`** (planner agent, max reasoning):
- `project-context.md` (persistent fact)
- Story spec file (up to 113K)
- `decision-policy.md` (from playbook prompt)
- Full diff output
- **3 sequential subagent reviews** (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — each launches its own opencode session with max reasoning, loading diff + project access + spec. The "parallel" subagents are actually sequential (the pipeline doc acknowledges: *"n8n executes branches of one execution one node at a time"*).

### 6. The reflection loop has noticed but cannot fix this

The ledger records `infra-opencode-timeout` as a confirmed observation **7+ times** across stories 3.9, 3.11, 5.1, 5.3, 5.5, 4.10. The `infra-phantom-halt` pattern (timeouts causing phantom questions) is also recorded multiple times. Per policy, these are `infra-*` fingerprints — the machine correctly **rejects any amendment citing infra evidence** and leaves them as a human work queue. The system is working as designed; the work queue just hasn't been worked.

---

## Analysis

### Root cause: a compounding interaction, not a single factor

The artifacts are not overflowing the context window (150K tokens vs 1M limit). The provider is not uniformly slow (most steps complete in 2–15 min). The slowness emerges from the **interaction** of four factors:

1. **`reasoningEffort: "max"`** — the engine. Every action generates extensive reasoning tokens. This is the dominant cost driver. A step that loads 150K tokens of context and generates 50–100K reasoning tokens before writing output is inherently time-expensive.

2. **Exhaustive skill design** — the fuel delivery system. The `create-story` skill explicitly demands "EXHAUSTIVE ANALYSIS REQUIRED" and "do NOT be lazy or skim!" The `code-review` skill launches 3 sequential subagent reviews. These designs are thorough but combinatorially expensive with max reasoning.

3. **Growing artifacts** — the fuel. As `epics.md` grows from 92K to 150K, `deferred-work.md` from 80K to 102K, and story spec files from 55K to 113K, each step has more to process. This doesn't cause overflow, but it increases the reasoning surface. More input → more to reason about → more reasoning tokens → more time. The growth is gradual but compounding.

4. **90-minute timeout too short for the combination** — the ceiling. The timeout was set when artifacts were smaller. As artifacts grow, steps that previously completed in 70–85 minutes now cross the 90-minute line. The `review-code` step is the clearest example: 3 sequential subagents × max reasoning × growing diffs/specs = consistently hitting the wall.

### Why `review-code` is the worst offender

The review-code step is structurally 3× a normal step: it launches Blind Hunter, Edge Case Hunter, and Acceptance Auditor as sequential subagent sessions. Each subagent:
- Loads the diff (growing as the codebase grows — now 52K lines of TS/TSX across 258 files)
- Loads project context (persistent fact)
- Edge Case Hunter and Acceptance Auditor also load the spec file (up to 113K)
- Runs with max reasoning
- Uses its own skill (`bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`)

Then the parent agent triages findings, applies patches, runs tests, and fixes failures — all with max reasoning. The 4.11 review-code trace shows 170 parts (tool calls + reasoning steps). The 4.10 proposal confirms: *"review-code timed out (rc:124) after launching 3 review subagents but before collecting or triaging."*

### Why `create-story` is the second worst offender

The create-story skill loads every planning artifact, reads previous story files, does web research, reads architecture files being modified, and then generates a comprehensive 50–113K story file — all with max reasoning. The 4.11 trace shows the agent gathered all context, said "Now let me create the comprehensive story file," and then spent the remaining 80+ minutes generating the story file with a pending `write` tool call when the timeout killed it.

### The phantom-halt feedback loop

Timeouts create a second-order problem: salvaged output from a timed-out run gets classified as `QUESTION` (because it's incomplete/mid-stream), which fires the question form. If nobody answers, the pipeline stalls for hours. The ledger records this as `infra-phantom-halt`. This is why some steps show 190–518 minute durations — they're not doing work for that long, they're waiting for a human who never comes.

### Steelman: maybe it IS the provider

One could argue the provider is slow at generating reasoning tokens, and `reasoningEffort: "max"` just exposes this. If the provider generates reasoning at, say, 500 tokens/second, a 100K-token reasoning chain takes 200 seconds. But if it's 100 tokens/second, that same chain takes 1000 seconds (16 min). We don't have token-generation-rate data to confirm or refute this. However, the fact that the same provider completes most steps in 2–15 minutes suggests it's not uniformly slow — the variance comes from the amount of work per step, not the provider's baseline speed.

---

## Recommendations

### Priority 1: Reduce `reasoningEffort` for high-volume pipeline steps (high impact, low effort)

Change `reasoningEffort` from `"max"` to `"medium"` (or `"high"`) for the `planner` and `coder` agents when running in the automated pipeline. The skills are designed to be thorough through their step-by-step structure, not through reasoning depth. Max reasoning is appropriate for interactive sessions where a human is waiting for a single high-stakes answer; it's excessive for an automated pipeline running 11 steps per story.

**Trade-off:** Lower reasoning may reduce the quality of story files or code reviews. But a completed step with medium reasoning is strictly better than a timed-out step with max reasoning (the salvaged output from a timeout is lower quality anyway).

**Implementation:** This could be done per-agent in `opencode.json` / `.opencode/agent/*.md`, or the pipeline could pass a `--reasoning-effort` flag to `opencode run` if supported.

### Priority 2: Increase the timeout for structurally expensive steps (high impact, low effort)

The 90-minute timeout is too short for `review-code` (3 sequential subagents) and `create-story` (exhaustive artifact analysis + story file generation). Either:
- Raise the global timeout to 120–150 minutes, or
- Make the timeout per-step in the playbook (e.g., `review-code: 150 min`, `create-story: 120 min`, others: 90 min)

**Trade-off:** Longer timeouts mean slower failure detection. A genuinely stuck run wastes more wall-clock time. Mitigate by combining with Priority 1 (lower reasoning effort means most runs will finish well under the timeout anyway).

### Priority 3: Add a timeout to the question form (high impact, medium effort)

The pipeline doc already identifies this as a known limitation: *"the human-question form inside BMAD Session (OpenCode) has no timeout, so an unanswered question stalls the loop indefinitely."* This caused 5 multi-hour stalls (190–518 minutes). A 15-minute timeout on the question form (after which the step is classified as `failed` and retried or halted) would eliminate the worst stalls.

**Trade-off:** A human might need more than 15 minutes to respond. But the current behavior (stalling for 8 hours) is strictly worse. The ntfy notification already alerts the human; a timeout just prevents the pipeline from hanging indefinitely if the notification is missed.

### Priority 4: Trim artifact loading in `create-story` (medium impact, medium effort)

The `create-story` skill loads everything exhaustively. Specific trims:
- **`deferred-work.md` (102K)**: Instead of loading the whole file, the playbook prompt could specify: "scan `deferred-work.md` for entries matching this story's file paths" — the agent should grep, not read the whole file.
- **`epics.md` (150K)**: The discover-inputs protocol loads the whole file. For create-story, only the current epic's section is needed. The skill could extract just the relevant epic.
- **Previous story file (up to 113K)**: Load only the "Dev Notes" and "Review" sections, not the entire file.
- **Web research (Step 4)**: This step does live web research for "latest technical specifics" — in an automated pipeline, this is rarely necessary and adds significant latency. Consider skipping it or making it optional.

**Trade-off:** Less context may cause the agent to miss relevant information. But the current behavior (loading 150K tokens, then timing out before finishing the story file) means the information isn't being used anyway.

### Priority 5: Make `review-code` subagents truly parallel or reduce their count (medium impact, high effort)

The 3 sequential subagent reviews are the structural bottleneck. Options:
- Run subagents as actual parallel opencode sessions (requires pipeline changes)
- Reduce to 2 subagents (merge Blind Hunter + Edge Case Hunter)
- For small diffs (under a threshold), skip the subagent pattern and do a single-pass review

**Trade-off:** Reducing review depth may lower review quality. But a timed-out review that never produces findings is lower quality than a completed single-pass review.

### Priority 6: Archive old traces (low impact, low effort)

The `traces/` directory is 86MB and growing. While traces aren't loaded into step context, they're available for the reflector to read via `trace-view.mjs`. Old traces (from completed epics) have diminishing value. A retention policy (e.g., keep last 2 epics' traces, archive the rest) would reduce storage and speed up reflector runs that scan trace directories.

---

## Risks and unknowns

1. **We don't have token-generation-rate data.** Cannot confirm whether the provider is slow at generating reasoning tokens or whether the volume of reasoning is the issue. If the provider is genuinely slow at max reasoning, Priority 1 is the correct fix. If the provider is fast but the reasoning volume is enormous, then artifact trimming (Priority 4) matters more.

2. **Lowering `reasoningEffort` is untested.** The pipeline has always run with `max`. Switching to `medium` or `high` might surface different failure modes (lower-quality story files, missed review findings). This should be tested on one story before rolling out.

3. **The `infra-phantom-halt` pattern may have a deeper cause.** The ledger records phantom halts as a symptom of timeouts, but the classification logic that turns salvaged output into `QUESTION` might have its own bugs. Fixing the timeout (Priorities 1–2) would reduce phantom halts, but the classification logic should also be hardened.

4. **The reflection loop can see the problem but cannot fix it.** This is by design (infra issues are human-only). But it means the system has been accumulating `infra-opencode-timeout` observations for weeks without action. The self-improving pipeline's learning loop has a gap: it correctly identifies the problem, correctly classifies it as out-of-scope for the machine, but has no mechanism to escalate it to a human beyond accumulating ledger entries. A notification threshold (e.g., "infra fingerprint recurring for the Nth time → ntfy alert") would close this loop.
