---
report_path: '' # set at runtime: path to the consolidated bug-hunt report
slug: '' # set at runtime: derived from target_description
---

# Step 5: Consolidate

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- Merge ALL findings from TFA, ECH, and CR into a single prioritized report.
- Deduplicate — the same issue found by multiple skills becomes one finding with merged sources.
- Be precise. When uncertain between classifications, prefer the more conservative classification.

## INSTRUCTIONS

1. **Normalize** findings into a common format. Expected input formats:
   - TFA: fidelity report with findings containing code path, test reference, assumed contract, real contract, gap classification, and `path:line` citations.
   - ECH: JSON array with `location`, `trigger_condition`, `guard_snippet`, `potential_consequence` fields.
   - CR: triaged markdown with `id`, `source`, `title`, `detail`, `location`, and classification bucket (`decision_needed`, `patch`, `defer`).

   If a layer's output does not match its expected format, attempt best-effort parsing. Note any parsing issues for the user.

   Convert all to a unified list where each finding has:
   - `id` — sequential integer
   - `source` — `tfa`, `ech`, `cr`, or merged sources (e.g., `tfa+ech`, `ech+cr`, `tfa+ech+cr`)
   - `title` — one-line summary
   - `detail` — full description
   - `location` — file and line reference (if available)
   - `original_classifications` — the layer-specific classifications (e.g., TFA gap type, ECH trigger, CR bucket)

2. **Deduplicate.** If two or more findings describe the same issue, merge them into one:
   - Use the most specific finding as the base (prefer ECH JSON with location, or TFA with `path:line`, over CR prose).
   - Append any unique detail, reasoning, or location references from the other finding(s) into the surviving `detail` field.
   - Set `source` to the merged sources (e.g., `tfa+ech`).

3. **Classify** each finding into exactly one severity level:
   - **critical** — false-green test on a real contract boundary (from TFA), OR unhandled path with production-reachable consequence (from ECH/CR). The bug is real and reachable in production.
   - **high** — unhandled edge case or adversarial finding with real impact. The bug is real but may require specific conditions to trigger.
   - **medium** — edge case or finding with conditional impact. The issue is valid but its production impact depends on usage patterns or configuration.
   - **low** — minor, theoretical, or hard-to-reach. The issue is technically valid but unlikely to manifest in practice.

   When classifying, consider: Is the consequence production-reachable? Does a false-green test hide it? Is there a guard that partially mitigates the risk? Prefer the more conservative classification when uncertain.

4. **Order** findings by severity: `critical` → `high` → `medium` → `low`. Within each severity, order by number of sources (findings found by multiple layers first).

5. **Write the consolidated report.** Derive `{slug}` from `{target_description}`: lowercase, words joined by hyphens, alphanumeric only. Set `{report_path}` = `{implementation_artifacts}/bug-hunt-{slug}.md`.

   Write the report with this structure:

   ```markdown
   # Bug Hunt Report: {target_description}

   **Date:** {date}
   **Target files:** <file list>
   **Has diff:** {has_diff}

   ## Summary

   - **Total findings:** <count>
   - **Critical:** <count>
   - **High:** <count>
   - **Medium:** <count>
   - **Low:** <count>

   ### Layer results:
   - **TFA (Test Fidelity Audit):** <finding count> findings — verdict: {tfa_verdict}
   - **ECH (Edge Case Hunter):** <finding count> unhandled paths
   - **CR (Code Review):** <finding count> findings (<dismiss_count> dismissed)

   ## Findings

   ### Critical

   <for each critical finding:>
   #### [C<id>] <title>
   - **Sources:** <source, e.g. "tfa+ech">
   - **Location:** <location>
   - **Detail:** <detail>
   - **Original classifications:** <original_classifications>

   ### High
   <...>

   ### Medium
   <...>

   ### Low
   <...>
   ```

6. **Present summary.** Announce what was written:

   > **Bug hunt complete.** <C> critical, <H> high, <M> medium, <L> low findings.
   > Report written to `{report_path}`.

   Present the top 3 critical/high findings (title, location, one-line detail). If there are fewer than 3 critical/high findings, present what exists.

7. **Offer next steps.**

   > **What would you like to do next?**
   > 1. **Fix findings** — run `bmad-quick-dev` to address critical/high findings
   > 2. **Investigate further** — run `bmad-investigate` to trace a specific finding deeper
   > 3. **Done** — end the workflow

   **HALT** — I am waiting for your choice. Reply with only the number. Do not proceed until the user selects an option.

## On Complete

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow.on_complete`

If the resolved `workflow.on_complete` is non-empty, follow it as the final terminal instruction before exiting.
