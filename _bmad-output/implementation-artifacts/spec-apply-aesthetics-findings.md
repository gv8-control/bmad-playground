---
title: 'Apply aesthetics review findings to app code'
type: 'refactor'
created: '2026-07-08'
status: 'in-progress'
baseline_commit: 'abe0c2782b6aea4ee910d7edda2202ad46e9ce09'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/review-aesthetics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The aesthetics review identified 25 findings across colors, spacing, and consistency. DESIGN.md and EXPERIENCE.md have been updated as source of truth, but `apps/web/` code still uses a stale `border-subtle` value (invisible on raised surfaces), `text-3` for permanent informational text (fails WCAG AA), off-grid padding (2px/6px/10px values violating the 4px grid), and inconsistent focus ring offsets (`ring-offset-bg` and `focus-visible:` instead of the canonical `ring-offset-surface` and `focus:`).

**Approach:** Fix the `border-subtle` token and add explicit spacing scale in `tailwind.config.ts`; migrate `text-3`→`text-2` on timestamps and status indicators; snap all off-grid spacing classes to 4px multiples; standardize all focus rings to the canonical pattern.

## Boundaries & Constraints

**Always:** Use semantic token names, never raw hex. Canonical focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`. Keep `text-3` only for placeholders (`placeholder:text-text-3`) and disabled states. Snap off-grid: `0.5`→`1` (2→4px), `1.5`→`2` (6→8px), `2.5`→`3` (10→12px) — except pills where DESIGN.md specifies `4px 8px` = `py-1 px-2`.

**Ask First:** None.

**Never:** Change `text-3` on decorative elements (spinner tracks `border-text-3`, thinking dots `bg-text-3`), interactive icon defaults (CopyButton, WorkingTreeIndicator info trigger), or `placeholder:` variants. Don't add box shadows to layout surfaces. Don't touch mockup HTML files or the design docs.

</frozen-after-approval>

## Code Map

- `apps/web/tailwind.config.ts` — token definitions (border-subtle value, spacing scale)
- `apps/web/src/__tests__/tailwind-theme.spec.ts` — token assertion tests
- `apps/web/src/components/conversation/AgentMessage.tsx` — timestamp text-3, inline code padding
- `apps/web/src/components/conversation/UserMessage.tsx` — timestamp text-3
- `apps/web/src/components/conversation/ChatMessageList.tsx` — system message text-3
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — empty-state copy text-3
- `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` — status indicators text-3, trigger/button padding
- `apps/web/src/components/conversation/ToolPill.tsx` — pill padding
- `apps/web/src/components/conversation/SemanticPill.tsx` — pill padding
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — date text-3, badge/card padding
- `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` — inline code/list padding, heading margin
- `apps/web/src/components/project-map/ArtifactCard.tsx` — badge/card padding, hover border token misuse
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — banner padding
- `apps/web/src/components/shell/AppShell.tsx` — focus ring offset
- `apps/web/src/components/shell/Breadcrumb.tsx` — focus ring offset
- `apps/web/src/components/project-map/RefreshButton.tsx` — focus ring offset
- `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` — focus ring, input/button padding
- `apps/web/src/app/sign-in/submit-button.tsx` — focus ring
- `apps/web/src/components/ui/dialog.tsx` — header spacing
- `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` — skeleton padding

## Tasks & Acceptance

**Execution:**

- [ ] `apps/web/tailwind.config.ts` -- change `border-subtle` from `#1E1E26` to `#232330` (visible on both surface and surface-raised); add `spacing` scale matching DESIGN.md (`'1': '4px'` through `'16': '64px'`) -- resolves findings 4 (border invisible on raised surfaces) and 11 (spacing scale not tokenized)
- [ ] `apps/web/src/__tests__/tailwind-theme.spec.ts` -- update border-subtle assertion to `#232330`; add spacing scale assertions for the new config entries -- keeps token tests aligned with config
- [ ] `apps/web/src/components/conversation/AgentMessage.tsx` -- `text-text-3`→`text-text-2` on timestamp (L111); snap inline code `px-1.5 py-0.5`→`px-2 py-1` (L54) -- WCAG AA; 4px grid
- [ ] `apps/web/src/components/conversation/UserMessage.tsx` -- `text-text-3`→`text-text-2` on timestamp (L21) -- WCAG AA
- [ ] `apps/web/src/components/conversation/ChatMessageList.tsx` -- `text-text-3`→`text-text-2` on system message (L80) -- WCAG AA
- [ ] `apps/web/src/components/conversation/SlashCommandPicker.tsx` -- `text-text-3`→`text-text-2` on empty-state copy (L24) -- WCAG AA
- [ ] `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` -- `text-text-3`→`text-text-2` on status indicators (L68 "All saved", L76 "Saving…", L84 "Saving after response…"); snap `px-2.5`→`px-3` (L105), `py-1.5`→`py-2` (L179) -- WCAG AA; 4px grid
- [ ] `apps/web/src/components/conversation/ToolPill.tsx` -- snap `py-0.5`→`py-1` and `gap-1.5`→`gap-2` (L52, match DESIGN.md 4px 8px) -- 4px grid
- [ ] `apps/web/src/components/conversation/SemanticPill.tsx` -- snap `px-2.5`→`px-2` and `gap-1.5`→`gap-2` (L38, match DESIGN.md 4px 8px) -- 4px grid
- [ ] `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` -- `text-text-3`→`text-text-2` on date (L81); snap `py-0.5`→`py-1` (L27, L29), `gap-0.5`→`gap-1` and `py-2.5`→`py-3` (L69) -- WCAG AA; 4px grid
- [ ] `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` -- snap `px-1.5 py-0.5`→`px-2 py-1` (L41), `gap-1.5`→`gap-2` (L30, L33), `mb-2.5`→`mb-3` (L19) -- 4px grid
- [ ] `apps/web/src/components/project-map/ArtifactCard.tsx` -- snap `py-0.5`→`py-1` (L28, L30), `gap-0.5`→`gap-1` (L57); change `hover:border-text-3`→`hover:border-border` (L53, text token misused as border) -- 4px grid; token discipline
- [ ] `apps/web/src/components/project-map/CredentialErrorBanner.tsx` -- snap `py-2.5`→`py-3` (L37, match DESIGN.md 12px 16px) -- 4px grid
- [ ] `apps/web/src/components/shell/AppShell.tsx` -- `ring-offset-bg`→`ring-offset-surface` (L72) -- canonical focus ring
- [ ] `apps/web/src/components/shell/Breadcrumb.tsx` -- `ring-offset-bg`→`ring-offset-surface` (L8) -- canonical focus ring
- [ ] `apps/web/src/components/project-map/RefreshButton.tsx` -- `ring-offset-bg`→`ring-offset-surface` (L28) -- canonical focus ring
- [ ] `apps/web/src/app/sign-in/submit-button.tsx` -- `focus-visible:`→`focus:` and `ring-offset-bg`→`ring-offset-surface` (L12) -- canonical focus ring
- [ ] `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` -- `ring-offset-bg`→`ring-offset-surface` on input (L53); `focus-visible:`→`focus:` and `ring-offset-bg`→`ring-offset-surface` on submit button (L75); snap `gap-1.5`→`gap-2` (L40), `py-2.5`→`py-3` (L53, L75) -- canonical focus ring; 4px grid
- [ ] `apps/web/src/components/ui/dialog.tsx` -- snap `space-y-1.5`→`space-y-2` (L53) -- 4px grid
- [ ] `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` -- snap `gap-0.5`→`gap-1` and `py-2.5`→`py-3` (L16) -- 4px grid

**Acceptance Criteria:**
- Given the app is rendered, when viewing message timestamps, working-tree status indicators, system messages, and empty-state copy, then all permanent informational text uses `text-2` (passes WCAG AA 4.5:1)
- Given `tailwind.config.ts`, when `border-subtle` is applied to a `surface-raised` element, then the border is visible (value `#232330`, distinct from `surface-raised` `#1E1E26`)
- Given any focusable interactive element, when it receives focus, then the focus ring matches `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (no `ring-offset-bg` or `focus-visible:` variants remain)
- Given any component, when inspecting padding/margin/gap classes, then all values are multiples of 4px (no `0.5`, `1.5`, `2.5` spacing classes remain in `apps/web/src/`)
- Given `yarn nx test web`, when tests run, then all pass including updated `tailwind-theme.spec.ts`

## Verification

**Commands:**
- `yarn nx lint web` -- expected: zero lint errors
- `yarn nx test web` -- expected: all tests pass, including updated tailwind-theme.spec.ts
- `yarn nx build web` -- expected: successful build, no type errors
