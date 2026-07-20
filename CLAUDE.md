## Project context

This is a BMAD project. Work here often targets the workflow system itself — BMAD skills, agents, n8n workflows, and the self-improving development pipeline — rather than application code.

When the request concerns the workflow system, `docs/self-improving-pipeline.md` documents the pipeline architecture and the constraints the rest of the workflow system inherits.

## Commits

Follow Conventional Commits specification. In message include only the subject line — no body, trailers, or metadata of any kind.

For BMAD artifact updates use `docs` commit type. When a commit creates or updates a BMAD artifact, the scope must reflect the artifact type:

| Artifact                      | Scope                |
| ----------------------------- | -------------------- |
| Brainstorming output          | `brainstorming`      |
| Technical research report     | `technical-research` |
| Market research report        | `market-research`    |
| Product Requirements Document | `prd`                |
| Architecture document         | `architecture`       |
| Epic / user story             | `epics`              |
| UX spec or design             | `ux`                 |
| Domain research               | `domain-research`    |
| Project brief                 | `product-brief`      |
| PR/FAQ document               | `prfaq`              |
| Test architecture             | `test-arch`          |

Do not automatically commit changes after updating \_bmad-output files.

### Examples

```
feat(brainstorming): add initial ideation session for onboarding flow
feat(technical-research): research Claude Code Agent SDK capabilities
```

## BMAD artifact vocabulary

Avoid catchy terms and prefer better-known, simpler terms. Examples:

- `requirements beat` -> `requirements entry`
- `wall-clock timeout` -> `timeout`
- `kill` -> `terminate`
- `flag loudly` -> `highlight`
- `benched` -> `tested performance`

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `yarn nx build`, `yarn nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# General Guidelines

1. Ask, don't assume. If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements. When running unattended, pick the most reasonable interpretation, proceed, and record the assumption rather than blocking.

2. Implement the simplest solution for simple problems, better solutions for harder problems. Do not over-engineer or add flexibility that isn't needed yet.

3. Don't touch unrelated code but please do surface bad code or design smells you discover with me so we can address them as a separate issue.

4. Flag uncertainty explicitly. If you're unsure about something, see point 1 above. If it makes sense to do so, conduct a small, localised and low-risk experiment and bring the hypothesis and results to me to discuss. Confidence without certainty causes more damage than admitting a gap.

## Railway API

The `RAILWAY_TOKEN` in `.env.local` is a **project token** (UUID format). Project tokens use the `Project-Access-Token` header, NOT `Authorization: Bearer`. Example: `curl -H "Project-Access-Token: $RAILWAY_TOKEN" https://backboard.railway.com/graphql/v2`.

## n8n

When doing changes to n8n workflow, apply them over MCP to the live n8n instance. Make sure to Activate (Publish) the updated workflows if applicable. Do not modify the workflows in n8n/workflows/ - those will be auto-exported.
