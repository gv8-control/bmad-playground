---
name: bmad-easy
description: SaaS web platform giving non-dev agile team members browser access to BMAD methodology skills. shadcn/ui on Next.js + Tailwind; this DESIGN.md specifies the brand-layer delta only.
status: draft
created: 2026-06-14
updated: 2026-06-14
sources:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
colors:
  # Brand overrides on top of shadcn defaults. All unlisted tokens inherit
  # from shadcn (background, foreground, muted, muted-foreground, popover,
  # popover-foreground, card, card-foreground, border, input, ring, destructive).
  primary: '#2C42DB'
  primary-foreground: '#FFFFFF'
  accent: '#EA5C1E'
  accent-foreground: '#FFFFFF'
  primary-dark: '#7B8FF0'
  primary-foreground-dark: '#0D1033'
  accent-dark: '#FF7B41'
  accent-foreground-dark: '#2A1005'
typography:
  # Body, label, and muted inherit from shadcn (Geist Sans). No display override.
  mono:
    fontFamily: 'Geist Mono'
    use: 'Skill names, slash commands, commit hashes, file paths, git-origin strings'
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  pill: 9999px
spacing:
  # shadcn / Tailwind 4-base scale inherited; no overrides.
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  commit-pill:
    background: 'hsl(var(--muted))'
    border: '1.5px solid {colors.accent}'
    foreground: 'hsl(var(--foreground))'
    view-link-color: '{colors.accent}'
    radius: '{rounded.pill}'
    padding: '4px 12px'
    artifact-name-font: '{typography.mono.fontFamily}'
  skill-launch-field:
    background: 'hsl(var(--input))'
    border-default: 'hsl(var(--border))'
    border-focus: '{colors.primary}'
    radius: '{rounded.md}'
    slash-prefix-color: '{colors.accent}'
    slash-prefix-font: '{typography.mono.fontFamily}'
    dropdown-active-row: 'hsl(var(--accent))'
  session-status-active:
    dot-color: '{colors.primary}'
    dot-animation: 'pulse'
    label-font: '{typography.mono.fontFamily}'
  session-status-provisioning:
    label: 'Starting session…'
    label-font: 'Geist Sans'
    color: 'hsl(var(--muted-foreground))'
    spinner: 'shadcn spinner'
  session-status-expired:
    color: 'hsl(var(--muted-foreground))'
    label-font: '{typography.mono.fontFamily}'
  agent-thinking-indicator:
    color: 'hsl(var(--muted-foreground))'
    animation: 'three-dot-bounce'
  agent-tool-indicator:
    background: 'hsl(var(--muted))'
    border: '1px solid hsl(var(--border))'
    icon-color: '{colors.primary}'
    label-font: '{typography.mono.fontFamily}'
    radius: '{rounded.sm}'
  chat-bubble-user:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
    pointer-corner-radius: '{rounded.sm}'
    max-width: '70%'
    align: 'right'
  chat-bubble-agent:
    background: 'hsl(var(--muted))'
    foreground: 'hsl(var(--foreground))'
    radius: '{rounded.lg}'
    pointer-corner-radius: '{rounded.sm}'
    max-width: '80%'
    align: 'left'
  artifact-row:
    background: 'hsl(var(--card))'
    border: '1px solid hsl(var(--border))'
    radius: '{rounded.md}'
    in-progress-left-accent: '3px solid {colors.primary}'
    completed-left-accent: '3px solid hsl(var(--border))'
    hover-background: 'hsl(var(--accent))'
  credential-warning-banner:
    background: 'hsl(var(--destructive) / 0.08)'
    border: '1px solid hsl(var(--destructive))'
    foreground: 'hsl(var(--destructive))'
    radius: '{rounded.md}'
  working-tree-indicator:
    dirty-color: '{colors.accent}'
    dirty-label: '● Unsaved changes'
    clean-color: 'hsl(var(--muted-foreground))'
    clean-label: '✓ All saved'
    font-size: '12px'
  commit-pill-checkpoint:
    background: 'hsl(var(--muted))'
    border: '1.5px dashed {colors.accent}'
    foreground: 'hsl(var(--foreground))'
    source-badge: 'Platform checkpoint'
    radius: '{rounded.pill}'
    padding: '4px 12px'
  save-checkpoint-confirmation:
    inherits: 'shadcn AlertDialog'
    title: 'Save checkpoint'
    description: 'Commits current working tree state to git. The agent does not participate in this commit.'
    confirm-label: 'Save checkpoint'
    cancel-label: 'Cancel'
---

## Brand & Style

bmad-easy is a professional B2B SaaS for non-dev agile team members who have never run a BMAD session before. The brand premise: BMAD's methodology is structured and serious — the access layer must match that register. PMs, BAs, and Delivery Leads are trusting the platform with a GitHub credential; the design signals expertise and reliability before the product proves it.

The palette is two brand colors layered on top of shadcn defaults. Indigo-blue primary (`{colors.primary}`) is the brand: purposeful, high-contrast, non-corporate without being casual. Ember accent (`{colors.accent}`) is the "live" signal — it appears when something is happening or has just happened: Commit Pills, active session indicators, the slash-command prefix. Ember never appears decoratively.

Everywhere else, shadcn defaults are the discipline. Components the brand hasn't earned the right to customize inherit shadcn as-is.

## Colors

The bmad-easy palette is two brand colors on top of shadcn defaults.

- **Indigo Primary (`#2C42DB` light / `#7B8FF0` dark)** — brand color. CTAs, active navigation items, focus rings, primary buttons, in-progress artifact indicators. Replaces shadcn's default `primary`.
- **Ember Accent (`#EA5C1E` light / `#FF7B41` dark)** — the "live" signal. Used exclusively on: Commit Pills (border + "View" link), the slash-command prefix in the Skill Launch Field, and active session pulse dots. Never used for hover states, decorative icons, section dividers, or state badges beyond these three roles. When a user sees ember, something has happened or is happening.
- **All other tokens** (`background`, `foreground`, `muted`, `muted-foreground`, `card`, `card-foreground`, `border`, `input`, `ring`, `popover`, `destructive`) inherit from shadcn defaults.

Load-bearing contrast pairs:

| Pairing | Approx. ratio | WCAG result |
|---|---|---|
| `{colors.primary}` (#2C42DB) on white | 6.5:1 | AA + AAA, all text sizes |
| White on `{colors.primary}` | 6.5:1 | AA + AAA, all text sizes |
| `{colors.accent}` (#EA5C1E) on white — border / dot / non-text | 3.3:1 | No minimum (non-text signal) |
| `{colors.accent}` on white — large text ≥ 18px regular / ≥ 14px bold | 3.3:1 | AA large text only |
| `{colors.accent}` on white — normal-weight text < 18px | 3.3:1 | Fail — do not use |

Note: the Working Tree State Indicator renders `● Unsaved changes` in `{colors.accent}` at 12px bold. This is borderline; the element is interactive and the prefix dot is the primary signal, not the text. If a formal audit requires it, deepen that label only to `#C44810` without altering other ember uses.

Avoid: gradient fills, chromatic decoration, semantic color overrides beyond `primary` and `accent`, using ember for anything that isn't the three designated roles.

## Typography

Geist Sans throughout — body, labels, navigation, headings, microcopy. No display font override. The product spans developer champions who value signal over decoration and non-dev PMs who should never feel like they're in a terminal. Geist Sans is the contract for everything readable.

**Geist Mono** (`{typography.mono.fontFamily}`) is used only for developer-adjacent content: Skill names (e.g., `/bmad-prd`), slash commands, commit hashes, file paths, and git-origin strings. It adds authenticity where the content is inherently technical without making the broader product feel tool-like. Body text, labels, headings, and all microcopy remain in Geist Sans — no exceptions.

## Layout & Spacing

shadcn / Tailwind 4-base spacing scale inherited as-is. Two content-width contexts:

- **Session layout** — `max-w-4xl` (896px). Wide enough for the chat column with comfortable reading width; narrow enough to stay focused.
- **Project Map and Artifact Browser** — `max-w-2xl` (672px) centered. Single-column; no need for width.

Sidebar nav at `lg` (1024px+). Collapses to icons at `md` (768–1023px). Below `md`, full-width; sidebar becomes an off-canvas `Sheet` triggered from the top bar.

## Elevation & Depth

Shadcn defaults inherited. One addition: the chat input area at the bottom of the Skill Session page uses `shadow-md` (upward) to visually separate it from the scrolling message list. No other custom elevation.

## Shapes

Slightly rounder than Drift. The product serves non-dev users who expect modern SaaS softness alongside the developer-credible mono typography.

- `rounded/sm` (4px) — inputs, code blocks, tool indicator chips
- `rounded/md` (8px) — cards, primary buttons, dialogs, dropdowns
- `rounded/lg` (12px) — chat bubbles, modals, Artifact Browser header
- `rounded/pill` (9999px) — Commit Pills, session status badges

## Components

shadcn components used as-is (no visual overrides): `Button` (secondary/outline/ghost/destructive variants), `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Toast`, `Separator`, `Avatar`, `Skeleton`, `Breadcrumb`, `Badge`, `Command`. The contract: do not customize these.

Brand-layer components:

**Button (primary variant)** — `{colors.primary}` fill, `{colors.primary-foreground}` text, `{rounded.md}` corner. All other button variants inherit shadcn defaults.

**Commit Pill** — The key brand moment. Inline chat-stream element, not a toast. Two variants share the pill shape and muted background:

- *Agent-initiated:* solid `1.5px {colors.accent}` border. Layout: git-commit icon + artifact type label (Geist Sans, muted) + artifact name (Geist Mono) + "View →" link (`{colors.accent}`).
- *Platform checkpoint:* dashed `1.5px {colors.accent}` border. Layout: checkpoint icon + "Platform checkpoint" source badge (Geist Sans, muted) + ISO timestamp (Geist Mono). No "View →" link — a checkpoint saves working state, not a complete artifact.

Both variants use `{rounded.pill}` and appear at the commit-event position in the message stream. Do not reuse this shape for non-commit events.

**Skill Launch Field** — The slash-command entry on the Project Map. Single input; typing `/` triggers the filterable Skill list (shadcn `Command` inside a `Popover`). Slash prefix and Skill name render in `{colors.accent}` + Geist Mono while typing. Focus state: `{colors.primary}` border/ring. Dropdown active row: shadcn default `hsl(var(--accent))`.

**Session Status** — Contextual indicator in the session page header. Three states: *provisioning* (shadcn spinner + "Starting session…" in Geist Sans muted), *active* (pulsing `{colors.primary}` dot + Skill name in Geist Mono), *expired* (muted foreground + "(expired)" suffix in Geist Mono).

**Agent Thinking Indicator** — Three-dot bounce animation in `hsl(var(--muted-foreground))`. Shown while the LLM is generating a response but no tokens have arrived yet. Replaced by the first streamed token when streaming begins — never shown simultaneously with streaming content.

**Agent Tool Indicator** — Visually distinct from the Thinking Indicator. Shown while the agent executes a tool or Bash command in the Sandbox. Chip component: `{rounded.sm}`, muted background, 1px border, `{colors.primary}` terminal icon, Geist Mono label showing the tool/command name (truncated at 40 chars). Expandable to show stdout/stderr (collapsed by default). Collapses to a smaller completed state when the tool run finishes.

**Chat Bubble — User** — Right-aligned. `{colors.primary}` fill, `{colors.primary-foreground}` text. `{rounded.lg}` on all corners; top-right corner uses `{rounded.sm}` (pointer corner). Max-width 70% of chat column. Timestamp shown on hover, right-aligned, below the bubble.

**Chat Bubble — Agent** — Left-aligned. `hsl(var(--muted))` background, standard foreground. `{rounded.lg}` on all corners; top-left corner uses `{rounded.sm}`. Max-width 80% of chat column. Markdown rendered with prose-sm scale. Per-block copy button on code blocks (always visible). Message-level copy button on hover (top-right of bubble). Timestamp inline at muted prominence.

**Artifact Row** — Horizontal card on the Project Map. Left border: `3px solid {colors.primary}` for in-progress; `3px solid hsl(var(--border))` for completed. `{rounded.md}`. Hover: `hsl(var(--accent))` background. Content: artifact type label + title + status + relative timestamp.

**Credential Warning Banner** — Full-width, below the top nav on the Project Map. `hsl(var(--destructive) / 0.08)` background, `hsl(var(--destructive))` border and foreground. CTA: "Update PAT." Not dismissible until a new PAT is validated.

**Working Tree State Indicator** — Persistent text element in the chat input area, left of the Send button. Two visible states: `● Unsaved changes` in `{colors.accent}` (text-xs Geist Sans) when the working tree is dirty; `✓ All saved` in `hsl(var(--muted-foreground))` (or hidden) when clean. When dirty, the element renders with `cursor-pointer` to signal activatability. Pulses once in `{colors.accent}` when the BMAD Agent completes a response turn and the working tree is dirty; the pulse does not repeat until the next agent turn completes. Hidden entirely when the session has expired or the Sandbox is provisioning.

**Save Checkpoint Confirmation** — shadcn `AlertDialog`, no visual overrides. Title: "Save checkpoint." Description: "Commits current working tree state to git. The agent does not participate in this commit." Confirm: primary `Button` labeled "Save checkpoint" — disabled while a save is in progress. Cancel: ghost `Button`. Cannot be submitted twice.

**Manual Refresh, Stop Button, Scroll-to-Bottom Button** — shadcn `Button` (outline or ghost variant). No brand override.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Inherit shadcn defaults for everything outside the brand layer | Override shadcn tokens beyond `primary` and `accent` |
| Use ember (`{colors.accent}`) only for Commit Pills, active session dots, and slash prefix | Use ember for hover states, icons, or decorative chrome |
| Geist Mono only for content that is inherently technical | Set labels, body copy, or headings in Geist Mono |
| `rounded/pill` only for Commit Pills and session status badges | Use pill shapes on buttons, cards, or dialogs |
| Keep Thinking Indicator and Tool Indicator visually distinct | Use the same animation or color for "LLM thinking" and "tool running" |
| Single `max-w-4xl` session container; single-column `max-w-2xl` for Project Map and Artifact Browser | Wide multi-column layouts outside the session page |
| Ember means something happened — use it to reward attention | Dilute ember by adding it to more surfaces |
