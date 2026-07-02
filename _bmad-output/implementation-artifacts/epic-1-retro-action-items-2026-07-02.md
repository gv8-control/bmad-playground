# Epic 1 Retrospective — Action Items

**Epic:** 1 — Authentication & Repository Connection
**Date:** 2026-07-02
**Theme:** Continuous improvement of automated BMAD workflows toward hands-off story-to-story and inter-epic development

---

## Action Items

### 1. Define the Autonomy Boundary

**Owner:** Marius
**Context:** "Hands-off" is undefined without an explicit line between decisions the automated pipeline can make and decisions that require human sign-off.
**Action:** Write a one-pager defining which decisions the pipeline can make autonomously and which require Marius's input. Cover story creation, implementation, code review, status transitions, and deployment.
**Success criteria:** Document exists, covers all BMAD workflow decision points, and is referenced by the workflow automation.
**Priority:** Blocking — must exist before further automation expansion.

### 2. Fix ntfy Topic Security

**Owner:** Charlie (Senior Dev)
**Context:** The n8n-analyst execution 215 review flagged that the ntfy.sh topic `agent-outcome` is public and unauthenticated, carrying signed resume URLs. Reducing notification frequency (the noise-reduction goal) is unsafe while the channel is readable by anyone.
**Action:** Set up an authenticated ntfy topic and update the `Notify` node in the n8n workflow to use it.
**Success criteria:** ntfy topic requires authentication, resume URLs are not readable by anonymous subscribers, workflow notifications still deliver.
**Priority:** High — must be done before reducing notification frequency.

### 3. Wire Analyst as Automated Post-Execution Step

**Owner:** Dana (QA Engineer)
**Context:** The `bmad-n8n-analyst` skill currently runs only when manually invoked. The vision is an automated post-run quality gate: n8n workflow completes → analyst evaluates automatically → notify only on severity above threshold.
**Action:** Build an n8n webhook that triggers the analyst skill after every Develop Story run. Save reports to `_bmad-output/n8n-analysis/`. Configure a severity threshold (Critical/High) for ntfy notification.
**Success criteria:** Every Develop Story execution produces an analyst report automatically without manual invocation. Notifications fire only on Critical or High findings.
**Priority:** High — core piece of the continuous improvement loop.

### 4. Document the Workflow State Machine

**Owner:** Winston (Architect)
**Context:** The BMAD workflow IS a state machine — story statuses are states, skills are transitions. You can't automate or instrument what isn't explicitly defined.
**Action:** Map every BMAD skill transition (create-story → dev-story → code-review → status update) as a versioned state diagram. Produce it from the sprint-status.yaml status definitions and skill activation flows.
**Success criteria:** State diagram document exists, covers all story statuses and transitions, is versioned, and is referenced by workflow automation decisions.
**Priority:** Medium — enables structured workflow changes between epics.

### 5. Re-enable One Disabled Workflow Node

**Owner:** Elena (Junior Dev), with Charlie reviewing
**Context:** The n8n-analyst found that `Create story`, `Implement story`, and `Prepare tests` are disabled pass-throughs — the workflow only reviews code, it doesn't develop. These are the exact steps between "review only" and "fully hands-off development."
**Action:** Start with `Create story` — wire it to actually call the `bmad-create-story` skill. Run the analyst on the next execution to surface what breaks. Iterate.
**Success criteria:** `Create story` node executes the real skill, produces a story file, and the analyst report on the next run shows no new Critical findings introduced by the change.
**Priority:** Medium — incremental path to autonomy, one node at a time.

### 6. Build the Trend Accumulator

**Owner:** Amelia (Developer)
**Context:** Each analyst report is a snapshot. Patterns — which steps consistently stall, which findings recur — only emerge across multiple runs. No single report shows the trend.
**Action:** Create an index file in `_bmad-output/n8n-analysis/` that tracks severity counts, stall times, and recurring findings across runs. Append to it automatically after each analyst report is generated.
**Success criteria:** After 5 runs, the index shows actionable trend data (e.g., "code review stall appears in 4 of 5 runs" or "sequential-branch finding recurring").
**Priority:** Medium — becomes valuable once the automated post-execution loop (item 3) is running.

---

## Dependency Order

```
1 (autonomy boundary) ──────────────────────────────► blocks all expansion
2 (ntfy security) ───────────────────────────────────► before reducing notifications
3 (auto analyst) ────────────────────────────────────► enables 6 (trend data)
4 (state machine doc) ───────────────────────────────► enables structured workflow changes
5 (re-enable node) ──────────────────────────────────► depends on 1 and 4
6 (trend accumulator) ───────────────────────────────► depends on 3
```

## Notification Maturity Model

| Stage | Behavior | Trigger |
|-------|----------|---------|
| Current | Notify on every run | n8n workflow completion |
| Next | Notify on Critical/High findings only | Analyst severity threshold |
| Mature | Notify only on unresolvable anomalies | Pattern detection across runs |
| Final | Notify only on critical human decisions | Autonomy boundary (item 1) |
