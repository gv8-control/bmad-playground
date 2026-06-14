---
name: reconcile-research
description: Autonomously reconciles contradictions across research documents by domain. Use when user says 'reconcile research' or 'sync research docs'.
---

# reconcile-research

## Overview

This skill discovers all research documents, groups them by domain, and runs parallel sub-agents to resolve contradictions within each group. Fully autonomous — no user input required. Documents are updated in-place; a changelog is printed in the response for review before committing.

## Conventions

- Bare paths (e.g. `scripts/discover_research_docs.py`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.

## On Activation

Load config from `{project-root}/_bmad/config.toml` and `{project-root}/_bmad/config.user.toml` if present. Resolve `{output_folder}` (default: `{project-root}/_bmad-output`).

## Stage 1: Discover

Run:

```bash
python3 {skill-root}/scripts/discover_research_docs.py --output-folder {output_folder}
```

The script returns a JSON array of all `*.md` files inside any `research/` subdirectory under `{output_folder}`. Each entry: `path`, `filename`, `updated_date` (from `updated:` frontmatter, or `null`). If the array is empty, report no research documents found and exit.

## Stage 2: Categorize

Using filenames only — do not read file contents at this stage.

Group documents by domain using filename prefixes (`technical-*`, `market-*`, `domain-*`). Within `technical-*`, form sub-groups when 3 or more files share a clear sub-topic inferred from the filename. Each document belongs to exactly one group.

## Stage 3: Parallel Reconcile

Spawn one sub-agent per domain group in parallel. Substitute the actual domain name and file paths into the prompt below:

---
You are reconciling research documents in the "[DOMAIN NAME]" domain.

Files (full paths):
[LIST EACH FILE PATH ON ITS OWN LINE]

Read all files. Identify incompatible factual assertions — claims that cannot both be true simultaneously. For each contradiction:

1. Determine the authoritative version using this priority:
   a. Document with a more recent `updated:` date in YAML frontmatter
   b. Document that treats the specific topic with greater depth or specificity
   c. The simpler of the two competing claims

2. Update the losing document in-place to reflect the authoritative claim. Replace the conflicting content; do not preserve both versions.

3. Leave documents not involved in any contradiction untouched.

Return ONLY this JSON — no other output:
[{"from_file": "<filename of doc that was updated>", "to_file": "<filename it deferred to>", "claim": "<one-line description of the claim>", "rationale": "<why this version won>"}, ...]

Return [] if no contradictions were found.
---

Wait for all sub-agents to complete before Stage 4.

## Stage 4: Summary

Compile override entries from all sub-agents. Display a changelog grouped by domain:
- Domain name and contradiction count
- Per override: which file was updated, which it deferred to, the claim changed, and the rationale

If total overrides across all domains is zero, report that all documents are consistent. No files are committed.
