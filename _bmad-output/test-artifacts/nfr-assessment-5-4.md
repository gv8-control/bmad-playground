---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-12'
workflowType: 'testarch-nfr-assess'
storyId: '5.4'
storyKey: '5-4-fix-token-usage-drift-and-token-config-gaps'
storyFile: '_bmad-output/implementation-artifacts/5-4-fix-token-usage-drift-and-token-config-gaps.md'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-4-fix-token-usage-drift-and-token-config-gaps.md'
  - '_bmad-output/test-artifacts/atdd-checklist-5-4-fix-token-usage-drift-and-token-config-gaps.md'
  - '_bmad-output/test-artifacts/automate-validation-report-5-4.md'
  - '_bmad-output/test-artifacts/test-review-validation-report-5-4.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - 'apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx'
  - 'apps/web/tailwind.config.ts'
  - 'apps/web/src/app/global.css'
  - 'apps/web/src/components/conversation/WorkingTreeIndicator.tsx'
  - 'apps/web/src/components/project-map/ArtifactCard.tsx'
  - 'apps/web/src/components/onboarding/RepositoryUrlForm.tsx'
  - 'apps/web/src/components/artifact-browser/ArtifactListEntry.tsx'
  - 'apps/web/src/components/artifact-browser/ArtifactViewer.tsx'
  - 'apps/web/src/components/shell/SideNavigation.tsx'
  - 'apps/web/src/components/conversation/ChatMessageList.tsx'
  - 'apps/web/src/app/global-css.spec.ts'
  - 'playwright/e2e/visual-containers/story-5-4-token-usage-drift.spec.ts'
  - 'libs/database-schemas/src/prisma/schema.prisma'
---

# NFR Evidence Audit - Story 5.4: Fix Token-Usage Drift and Token-Config Gaps

**Date:** 2026-07-12
**Story:** 5.4
**Overall Status:** PASS WITH CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs where available. Per user instruction, this audit focuses on NFR-specific issues only (missing select projections, take limits, timing tests, security headers).

## Executive Summary

**Assessment:** 6 PASS, 5 CONCERNS, 0 FAIL

**Blockers:** 0

**Medium Priority Issues:** 2

**Low Priority Issues:** 3

**Recommendation:** Proceed to release with documented findings. Story 5.4 is a frontend-only CSS/Tailwind token-drift story (className changes, CSS rules, Tailwind config structure). No new Prisma queries, no security header changes, no sandbox/credential changes. The 2 Medium findings are: (1) a pre-existing missing `select` projection on `repoConnection.findUnique` in a file the story modified, and (2) an AC-7 coverage gap where `no-scrollbar` was applied to the two-pane artifact list layout but not the full-width layout. Neither blocks release, but both should be addressed.

---

## NFR Matrix for Story 5.4

| NFR | Category | Threshold | Relevance to Story 5.4 |
| --- | --- | --- | --- |
| NFR-P3 | Performance | Project Map loads within 2s | Story modifies ArtifactCard (rendered on Project Map) — CSS-only change, negligible impact |
| NFR-P4 | Performance | Artifact Browser loads within 2s | Story modifies artifacts/page.tsx, ArtifactListEntry, ArtifactViewer — CSS-only change, negligible impact |
| NFR-S2 | Security | Credential isolation (tenant-scoped lookups) | Story does not touch credential resolution or token lookups |
| NFR-S4 | Security | OAuth token storage encryption | Story does not touch encryption or token storage |
| NFR-R1 | Reliability | Credential health update within one cycle | Story does not touch credential health |
| NFR-R3 | Reliability | SSE back-pressure | Story does not touch SSE transport |
| NFR-O1 | Observability | Per-user LLM spend tracking | Story does not touch cost tracking |
| UX-DR16 | Accessibility | Visible focus rings, keyboard nav, aria-live | Story modifies components with focus rings — preserves all existing focus ring classes |
| QoE | Quality of Experience | Scrollbar consistency | Story introduces `no-scrollbar` — AC-7 coverage gap on full-width pane (Finding 2) |

---

## Evidence Gathered

### Performance

**Source:** `artifacts/page.tsx` (file modified by Story 5.4 for AC-6, AC-7)

- `findMany` (line 47-52): has `take: 100` and `select` projection — PASS
- `findMany` (line 64-69): has `take: 100` and `select` projection — PASS
- `findFirst` (line 76-79): has `select: { content: true }` — PASS
- `findUnique` (line 24-26): NO `select` projection — CONCERN (Finding 1)

**Source:** `tailwind.config.ts` (modified by Story 5.4 for AC-8, AC-10, AC-11)

- Full `theme` override for `colors` reduces CSS bundle size (fewer utilities generated) — PASS
- Full `theme` override for `borderRadius` with `DEFAULT: '4px'` — PASS (review patch applied)
- Full `theme` override for `fontWeight` blocks `font-bold`/`font-extrabold`/`font-black` — PASS
- `boxShadow.floating` added to `extend` (not full override) — PASS (intentional, shadcn/ui still uses `shadow-lg`)

### Security

**Source:** `RepositoryUrlForm.tsx` (modified by Story 5.4 for AC-2, AC-3)

- Input has no `maxLength` attribute — CONCERN (Finding 5, pre-existing, Low)
- Story only changed CSS classes on the input — no security regression introduced
- No security headers modified — PASS
- No credential/token handling modified — PASS

### Accessibility

**Source:** `SideNavigation.tsx`, `ChatMessageList.tsx`, `artifacts/page.tsx` (modified for AC-7)

- `no-scrollbar` panels lack `tabIndex={0}` and `role="region"` — CONCERN (Finding 4, Low)
- All focus ring classes preserved (`focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2`) — PASS
- `aria-live="polite"` preserved on ChatMessageList and WorkingTreeIndicator — PASS
- `role="log"` preserved on ChatMessageList — PASS

### Deployability

**Source:** `global-css.spec.ts` (new file created by Story 5.4 ATDD)

- File exists on disk but is untracked in git (`git status` shows `??`) — CONCERN (Finding 3, Low)
- Production build succeeds (853 tests pass, `yarn nx build web` PASS) — PASS
- No skipped tests (0 `.skip()`/`.todo()`/`.fixme()` patterns) — PASS

### Quality of Experience

**Source:** `artifacts/page.tsx` (modified for AC-6, AC-7)

- Two-pane layout (line 93): has `no-scrollbar` — PASS
- Full-width layout (line 123): missing `no-scrollbar` — CONCERN (Finding 2, Medium)
- Test coverage only covers two-pane layout (passes `{ id: 'art_1' }`) — coverage gap

---

## Findings

### Finding 1: Missing `select` projection on `repoConnection.findUnique` [Medium]

**Category:** Performance (NFR-P3/P4 — hot path page load)
**Introduced by Story 5.4:** No (pre-existing, but in a file the story modified)
**Status:** Open

**Evidence:**
- File: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:24-26`
- Query: `getPrisma().repoConnection.findUnique({ where: { userId: session.userId } })`
- Fetches all 7 columns (id, userId, repoUrl, credentialHealth, lastSyncedAt, createdAt, updatedAt) when only `id` is read downstream (lines 48, 65, 77).
- `RepoConnection` model confirmed in `schema.prisma:43-56` — no encrypted token column (token stored elsewhere), so no security concern, but wasted Postgres transfer on every page load.

**Spec citation:** project-context.md line 179: "always pass `select: { ... }` with only the columns actually read. Without it, Prisma fetches the full row (all columns) on every call — wasted Postgres transfer on hot paths."

**Remediation:** Add `select: { id: true }` to the `findUnique` call.

---

### Finding 2: `no-scrollbar` not applied to full-width artifact list pane [Medium]

**Category:** Quality of Experience (QoE — scrollbar consistency)
**Introduced by Story 5.4:** Yes (AC-7 coverage gap)
**Status:** Open

**Evidence:**
- File: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123`
- Two-pane layout (line 93): `className="w-[280px] flex-shrink-0 border-r border-surface-raised overflow-y-auto no-scrollbar"` — has `no-scrollbar`
- Full-width layout (line 123): `className="flex-1 overflow-y-auto px-8 pb-8"` — missing `no-scrollbar`
- AC-7 says "scrollable panels on the 3 affected surfaces" should hide scrollbars. The full-width list pane is a scrollable panel on the artifact-browser surface.
- Test at `page.test.tsx:461` only covers the two-pane layout (passes `{ id: 'art_1' }`), not the full-width layout — coverage gap.

**Remediation:** Add `no-scrollbar` class to line 123. Add a test case rendering the page without an `id` searchParam to assert `no-scrollbar` on the full-width pane.

---

### Finding 3: `global-css.spec.ts` untracked in git [Low]

**Category:** Deployability (NFR — test coverage persistence)
**Introduced by Story 5.4:** Yes (new file not staged)
**Status:** Open (already noted as deferred in review findings)

**Evidence:**
- File: `apps/web/src/app/global-css.spec.ts`
- `git status --short apps/web/src/app/global-css.spec.ts` returns `??` (untracked).
- The AC-7 CSS rule presence test file exists on disk but is not staged/committed.
- A selective commit staging only modified tracked files would lose AC-7 test coverage.

**Remediation:** `git add apps/web/src/app/global-css.spec.ts` before committing.

---

### Finding 4: `no-scrollbar` panels not keyboard-scrollable [Low]

**Category:** Accessibility (UX-DR16 — keyboard navigability)
**Introduced by Story 5.4:** Yes (AC-7 introduced the `no-scrollbar` class)
**Status:** Open (already noted as deferred in review findings)

**Evidence:**
- Files: `SideNavigation.tsx:42`, `ChatMessageList.tsx:75`, `artifacts/page.tsx:93`
- Panels with `no-scrollbar` lack `tabIndex={0}` and `role="region"` for keyboard scrolling.
- Keyboard-only users cannot scroll these panels via Tab + Space/PageDown.
- AC-7 explicitly lists wheel/trackpad/touch, not keyboard — but accessibility is an NFR category.
- Pre-existing condition: panels lacked `tabIndex`/`role="region"` before this change.

**Remediation:** Add `tabIndex={0}` and `role="region"` with `aria-label` to each scrollable panel.

---

### Finding 5: No `maxLength` on RepositoryUrlForm input [Low]

**Category:** Security (NFR-S — defense-in-depth, DoS prevention)
**Introduced by Story 5.4:** No (pre-existing)
**Status:** Open

**Evidence:**
- File: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:46-53`
- The URL input has no `maxLength` attribute, allowing unbounded input length on the frontend.
- While server-side Zod validation likely bounds this (per project-context.md line 137), the frontend lacks defense-in-depth.
- Story only changed CSS classes on the input — no security regression introduced.

**Remediation:** Add `maxLength={2000}` (or limit matching the server-side Zod schema) to the input element.

---

## Categories with No Findings

| Category | Status | Notes |
|----------|--------|-------|
| Take limits | PASS | Both `findMany` calls have `take: 100` |
| Timing tests | PASS | CSS-only story — no performance timing tests needed; NFR-P3/P4 impact negligible |
| Security headers | PASS | No middleware, headers, or security configuration modified |
| SSE back-pressure | PASS | No SSE transport changes |
| Credential isolation | PASS | No credential resolution or token lookups modified |
| LLM spend tracking | PASS | No cost tracking changes |
| Encryption | PASS | No encryption or token storage modified |

---

## Conclusion

Story 5.4 is a frontend-only CSS/Tailwind token-drift story. The NFR audit found 5 issues (2 Medium, 3 Low), none of which are blockers. The 2 Medium findings are: (1) a pre-existing missing `select` projection on `repoConnection.findUnique` in a file the story modified (performance), and (2) an AC-7 coverage gap where `no-scrollbar` was applied to the two-pane artifact list layout but not the full-width layout (QoE). The 3 Low findings are deployability (untracked test file), accessibility (keyboard scrolling), and security (missing `maxLength`). All findings are documented in the story's review section with severity and remediation.

**Gate Decision: PASS WITH CONCERNS** — proceed to release with documented findings. Findings 1 and 2 should be addressed in a follow-up patch; findings 3-5 can be deferred.
