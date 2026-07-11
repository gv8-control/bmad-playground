---
title: 'Fix Claude Code binary cwd fallback'
type: 'bugfix'
created: '2026-07-11'
status: 'done'
route: 'one-shot'
---

# Fix Claude Code binary cwd fallback

## Intent

**Problem:** The Claude Code native binary failed to launch during Tier 3 E2E tests because `agent.service.ts` passed `cwd: process.env.AGENT_WORKDIR ?? '/workspace'` to the SDK `query()` call, but `AGENT_WORKDIR` was never set and `/workspace` did not exist on any runtime environment. `child_process.spawn` emitted `ENOENT` for the missing `cwd`; the SDK produced the misleading message "exists but failed to launch."

**Approach:** Changed the fallback from the non-existent `/workspace` to `os.tmpdir()`, which always exists and is a neutral directory that won't expose the application's own source code to the agent. Added `import { tmpdir } from 'os'`.

## Suggested Review Order

- Import addition for `os.tmpdir()`
  [`agent.service.ts:2`](../../apps/agent-be/src/streaming/agent.service.ts#L2)

- The `query()` call — `cwd` fallback changed from `/workspace` to `tmpdir()`
  [`agent.service.ts:94`](../../apps/agent-be/src/streaming/agent.service.ts#L94)
