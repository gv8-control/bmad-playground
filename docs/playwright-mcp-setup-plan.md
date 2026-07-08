# Playwright MCP Setup Plan

**Date:** 2026-07-08
**Author:** Thinker (BMad)
**Status:** Complete — all steps verified and both MCP servers operational

## Purpose

Enable TEA's `tea_browser_automation` config to use live browser interaction during test generation and review. TEA already has `tea_browser_automation: auto` in `_bmad/tea/config.yaml`, but the required infrastructure (Playwright CLI + Playwright MCP servers) is not installed. This plan covers the full setup.

## What This Enables

TEA uses browser automation in 6 workflows: automate, atdd, framework, test-design, test-review, ci. With it enabled, TEA can:

- See actual page structure during test generation (real selectors, not guessed)
- Verify generated tests work against the real UI
- Inspect DOM during test review for quality scoring
- Drive the browser programmatically — no manual clicking required

This directly reduces false-confidence tests that use fabricated selectors or assume page structure.

## What Already Exists

- `@playwright/test` installed as a project dependency (test runner)
- `playwright.config.ts` with a mature two-tier setup (PR tier + real-service tier)
- `playwright/` directory with E2E tests, auth setup, and support files
- `tea_browser_automation: auto` and `tea_capability_probe: true` in TEA config
- Node.js 18+ (project has `.nvmrc`)

## Prerequisites

- Node.js 18+ (already satisfied)
- Ability to install global npm packages
- Ability to edit `opencode.json` (the MCP client config for this environment)

## Implementation Steps

### Step 1: Install Playwright CLI (global)

The Playwright CLI (`@playwright/cli`) is a separate package from the project-level `@playwright/test`. TEA uses it for browser interaction during test generation.

```bash
npm install -g @playwright/cli@latest
```

Then install the browser skills bundle from the project root:

```bash
playwright-cli install --skills
```

This downloads browser binaries and the skill definitions TEA references.

**Verify:**

```bash
playwright-cli --version
```

### Step 2: Add Playwright MCP servers to opencode.json

TEA's `auto` mode probes for both CLI and MCP availability and uses whatever works. The MCP servers provide a richer interaction model (DOM inspection, element location, screenshot capture) that the CLI alone doesn't offer.

This environment uses **opencode** as its MCP client, which reads from `opencode.json` at the project root. Add two entries to the `mcp` block:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true
    },
    "playwright-test": {
      "type": "local",
      "command": ["npx", "playwright", "run-test-mcp-server"],
      "enabled": true
    }
  }
}
```

**opencode schema notes** (differs from Claude Code's `.mcp.json`):

| Aspect | opencode.json | .mcp.json (Claude Code) |
|---|---|---|
| Command | single `command` array | `command` string + `args` array |
| Enabled | `"enabled": true` required | implicit |
| Env vars | `"{env:VAR}"` | `"${VAR}"` |

**What each server does:**

| Server | Package | Purpose |
|---|---|---|
| `playwright` | `@playwright/mcp` | Browser automation — navigate, click, fill, inspect DOM, screenshot |
| `playwright-test` | `playwright run-test-mcp-server` | Test execution — run Playwright tests, collect results, inspect failures |

**Reference:** https://github.com/microsoft/playwright-mcp

### Step 3: Verify MCP connectivity

After editing `opencode.json`, restart the MCP client (reload the opencode session). Then verify both servers respond.

**Install Google Chrome (required for the browser MCP):**

The `@playwright/mcp` server defaults to the `chrome` browser channel (Google Chrome stable), not Chromium for Testing. The `playwright-cli install --skills` command from Step 1 downloads Chromium for Testing, but the MCP server looks for Chrome at `/opt/google/chrome/chrome`. Install it:

```bash
npx playwright install chrome
```

This installs Google Chrome stable and its system dependencies (~500MB disk space).

**Verification:**

The simplest verification is to call a tool from each MCP server directly:

1. **Browser MCP** — navigate to the dev server and take a snapshot:
   - `playwright_browser_navigate` to `http://localhost:3000`
   - `playwright_browser_snapshot` — should return real DOM content (headings, buttons, page structure)

2. **Test MCP** — list the project's Playwright tests:
   - `playwright-test_test_list` — should return all tests found in `playwright.config.ts`

If either server fails, check:

1. `playwright-cli` is on PATH: `which playwright-cli`
2. MCP servers are registered in `opencode.json` with `"enabled": true`
3. Google Chrome is installed: `google-chrome --version`
4. Browser binaries are installed: `npx playwright install chromium`

### Step 4: Configure browser automation mode (optional)

The current `auto` setting lets TEA probe and pick the best available mode. If you want to force a specific mode, edit `_bmad/tea/config.yaml`:

| Value | Behavior |
|---|---|
| `auto` | Probe and pick best available (recommended) |
| `cli` | Use Playwright CLI only — no MCP |
| `mcp` | Use Playwright MCP servers only — no CLI |
| `none` | Disable browser automation entirely |

Keep `auto` unless there's a specific reason to constrain it.

## Considerations

### Security

- The Playwright MCP servers run locally via `npx` — no external network calls beyond the initial package download
- Browser automation runs against `http://localhost:3000` (the web dev server) — no production URLs
- No credentials are passed to the MCP servers; they interact with the DOM only

### Cost

- No API costs — Playwright MCP runs locally
- Browser binaries consume ~700MB disk space total: Chromium for Testing (~300MB from `playwright-cli install --skills`) + Google Chrome stable (~400MB from `npx playwright install chrome`, including system dependencies)

### Interaction with existing Playwright setup

- The MCP servers use the same browser binaries as `@playwright/test` — no separate install needed beyond `playwright-cli install --skills`
- The MCP servers do not interfere with the existing `playwright.config.ts` or test execution — they are separate tools for TEA's test *generation* workflow, not test *execution*
- TEA's generated tests still use the project's existing test runner and config

### Failure mode

If neither CLI nor MCP is available, TEA falls back to generating tests without live browser interaction. Tests will still be generated, but with lower quality (guessed selectors, no DOM verification). The `auto` mode with `tea_capability_probe: true` ensures this fallback is automatic.

## Validation

After setup is complete, validate by running `bmad-testarch-automate` (TEA Test Automation workflow) against a feature with a UI. TEA should:

1. Report that browser automation is available
2. Navigate to the dev server URL
3. Inspect actual page structure during test generation
4. Generate tests with real selectors that match the DOM

If TEA generates tests with generic selectors like `getByRole('button')` without verifying the element exists, browser automation is not working — re-check Step 3.

## Open Questions

- **Should the Playwright MCP servers be added to the devcontainer config?** The `.devcontainer/` directory exists — if development happens primarily in containers, the MCP servers need to be available inside the container, not just on the host. This plan assumes host-level setup; container setup may need additional configuration.
- **Should `@playwright/cli` be a devDependency instead of a global install?** Global install is what TEA's post-install notes specify, but a devDependency would be more reproducible. If TEA's workflows require the global binary specifically, a devDependency won't work. Test this before committing to either approach.

## Implementation Log

**Date:** 2026-07-08
**Outcome:** All steps completed. Both MCP servers verified operational.

### Corrections discovered during implementation

1. **Wrong config file (Step 2).** The plan originally targeted `.mcp.json` (Claude Code format). This environment uses **opencode**, which reads from `opencode.json` with a different schema (command array instead of command+args, `enabled` flag required, `{env:VAR}` instead of `${VAR}`). Step 2 has been rewritten to reflect the correct file and schema.

2. **Missing Chrome install (Step 3).** The plan did not mention that `@playwright/mcp` defaults to the `chrome` browser channel (Google Chrome stable). The `playwright-cli install --skills` command downloads Chromium for Testing, but the MCP server looks for Chrome at `/opt/google/chrome/chrome`. Running `npx playwright install chrome` is required before the browser MCP will work. Step 3 has been updated to include this.

3. **`mCPServers` typo in example JSON.** The original Step 2 example had `"mCPServers"` (capital C) instead of `"mcpServers"`. This would cause silent failures if copy-pasted into a `.mcp.json` file. Fixed.

### What was installed

| Component | Location | Persists across codespace rebuild? |
|---|---|---|
| `@playwright/cli` (global) | `/home/codespace/nvm/current/bin/playwright-cli` | No — global npm packages are lost on rebuild |
| Playwright CLI skills | `.claude/skills/playwright-cli/` | Yes — in workspace |
| Playwright CLI config | `.playwright/cli.config.json` | Yes — in workspace |
| Chromium for Testing | `~/.cache/ms-playwright/chromium-1229` | No — cache is lost on rebuild |
| Google Chrome stable | `/opt/google/chrome/chrome` | No — system packages are lost on rebuild |
| MCP server entries | `opencode.json` | Yes — in workspace |

### Verification results

- **`playwright-test` MCP**: Listed 208 tests across 24 files. Fully operational.
- **`playwright` browser MCP**: Navigated to `http://localhost:3000`, followed redirect to `/sign-in`, snapshot returned real DOM content (heading "bmad-easy", "Sign in with GitHub" button). Fully operational.

### Remaining work

- The global `@playwright/cli` install and Google Chrome install will not survive a codespace rebuild. If persistence is needed, add both to `.devcontainer/devcontainer.json` or a post-create script.
- The TEA end-to-end validation (running `bmad-testarch-automate` and confirming TEA reports browser automation is available) was not performed. The MCP connectivity is verified directly; the TEA workflow validation is a separate, optional step.
