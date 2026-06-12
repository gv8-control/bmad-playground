---
name: commit
description: Stage and commit changes to the git repository with a well-formed commit message. Use this whenever the user says "commit", "/commit", "commit my changes", "make a commit", "commit everything", "commit staged files", "save my changes to git", or otherwise wants to create a git commit — even if they don't say "commit" explicitly but clearly want to record changes in git history. If the user provides a description of what to commit, use it to determine what to stage.
---

Create a git commit from staged (or described) changes, using a message that follows the project's commit conventions.

## Steps

1. **Check what's staged**: run `git status` to see staged and unstaged changes.

2. **If nothing is staged**:
   - If the user's message describes what to commit (e.g. "commit the new auth changes", "commit everything"), stage the relevant files:
     - "all" / "everything" / no specific mention → `git add -A`
     - specific feature or area described → research which files are involved first: the description likely refers to a feature or concern that spans multiple files and directories (e.g. both frontend and backend). Use `git status`, `git diff`, and file content reads as needed to identify all relevant files, then `git add <file1> <file2> ...` each one explicitly.
   - If the user gave no description and nothing is staged, tell them there's nothing to commit and stop.

3. **Secrets check**: scan the list of files about to be committed. If any are likely to contain secrets (`.env`, `*.key`, `*credentials*`, `*secret*`, `*.pem`, etc.), warn the user and stop without committing.

4. **Analyze the diff**: run `git diff --cached` to understand what is actually changing. Read the output carefully — the commit message should reflect the real nature of the change, not just a restatement of the file names.

5. **Generate the commit message** following the constraints below.

6. **Commit** using a heredoc to avoid shell quoting issues:
   ```bash
   git commit -m "$(cat <<'EOF'
   <your message here>
   EOF
   )"
   ```

7. **Report** the commit hash and message, then suggest the user run `/push` to push the commit to the remote.

## Commit message constraints

Follow **Conventional Commits**: `<type>(<scope>): <description>`

**Subject line only — nothing else.** No body, no footers, no trailers, no blank lines. The entire message is one line.


### Examples

```
feat(auth): add JWT-based login flow
fix(cart): prevent duplicate item entries on rapid clicks
docs(prd): add initial product requirements for onboarding
chore(deps): upgrade eslint to v9
refactor(api): extract pagination logic into helper
docs(brainstorming): capture ideation session for notification redesign
```

## Hard constraints

- **Subject line only** — one line, nothing after it
- Never run `git commit --amend` unless the user explicitly asks
- Never pass `--no-verify`; if a hook fails, report the error and stop
- Never commit secrets — stop and warn if detected
- Never force-push or touch remote state
