---
target_files: [] # set at runtime: list of file paths
target_description: '' # set at runtime: what the user wants to explore
has_diff: false # set at runtime: whether a diff was provided
---

# Step 1: Gather Context

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- The prompt that triggered this workflow IS the intent — not a hint.
- Do not modify any files. This step is read-only.
- The target can be existing code — no diff is required. This is a bug hunt, not a code review of changes.

## INSTRUCTIONS

1. **Find the bug-hunt target.** The conversation context before this skill was triggered IS your starting point — not a blank slate. Check in this order — stop as soon as the target is identified:

   **Tier 1 — Explicit argument.**
   Did the user pass a file path, directory, code area name, or diff source this message?
   - File path → verify it exists in the working tree. Add to `{target_files}`. Set `{target_description}` from the path or the user's wording.
   - Directory → list all source files within it (respecting `.gitignore`). Add each to `{target_files}`. Set `{target_description}` from the directory name or the user's wording.
   - Code area name (e.g. "auth module", "n8n integration") → resolve to the relevant files by searching the project. Add each to `{target_files}`. Set `{target_description}` to the user's wording.
   - Diff source (PR, commit, branch) → resolve to changed files and add them to `{target_files}`. Set `{has_diff}` = `true`. Set `{target_description}` from the diff source.
   - Also scan the argument for diff-mode keywords to set `{has_diff}`:
     - "staged" / "staged changes" → Staged changes only
     - "uncommitted" / "working tree" / "all changes" → Uncommitted changes (staged + unstaged)
     - "branch diff" / "vs main" / "against main" / "compared to <branch>" → Branch diff (extract base branch if mentioned)

   **Tier 2 — Recent conversation.**
   Do the last few messages reveal what the user wants explored? Look for file paths, directory names, code area descriptions, or references to a change. Apply the same routing as Tier 1.

   **Tier 3 — Ask.**
   Fall through to instruction 2.

   Never ask extra questions beyond what the cascade prescribes. If a tier above already identified the target, skip the remaining tiers and proceed to instruction 3 (validate target).

2. HALT. Ask the user: **What do you want to hunt for bugs in?** Present these options:
   - **Specific file(s)** (provide one or more paths)
   - **Directory** (all source files within a directory)
   - **Code area** (describe it — e.g. "auth flow", "n8n integration")
   - **Recent changes** (uncommitted, staged, branch diff, or commit range)

   Wait for the user's response. When received, resolve the target as in Tier 1: expand to a file list, set `{target_files}`, `{target_description}`, and `{has_diff}`.

3. **Validate the target.**
   - Verify every path in `{target_files}` exists in the working tree. If any path does not exist, HALT and ask the user to provide valid paths.
   - If `{target_files}` is empty after resolution (e.g. a directory with no source files), HALT and tell the user there is nothing to analyze.
   - If `{target_files}` is very large (more than approximately 20 files), warn the user and offer to narrow the scope or proceed in batches across multiple runs.

4. Sanity check: if `{has_diff}` = `true` and the diff exceeds approximately 3000 lines, warn the user and offer to chunk the hunt by file group.

### CHECKPOINT

Present a summary before proceeding: `{target_files}` (file count and list), `{target_description}`, and whether the hunt includes a diff (`{has_diff}`). HALT and wait for user confirmation to proceed.

## NEXT

Read fully and follow `./step-02-tfa.md`
