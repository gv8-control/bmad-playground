# Validation Report — bmad-easy

- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-06-15T13:45:00Z
- **Grade:** Poor

## Overall verdict

This PRD is structurally strong: all seven rubric dimensions score strong or adequate, the Vision has a specific and earned thesis, every FR carries testable consequences, NFRs have real numeric targets, and the DL-7 OAuth update visibly improved the onboarding story by removing the PAT setup step that contradicted the access-barrier premise.

The adversarial review shifts the grade to Poor by surfacing three critical strategic gaps that survive DL-7. The OAuth `repo` scope fixes PAT friction but trades it for an enterprise security blocker: the scope grants write access to every repository the user can access, and the buyer segment most likely to pay — organized teams in GitHub organizations above ~30–50 people — is precisely the segment most likely to be blocked by org-level OAuth App restrictions or security reviews. The competitive window argument in §9 remains self-contradictory: BMAD specificity cannot simultaneously be a durable structural moat and be eroded by Claude Code Web within 4–10 months. Daytona compute costs remain absent from the cost model while the 60% gross margin floor — computed without them — gates the pricing decision. A skeptical decision-maker at a green-light gate would challenge all three before approving further investment.

## Dimension verdicts

- Decision-readiness — Strong
- Substance over theater — Strong
- Strategic coherence — Strong
- Done-ness clarity — Adequate
- Scope honesty — Strong
- Downstream usability — Strong
- Shape fit — Strong

## Findings by severity

### Critical (3)

**[Adversarial]** — OAuth `repo` scope is an enterprise sales blocker that trades one barrier for another (§4.1 FR-1, A-6, §6.2, §8)
DL-7 removes PAT setup friction, but the `repo` scope gives the platform write access to every GitHub repository the user can access — not just the connected one. Any PM or BA at a company above ~30 people is subject to a security review before authorizing a third-party OAuth App with `repo` scope. That scope, on a personal OAuth App, will fail most enterprise security reviews. §8 acknowledges a second blocker: GitHub organizations with OAuth App access restrictions will require org-owner approval regardless of scope granted. The population most likely to pay $25–$30/seat (organized teams in GitHub organizations) is also the population most likely to be blocked. GitHub App integration is post-MVP with a trigger dependent on observing production failures — meaning the blocker must manifest before the fix ships.
Fix: Either (a) move a minimal GitHub App integration to MVP — scoped to a single connected repository per installation; or (b) narrow the stated target market to personal-account and small-team GitHub users not subject to organization OAuth restrictions, and revise §9's buyer persona, addressable market, and SM-5 accordingly.

**[Adversarial]** — Competitive window argument is self-contradictory and moat analysis is absent (§9)
§9 makes two incompatible claims: "As Claude Code Web matures, the 'browser-native access' differentiation narrows … bmad-easy's durable advantages must be in users' hands within 12–18 months" and "The BMAD methodology itself is the structural moat … too niche for Anthropic to build specific support for." If BMAD specificity is the structural moat, Claude Code Web maturing does not close the window. If the window closes, BMAD specificity is not a durable moat. Both cannot be true. BMAD is open-source and Claude Code Web users can already run BMAD Skills today using practitioner guides; the actual differentiation is platform UX (Project Map, Artifact Browser, team billing), which is replicable. The PRD contains no competitive analysis of Claude Code Web. The 12–18 month and 12–24 month window estimates in §9 are also inconsistent arithmetic.
Fix: Choose a coherent moat thesis: "habit formation and BMAD community distribution" (the window is about acquisition speed) or "platform UX specificity" (evaluate how fast Claude Code Web can ship equivalent UX). Add a short competitor section. Harmonize to a single window estimate with an explicit projected expiry date.

**[Adversarial]** — Cost floor omits Daytona compute and is used as a pricing gate without owner or deadline (§10)
The cost model estimates $3–$6 LLM cost per active seat and uses the 60% gross margin floor as a pricing gate — but Daytona compute is explicitly listed as missing ("add cost on top") with no estimate. This gap is unchanged from the prior validation. Up to 10 concurrent Sandboxes per user are permitted (FR-11) with no idle timeout defined anywhere, making the per-session cost model an undercount. NFR-O1 covers LLM spend monitoring only; there is no observability requirement for Daytona compute spend. The gate cannot be evaluated without the missing input.
Fix: Add a Daytona compute cost estimate (even an order-of-magnitude range) to §10. Add an idle Sandbox timeout requirement to §4.3 or §8. Add an NFR-O2 for Daytona compute spend monitoring and alerting. Name an owner and a date for the cost floor validation task.

### High (5)

**[Rubric]** — Sandbox re-initialization recovery is not testable (§4.3 FR-13)
FR-13 states the platform handles re-initialization "transparently" and the user "sees a loading indicator." No condition defines when re-initialization is triggered, what the maximum wait is, or when the platform surfaces a hard failure. "Transparent" is not a testable condition.
Fix: Add: what triggers a re-initialization attempt; a maximum wait duration before surfacing an error; and the user-visible state when re-initialization fails.

**[Rubric]** — Concurrent-write last-write-wins has no user-visible consequence specified (§6.2, §8)
The constraint is honestly named, but the PRD does not specify what the losing user sees. Is the earlier commit silently overwritten? Does the user whose commit "lost" receive any indication?
Fix: At minimum, add a consequence statement naming the behavior. Then evaluate whether a pull-before-push sequence (converting silent data loss to a visible error) is in scope for MVP.

**[Adversarial]** — Main-branch last-write-wins creates silent data loss on the core user journey (§5, §6.2, §8)
Sarah can complete a 20-minute PRD session, see "Progress saved," and then have that Artifact silently overwritten by a concurrent session — with no notification and no recovery path. This is a failure mode that cannot be distinguished from success by SM-1's metric instrumentation. A pull-before-push sequence is standard git and converts silent data loss to a visible error without requiring branch workflows.
Fix: Add a requirement that the platform performs a pull-then-push sequence on every Agent-initiated and platform-initiated commit. Define the failure behavior: surface an error Tool Pill and leave the working tree dirty (FR-14 amber state) rather than silently overwriting.

**[Adversarial]** — "Progress saved" Semantic Pill timing undefined — may display before commit is confirmed (§4.3 FR-12)
The PRD does not define the timing relationship between tool call initiation, tool call completion, and Semantic Pill display. If the platform promotes a `git commit` to "Progress saved" before the commit result is confirmed, a user can see "Progress saved" for an Artifact that was not actually committed. A first-session user who loses 20 minutes of work after seeing "Progress saved" will not return — this directly threatens SM-2 (repeat session rate ≥ 40%).
Fix: Clarify in FR-12 that the "Progress saved" Semantic Pill is only emitted after confirmed commit success. Define the failure path: a failed `git commit` shows an error-state Tool Pill, not a "Progress saved" Semantic Pill. Ensure FR-14's working tree indicator remains dirty if the commit fails.

**[Adversarial]** — BMAD version compatibility is unspecified, creating a silent breakage path (§2.2, §4.1 FR-2, §5, A-1)
BMAD is an open-source third-party project. The PRD does not address BMAD version compatibility across releases, who maintains compatibility when BMAD's Skill directory structure or Artifact conventions change, or how the platform detects an incompatible BMAD version. FR-2 validates only directory presence — not BMAD version or Skill file presence. A developer who upgrades BMAD to a version that renames conventions may break Project Map parsing and Artifact Browser rendering silently.
Fix: Add a BMAD version check to FR-2's validation. Add a Skill file presence check (.claude/skills/ must exist and be non-empty). Define a compatibility matrix and ownership scope in the architecture document.

### Medium (7)

**[Rubric]** — NFR-P2 scope boundary not closed in PRD (§12 Q-1, §7)
The open question is correctly flagged and owner-assigned, but it lands in the architecture document. If that document has not yet been started, nothing prevents a build decision being made with NFR-P2's scope undefined.
Fix: Add a sentence to §7 Performance noting that NFR-P2 applies to repositories under ~200 MB; the architect's task in Q-1 is to document the number, not to decide it.

**[Rubric]** — FR-3 commit attribution email fallback unspecified (§4.1 FR-3)
FR-3 is clear on where name comes from but does not specify behavior when the GitHub OAuth profile returns no public primary email.
Fix: Add: what happens when the GitHub OAuth profile returns no email — whether a fallback identity is used, the commit is blocked, or a placeholder email is generated.

**[Rubric]** — Agent behavior after tool call failure unspecified (§4.3 FR-12)
FR-12 specifies that failures appear as error-state Tool Pills, but does not specify whether the Agent continues its turn after a tool call failure, stops and waits, or requires user input before the next turn.
Fix: Add: whether the Agent continues its turn after a tool call failure or pauses; and whether the user must take action before the session continues.

**[Adversarial]** — Session timeout and Sandbox lifecycle entirely unspecified (§4.3 FR-11, FR-13, §8)
The PRD does not state when a Sandbox is terminated. With up to 10 concurrent Sandboxes per user and no idle timeout, a user who opens sessions and walks away imposes unbounded compute cost and leaves 10 live Sandbox environments holding OAuth tokens active.
Fix: Add a constraint in §8 specifying a maximum idle Sandbox lifetime (e.g., auto-terminated after 30 minutes of no agent activity, with a user-visible warning before termination).

**[Adversarial]** — SM-1 "unassisted" has no definition and no measurement mechanism (§11)
"Assistance" is not defined and no platform requirement captures whether a session was assisted or unassisted. Without a definition and instrumentation path, SM-1 can only be reported as "session completion rate."
Fix: Define "unassisted" (e.g., no support ticket opened against that session). Add a data requirement specifying how sessions are tagged as assisted vs. unassisted.

**[Adversarial]** — OAuth token has no rotation or revocation requirement beyond account deactivation (§4.1 FR-4, NFR-S4, NFR-S5)
GitHub OAuth tokens for OAuth Apps do not expire unless revoked. A token stored for a user inactive for 18 months remains a valid `repo`-scope credential to all repositories that user could access at the time. NFR-S4 addresses account deactivation but not dormant token exposure.
Fix: Extend NFR-S4 to require OAuth token revocation on account deactivation. Add a token re-authorization interval requirement (e.g., every 90 days). Add a dormant account purge requirement.

**[Adversarial]** — EU Data Act compliance asserted with no derived requirements (§8)
§8 states EU Data Act requirements "cannot be retrofitted" but no requirement in §4 implements this. "Machine-readable export" of Artifacts, a "switching" mechanism, and any export surface are absent from the PRD.
Fix: Derive concrete minimum requirements (what Artifact export means, what switching means in this context) or defer explicitly to post-MVP with a named risk owner and a date by which requirements must exist.

### Low (7)

**[Rubric]** — SM-4 absent from metrics sequence (§11)
SM-1, SM-2, SM-3, SM-5, SM-6 are present; SM-4 does not appear and no note explains the gap.
Fix: Either restore SM-4 or renumber SM-5 and SM-6 to SM-4 and SM-5.

**[Rubric]** — NFR-S1 missing from Security NFR sequence (§7)
Security NFRs are numbered S2 through S5 with no S1 and no note explaining the gap.
Fix: Renumber S2–S5 to S1–S4, or add a note explaining the gap.

**[Rubric]** — FR-16 Artifact ordering deferred without fallback (§4.4 FR-16)
"Artifact ordering is to be determined by the UX spec" creates a hard dependency on a downstream spec for an otherwise implementable FR.
Fix: Add a default ordering (e.g., "most recently committed first") as the fallback. Mark the deferral as [NOTE FOR PM].

**[Rubric]** — [NON-GOAL for MVP] on session lifetime conflates non-goal with deferred decision (§4.5 FR-18)
A session lifetime of 15 minutes is within the space of "framework defaults" and would eject non-dev users mid-Conversation. This is a deferred decision, not a non-goal.
Fix: Replace the [NON-GOAL for MVP] tag with [NOTE FOR PM] and add a preference signal: session lifetime should be at least 8 hours.

**[Rubric]** — Side navigation specification located in Constraints, not Features (§8)
The navigation model (5 Conversations in side nav, semantic labels, breadcrumb model, Settings placeholder) is embedded in §8 Constraints rather than §4 Features. The UX designer will need to read §8 to find this.
Fix: Move navigation model to §4 or add a cross-reference in §8.

**[Adversarial]** — Window estimate is internally inconsistent (§9)
§9 gives two different window estimates: "12–18 months of Claude Code Web's launch" and "12–24 months" in adjacent sentences. Combined with "8 months elapsed / 4–10 months remaining," the arithmetic is consistent only with the 12–18 month estimate.
Fix: Harmonize to a single window estimate with an explicit projected expiry date.

**[Adversarial]** — Settings "coming soon" is a trust signal problem during developer champion evaluation (§8 navigation model)
A product priced at $25–$30/seat that shows an empty "coming soon" page when the user clicks their own avatar undermines the premium positioning during the developer champion's internal evaluation period.
Fix: Either hide the Settings entry point until it has real content, or populate it with minimal MVP content: connected Repository status, re-auth action, account email, and sign-out.

## Mechanical notes

- **Glossary drift:** None detected. Capitalized terms used consistently across all sections.
- **ID continuity:** FR-1–19 contiguous. UJ-1–3 contiguous. NFR-S2–S5 (gap at S1, unexplained). SM-1–3, SM-5–6 (gap at SM-4, unexplained). NFR-P1–P5, NFR-R1–R4, NFR-O1 contiguous.
- **Assumptions Index roundtrip:** A-1 through A-7 all indexed in §13 with inline tags. A-4 and A-5 marked resolved. No orphans.
- **UJ protagonist naming:** All three UJs carry "Sarah" as named protagonist with context inline. Clean.
- **Required sections:** All sections present and substantively populated for a chain-top greenfield SaaS PRD at this stake level.

## Reviewer files

- `review-rubric.md`
- `review-adversarial-general.md`
