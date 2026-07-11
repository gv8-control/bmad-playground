# Validation Report — bmad-easy

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md`
- **Run at:** 2026-07-08T12:00:00Z
- **Lens run:** Aesthetics (colors, margins, consistency) — focused review per user request. Prior rubric (2026-07-02) and implementation-drift (2026-07-05) reviews exist and are not re-run; their findings are referenced where relevant.

## Overall verdict

The aesthetic direction is sound: a coherent blue-violet dark palette, elevation via surface lightness (no shadows), a restrained violet accent reserved for primary actions, and a clear two-typeface typographic ramp. Execution, however, has real gaps that a downstream builder would propagate.

A broken color-token reference (`{colors.warning}` / `{colors.warning-bg}` — defined nowhere in the frontmatter) was introduced when the Access Notice component was added on 2026-07-02 and was not caught by the prior rubric pass, which ran the same day. The Access Notice also lacks a `components:` frontmatter entry — it has prose only. The muted text token (`text-3`, `#56556A`) fails WCAG AA contrast on every surface (~2.3–2.7:1; AA requires 4.5:1) and is used for permanent informational text (timestamps, "All saved" indicator). The stated 4px spacing grid is violated throughout the mockups and in the spine's own component specs (7px, 10px, 11px, 14px appear routinely; the credential-error-banner spec itself uses 10px). Cross-mock consistency is uneven: the conversation mock diverges from the other four app-shell mocks in nav-item display model, textarea text color, and send-button class naming.

None of this is fatal to the aesthetic vision. The palette, elevation system, typography, and shape language are well-conceived. But the three critical findings (broken tokens, inaccessible text, missing component spec) and the six high-severity findings (grid violations, border-subtle invisibility, primary-action color inconsistency, nav display drift, textarea color bug, class naming drift) should be resolved before a builder mirrors these artifacts.

## Category verdicts

- Colors — thin
- Margins & Spacing — adequate
- Consistency — adequate

## Findings by severity

### Critical (3)

**Colors** — Broken color-token references: `{colors.warning}` / `{colors.warning-bg}` undefined (DESIGN.md line 381, EXPERIENCE.md line 262)
The Access Notice component prose references `{colors.warning-bg}` and `{colors.warning}` for its background and left border, but the frontmatter `colors:` block defines no `warning` or `warning-bg` token. The semantic palette has `positive`/`caution`/`negative` only. Downstream code mirroring the spine cannot resolve these references. The prior rubric review (§2, "strong") did not catch this because the Access Notice was added as part of applying that review's own findings on the same day.
Fix: Add `warning` / `warning-bg` tokens to the frontmatter, or replace with `{colors.caution}` / `{colors.caution-bg}` (the closest existing semantic).

**Colors** — `text-3` (#56556A) fails WCAG AA contrast on every surface (DESIGN.md line 18)
Computed ratios: 2.68:1 on `bg`, 2.49:1 on `surface`, 2.29:1 on `surface-raised`. AA requires 4.5:1 for normal text. `text-3` is used for permanent informational text: agent message timestamps (shown permanently per DESIGN.md line 337), the "All saved" clean-state indicator (line 352), footer links, disabled text. No contrast targets are stated anywhere in DESIGN.md.
Fix: Lighten `text-3` to meet 4.5:1 on all surfaces (~`#757488` or lighter), or restrict `text-3` to placeholder/disabled use and move timestamps and "All saved" to `text-2`. State contrast targets in DESIGN.md §Colors.

**Consistency** — `access-notice` component has prose but no frontmatter spec (DESIGN.md lines 380–381)
The `components:` frontmatter defines 16 components; the Access Notice is described in §Components prose but has no `access-notice` key. Its prose references non-existent `{colors.warning}` / `{colors.warning-bg}` tokens. A downstream builder has no machine-readable spec.
Fix: Add an `access-notice:` entry to the frontmatter with resolved token references, or fold into `credential-error-banner` as a variant.

### High (6)

**Colors** — Sign-in primary button uses `text-1` (#EDECF5) as background instead of `accent` (#7B6EE8) (key-signin.html line 131)
DESIGN.md Do's: "Use `{colors.accent}` for all primary interactive elements." The onboarding "Connect repository" button in the same pre-app-shell context uses `accent`. Two primary-action treatments with no documented rationale.
Fix: Use `accent` for the sign-in button, or document the exception.

**Colors** — `border-subtle` (#1E1E26) equals `surface-raised` (#1E1E26) — invisible on raised surfaces (DESIGN.md lines 11, 13)
`border-subtle` is for "inner divisions on raised surfaces" but is the same color as the raised surface it sits on. Visible only against `surface` (#16161C).
Fix: Set `border-subtle` to a value between `surface` and `border` (e.g., `#232330`).

**Margins & Spacing** — 4px grid violated throughout mockups and spine specs (DESIGN.md line 266: "All internal spacing is a multiple of 4")
Off-grid values: 7px (nav-item padding, all app-shell mocks), 10px (credential-error-banner in DESIGN.md frontmatter line 186; list-entry; teaser-item; field-group gap), 11px (GitHub button; connect-button), 14px (field-input; teaser-item), 6px (frontmatter-badge; nav active margin). The 10px in the spine's own frontmatter is notable.
Fix: Snap all off-grid values to nearest 4px multiple. Document 2px half-step exception if needed for tight controls.

**Consistency** — Nav-item `display` property inconsistent across mocks (key-conversation.html line 114: `flex`; others: `block`)
The conversation mock uses flex; all other app-shell mocks use block. Changes vertical alignment and hit-area.
Fix: Standardize on one display model across all app-shell mocks.

**Consistency** — Conversation mock textarea uses `text-3` (#56556A) for entered text instead of `text-1` (#EDECF5) (key-conversation.html line 344)
Entered text renders at 2.29:1 contrast — nearly invisible. The new-conversation mock correctly uses `text-1`. If a builder mirrors the mock, typed text would be unreadable.
Fix: Set textarea color to `#EDECF5` (text-1); reserve `text-3` for `::placeholder` only.

**Consistency** — Send-button class naming inconsistent (key-new-conversation.html: `.send-button`; key-conversation.html: `.send-btn`)
Different class names for the same component across mocks.
Fix: Standardize on one class name.

### Medium (10)

**Colors** — Ad-hoc colors not in the palette (key-project-map.html line 218: `#3b3b4f` hover border; key-new-conversation.html line 351: `#2B2B38` as hover bg, spine says `surface-raised`; key-artifact-browser.html line 209: `rgba(30,30,38,0.6)` hover)
Fix: Replace with nearest token; add a hover-surface token if needed.

**Colors** — Focus-ring implementation inconsistent and non-compliant with spine (key-onboarding.html line 142: 20% opacity; key-new-conversation.html line 264: 15% opacity; spine says 2px solid outline, 2px offset)
Fix: Standardize on the spine's 2px solid accent outline with 2px offset.

**Colors** — Loading/disabled button states use ad-hoc colors with no spine tokens (connect-button.loading: #56556A bg; send-button.disabled: #1E1E26 bg + #56556A text; send-button.loading: #56556A bg)
Fix: Add disabled/loading button-state tokens, or specify as "accent at 40% opacity."

**Margins & Spacing** — `spacing` frontmatter has only `base: 4px` — no scale tokens (DESIGN.md lines 61–63)
Tailwind scale is prose-only. Downstream code can't reference `{spacing.4}` etc. Contributes to off-grid proliferation.
Fix: Add scale tokens to the frontmatter.

**Margins & Spacing** — Chat input area bottom padding inconsistent between chat surfaces (key-new-conversation.html: 24px; key-conversation.html: 20px)
Fix: Standardize on one value; document in chat-input component spec.

**Margins & Spacing** — Undocumented max-widths across mocks (400px, 480px, 720px, 760px, 824px — no system, no tokens)
Fix: Document a content-width system in DESIGN.md §Layout & Spacing, or note as per-surface decisions.

**Consistency** — Nav-item active-state margins inconsistent across mocks (1px vs 0px top/bottom; conversation mock has two active classes)
Fix: Standardize active-state margins; use one active class.

**Consistency** — Slash picker uses `box-shadow`, contradicting the no-shadow rule (key-new-conversation.html line 332; DESIGN.md Don'ts line 399)
Fix: Document a floating-element exception in §Elevation & Depth, or replace shadow with stronger border/contrast.

**Consistency** — Scrollbars hidden in multiple mocks, undocumented in spine (`::-webkit-scrollbar { display: none; }` in 4 mocks)
Fix: Document the decision in EXPERIENCE.md, or show styled scrollbars.

**Consistency** — Wordmark presentation inconsistent between pre-app-shell and app-shell (logo box + name + tagline vs compact text mark)
Fix: Document both treatments in DESIGN.md §Brand & Style, or standardize.

### Low (6)

**Colors** — Browser-chrome lock icon uses `positive` (#3ECF8E) decoratively (all mocks; DESIGN.md Don'ts line 396). Mock furniture only. Fix: Use a neutral color for mock chrome, or note that browser-chrome furniture is outside the design system scope.

**Colors** — Spinner treatments inconsistent between mocks (onboarding: white-on-white-translucent; new-conversation: accent-on-border). Fix: Standardize on one spinner treatment; document in DESIGN.md.

**Margins & Spacing** — Tool-pill padding (2px 8px) vs semantic-pill padding (4px 10px) — visually related components with different sizing. Fix: Align padding; document the relationship if the size difference is intentional.

**Margins & Spacing** — Status-badge padding (2px 8px) differs from semantic-pill padding (4px 10px). Fix: Standardize pill-badge padding across variants.

**Consistency** — Dead CSS: `.annotation-band` defined but unused in 4 mocks. Fix: Remove unused CSS blocks.

**Consistency** — `min-width: 1280px` on body doesn't match spine's 1024px minimum (all mocks). Fix: Render at 1024px or note that mocks are at 1280px for readability.

## Reviewer files

- `review-aesthetics.md`
- `review-rubric.md` (prior, 2026-07-02 — not re-run)
- `review-implementation-drift.md` (prior, 2026-07-05 — not re-run)
