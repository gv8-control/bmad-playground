# Investigation: Visual drift between UX mockups and the application

## Hand-off Brief

1. **What happened.** Confirmed: significant visual drift exists between the 7 authoritative UX mockups and the `apps/web` implementation — 102 findings across all surfaces (10 High, 32 Medium, 60 Low), plus 3 token-config gaps. Token values match exactly (42/42); the drift is structural (missing containers, wrong layouts), token-usage (wrong tokens applied), and copy-level — not token-value drift.
2. **Where the case stands.** Root cause Confirmed at two levels: (a) per-surface structural omissions (missing card containers, missing empty-state designs, non-inline tool pills), and (b) a systemic pattern — the prior conversation-drift spec (commit c7c1c5a) fixed token/attribute drift in one cluster but no broader mockup-vs-implementation audit was ever performed. 6 of 7 surfaces were never compared to their mockups post-implementation.
3. **What's needed next.** A fix pass aligned to the 7 drift mechanisms identified below. Highest leverage: restore missing visual containers (6 surfaces), fix the Breadcrumb/header layout (affects every depth-1 page), and inline tool/semantic pills in the conversation stream. Recommend `bmad-create-story` to scope the fix work, or `bmad-correct-course` if the sprint plan needs adjustment.

## Case Info

| Field            | Value                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Ticket           | N/A                                                                                                                                |
| Date opened      | 2026-07-08                                                                                                                         |
| Status           | Concluded                                                                                                                          |
| System           | bmad-easy monorepo — Nx 23 + Yarn Berry; apps/web: Next.js 16 (App Router), React 19, Tailwind 3.4.19 + shadcn/ui (new-york, dark-first) |
| Evidence sources | 7 HTML mockups, DESIGN.md, EXPERIENCE.md, epics.md (UX-DR1–20), tailwind.config.ts, global.css, 50+ component files, prior drift spec |

## Problem Statement

User-reported (verbatim): "there is significant visual drift between UX mockups and the application itself."

**Verdict: Confirmed.** The evidence validates the user's premise.

## Evidence Inventory

| Source                                                                 | Status    | Notes                                                                                                                                            |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| UX mockups (HTML) — `ux-designs/.../mockups/*.html`                    | Available | 7 files read by subagents. All compared against implementations.                                                                                  |
| DESIGN.md — `ux-designs/.../DESIGN.md`                                 | Available | 446 lines. Read in full by token-audit subagent. 42 primitive tokens + 1 prose-only shadow token.                                                |
| EXPERIENCE.md — `ux-designs/.../EXPERIENCE.md`                        | Available | 459 lines. Referenced by conversation subagent for spine-backed findings.                                                                        |
| epics.md — UX-DR1–UX-DR20                                              | Available | 20 design requirements. Read for context.                                                                                                         |
| tailwind.config.ts — `apps/web/tailwind.config.ts`                     | Available | 65 lines. Read in full. 42 tokens match DESIGN.md exactly.                                                                                        |
| global.css — `apps/web/src/app/global.css`                             | Available | 26 lines. No `:root` CSS variables; only `@apply` utilities. Note: file is `global.css` not `globals.css` (naming inconsistency with Next.js convention). |
| All component files — `apps/web/src/components/**/*` and `apps/web/src/app/**/*` | Available | 50+ files read by 7 parallel subagents. All cited with `path:line` references.                                                                    |
| Prior drift spec — `spec-ux-spec-drift-conversation-ui.md`            | Available | 9/9 prior fixes verified as landed in current code.                                                                                               |
| Visual diff / screenshot evidence                                     | Missing   | No automated visual-regression exists. Findings are from code-vs-mockup comparison, not pixel-level screenshot diff. Empirical confirmation would require rendering both. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Read DESIGN.md design tokens; diff against `tailwind.config.ts` | High | Done | 42/42 values match; 3 gaps found (font weights, box shadow, spacing.base). |
| 2 | Diff each of 7 HTML mockups against its implementation surface | High | Done | 102 findings across all surfaces. |
| 3 | Verify prior conversation-drift spec fixes landed at/after c7c1c5a | Medium | Done | 9/9 fixes verified. |
| 4 | Inventory non-conversation surface components | High | Done | All surfaces inventoried and audited. |

## Timeline of Events

| Time        | Event                                                                                  | Source                | Confidence |
| ----------- | -------------------------------------------------------------------------------------- | --------------------- | ---------- |
| 2026-06-15  | UX spine authored (DESIGN.md, EXPERIENCE.md, 7 HTML mockups)                           | ux-designs dir name   | Confirmed  |
| 2026-07-05  | Prior spec patched conversation-UI drift (7 classes), baseline_commit c7c1c5a         | spec frontmatter      | Confirmed  |
| 2026-07-08  | Comprehensive mockup-vs-implementation audit performed across all 7 surfaces + shell    | this investigation    | Confirmed  |
| 2026-07-08  | User reports significant visual drift persists                                         | user statement        | Confirmed  |

## Confirmed Findings

### Finding 1: Token values match exactly — drift is NOT token-value drift

**Evidence:** Token-audit subagent compared all 42 primitive tokens in DESIGN.md frontmatter against `tailwind.config.ts`. 18 colors, 2 font families, 6 font sizes, 6 border radii, 10 numbered spacing values — all match exactly. No mismatches.

**Detail:** The user's "visual drift" is not caused by wrong token values. The token system is faithfully implemented. The drift comes from (a) wrong tokens being *selected* in components (token-usage drift), (b) missing structural elements, and (c) layout divergences.

### Finding 2: 3 token-config gaps create latent drift risk

**Evidence:** `tailwind.config.ts` audit.

1. **Font weights not enforced** — DESIGN.md defines `regular=400, medium=500, semibold=600` and proscribes weights above 600 (line 445). Tailwind config has no `fontWeight` key, so defaults (including `font-bold=700`, `font-extrabold=800`) remain available. No functional impact today, but the constraint is unenforced.
2. **Floating-element box shadow missing** — DESIGN.md line 327 specifies `0 8px 24px rgba(0,0,0,0.4)` for dropdowns/popovers/pickers. No `boxShadow` key in config. Implementers hardcode or use `shadow-lg` (wrong value).
3. **`extend` rather than full override** — the config uses `theme.extend`, leaving the entire default Tailwind palette (`text-red-500`, `bg-gray-400`, `rounded-3xl`, etc.) available alongside the design system. Any use of these is silent drift.

### Finding 3: 102 drift findings across 7 surfaces + shared shell

**Evidence:** 7 parallel subagent audits, each comparing mockup HTML against implementation components with `path:line` citations.

| Surface | Findings | High | Medium | Low | Fidelity |
|---------|----------|------|--------|-----|----------|
| Shared Shell (SideNav, AppShell, Breadcrumb) | 15 | 2 | 9 | 4 | Medium |
| Sign-In | 14 | 2 | 4 | 8 | Low |
| Onboarding | 21 | 2 | 9 | 10 | Low–Medium |
| Project-Map | 12 | 0 | 2 | 10 | High |
| Artifact-Browser | 13 | 1 | 1 | 11 | Medium |
| Conversation + New-Conversation | 21 | 2 | 5 | 14 | Medium |
| Settings | 6 | 1 | 2 | 3 | Low |
| **Total** | **102** | **10** | **32** | **60** | |

### Finding 4: Prior conversation-drift spec fixes all landed (9/9 verified)

**Evidence:** Conversation subagent verified all 9 fixes from `spec-ux-spec-drift-conversation-ui.md` against current code.

**Detail:** The prior spec successfully closed the 7 drift classes it targeted (input-disable, scroll-to-bottom, copy affordances, timestamps, typography scale, a11y attributes, token mismatches). However, it was scoped to token/attribute-level fixes and did not address structural concerns (chat-input container, inline tool pills, column centering). 21 new/residual findings were discovered beyond the prior spec's scope.

### Finding 5: Drift clusters into 7 identifiable mechanisms

**Evidence:** Cross-surface synthesis of all 102 findings.

1. **Missing visual containers/panels** (6 surfaces) — sign-in auth card, onboarding form panel, onboarding BMAD-not-found panel, settings coming-soon empty-state, artifact-browser frontmatter badge, conversation chat-input box.
2. **Structural/architectural divergence** (shell + conversation) — nav links relocated, "Settings" label removed, wordmark brand mark lost, tool/semantic pills not inline, new-conversation empty-state simplified, SessionStartSpinner in wrong zone.
3. **Layout/spacing drift** (all surfaces) — breadcrumb stacked vs inline (affects every depth-1 page), missing header bottom divider (all pages), double horizontal padding, active-state styling, 824px column not centered.
4. **Token-usage drift** (multiple surfaces) — correct tokens exist but wrong ones used: `text-3` instead of `accent` for hover, `bg-surface` instead of `bg-bg` for input, `text-2` instead of `text-1` for labels, `text-bg` instead of `text-accent-fg` on accent buttons, `border-subtle` instead of `surface-raised` for hairlines.
5. **Missing scrollbar hiding** (3 surfaces) — DESIGN.md requires `scrollbar-width: none` on scrollable panels; not implemented anywhere.
6. **Copy/text drift** (3 surfaces) — taglines, placeholders, error messages, link text differ from mockups.
7. **Token-config gaps** (structural) — unenforced font weights, missing box-shadow token, `extend`-based config leaving defaults available.

## Deduced Conclusions

### Deduction 1: The drift is systemic, not localized

**Based on:** Finding 3 (102 findings across all 7 surfaces), Finding 4 (prior spec was narrowly scoped)

**Reasoning:** The prior conversation-drift spec proved drift occurred in one cluster. This audit proves it is pervasive — every surface has drift, and 6 of 7 surfaces had never been audited against their mockups. The pattern is not "one developer made mistakes in one area" but "no systematic mockup-vs-implementation verification was performed after implementation."

### Deduction 2: Token values are not the problem; token usage and structure are

**Based on:** Finding 1 (42/42 values match), Finding 5 mechanism 4 (token-usage drift)

**Reasoning:** The design-token system in `tailwind.config.ts` faithfully encodes DESIGN.md. The drift comes from components selecting the wrong token (e.g. `text-3` for a hover border instead of `accent`), omitting structural containers that hold tokens, or using non-design-system defaults (e.g. `shadow-lg`). Fixing token values would change nothing; fixing token *selection* and restoring missing structural elements is the work.

### Deduction 3: The Breadcrumb/header layout is the highest-leverage single fix

**Based on:** Shell Finding 14 (breadcrumb stacked vs inline), Shell Finding 15 (missing header divider), repeated across project-map, artifact-browser, conversation, settings audits.

**Reasoning:** The Breadcrumb component renders as its own stacked row above the title with `py-4` padding, when the mockup places it inline beside the title on a single row. Additionally, no page renders the 1px header bottom divider. This affects every depth-1 page (conversation, artifact-browser, settings, new-conversation). Fixing the Breadcrumb component + adding `border-b` to page headers would improve fidelity on 4 surfaces with a single change.

## Hypothesized Paths

### Hypothesis 1: Significant visual drift exists between mockups and the application

**Status:** Confirmed

**Theory:** The user's reported premise — the rendered app does not match the UX mockups across one or more surfaces.

**Supporting indicators:** 102 findings across all 7 surfaces, including 10 High-severity items. Every surface has at least Medium-severity drift.

**Would confirm:** Side-by-side comparison showing material divergence. ✓ Done — 102 findings.

**Would refute:** Implementation matches mockups within acceptable tolerance. ✗ Not the case.

**Resolution:** Confirmed. The user's premise is validated by the evidence.

### Hypothesis 2: Design-token drift (DESIGN.md → tailwind.config.ts) is a root or contributing cause

**Status:** Refuted (as stated) / Partially Confirmed (revised)

**Theory:** If the Tailwind theme does not faithfully encode DESIGN.md's tokens, every surface drifts uniformly.

**Supporting indicators:** Prior spec corrected several token mismatches at component level.

**Would confirm:** A diff showing missing, renamed, or mis-valued tokens.

**Would refute:** The Tailwind theme matches DESIGN.md token-for-token.

**Resolution:** Refuted as stated — 42/42 token values match exactly. Revised: the *structural config* (using `extend` rather than full override, missing `boxShadow`/`fontWeight` keys) creates drift *risk* but not active value drift. The active drift is token-*usage* (wrong tokens selected in components) and structural (missing containers), not token-*definition*.

## Missing Evidence

| Gap | Impact | How to Obtain |
|-----|--------|---------------|
| Pixel-level screenshot comparison | Would empirically confirm/refute visual severity (some findings may be imperceptible at render time) | Render each mockup HTML + live route in a browser; capture and diff screenshots. Playwright MCP could automate this. |
| Design intent for shell structural changes | Two High-severity shell findings (nav links relocated, "Settings" label removed) could be intentional redesigns | Ask the designer/PM whether the shell layout was deliberately changed from the mockup. |

## Source Code Trace

| Element | Detail |
|---------|--------|
| Error origin | N/A — fidelity gap, not a crash |
| Trigger | Implementation built without systematic mockup verification; prior spec covered only conversation cluster |
| Condition | Components omit structural containers, select wrong tokens, and diverge on layout from mockups |
| Related files | `apps/web/tailwind.config.ts`; `apps/web/src/components/shell/*`; `apps/web/src/components/conversation/*`; `apps/web/src/components/project-map/*`; `apps/web/src/components/artifact-browser/*`; `apps/web/src/components/onboarding/*`; all `page.tsx` files |

## Conclusion

**Confidence:** High

The user's report of "significant visual drift" is **Confirmed**. A comprehensive audit of all 7 mockup surfaces plus the shared shell against their implementations yielded **102 findings** (10 High, 32 Medium, 60 Low) plus 3 token-config gaps. Every surface has drift; the lowest-fidelity surfaces are Sign-In, Settings, and Onboarding; the highest-fidelity is Project-Map.

The root cause is **not token-value drift** (42/42 tokens match exactly) but rather: (1) missing visual containers/panels on 6 surfaces, (2) structural divergences in the shell and conversation stream, (3) wrong token selection in components (token-usage drift), (4) a Breadcrumb/header layout that diverges from the mockup's inline-row pattern on every depth-1 page, (5) missing scrollbar hiding, (6) copy/text drift, and (7) structural token-config gaps that create drift risk.

The prior conversation-drift spec (commit c7c1c5a) successfully fixed its 9 targeted issues but was narrowly scoped to token/attribute-level fixes. No broader mockup-vs-implementation audit was ever performed — this is the process gap that allowed the drift to accumulate.

## Recommended Next Steps

### Fix direction

Categorized by mechanism, ordered by leverage:

**1. Restore missing visual containers (6 surfaces, High impact):**
- Sign-in: add bordered auth card (`bg-surface border border-border rounded-xl p-8`), brand logo box, heading, legal footer
- Onboarding: add form panel (`bg-surface border border-border rounded-xl p-7`), BMAD-not-found panel (`bg-negative-bg border border-negative rounded-lg p-4`)
- Settings: implement the designed "coming soon" empty-state (icon, title, body, teaser items)
- Artifact-browser: implement frontmatter metadata badge in `ArtifactViewer`
- Conversation: wrap textarea + Send + WorkingTreeIndicator in single `chat-input-box` container

**2. Fix Breadcrumb/header layout (all depth-1 pages, High leverage):**
- Refactor `Breadcrumb.tsx` to render inline beside the title in a flex row (not stacked above)
- Add `border-b border-border-subtle` to page headers on conversation, artifact-browser, settings, new-conversation

**3. Fix shell structural items (High impact, may need design confirmation):**
- Restore wordmark brand mark (`bmad·easy` with accent interpunct)
- Restore "Settings" visible label next to avatar
- Confirm whether nav-links-at-bottom is intentional redesign or drift
- Fix active-state styling (inset pill vs full-width bar)
- Fix double horizontal padding on nav items

**4. Inline tool/semantic pills in conversation stream (High impact, architectural):**
- Refactor `ChatMessageList` to interleave `TOOL_CALL_*` events within the agent's markdown stream at the position they occurred, not as standalone rows

**5. Fix token-usage drift (Medium impact, low effort):**
- Project-map: `hover:border-text-3` → `hover:border-accent`
- Onboarding: `bg-surface` → `bg-bg` for input; `text-text-2` → `text-text-1` for label
- Conversation: `text-bg` → `text-accent-fg` on Retry and Save buttons
- Artifact-browser: `hover:bg-surface-raised/60` → `hover:bg-surface-raised`; `text-text-2` → `text-text-3` for dates
- Shell: `border-border-subtle` → `border-surface-raised` for hairlines (or add `border-subtle` to DESIGN.md)

**6. Add scrollbar hiding (Low effort, 3 surfaces):**
- Add `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` to `global.css` or as a utility class

**7. Fix token-config gaps (Low effort, structural):**
- Add `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` to `tailwind.config.ts`
- Consider replacing `extend` with full `theme` overrides for tokenized categories to block non-design-system utilities
- Add `fontWeight` override to enforce the 400/500/600 constraint

### Diagnostic

If pixel-level confirmation is needed before committing to fixes, render each mockup HTML and the corresponding live route in a browser and capture screenshots for visual diff. Playwright MCP could automate this.

## Reproduction Plan

1. Open each mockup HTML file in a browser: `ux-designs/.../mockups/key-*.html`
2. Open the corresponding live route in another tab/window
3. Compare side-by-side — the 10 High-severity findings should be immediately visible
4. For systematic verification, an automated visual-regression suite (Playwright screenshot comparison) would catch future drift

## Side Findings

- The CSS file is `global.css` (singular), not the Next.js-conventional `globals.css` — a naming inconsistency that could confuse tooling.
- The prior drift spec is marked `done` but scoped narrowly (conversation only); a broader drift audit was never performed — this process gap allowed drift to accumulate undetected across 6 surfaces.
- The `extend`-based Tailwind config is a structural drift risk: all default Tailwind utilities remain available alongside the design system, enabling silent non-design-system token usage.
- The mockup HTML files contain dead CSS (e.g. `key-signin.html` defines `.auth-divider` styles but never renders a divider) — cosmetic, but worth cleaning up.
- Accessibility in the implementation frequently *exceeds* the mockups (focus rings, aria labels, keyboard nav, route-focus management) — this is positive drift, not a defect.

## Follow-up: 2026-07-08

### New Evidence

Full comprehensive audit performed. 7 parallel subagents compared all 7 mockup surfaces + shared shell against their implementations. Token-layer audit compared DESIGN.md against `tailwind.config.ts`. Prior conversation-drift spec fixes verified (9/9 landed). See Confirmed Findings above for the complete record.

### Additional Findings

See Confirmed Findings 1–5 above. The full per-surface finding lists with `path:line` citations are recorded in the subagent outputs and summarized in Finding 3's table. Key High-severity items:

1. **Sign-in**: brand logo box + auth card container missing (`sign-in/page.tsx:17-43` vs `key-signin.html:79-91,105-115`)
2. **Onboarding**: form panel + BMAD-not-found panel missing (`RepositoryUrlForm.tsx:39,55-69` vs `key-onboarding.html:98-106,213-233`)
3. **Settings**: entire "coming soon" empty-state design missing (`settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)
4. **Artifact-browser**: frontmatter metadata badge absent (`ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)
5. **Shell**: nav links relocated from top-grouped to bottom-pinned (`SideNavigation.tsx:41-60,87` vs `key-project-map.html:96-100,287-298`)
6. **Shell**: visible "Settings" label removed — avatar-only (`SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`)
7. **Conversation**: chat-input not in single bordered container (`ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)
8. **Conversation**: tool/semantic pills rendered as standalone rows, not inline in agent stream (`ChatMessageList.tsx:84-103` vs `key-conversation.html:448-451`)
9. **Shell**: wordmark brand mark lost — `bmad-easy` instead of `bmad·easy` (`SideNavigation.tsx:30-31` vs `key-project-map.html:78-79`)
10. **Onboarding**: input background inverted — `bg-surface` (raised) instead of `bg-bg` (recessed) (`RepositoryUrlForm.tsx:53` vs `key-onboarding.html:128-135`)

### Updated Hypotheses

- **Hypothesis 1** (significant drift exists): **Confirmed** — 102 findings across all surfaces.
- **Hypothesis 2** (token-layer root cause): **Refuted as stated** (42/42 values match); **partially confirmed as revised** — structural config gaps (`extend`, missing `boxShadow`/`fontWeight`) create drift risk, and token-*usage* drift (wrong tokens selected) is a contributing mechanism.

### Backlog Changes

All 4 backlog items marked Done. No new backlog items — the investigation is concluded; next steps are fix work, not investigation.

### Updated Conclusion

See Conclusion above. Confidence: **High**. Root cause Confirmed at two levels: per-surface structural omissions and a systemic process gap (no mockup-vs-implementation audit was ever performed beyond the conversation cluster). The user's premise is validated.
