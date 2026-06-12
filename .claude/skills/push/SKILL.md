---
name: push
description: Push existing commits to the remote repository. Use this whenever the user says "push", "/push", "push to remote", "push my commits", "send to GitHub", or otherwise wants to push local commits upstream. This skill NEVER creates commits or stages files — it only pushes what already exists in git history. Use it even when the user just says "push" without elaboration.
---

Push the current branch's existing commits to the remote. Never stage files, never create commits.

## Steps

1. Get the current branch: `git branch --show-current`
2. Check if an upstream tracking branch is set:
   ```
   git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
   ```
3. Run the appropriate push command:
   - **Upstream already set**: `git push`
   - **No upstream, origin exists** (`git remote get-url origin` succeeds): `git push -u origin <branch>`
   - **No remote at all**: tell the user no remote is configured and stop
4. If already up to date, tell the user. Otherwise report the result.

## Hard constraints

- Never run `git add`, `git stage`, or `git commit` under any circumstances
- Never amend, rebase, or modify existing commits
- Never force-push unless the user explicitly asks and confirms
