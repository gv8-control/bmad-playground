# Validation Report — bmad-easy

- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-06-14T00:00:00Z
- **Grade:** Fair

## Overall verdict

This PRD is technically well-formed: six of seven rubric dimensions grade strong, one grades adequate (downstream usability), and the "Consequences (testable)" pattern on every FR is among the best done-ness clarity seen at PRD level. Two cross-reference defects in the Assumptions Index — a ghost reference to a non-existent FR-18 and a missing A-11 — are the blocking downstream usability issues; both are mechanical fixes. The PRD earns a Fair grade because the rubric surfaced two high findings before the adversarial reviewer ran.

The adversarial review materially shifts the risk picture beyond what the rubric scores. Three critical findings surface concerns the rubric did not: the addressable market is bounded by BMAD's actual production user base rather than its GitHub star count, and that base is unquantified; LLM cost per session is unmodelled and could invert unit economics at the current flat per-seat price; and every critical technical layer (AG-UI emitter, Stop signal, PostToolUse hook, Daytona stability) requires custom work against undocumented or unstable APIs, making the MVP timeline fragile. The adversarial also elevates PAT onboarding from "known activation friction" to a potential activation wall, and identifies the success metrics as validating onboarding UX but not the business model.

## Dimension verdicts

- Decision-readiness — Strong
- Substance over theater — Strong
- Strategic coherence — Strong
- Done-ness clarity — Strong
- Scope honesty — Strong
- Downstream usability — Adequate
- Shape fit — Strong

## Findings by severity

### Critical (3) — from adversarial review

**[Adversarial]** — The addressable market is a population of one tool's existing users (§9, §2.1)
Stars and forks are not seats. There is no estimate of how many star-holders are on active teams using BMAD in production, what fraction include non-dev members actually blocked today, or whether non-dev users want to run sessions themselves. The buyer model requires three sequential conversions, all assumed. No customer discovery or signal that non-dev users have asked for this as a product are cited.
Fix: Add a market sizing note to §9 that distinguishes GitHub stars from estimated active production teams, and state what evidence exists that non-dev users are requesting access.

**[Adversarial]** — LLM cost passthrough is unmodelled and could invert unit economics (§10, §8, §11)
A non-dev PM running a PRD session could generate 50,000–200,000 tokens per session. A single session could cost $0.75–$3.00 in LLM spend alone. If a PM runs 4 sessions per month (implied by SM-6), LLM cost per seat per month could reach $3–$12 before any other costs. No unit economics calculation exists. NFR-O1 proves the team knows this is a risk but makes no attempt to bound it.
Fix: Add a cost model to §10 or §8: estimated LLM token cost per average session, estimated sessions per user per month, and the resulting per-seat cost floor.

**[Adversarial]** — Every critical technical layer requires custom work that does not exist (§8, A-4, A-9)
No official TypeScript adapter between the Claude Agent SDK and AG-UI exists; the Stop button requires distinguishing a user SIGINT from an idle timeout without a supported API path; the PostToolUse hook for Commit Pills is not documented as a stable API; Daytona's AGPL-3.0 "continuity fallback" is a large migration. These are sequential build dependencies labelled as "constraints" when they are unbuilt custom integrations.
Fix: Re-open §12: "Which of the four custom integration layers (AG-UI emitter, Stop signal, PostToolUse hook, Daytona API) has been prototyped?"

### High (6)

**[Downstream usability]** — A-7 cross-references FR-18 which does not exist (§13)
A-7 states "no read-only free tier. (§4.5 FR-18)" but the PRD defines FR-1 through FR-17 only. An architect or story author extracting A-7 will hit a dead reference.
Fix: Correct A-7's cross-reference to FR-17.

**[Downstream usability]** — A-11 is absent from the Assumptions Index (§13)
The index lists A-1 through A-10, then jumps to A-12. No inline `[ASSUMPTION: A-11]` appears in the body either. Leaves a permanent gap in a numbered sequence downstream readers will notice.
Fix: Either define A-11 or renumber A-12 to A-11 throughout.

**[Adversarial]** — PAT onboarding may be an activation wall, not friction (§4.1, §6.2, A-8)
Fine-grained GitHub PATs require multiple steps non-dev users have never done. Non-dev users may not have a GitHub account. The GitHub App that eliminates this step is deferred to post-MVP with a tautological trigger: you cannot measure the friction as a blocker until you have already lost users to it.
Fix: Either fast-track GitHub App as an MVP feature, or add a non-GitHub-account user path and acknowledge the risk explicitly in §12.

**[Adversarial]** — "Main branch only" is a team workflow blocker, not a minor caveat (§5, §8)
Teams with GitHub main branch protection rules enabled cannot use the platform. The PRD's target persona ("40-person SaaS company") very likely has main branch protection. Additionally, concurrent writes to the same Artifact path produce silent last-write-wins with no user-visible signal.
Fix: Add to §5: "Teams with GitHub main branch protection rules enabled cannot use the platform in MVP."

**[Adversarial]** — The "Why Now" window argument is circular (§9)
If Anthropic is actively reducing the non-dev access barrier, the moat can be replicated in a Claude Code Web update. The 12–24 month window estimate is undocumented with no competitive teardown. If Anthropic ships native BMAD support, the entire differentiation argument collapses.
Fix: Add a two-sentence answer to §9: "What prevents Anthropic from shipping this?"

**[Adversarial]** — Success metrics validate onboarding UX, not the business model (§11)
No metric for trial-to-paid conversion rate, net revenue retention, churn rate, or seat expansion. At the 6-month mark the team could hit all six success metrics and still be running at 90% churn.
Fix: Add: (1) trial-to-paid conversion rate ≥ 15%; (2) 90-day net revenue retention ≥ 80%; (3) month-2 seat expansion rate for accounts with ≥ 2 seats.

### Medium (5)

**[Decision-readiness]** — "No open questions remain" is implausible (§12)
Q-4 (repository size limit) was deferred without a threshold or owner. Closing it without a threshold is not a resolution.
Fix: Re-open Q-4 with: "No Repository size limit defined for MVP; Daytona provisioning time for Repositories > N GB is unvalidated against NFR-P2."

**[Strategic coherence]** — SM-5 is a milestone condition dressed as a metric (§11)
"At least one paying team includes a Director or VP-level buyer" is binary and says nothing about whether the GTM model is working.
Fix: Supplement with a ratio metric: "Percentage of paying accounts where the buyer holds Director or VP-equivalent title, target ≥ 30% within 6 months."

**[Downstream usability]** — SM-4 has no defined data collection mechanism (§11)
"Referenced in team-external documents" has no instrumentation path in MVP. A story author cannot write a story for this measurement.
Fix: Add proxy metric note: "External reference measurement not in MVP scope; proxy: percentage of platform Artifacts appearing in any git diff in the same Repository within 30 days."

**[Adversarial]** — Single-container NestJS backend is a hidden reliability risk (§8)
One process crash drops all active Skill Sessions. A 25-minute draft that has not yet committed is lost on a NestJS restart with no user-visible warning. A single high-profile session loss during beta will define the product's reputation.
Fix: Add to FR-10 a persistent indicator that work is ephemeral until committed.

**[Adversarial]** — Artifact commit failure leaves the user with no output and no recovery (§6.2)
Failed commit → no Commit Pill → user believes session produced no output. No fallback to show Artifact content in-chat. Git commit failures are not exotic edge cases.
Fix: "If the git commit fails, the BMAD Agent's error output must be visible in the chat stream; the Commit Pill is not emitted. Consider showing Artifact content inline on commit failure."

### Low (5)

**[Substance over theater]** — SM-4 assumes a detection mechanism that does not exist (§11)
See medium finding above. Also flagged here as a substance concern — if unmeasurable, it should be marked aspirational.

**[Done-ness clarity]** — FR-5 does not define behavior when the Repository read fails (§4.1)
Fix: "If the Repository read fails, the Project Map displays a read-failure notice; it does not silently render stale state."

**[Scope honesty]** — Artifact commit failure has no user-visible fallback defined (§6.2)
Fix: "If the git commit operation inside the Sandbox fails, the BMAD Agent's error output must be visible in the chat stream; the Commit Pill is not emitted."

**[Downstream usability]** — RBAC out-of-scope line in §6.2 should reference FR-17 explicitly (§6.2)
Fix: Add "(FR-17)" parenthetical to the RBAC out-of-scope line in §6.2.

**[Adversarial]** — No repository size limit creates an unquantified Sandbox risk (§12, decision log Q-4)
NFR-P2 will be violated at first real use on any Repository over a few hundred MB. Demo environments use clean test repos and will not surface this.
Fix: Add shallow clone or sparse checkout specification to §8 or FR-9, or add a Repository size guard with a user-visible error.

## Mechanical notes

- Glossary drift: None detected. All 13 terms used consistently. ✓
- FR IDs: FR-1 through FR-17, contiguous, no gaps. ✓
- UJ IDs: UJ-1 through UJ-3, contiguous. ✓
- NFR IDs: Contiguous within each group (S, P, R, O). ✓
- SM IDs: SM-1 through SM-6, SM-C1, SM-C2, contiguous. ✓
- Assumptions IDs: A-11 missing — gap between A-10 and A-12. ✗
- Cross-reference: A-7 references FR-18 (does not exist); correct to FR-17. ✗
- Assumptions roundtrip: A-1, A-5, A-6, A-7, A-10 appear only in the index with no inline tag in the body — minor inconsistency with §0.
- YAML frontmatter: Duplicate `status` key (lines 3 and 6). Parsers will use the last value (`ready-for-review`). Minor.
- UJ protagonist naming: All three UJs use "Sarah" consistently. ✓
- Required sections: All sections present (§0 through §13). ✓

## Reviewer files

- `review-rubric.md`
- `review-adversarial-general.md`
