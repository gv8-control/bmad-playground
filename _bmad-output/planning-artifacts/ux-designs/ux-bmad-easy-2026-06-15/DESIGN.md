---
title: "DESIGN: bmad-easy"
status: final
created: 2026-06-15
updated: 2026-07-04

colors:
  # Backgrounds — elevation via lightness, no shadows
  bg:              "#0D0D11"   # page canvas
  surface:         "#16161C"   # sidebar, panels
  surface-raised:  "#1E1E26"   # inputs, cards, hover targets
  border:          "#2B2B38"   # standard dividers
  border-subtle:   "#1E1E26"   # inner divisions on raised surfaces

  # Text
  text-1:          "#EDECF5"   # primary — body, headings
  text-2:          "#8D8CA0"   # secondary — labels, timestamps, nav items
  text-3:          "#56556A"   # muted — placeholders, disabled

  # Accent — primary actions, focus rings, links
  accent:          "#7B6EE8"
  accent-hover:    "#9083F2"
  accent-fg:       "#FFFFFF"

  # Semantic states
  positive:        "#3ECF8E"   # committed / saved (FR-18 clean)
  positive-bg:     "rgba(62,207,142,0.08)"
  caution:         "#F2A944"   # unsaved changes (FR-18 dirty)
  caution-bg:      "rgba(242,169,68,0.08)"
  negative:        "#F06B6B"   # errors, destructive actions
  negative-bg:     "rgba(240,107,107,0.08)"

  # Utility
  overlay:         "rgba(0,0,0,0.65)"  # dialog backdrops

typography:
  font-sans: "'Inter', system-ui, -apple-system, sans-serif"
  font-mono: "'JetBrains Mono', 'Fira Mono', monospace"

  scale:
    xs:   "0.75rem / 1rem"      # 12/16 — timestamps, chips
    sm:   "0.875rem / 1.25rem"  # 14/20 — nav items, labels, secondary text
    base: "1rem / 1.5rem"       # 16/24 — body, chat messages
    lg:   "1.125rem / 1.75rem"  # 18/28 — section headings
    xl:   "1.25rem / 1.75rem"   # 20/28 — page titles
    2xl:  "1.5rem / 2rem"       # 24/32 — onboarding headings

  weights:
    regular:  400
    medium:   500
    semibold: 600

rounded:
  sm:   "4px"
  md:   "8px"
  lg:   "12px"
  xl:   "16px"
  2xl:  "24px"
  full: "9999px"

spacing:
  base: "4px"
  # Tailwind 4-unit scale: 4 8 12 16 20 24 32 40 48 64

components:
  side-nav:
    width:        "240px"
    background:   "{colors.surface}"
    border-right: "1px solid {colors.border-subtle}"

  chat-input:
    background:    "{colors.surface-raised}"
    border:        "1px solid {colors.border}"
    border-radius: "{rounded.lg}"
    padding:       "12px 16px"
    font:          "{typography.font-sans}"
    font-size:     "{typography.scale.base}"

  message-user:
    background:    "{colors.surface-raised}"
    border-radius: "{rounded.lg}"
    padding:       "12px 16px"
    max-width:     "80%"
    align:         "right"

  message-agent:
    background:    "transparent"
    padding:       "4px 0"
    max-width:     "760px"
    align:         "left"

  tool-pill:
    display:        "inline-flex"
    background:     "{colors.surface-raised}"
    border:         "1px solid {colors.border}"
    border-radius:  "{rounded.sm}"
    padding:        "2px 8px"
    font-size:      "{typography.scale.xs}"
    color:          "{colors.text-2}"

  semantic-pill:
    display:        "inline-flex"
    background:     "{colors.positive-bg}"
    border:         "1px solid {colors.positive}"
    border-radius:  "{rounded.sm}"
    padding:        "4px 10px"
    font-size:      "{typography.scale.sm}"
    color:          "{colors.positive}"

  working-tree-indicator:
    # Dirty state
    dirty-color:  "{colors.caution}"
    dirty-bg:     "{colors.caution-bg}"
    dirty-label:  "● Unsaved changes"
    # Clean state
    clean-color:  "{colors.text-3}"
    clean-label:  "✓ All saved"
    # Info affordance (dirty state only)
    info-icon-color:       "{colors.text-3}"
    info-icon-color-hover: "{colors.text-2}"

  avatar-circle:
    size:          "32px"
    background:    "{colors.accent}"
    color:         "{colors.accent-fg}"
    border-radius: "{rounded.full}"
    font-size:     "{typography.scale.xs}"
    font-weight:   "{typography.weights.semibold}"

  artifact-card:
    background:    "{colors.surface-raised}"
    border:        "1px solid {colors.border}"
    border-radius: "{rounded.lg}"
    padding:       "12px 16px"

  status-badge-in-progress:
    border:        "1px solid {colors.caution}"
    background:    "{colors.caution-bg}"
    color:         "{colors.caution}"
    border-radius: "{rounded.full}"
    padding:       "2px 8px"
    font-size:     "{typography.scale.xs}"

  status-badge-completed:
    border:        "1px solid {colors.border}"
    background:    "transparent"
    color:         "{colors.text-2}"
    border-radius: "{rounded.full}"
    padding:       "2px 8px"
    font-size:     "{typography.scale.xs}"

  slash-command-picker:
    background:    "{colors.surface-raised}"
    border:        "1px solid {colors.border}"
    border-radius: "{rounded.lg}"
    min-width:     "240px"
    max-height:    "320px"
    font-size:     "{typography.scale.sm}"
    item-padding:  "8px 12px"

  scroll-to-bottom-button:
    background:    "{colors.surface-raised}"
    border:        "1px solid {colors.border}"
    border-radius: "{rounded.full}"
    padding:       "6px 12px"
    font-size:     "{typography.scale.xs}"
    color:         "{colors.text-2}"

  stop-button:
    background:    "transparent"
    border:        "1px solid {colors.border}"
    border-radius: "{rounded.md}"
    padding:       "6px 16px"
    font-size:     "{typography.scale.sm}"
    color:         "{colors.text-1}"

  copy-action:
    color-default: "{colors.text-3}"
    color-hover:   "{colors.text-2}"
    size:          "16px"
    border-radius: "{rounded.sm}"

  credential-error-banner:
    background:    "{colors.negative-bg}"
    border-bottom: "1px solid {colors.negative}"
    padding:       "10px 16px"
    font-size:     "{typography.scale.sm}"
    color:         "{colors.text-1}"
    link-color:    "{colors.negative}"
---

# DESIGN: bmad-easy

## Brand & Style

bmad-easy sits at the intersection of AI chat tools and professional productivity software. Its primary users — PMs, Business Analysts, Delivery Leads — come to it with experience from tools like Claude.ai, ChatGPT, and Notion. The interface should feel immediately familiar: dark, calm, content-forward, with enough structure to signal "this is a serious tool" without the density of a developer IDE.

**Personality keywords:** focused · intelligent · calm · professional · approachable

**Reference aesthetic:** Claude.ai, Perplexity, Linear — dark surfaces, generous whitespace, restrained use of color, content that earns its place.

**What this is not:** A developer IDE, a productivity dashboard crammed with widgets, a bright consumer app.

**Dark mode:** Primary and only mode for MVP. The palette is designed around a very dark near-black with a hint of blue-violet, harmonizing with the accent color throughout.

**Accent use:** The violet accent (`{colors.accent}`) is reserved for primary interactive elements: focus rings, primary buttons, active nav states, links. It does not appear decoratively. Semantic colors (positive, caution, negative) each carry specific meaning and are not used interchangeably.

---

## Colors

The palette is built for dark mode from first principles. Elevation is communicated through surface lightness — there are no box shadows on dark surfaces.

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `bg` | `#0D0D11` | Page background, behind all surfaces |
| Panel | `surface` | `#16161C` | Sidebar, persistent panels |
| Raised | `surface-raised` | `#1E1E26` | Inputs, cards, dropdown menus, hover states |
| Dividers | `border` | `#2B2B38` | Standard separators |
| Inner | `border-subtle` | `#1E1E26` | Dividers within raised surfaces |
| Primary text | `text-1` | `#EDECF5` | Body, headings, active items |
| Secondary text | `text-2` | `#8D8CA0` | Nav labels, timestamps, supporting copy |
| Muted text | `text-3` | `#56556A` | Placeholders, disabled states |
| Action | `accent` | `#7B6EE8` | Primary buttons, focus rings, active nav, links |
| Action hover | `accent-hover` | `#9083F2` | Hover/pressed state for accent elements |
| Action text | `accent-fg` | `#FFFFFF` | Text on accent backgrounds |
| Committed | `positive` | `#3ECF8E` | Saved/committed state, Semantic Pills |
| Unsaved | `caution` | `#F2A944` | Unsaved working tree indicator |
| Error | `negative` | `#F06B6B` | Validation errors, destructive actions |
| Backdrop | `overlay` | `rgba(0,0,0,0.65)` | Dialog / modal backdrops |

**Semantic color rule:** positive = artifact committed to repo; caution = uncommitted local work exists; negative = something went wrong. These map directly to the working tree states in FR-18.

---

## Typography

Two typefaces only.

**Inter** — all UI text: navigation, labels, chat input, agent messages, page titles, error text. Inter is chosen for its exceptional readability at small sizes in dense UIs and its neutrality in both professional and consumer contexts.

**JetBrains Mono** — monospace content only: code blocks within agent messages, raw tool call output in Tool Pills, any inline `code` spans.

**Usage rules:**
- Do not use weights above 600 (semibold). Bold (700+) is not part of this palette.
- Page titles and section headings: `lg` or `xl`, `semibold`.
- Body and chat messages: `base`, `regular`.
- All secondary / supporting copy: `sm`, `regular`, `text-2`.
- Timestamps: `xs`, `regular`, `text-3`.
- Markdown rendered in agent responses follows the same scale — headings map down one step relative to their document hierarchy (H1 → `xl`, H2 → `lg`, H3 → `base semibold`).

---

## Layout & Spacing

**Grid:** There is no column grid. Layout is zone-based: a fixed sidebar and a fluid content area.

| Zone | Width |
|---|---|
| Side navigation | 240px fixed |
| Content area | Remaining viewport width |
| Chat message max-width | 760px, centered in the content area |
| Artifact Browser list pane | 280px when an artifact is selected |
| Artifact Browser content pane | Remaining content area width |

**Spacing unit:** 4px. All internal spacing is a multiple of 4. Tailwind's default scale applies (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).

**Density:** Chat interfaces use generous line height (`1.5rem` at `base` size). Navigation items use `sm` text with `20px` line height to keep the list scannable at a glance. Artifact Cards (Project Map) have `12px 16px` internal padding.

**Content breathing room:** The chat content column has `32px` horizontal padding at 1280px+ viewports; `20px` at narrower breakpoints. This is not reduced to maximize visible tokens — readability and message chunking are more important than information density.

---

## Elevation & Depth

Dark mode elevation is expressed through surface lightness, not shadow. From darkest (lowest) to lightest (highest):

| Level | Token | Surface |
|---|---|---|
| L0 | `bg` | Page canvas — behind everything |
| L1 | `surface` | Sidebar, persistent panels |
| L2 | `surface-raised` | Inputs, cards, dropdowns, hover states |
| L3 | `overlay` over L0 | Modal / dialog backdrop |

Dialogs themselves sit at L2 brightness against the L3 overlay. No box shadow is used to convey elevation on dark surfaces.

The only exception: focus rings use `{colors.accent}` as an outline, which creates visual separation through color rather than elevation.

---

## Shapes

| Context | Radius |
|---|---|
| Inline chips (Tool Pills, Semantic Pills, status badges) | `sm` (4px) |
| Buttons, badges, small controls | `md` (8px) |
| Input fields, cards, message bubbles, dropdowns | `lg` (12px) |
| Dialogs, modals | `xl` (16px) |
| Avatar circles, circular icon buttons | `full` |

Shape is consistent within each category. Chat message bubbles use `lg` (12px) — this echoes familiar chat UIs without introducing playful pill shapes that would undermine the professional register.

---

## Components

### Side Navigation

Fixed 240px panel. `{colors.surface}` background, single `{colors.border-subtle}` right border. No drop shadow.

Internal structure (top to bottom):
1. Product mark / wordmark — 48px tall header zone
2. **New Conversation** button — `{colors.accent}` border, `accent` text, `md` radius; full-width within nav padding
3. Conversation list — last 5 entries; `sm` text, `text-2` color; active entry highlighted with `surface-raised` background and `text-1` color; entries are truncated at one line with an ellipsis
4. `{colors.border-subtle}` horizontal separator (16px vertical margin)
5. **Project Map** and **Artifact Browser** nav links — same style as conversation entries
6. Bottom-pinned: **Settings** entry represented as the user's avatar circle. Avatar circle is `{components.avatar-circle}`. Settings label appears as tooltip or beside it at `xs`/`text-2`.

No nested navigation. No expand/collapse. No icons beyond the avatar.

### Chat Input

Auto-growing multi-line textarea, `{components.chat-input}`. Minimum height: `52px` (one line + padding). Maximum height: `200px`; scrolls internally above that.

Below the textarea, in the same container: the working tree indicator (`{components.working-tree-indicator}`) on the left and the **Send** button on the right. Send button: `{colors.accent}` background, `{colors.accent-fg}` text, `md` radius, disabled style when input is empty or agent is processing.

While agent is processing: **Stop** button replaces Send. Stop is outlined (border: `{colors.border}`, text: `text-1`), not filled — it is an interruption action, not a primary action.

### Messages

**User messages** (`{components.message-user}`): right-aligned, `surface-raised` background, `lg` radius, max 80% content width, `text-1` text.

**Agent messages** (`{components.message-agent}`): left-aligned, transparent background, full column width up to 760px max. Markdown rendered inline. Code blocks within agent messages use `surface-raised` background, `border` border, `font-mono`, `sm` size, with an independent copy button in the top-right corner of the block.

**Copy action on messages:** appears on hover at the top-right corner of the message. Single icon button, `text-3` default, `text-2` on hover.

**Timestamps:** User message timestamps on hover only (`xs`, `text-3`, right-aligned). Agent message timestamps inline below the message (`xs`, `text-3`) — shown permanently but at low prominence.

### Tool Pill

`{components.tool-pill}` — inline chip in the agent message stream at the exact position the tool call occurred. Displays the tool name and a short status (e.g. `bash`, `read_file`, `git commit`). Clicking a Tool Pill expands it to show the raw input/output inline.

### Semantic Pill

`{components.semantic-pill}` — elevated variant of Tool Pill for recognized actions. Positive-colored border and background. Displays a human-readable label (e.g. "Progress saved · PRD draft · **View**"). "View" is an underlined link in `{colors.positive}` that opens the Artifact Browser to the committed artifact.

### Working Tree Indicator

Displayed in the chat input area, left-aligned, below the textarea.

- **Dirty:** `● Unsaved changes` — `{colors.caution}` text, `caution-bg` pill background. Clickable — activates the manual save flow (confirmation → platform commit). A small `ⓘ` icon sits immediately after the label, its own click/focus target: `{colors.text-3}` default, `{colors.text-2}` on hover/focus. 14px, `{typography.scale.xs}`. Opens a disclosure tooltip, distinct from the Save-confirmation popover triggered by the label itself.
- **Clean:** `✓ All saved` — `{colors.text-3}` text, no background. Not clickable. No info icon (nothing at risk to disclose).
- **Hidden:** when no working tree exists (new conversation, pre-first-message).

### Artifact Cards (Project Map)

`{components.artifact-card}` — one card per artifact. Contains: artifact type label (`xs`, `text-2`), artifact title (`sm`, `semibold`, `text-1`), status badge. In-progress badge: `{components.status-badge-in-progress}`. Completed badge: `{components.status-badge-completed}` (muted, less prominent than in-progress).

### Slash Command Picker

`{components.slash-command-picker}` — floating dropdown anchored above the chat input, appearing when the user types `/`. Overlays content; does not push the input downward. Scrollable list (`max-height: 320px`) with a visible scrollbar if items overflow. Each item: skill name in `sm` weight medium, left-padded at `12px`. Hovered/focused item: `{colors.surface-raised}` background highlight. Container outline: `{colors.border}` border on `{rounded.lg}` radius.

### Scroll-to-Bottom Button

`{components.scroll-to-bottom-button}` — pill-shaped button anchored at the bottom-center of the chat message panel, above the chat input. Visible only when the user has scrolled above the most recent message. When new messages have arrived while scrolled away, the button displays a count label (e.g., "3 new"). Hidden when at the bottom.

### Stop Button

`{components.stop-button}` — outlined, non-filled. Replaces the Send button while the agent is processing. Uses border color `{colors.border}` and text color `{colors.text-1}` to signal interruption rather than primary action. Same container position as Send (right of the chat input).

### Copy Action

`{components.copy-action}` — icon-only button (clipboard icon, 16px). On messages: appears on hover at the top-right corner, `{colors.text-3}` default, `{colors.text-2}` on hover. On code blocks: always visible (not hover-only), positioned top-right within the block. After activation: icon replaced with a "Copied" label for 1.5 seconds, then reverts.

### Credential Error Banner

`{components.credential-error-banner}` — full-width horizontal banner at the top of the content area (below the page header) on Project Map, Artifact Browser, and Conversation. Non-dismissible. Background `{colors.negative-bg}`, bottom border `{colors.negative}`. Contains plain-language copy and a link styled in `{colors.negative}` to trigger the re-auth flow (inline modal, not a page navigation). Gated on `credentialHealth === 'failed'` — a 403 mid-conversation does NOT trigger this banner (per FINDING-12); see Access Notice.

### Access Notice

`{components.access-notice}` — inline notice rendered in the message stream directly below the error-state Tool Pill for a failing git operation that returned a 403. Distinct from the Credential Error Banner: it is scoped to the single failing tool call (not full-width, not pinned to the content area top), dismissible, and never offers a re-auth action — re-authentication resolves none of the three 403 causes. Background `{colors.warning-bg}` (or `{colors.negative-bg}` for `INSUFFICIENT_PERMISSION`), left border `{colors.warning}` / `{colors.negative}`. Copy is derived from the `ACCESS_DENIED` event's `code` field (`RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`); the raw GitHub error text remains available in the Tool Pill's expanded output. Does not disable the input or halt the agent turn. (Component added 2026-07-02 alongside the architecture.md `ACCESS_DENIED` event contract.)

### Avatar Circle

`{components.avatar-circle}` — 32px circle, `{colors.accent}` fill, user initials in `{colors.accent-fg}`, `xs` semibold. Used in the bottom of the side nav as the Settings entry point.

---

## Do's and Don'ts

**Do:**
- Use `{colors.accent}` for all primary interactive elements — buttons, focus rings, active states, links.
- Communicate elevation through surface lightness only.
- Keep the content area uncluttered: one active surface at a time.
- Let agent message text have generous line height; long unbroken blocks of streamed text are hard to read.
- Use semantic colors strictly: positive = committed, caution = unsaved, negative = error. Never use them decoratively.

**Don't:**
- Don't use box shadows to communicate elevation on dark surfaces.
- Don't use the accent color for decorative purposes, icons, or illustrations.
- Don't add IDE-style panels: file trees, status bars, tab strips, terminal drawers.
- Don't put more than two typefaces in any single view.
- Don't use font weights above 600.
- Don't reduce the chat column width below 640px in an attempt to surface more sidebar or panel content — legibility of streamed responses is the highest-priority layout concern.
