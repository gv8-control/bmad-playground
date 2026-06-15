# Adversarial Review — bmad-easy PRD

## Preamble

The DL-7 OAuth change resolves the PAT usability barrier but immediately introduces a broader credential scope problem that will block enterprise adoption within the stated competitive window; the competitive moat argument in §9 remains self-contradictory because it simultaneously claims BMAD specificity is a durable structural moat and that a narrowing 4–10 month window must be closed before Claude Code Web makes that moat irrelevant; and the cost model still omits Daytona compute costs while using a gross margin floor as a pricing gate. A skeptical decision-maker would ask: can this product clear enterprise security reviews before the window closes, is the moat real or temporary, and does anyone actually know the unit economics?

---

## Findings

### Critical (3)

**OAuth `repo` scope is an enterprise sales blocker that trades one barrier for another** (§4.1 FR-1, A-6, §6.2, §8)

DL-7 removes PAT setup friction for the user, but the `repo` scope granted at sign-in gives the platform write access to every GitHub repository the user can access — not just the one connected. The PRD acknowledges this ("broader than required for a single connected Repository") and calls it "an accepted trade-off," but that framing understates the consequence. Any PM or BA at a company above roughly 30 people is subject to a security review before authorizing a third-party OAuth App with `repo` scope on their GitHub account. That scope, on a personal OAuth App (not a GitHub App with per-installation repository scoping), will fail most enterprise security reviews. The product's own §8 acknowledges a second blocker: GitHub organizations with OAuth App access restrictions will block the token entirely regardless of scope granted — requiring org-owner approval of the bmad-easy OAuth App. The competitive window is 4–10 months. If a meaningful share of the 1–200 person target companies have GitHub organization security policies enabled (common above 50 people), the product cannot be adopted until GitHub App integration ships. GitHub App integration is listed as post-MVP with a trigger that is itself dependent on observing failures in production. This is a go-to-market risk, not an implementation detail: the population most likely to pay $25–$30/seat (organized teams with defined roles, budget authority, and GitHub organizations) is also the population most likely to be blocked.

Fix: Either (a) move a minimal GitHub App integration to MVP — scoped to a single connected repository per installation — and accept the implementation cost against the competitive window argument, or (b) narrow the stated target market to personal-account and small-team GitHub users who are not subject to organization OAuth restrictions, and revise §9's buyer persona and addressable market accordingly. If (b), SM-5 ("VP/Director buyer conversion within 6 months") is unlikely to be achievable from the narrowed segment and must be reassessed.

---

**Competitive window argument is self-contradictory and the moat analysis is not present** (§9)

Section 9 makes two incompatible claims in the same paragraph. First: "As Claude Code Web matures, the 'browser-native access' differentiation narrows ... bmad-easy's durable advantages must be in users' hands within 12–18 months of Claude Code Web's launch." Second: "The BMAD methodology itself is the structural moat ... BMAD's skill-file architecture, Artifact conventions, and community are too niche for Anthropic or other large platform vendors to build specific support for." If BMAD specificity is the structural moat, Claude Code Web maturing its browser UX does not close the competitive window — BMAD users would still need bmad-easy for BMAD-specific functionality. But if the window closes because Claude Code Web is maturing, then BMAD specificity is not a durable moat: it is a temporary feature gap that erodes as general platforms improve. These two claims cannot both be true simultaneously. The deeper problem is that BMAD is open-source and Claude Code Web users can already run BMAD Skills in a browser session today using practitioner guides. The actual differentiation is platform UX (Project Map, Artifact Browser, commit attribution, team billing) — not methodology access. If that is the moat, it is a weak one: these are features, not structural advantages, and they are replicable. The PRD contains no competitive analysis of Claude Code Web, Cursor, or any BMAD community fork. The 12–18 month window and 12–24 month window are both stated in §9 and are not the same claim.

Fix: Resolve the contradiction by choosing a coherent moat thesis: either (a) "The moat is habit formation and BMAD community distribution; the window is about acquiring users before they default to Claude Code Web for BMAD" — then the window argument becomes about user acquisition speed, not feature parity; or (b) "The moat is platform UX specificity; BMAD access is table stakes" — then the moat section must evaluate how long it takes Claude Code Web to ship equivalent UX. Add a short competitor section covering Claude Code Web, any BMAD community tooling, and Cursor. Harmonize the window estimate to a single number with an explicit expiry date.

---

**Cost floor omits Daytona compute and is used as a pricing gate without an owner or deadline** (§10)

The cost model estimates $3–$6 LLM cost per active seat per month at SM-6 retention (4 sessions/month), against a $25–$30/seat price, and states the 60% gross margin floor "must be validated against the full cost floor (LLM + Daytona + infrastructure) after MVP launch." Daytona compute cost is explicitly listed as missing ("add cost on top") but no estimate is provided. This is the same gap the prior review identified; DL-7 did not address it. The problem is structural: the PRD uses the 60% gross margin floor as a decision gate ("if validated cost floor places gross margin below 60%, the pricing model must be revised"), but the gate cannot be evaluated without the missing input. Additionally: up to 10 concurrent Sandboxes per user are permitted (FR-11) with no idle timeout defined anywhere in the PRD. A user who opens 10 Conversations and walks away leaves 10 Sandboxes running indefinitely; the compute cost of idle Sandboxes is unbounded by any stated constraint. The per-session cost model assumed in §10 does not account for idle sandbox time. NFR-O1 covers LLM spend monitoring only; there is no observability requirement for Daytona compute spend.

Fix: Add a Daytona compute cost estimate (even an order-of-magnitude range) to §10. Add an idle Sandbox timeout requirement to §4.3 or §8 (e.g., Sandbox terminated after N minutes of no agent activity). Add an NFR-O2 for Daytona compute spend monitoring and alerting. Name an owner and a date for the cost floor validation task.

---

### High (3)

**Main-branch last-write-wins creates silent data loss on the core user journey** (§5, §6.2, §8)

The PRD defers conflict detection to post-MVP and accepts last-write-wins as the behavior when two concurrent Conversations commit to the same Artifact path. This is framed as a known constraint, but the consequence for the core user journey (UJ-2, SM-1) is that Sarah can complete a 20-minute PRD session, see "Progress saved" (Semantic Pill for a successful commit), and then have that committed Artifact silently overwritten by a concurrent session — with no notification and no recovery path visible to her. The Project Map reads from the latest committed state (FR-5), so the next page load will show the overwriting content with no indication that her work was replaced. For the primary success metric — unassisted session completion through to a committed Artifact — this is a failure mode that cannot be distinguished from success by the metric instrumentation. A pull-before-push sequence with a surfaced non-fast-forward error is a standard git operation that does not require branch workflows and would convert a silent data loss into a visible error. The complexity is low relative to the risk.

Fix: Add a requirement that the platform performs a pull-then-push sequence on every Agent-initiated and platform-initiated commit. Define the behavior when the fast-forward fails: surface an error Tool Pill in the chat and leave the working tree dirty (FR-14 amber state) rather than silently overwriting. This eliminates the silent data loss mode within MVP scope.

---

**Agent-initiated commit failure is a silent data loss path that directly undermines SM-1** (§4.3 FR-12)

FR-12 states that when any agent tool call fails, the failure appears as an error-state Tool Pill. However, the Semantic Pill for "Progress saved" is emitted for a `git commit` action — the PRD does not explicitly state that the Semantic Pill is only emitted on confirmed commit success. If the Agent emits the commit tool call and the platform promotes it to a "Progress saved" Semantic Pill before the commit result is confirmed, a user can see "Progress saved" and a "View" link for an Artifact that was not actually committed. The PRD does not define the timing relationship between tool call initiation, tool call completion, and Semantic Pill display. A first-session user who loses 20 minutes of work after seeing "Progress saved" will not return; this is a direct threat to SM-2 (repeat session rate ≥ 40%).

Fix: Clarify in FR-12 that the "Progress saved" Semantic Pill is only emitted after confirmed commit success (the tool call result is available and indicates success). Define the failure path explicitly: a failed `git commit` shows an error-state Tool Pill, not a "Progress saved" Semantic Pill. Ensure FR-14's working tree state indicator remains dirty if the commit fails.

---

**BMAD version compatibility is unspecified, creating a silent breakage path** (§2.2, §4.1 FR-2, §5, A-1)

The product's entire function depends on BMAD being initialized in the connected Repository — this is stated as a non-goal to fix and as A-1. However, BMAD is an open-source third-party project. The PRD does not address: BMAD version compatibility across releases, who is responsible for maintaining compatibility when BMAD's Skill directory structure, Artifact conventions, or `_bmad-output/` format changes, or how the platform detects when an incompatible BMAD version is in use. FR-2 validates only directory presence (`_bmad/`, `_bmad-output/`, `.claude/`) — it does not validate BMAD version or Skill file presence in `.claude/skills/`. A developer who upgrades BMAD in the Repository to a version that renames conventions may break the platform's Project Map parsing and Artifact Browser rendering silently. The developer champion is identified as the person who initializes BMAD; they may upgrade BMAD independently of bmad-easy's release cycle.

Fix: Add a BMAD version check to FR-2's validation (read a version indicator from the Repository's BMAD setup; surface a warning if outside the supported range). Add at least one Skill file presence check to FR-2 (`.claude/skills/` must exist and be non-empty; if empty, surface an explicit error rather than allowing the user to reach a Conversation with no available Skills). Define a compatibility matrix and ownership in the architecture document scope.

---

### Medium (4)

**Session timeout and Sandbox lifecycle are entirely unspecified** (§4.3 FR-11, FR-13, §8)

A Conversation's Sandbox is provisioned on page open (FR-9). The PRD does not state when a Sandbox is terminated. FR-13 says the platform manages re-initialization "transparently." With up to 10 concurrent Sandboxes per user and no idle timeout, a user who opens sessions and walks away imposes unbounded compute cost. This is both a cost control gap (relevant to the Critical cost floor finding) and a security surface (10 live Sandbox environments holding OAuth tokens). FR-4 and NFR-S4 address credential health and account deactivation, but neither covers Sandbox expiry during normal use. The architecture document cannot define this correctly without a bounded requirement from the PRD.

Fix: Add a constraint in §8 specifying a maximum idle Sandbox lifetime (e.g., Sandbox auto-terminated after 30 minutes of no agent activity, with a user-visible warning before termination). This bounds compute cost exposure and reduces the active credential surface for idle sessions.

---

**SM-1's "unassisted" definition has no measurement mechanism** (§11)

SM-1 is the primary success metric: percentage of new non-dev users who complete a full Skill run through to a committed Artifact *without assistance*. "Assistance" is not defined, and no platform requirement captures whether a session was assisted or unassisted. The Semantic Pill for `git commit` can confirm that a commit occurred, but not that no assistance was involved. Without a definition of "unassisted" and a mechanism to tag sessions accordingly, SM-1 can only be reported as "session completion rate" — which is a weaker and differently-shaped signal. A metric without an instrumentation path is a goal statement.

Fix: Define "unassisted" (e.g., no support ticket opened against that session, no inbound contact from the user's developer teammate on the same day, no platform error escalation). Add a data requirement specifying how sessions are tagged as assisted vs. unassisted, even if the initial implementation is manual (support tickets linked to sessions).

---

**OAuth token has no rotation or revocation requirement beyond account deactivation** (§4.1 FR-4, NFR-S4, NFR-S5)

GitHub OAuth tokens for OAuth Apps do not expire unless revoked. The platform stores them encrypted at rest (NFR-S5) and monitors for 401/403 (FR-4), but has no requirement for proactive rotation, periodic re-authorization prompts, or purge of tokens for inactive accounts. NFR-S4 requires Sandbox termination on account deactivation but does not require token revocation. A token stored for a user who stopped using the platform 18 months ago remains a valid `repo`-scope credential to all repositories that user could access at the time. The `repo` scope (all accessible repositories) makes dormant token exposure higher risk than typical stored credentials.

Fix: Extend NFR-S4 to require OAuth token revocation on account deactivation (via GitHub's token revocation API). Add a token re-authorization interval requirement (e.g., force re-authorization every 90 days). Add a dormant account purge requirement (purge stored tokens for accounts inactive beyond a defined threshold).

---

**EU Data Act compliance is asserted with no derived requirements** (§8)

§8 states "EU Data Act (effective September 2025). Data portability in machine-readable formats and mandatory switching rights must be designed into the product architecture from launch. These cannot be retrofitted." No requirement in §4 implements this. "Machine-readable export" of Artifacts, a "switching" mechanism, and any API or export surface are absent from the PRD. "These cannot be retrofitted" is stated as a warning but then not acted on — the PRD proceeds without deriving any requirement from it. If the platform serves EU customers (implied by the statement's presence), this is an open compliance gap at launch.

Fix: Either derive concrete minimum requirements from the EU Data Act claim — at minimum, specify what Artifact export means (raw files? ZIP download? Git clone access?) and what "switching" means in this context — or explicitly defer them to post-MVP with a named risk owner and a date by which requirements must exist.

---

### Low (2)

**Window estimate is inconsistent within §9** (§9)

Section 9 gives two different window estimates: "12–18 months of Claude Code Web's launch" in one paragraph and "12–24 months" in the sentence immediately after. These are different claims with different urgency implications. Combined with "8 months elapsed / 4–10 months remaining," the arithmetic is only consistent with the 12–18 month estimate. The 12–24 month figure appears to be a separate "first-mover window" claim but is not distinguished from the Claude Code Web window.

Fix: Harmonize to a single window estimate. State an explicit projected window-close date (e.g., "window closes approximately Q2–Q4 2027") to make the timing argument falsifiable and anchor planning.

---

**Settings page as "coming soon" is a trust signal problem for a premium-priced product** (§8 navigation model)

The navigation model specifies that Settings is present in MVP as an empty "coming soon" page. The user avatar (initials circle) in the persistent side navigation is the entry point to Settings, making it a visible, prominent surface. A product priced at $25–$30/seat that shows an empty "coming soon" page when the user clicks their own avatar undermines the premium positioning during the evaluation period when the developer champion is building an internal case (UJ-1, buyer persona §2.1).

Fix: Either hide the Settings entry point until it has real content, or populate it with minimal useful MVP content: connected Repository status, re-auth action, account email, and sign-out. The latter option also addresses the re-auth flow surfaced in FR-4, which currently has no specified navigation entry point.
