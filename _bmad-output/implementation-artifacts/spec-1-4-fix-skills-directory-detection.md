---
title: 'Fix skills-directory detection in BMAD repository validation'
type: 'bugfix'
created: '2026-07-01'
status: 'done'
context: []
baseline_commit: 'fd624b4379b6a43d763321a65cd9a1932724ca4a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `inspectBmadSetup` (Story 1.4, status `review`) counts a BMAD Skill only when it finds a `type: 'file'` entry ending in `.md` directly under `.claude/skills/`. The real BMAD packaging convention — confirmed by this repo's own `.claude/skills/` layout — is one directory per skill containing `SKILL.md` (e.g. `.claude/skills/bmad-agent-architect/SKILL.md`), which GitHub's Contents API reports as `type: 'dir'`. Every correctly-initialized repo therefore reports `skillsCount: 0` and fails onboarding with a false "No BMAD Skills were found" error.

**Approach:** After listing `.claude/skills/`, keep counting flat `*.md` files (back-compat, already tested), and additionally probe each `type: 'dir'` entry for `<dir>/SKILL.md` in parallel via the existing `fetchGithubContents` helper — a directory counts as a skill only if that probe resolves to a file (not 404).

## Boundaries & Constraints

**Always:**
- Reuse `fetchGithubContents` for the `SKILL.md` probes — no new GitHub client code.
- Keep the existing `AbortSignal.timeout(10_000)` behavior (inherited automatically from `fetchGithubContents`).
- Preserve existing behavior untouched: required-directory checks, version detection, error envelope shape (`ValidationError`/`ValidationResult`), and the `MISSING_DIRECTORY` → `UNSUPPORTED_VERSION` → `NO_SKILLS_FOUND` priority order.
- Probe directory entries in parallel (`Promise.all`), matching the existing parallel-fetch style already used for the root/skills/version calls.

**Ask First:** None — approach is fully determined by the existing code pattern (mirrors `detectBmadVersion`'s probe style) and confirmed root cause.

**Never:**
- Do not add a concurrency limiter/queue for the `SKILL.md` probes. The codebase has no such utility today and Story 1.3/1.4 already do unbounded parallel GitHub fetches; adding one now is speculative for MVP repo sizes (dozens of skills, not thousands).
- Do not change the public `ValidationResult`/`ValidationError` shape or the `skillsCount` field's meaning (still a total count, not a boolean).
- Do not touch `repo-connection.actions.ts`, the onboarding UI, or version/required-directory logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Directory-style skill | `.claude/skills/foo/` (dir) contains `SKILL.md` | counted as 1 skill | N/A |
| Directory without SKILL.md | `.claude/skills/foo/` (dir) has no `SKILL.md` (404 on probe) | not counted | N/A |
| Flat file skill (back-compat) | `.claude/skills/foo.md` (file) | counted as 1 skill (unchanged existing behavior) | N/A |
| Mixed layout | 1 flat `.md` file + 1 valid skill dir + 1 dir without `SKILL.md` | `skillsCount: 2` | N/A |
| All dirs, none valid | `.claude/skills/` has only dirs, none contain `SKILL.md` | `NO_SKILLS_FOUND`, "No BMAD Skills were found..." message (dir exists) | existing NO_SKILLS_FOUND path, unchanged |
| GitHub error on a probe | One `SKILL.md` probe returns 401/403/500 | propagates like any other GitHub error already does in `inspectBmadSetup` | 401 → `CredentialFailureError` / 403 → `null` or `RateLimitError` / 500 → generic catch in `validateRepository`, unchanged |

</frozen-after-approval>

## Code Map

- `apps/web/src/actions/repository-validation.actions.ts` -- `inspectBmadSetup` skills-counting block (lines ~194-197) is the bug; add a helper that probes directory entries for `SKILL.md`.
- `apps/web/src/actions/repository-validation.actions.spec.ts` -- existing skills tests (lines ~102-114, ~316-334) encode the flat-file-only assumption; add coverage for the directory+`SKILL.md` layout.
- `apps/web/src/actions/repository-validation.test-utils.ts` -- shared fixtures/mocks (`SKILLS_WITH_MD`, `setupFetchWithOverrides`); add fixtures for directory-style skills, reuse existing generic override mechanism for per-directory `SKILL.md` probe URLs.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/actions/repository-validation.actions.ts` -- add `countSkills(accessToken, owner, repo, entries)` helper: sums flat `.md` file entries + parallel `SKILL.md` probes for `type: 'dir'` entries; call it in place of the current inline filter -- fixes the false-negative root cause
- [x] `apps/web/src/actions/repository-validation.test-utils.ts` -- add `SKILLS_WITH_SUBDIRS` (dir entries) and a way to mock per-directory `SKILL.md` probe responses via the existing `overrides` mechanism in `setupFetchWithOverrides` -- unblocks new test cases without duplicating mock plumbing
- [x] `apps/web/src/actions/repository-validation.actions.spec.ts` -- add tests for: directory-style skill counted, directory without `SKILL.md` excluded, mixed flat+directory count, all-dirs-no-SKILL.md triggers `NO_SKILLS_FOUND` -- locks in the real-world layout so this regression can't reoccur silently

**Acceptance Criteria:**
- Given `.claude/skills/bmad-agent-architect/SKILL.md` exists (this repo's actual layout), when `inspectBmadSetup` runs, then `skillsCount` includes it and validation succeeds if other checks pass
- Given a `.claude/skills/` directory entry with no `SKILL.md` inside, when `inspectBmadSetup` runs, then that entry is not counted
- Given `.claude/skills/` contains a mix of flat `.md` files and valid skill directories, when `inspectBmadSetup` runs, then `skillsCount` equals the sum of both
- Given all existing Story 1.4 tests (flat-file cases, missing/empty directory cases, version detection, required-directory checks), when the fix is applied, then they still pass unmodified in behavior (only new tests added)

## Design Notes

`countSkills` probes `SKILL.md` via `fetchGithubContents(accessToken, owner, repo, '.claude/skills/<dir-name>/SKILL.md')` — this returns a single file object (truthy, non-array) if present, or `null` on 404, exactly mirroring how `detectBmadVersion` already probes candidate file paths. No new fetch/error-handling primitives needed:

```ts
async function countSkills(accessToken: string, owner: string, repo: string, entries: GithubContentEntry[]): Promise<number> {
  const flatMdCount = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md')).length;
  const dirEntries = entries.filter((e) => e.type === 'dir');
  const dirChecks = await Promise.all(
    dirEntries.map((d) => fetchGithubContents(accessToken, owner, repo, `.claude/skills/${d.name}/SKILL.md`)),
  );
  const dirSkillCount = dirChecks.filter((r) => r !== null && !Array.isArray(r)).length;
  return flatMdCount + dirSkillCount;
}
```

Call site changes from a plain array `.filter().length` to `await countSkills(accessToken, owner, repo, skillsEntries)` — `inspectBmadSetup` is already `async`, so this is a non-breaking internal change.

## Verification

**Commands:**
- `yarn nx test web --testFile=repository-validation.actions.spec.ts` -- expected: all existing + new tests pass
- `yarn nx lint web` -- expected: 0 errors

## Suggested Review Order

**Skills-counting fix**

- Entry point — new helper sums flat `.md` files plus parallel `SKILL.md` probes per directory.
  [`repository-validation.actions.ts:139`](../../apps/web/src/actions/repository-validation.actions.ts#L139)

- Directory names are percent-encoded before path interpolation — patch from review (edge-case/blind hunter: unescaped special chars in GitHub path).
  [`repository-validation.actions.ts:151`](../../apps/web/src/actions/repository-validation.actions.ts#L151)

- Call site swaps the old inline filter for the async helper — same position in the validation sequence, no control-flow change.
  [`repository-validation.actions.ts:214`](../../apps/web/src/actions/repository-validation.actions.ts#L214)

**Test coverage**

- New fixture representing the real BMAD skill-directory layout (one dir per skill, contains `SKILL.md`).
  [`repository-validation.test-utils.ts:31`](../../apps/web/src/actions/repository-validation.test-utils.ts#L31)

- Core positive case — directory-style skill counted when `SKILL.md` is present.
  [`repository-validation.actions.spec.ts:363`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L363)

- Negative case — directory without `SKILL.md` excluded from the count.
  [`repository-validation.actions.spec.ts:373`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L373)

- Mixed layout — flat `.md` files and valid skill directories sum correctly.
  [`repository-validation.actions.spec.ts:383`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L383)

- All-directories-invalid still resolves to `NO_SKILLS_FOUND`, unchanged error path.
  [`repository-validation.actions.spec.ts:397`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L397)

- Patch from review (acceptance auditor: untested I/O-matrix row) — a GitHub error on one directory's `SKILL.md` probe propagates like any other GitHub error.
  [`repository-validation.actions.spec.ts:407`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L407)
