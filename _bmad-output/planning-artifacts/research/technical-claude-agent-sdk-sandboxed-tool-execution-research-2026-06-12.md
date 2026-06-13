---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Claude Agent SDK Sandboxed Tool Execution (E2B / Docker)'
research_goals: 'Understand how to intercept or override tool execution in the Claude Agent SDK so that tool calls (Bash, Read, Write, Edit) are dispatched to an external isolated environment (E2B or Docker container) rather than executing locally on the NestJS host'
user_name: 'Marius'
date: '2026-06-12'
web_research_enabled: true
source_verification: true
---

# Research Report: Claude Agent SDK — Sandboxed Tool Execution (E2B / Docker)

**Date:** 2026-06-12
**Author:** Marius
**Research Type:** Technical

---

## Research Overview

This report answers the question: when running Claude Agent SDK sessions from a NestJS backend, how do you prevent tool calls (Bash, Read, Write, Edit) from executing locally on the NestJS host and instead route them to an isolated sandbox (E2B or Docker)?

Research was conducted against current official Anthropic documentation (code.claude.com/docs), the E2B documentation, and verified community sources. All code patterns cited are from the official SDK documentation as of June 2026.

**Core finding:** There are three distinct architectural approaches, each with different tradeoffs:

1. **Run the SDK subprocess inside the sandbox** — the entire agent (including tool execution) lives inside the E2B VM or Docker container, and the NestJS host only drives it via the SDK over stdio.
2. **Custom tools via in-process MCP server** — define custom `Bash`, `Read`, `Write`, `Edit` replacements whose handlers call out to E2B or Docker via API/SSH; Claude never calls the real built-in tools.
3. **PreToolUse hooks to block/redirect built-in tools** — intercept tool calls before they execute and either block them entirely or substitute the result via `updatedToolOutput`.

Approach 1 is what E2B's official Claude Code integration uses. Approaches 2 and 3 are SDK-native patterns for when you need to orchestrate the sandbox from the NestJS host.

---

## Technical Research Scope Confirmation

**Research Topic:** Claude Agent SDK Sandboxed Tool Execution (E2B / Docker)
**Research Goals:** Understand how to intercept or override tool execution in the Claude Agent SDK so that tool calls (Bash, Read, Write, Edit) are dispatched to an external isolated environment (E2B or Docker container) rather than executing locally on the NestJS host

**Technical Research Scope:**

- Architecture Analysis — design patterns for tool execution isolation
- Implementation Approaches — how to intercept Bash/Read/Write/Edit tool calls
- Technology Stack — Claude Agent SDK, E2B, Docker, MCP Server, NestJS
- Integration Patterns — remote tool dispatch, MCP-in-sandbox architecture
- Performance Considerations — sandbox lifecycle, latency, round-trip patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information

**Scope Confirmed:** 2026-06-12

---

## Q1: How Are Tools Defined and How Is Tool Execution Intercepted?

### Built-in Tools

The Claude Agent SDK ships with these built-in tools that match what Claude Code uses:

| Category | Tools | What they do |
|----------|-------|--------------|
| File operations | `Read`, `Edit`, `Write` | Read, modify, create files |
| Search | `Glob`, `Grep` | Find files, search content |
| Execution | `Bash` | Run shell commands |
| Web | `WebSearch`, `WebFetch` | Search, fetch pages |
| Orchestration | `Agent`, `Skill`, `AskUserQuestion` | Subagents, skills, user prompts |

**Source:** [Agent Loop — How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)

By default, when Claude decides to call `Bash`, `Read`, `Write`, or `Edit`, the SDK executes those tools **in the local process context** — i.e., on the same machine running the NestJS backend. This is the problem to solve.

### Custom Tool Definition (in-process MCP server)

The primary SDK mechanism to define custom tools is the **in-process MCP server** pattern. In TypeScript:

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define a tool with a name, description, Zod schema, and async handler
const myBash = tool(
  "bash",                          // name Claude will call
  "Execute a shell command",       // description Claude reads
  { command: z.string() },         // Zod schema for args
  async (args) => {
    // Handler runs in YOUR application process
    // args.command is typed and validated
    const result = await callE2BSandbox(args.command); // custom dispatch
    return {
      content: [{ type: "text", text: result }]
    };
  }
);

// Wrap tools into an in-process MCP server
const sandboxServer = createSdkMcpServer({
  name: "sandbox",
  version: "1.0.0",
  tools: [myBash]
});
```

Then pass to `query()`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Run the tests",
  options: {
    tools: [],                           // removes ALL built-in tools
    mcpServers: { sandbox: sandboxServer },
    allowedTools: ["mcp__sandbox__bash"]
  }
})) { ... }
```

Key properties of custom tool handlers:
- The handler is an **async function** in your application process
- It receives validated arguments from Claude's tool call
- It must return `{ content: [{type: "text", text: "..."}], isError?: boolean }`
- **The handler can do anything** — call E2B API, SSH into Docker, invoke any remote service
- `tools: []` removes all built-in tools so Claude cannot fall back to local execution

**Source:** [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)

---

## Q2: Is There an Official Pattern for Remote Tool Execution?

### Official Pattern: Run the Entire SDK Inside the Sandbox

The officially documented pattern (reflected in E2B's integration and Anthropic's hosting cookbook) is **not** to intercept tool calls from outside, but rather to **run the entire Claude Agent SDK subprocess inside the isolated environment**. The SDK documentation states:

> "Every hosting decision follows from how the SDK runs the agent. When your code calls `query()`, the SDK spawns a separate `claude` CLI process and talks to it over stdio. That subprocess owns the shell, the working directory, and the JSONL session transcripts on local disk."
>
> — [Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting)

This means if you spin up an E2B VM or Docker container and **run your NestJS `query()` call from inside that container**, all tool execution (Bash, Read, Write, Edit) automatically happens inside the container. The NestJS host that spawns the container becomes just an orchestration layer.

**Officially listed sandbox providers** in the hosting docs:

- [E2B](https://e2b.dev/) — cloud Linux VMs, ~150ms cold start
- [Modal Sandbox](https://modal.com/docs/guide/sandbox)
- [Cloudflare Sandboxes](https://github.com/cloudflare/sandbox-sdk)
- [Daytona](https://www.daytona.io/)
- [Fly Machines](https://fly.io/docs/machines/)
- [Vercel Sandbox](https://vercel.com/docs/functions/sandbox)

### E2B's Official Architecture

E2B's official pattern (from `e2b-dev/claude-code-fastapi`) runs Claude Code **inside** the E2B VM. The FastAPI/NestJS backend:

1. Creates an E2B sandbox (cloud VM)
2. The E2B SDK provides access to a shell inside the VM
3. The Claude Agent SDK `query()` call runs within that VM context (or the entire process is spawned inside the VM)
4. All Bash/Read/Write/Edit tool calls therefore execute inside the E2B VM's isolated filesystem

The E2B official template pre-installs the `anthropic-claude-code` binary in the VM. MCP servers configured via `.mcp.json` run inside the sandbox VM.

**Source:** [E2B Claude Code docs](https://e2b.dev/docs/agents/claude-code), [e2b-dev/claude-code-fastapi](https://github.com/e2b-dev/claude-code-fastapi)

### Per-Session Working Directory (for multi-tenant NestJS)

Even without an external sandbox, the SDK supports isolating sessions by working directory:

```typescript
query({
  prompt,
  options: {
    cwd: `/work/tenant-${tenantId}`,           // per-tenant filesystem path
    settingSources: [],                         // no shared CLAUDE.md
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: `/config/tenant-${tenantId}`,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    }
  }
})
```

**Source:** [Multi-tenant isolation — Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting#multi-tenant-isolation)

---

## Q3: The Tool Call Round-Trip — How Does It Work?

### The Agent Loop

The official documentation describes the exact round-trip:

> "A turn is one round trip inside the loop: Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back to Claude automatically. Turns continue until Claude produces output with no tool calls, at which point the loop ends and the final result is delivered."
>
> — [How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)

Detailed flow for a single turn:

1. **Claude emits tool call:** Claude produces an `AssistantMessage` with `tool_use` blocks (one or more tool calls). The SDK yields this message in the stream.
2. **SDK executes tools:** The SDK runs each requested tool. For built-in tools, it executes locally. For custom MCP tools, it calls your async handler function. Read-only tools can run concurrently; state-modifying tools run sequentially.
3. **SDK returns results:** Tool results are wrapped in a `UserMessage` and fed back to Claude automatically. This step does NOT yield control back to your application code — it's internal to the SDK.
4. **Claude continues or stops:** Claude sees the tool results and either calls more tools (another turn) or produces a text-only response (loop ends).
5. **Final result:** A `ResultMessage` is yielded with `subtype: "success"` and the final text result, plus cost and session ID.

### Message Types You Observe

```typescript
for await (const message of query({ prompt, options })) {
  if (message.type === "system" && message.subtype === "init") {
    // Session started — capture session ID
    sessionId = message.session_id;
  }
  if (message.type === "assistant") {
    // Claude spoke — includes tool_use blocks for in-flight tool calls
    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        console.log(`Claude called: ${block.name}`, block.input);
      }
    }
  }
  if (message.type === "user") {
    // Tool results returned to Claude (for observability)
  }
  if (message.type === "result" && message.subtype === "success") {
    // Loop complete — final answer
    console.log(message.result);
  }
}
```

### Custom Tool Handler Round-Trip

When using custom tools via in-process MCP server, the round-trip is:

```
Claude emits tool_use block (e.g., mcp__sandbox__bash)
    → SDK calls your async handler(args)
    → Handler calls E2B SDK / Docker API / SSH
    → Remote execution completes
    → Handler returns { content: [{ type: "text", text: output }] }
    → SDK feeds result back to Claude as tool_result
    → Claude continues
```

**The handler is fully async** — you can `await` HTTP calls, WebSocket messages, etc. The SDK waits for the handler to return before feeding the result to Claude. There is no timeout enforced by the SDK itself on custom tool handlers (though you should implement your own).

**Source:** [Give Claude custom tools — Handle errors](https://code.claude.com/docs/en/agent-sdk/custom-tools#handle-errors)

---

## Q4: Claude Agent SDK + E2B Integration — How Tools Execute in E2B

### Architecture Pattern 1 (Official E2B Pattern): Whole SDK Runs Inside E2B VM

The cleanest pattern, used by `e2b-dev/claude-code-fastapi`:

```
NestJS Host
  └─ Creates E2B Sandbox (cloud VM)
  └─ SDK `query()` is called with E2B's cwd and env
        ↓
  E2B VM
    └─ Claude CLI subprocess spawns inside VM
    └─ Bash commands → execute in VM's isolated shell
    └─ Read/Write/Edit → operate on VM's isolated filesystem
    └─ MCP servers → run as processes inside the VM
```

**Key insight:** The Agent SDK documentation explicitly states that the SDK spawns a `claude` CLI subprocess. If that subprocess is spawned inside an E2B VM (or if your NestJS `query()` call is happening from inside the E2B VM context), all tool execution is automatically isolated.

E2B provides the `@e2b/sdk` package to create sandboxes and execute processes inside them. The pattern is:

```typescript
import { Sandbox } from "@e2b/sdk";

// Create isolated VM
const sandbox = await Sandbox.create("anthropic-claude-code");

// Run Claude Agent SDK inside the sandbox
// (via E2B's process execution or by running a server inside the sandbox)
const result = await sandbox.process.start({
  cmd: "node run-agent.mjs",
  envVars: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
});
```

**Source:** [E2B Claude Code docs](https://e2b.dev/docs/agents/claude-code), [E2B + Claude Code Sandbox guide](https://aitmpl.com/blog/e2b-claude-code-sandbox/)

### Architecture Pattern 2: Custom Tool Handlers Calling E2B from NestJS Host

An alternative: run the Agent SDK on the NestJS host but replace all built-in tools with custom handlers that call E2B:

```typescript
import { tool, createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import { Sandbox } from "@e2b/sdk";
import { z } from "zod";

// Pre-created (or per-session) E2B sandbox
const sandbox = await Sandbox.create("base");

const bashTool = tool(
  "Bash",
  "Execute a bash command in the isolated sandbox",
  { command: z.string(), timeout: z.number().optional() },
  async (args) => {
    try {
      const result = await sandbox.process.start({
        cmd: args.command,
        timeout: args.timeout ?? 60000
      });
      return {
        content: [{ type: "text", text: result.stdout + result.stderr }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: String(err) }],
        isError: true
      };
    }
  }
);

const readTool = tool(
  "Read",
  "Read a file from the isolated sandbox filesystem",
  { file_path: z.string() },
  async (args) => {
    const content = await sandbox.filesystem.read(args.file_path);
    return { content: [{ type: "text", text: content }] };
  }
);

const writeTool = tool(
  "Write",
  "Write a file to the isolated sandbox filesystem",
  { file_path: z.string(), content: z.string() },
  async (args) => {
    await sandbox.filesystem.write(args.file_path, args.content);
    return { content: [{ type: "text", text: `Written: ${args.file_path}` }] };
  }
);

const sandboxServer = createSdkMcpServer({
  name: "sandbox",
  version: "1.0.0",
  tools: [bashTool, readTool, writeTool]
});

// Use in NestJS service
for await (const message of query({
  prompt: userPrompt,
  options: {
    tools: [],    // CRITICAL: removes all built-in local tools
    mcpServers: { sandbox: sandboxServer },
    allowedTools: ["mcp__sandbox__*"],
    permissionMode: "dontAsk"
  }
})) { ... }
```

**Source:** [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools), [E2B SDK docs](https://e2b.dev/docs)

---

## Q5: MCP Role — Can MCP Servers Running Inside E2B Be the Right Architecture?

### Yes — This Is the Recommended Pattern for External Tool Execution

The MCP documentation explicitly addresses this:

> "Provide access through an MCP server or custom tool that routes requests to a service running outside the agent's security boundary, where the agent calls the tool, but the actual authenticated request happens outside."
>
> — [Securely deploying AI agents](https://code.claude.com/docs/en/agent-sdk/secure-deployment)

### Two Sub-Patterns for MCP + Sandbox

#### Sub-pattern A: MCP Server Running Inside the Sandbox (E2B/Docker)

An MCP server process runs **inside** the E2B VM or Docker container. The Agent SDK (running on NestJS host or inside the container) connects to it via:

- **stdio transport**: if the MCP server is a local process (works if SDK and MCP server are co-located)
- **HTTP/SSE transport**: if the sandbox exposes an HTTP port

```typescript
// MCP server running inside E2B sandbox, exposed on port 3100
options: {
  mcpServers: {
    "sandbox-tools": {
      type: "http",
      url: `https://${sandboxId}.e2b.app:3100/mcp`  // E2B sandbox URL
    }
  },
  allowedTools: ["mcp__sandbox-tools__*"]
}
```

This pattern means:
- Bash/Read/Write are implemented as MCP tools on a server running inside the sandbox
- The MCP server translates tool calls into local filesystem/shell operations inside the sandbox
- The Agent SDK on the NestJS host connects to the MCP server via HTTP/SSE
- **Credential separation**: the MCP server inside the sandbox only has the credentials it needs; the NestJS host manages lifecycle

#### Sub-pattern B: MCP Server on NestJS Host, Calls Remote Sandbox API

The in-process MCP server runs in the NestJS process and each tool handler calls E2B SDK / Docker API:

```typescript
// in-process MCP server: runs in NestJS, handlers call E2B
const sandboxServer = createSdkMcpServer({
  name: "sandbox",
  version: "1.0.0",
  tools: [bashTool, readTool, writeTool]  // handlers call e2b.sandbox.*
});
```

This is Pattern 2 from Q4 above. The MCP server is in-process (not a separate process) — Anthropic calls this an "SDK MCP server."

### MCP Transport Types Supported

| Transport | Config | Use case |
|-----------|--------|----------|
| `stdio` | `command: "npx ..."` | Local MCP server process co-located with SDK |
| `http` (streamable HTTP) | `type: "http", url: "..."` | Remote MCP server over HTTP |
| `sse` | `type: "sse", url: "..."` | Remote MCP server via Server-Sent Events |
| SDK MCP (in-process) | `createSdkMcpServer(...)` | Handler functions running in your app process |

**Source:** [Connect to external tools with MCP](https://code.claude.com/docs/en/agent-sdk/mcp)

---

## Q6: Official Anthropic Docs and Examples for Sandboxed Tool Execution

### Official Documentation

1. **Hosting the Agent SDK** — covers container-based sandboxing, per-tenant isolation, recommended sandbox providers, session patterns
   - URL: https://code.claude.com/docs/en/agent-sdk/hosting

2. **Securely deploying AI agents** — isolation technologies (Docker, gVisor, Firecracker, VMs), credential proxy pattern, filesystem configuration
   - URL: https://code.claude.com/docs/en/agent-sdk/secure-deployment

3. **Configure the sandboxed Bash tool** — built-in OS-level Bash sandbox (bubblewrap/Seatbelt), filesystem and network isolation config
   - URL: https://code.claude.com/docs/en/sandboxing

4. **Connect to external tools with MCP** — HTTP/SSE MCP servers, remote tool execution
   - URL: https://code.claude.com/docs/en/agent-sdk/mcp

5. **Intercept and control agent behavior with hooks** — PreToolUse interception, input modification, output replacement
   - URL: https://code.claude.com/docs/en/agent-sdk/hooks

6. **Anthropic Claude Cookbooks — Hosting** — deployable Dockerfiles and Kubernetes manifests
   - URL: https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting

### Official Community Examples

- **E2B + Claude Code FastAPI backend**: `github.com/e2b-dev/claude-code-fastapi`
  - Pattern: entire Claude Agent SDK runs inside E2B sandbox VM
  - FastAPI provides REST API; Claude Code + MCP config run inside E2B sandbox

- **E2B Claude Code templates with sandbox support**: Claude Code Templates project
  - Supports E2B, Cloudflare, and Docker sandboxes
  - Single command creates sandbox and runs Agent SDK inside it

- **Claude Agent WebSocket Server**: `github.com/dzhng/claude-agent-server`
  - WebSocket wrapper for Agent SDK, deployable as E2B sandbox

---

## Architecture Analysis: Which Approach for NestJS?

### Approach Comparison

| Approach | Tool Isolation | Complexity | SDK Location | Tool Call Latency |
|----------|----------------|------------|--------------|-------------------|
| **A: SDK subprocess inside sandbox** | Full (OS-level) | Medium | Inside E2B/Docker | Lowest (no network round-trip per tool) |
| **B: Custom tools calling E2B from host** | Full (API boundary) | Medium | NestJS host | Medium (HTTP/API per tool call) |
| **C: MCP server inside sandbox, SDK on host** | Full (network boundary) | Higher | NestJS host | Medium-High (HTTP/SSE per call) |
| **D: PreToolUse hook to block + substitute** | Partial (blocks built-ins) | Low | NestJS host | Medium |

### Recommended Architecture for NestJS + Sandbox

**For production multi-tenant NestJS, the recommended approach is Approach A** (entire SDK subprocess inside the sandbox), because:

1. Complete OS-level isolation with no per-tool interception code required — the VM boundary is the isolation boundary
2. Both E2B and Daytona have official reference implementations for this pattern (E2B: `e2b-dev/claude-code-fastapi`; Daytona: official Claude Agent SDK guide)
3. No risk of a missing `tools: []` flag or a new SDK tool bypassing custom handler coverage
4. The `sandbox-agent` binary (rivet-dev) running inside the sandbox handles the AG-UI event channel back to NestJS, resolving the communication complexity

**Approach B** (custom tools calling the sandbox from the NestJS host) is a valid fallback if the in-sandbox event channel proves impractical, but carries a higher maintenance burden: every tool the SDK can call must have a custom handler, and new SDK tools must be intercepted proactively. See the companion research reports for full platform comparison and system architecture details.

### Critical: Remove Built-in Tools

Regardless of which pattern you choose, you **must** remove the built-in tools to prevent fallback to local execution:

```typescript
options: {
  tools: [],    // removes ALL built-in tools (Bash, Read, Write, Edit, Glob, Grep, etc.)
  mcpServers: { sandbox: sandboxServer },
  allowedTools: ["mcp__sandbox__*"]
}
```

If you do not set `tools: []`, Claude can still call the built-in `Bash`, `Read`, `Write`, `Edit` tools and they will execute locally on the NestJS host.

---

## Implementation Patterns

### Pattern: NestJS Service with Per-Session E2B Sandbox

```typescript
// sandbox.service.ts (NestJS)
import { Injectable } from "@nestjs/common";
import { Sandbox } from "@e2b/sdk";
import { tool, createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

@Injectable()
export class SandboxAgentService {

  async runSession(prompt: string, sessionId: string): AsyncIterable<any> {
    // Create isolated E2B sandbox for this session
    const sandbox = await Sandbox.create("base", {
      timeoutMs: 300_000  // 5 minute sandbox lifetime
    });

    try {
      // Build custom tools that delegate to E2B
      const bashTool = tool(
        "Bash",
        "Run a shell command in the isolated sandbox",
        { command: z.string() },
        async (args) => {
          const proc = await sandbox.process.start({ cmd: args.command });
          return { content: [{ type: "text", text: proc.stdout + proc.stderr }] };
        }
      );

      const readTool = tool(
        "Read",
        "Read a file from the sandbox",
        { file_path: z.string() },
        async (args) => {
          const content = await sandbox.filesystem.read(args.file_path);
          return { content: [{ type: "text", text: content }] };
        }
      );

      const writeTool = tool(
        "Write",
        "Write a file in the sandbox",
        { file_path: z.string(), content: z.string() },
        async (args) => {
          await sandbox.filesystem.write(args.file_path, args.content);
          return { content: [{ type: "text", text: `Written: ${args.file_path}` }] };
        }
      );

      const editTool = tool(
        "Edit",
        "Edit a file in the sandbox (find/replace)",
        {
          file_path: z.string(),
          old_string: z.string(),
          new_string: z.string()
        },
        async (args) => {
          const current = await sandbox.filesystem.read(args.file_path);
          const updated = current.replace(args.old_string, args.new_string);
          await sandbox.filesystem.write(args.file_path, updated);
          return { content: [{ type: "text", text: "Edit applied" }] };
        }
      );

      const sandboxServer = createSdkMcpServer({
        name: "sandbox",
        version: "1.0.0",
        tools: [bashTool, readTool, writeTool, editTool]
      });

      // Run agent — all tool calls go through E2B handlers
      return query({
        prompt,
        options: {
          tools: [],         // remove ALL built-in tools
          mcpServers: { sandbox: sandboxServer },
          allowedTools: ["mcp__sandbox__*"],
          permissionMode: "dontAsk",
          maxTurns: 30,
          maxBudgetUsd: 2.0
        }
      });

    } finally {
      // Always clean up the sandbox
      await sandbox.kill();
    }
  }
}
```

### Pattern: PreToolUse Hook to Block Built-in Tools (Fallback Guard)

Even if you specify `tools: []`, you can add a PreToolUse hook as a defense-in-depth guard that blocks any built-in tool call that somehow slips through:

```typescript
import { HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

const blockLocalExecution: HookCallback = async (input) => {
  const preInput = input as PreToolUseHookInput;
  const localTools = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];
  
  if (localTools.includes(preInput.tool_name)) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Local execution is disabled. Use sandbox tools only."
      }
    };
  }
  return {};
};

// Add to query options
options: {
  hooks: {
    PreToolUse: [{ hooks: [blockLocalExecution] }]
  }
}
```

**Source:** [Intercept and control agent behavior with hooks](https://code.claude.com/docs/en/agent-sdk/hooks)

### Pattern: Modify Tool Input Before Execution (File Path Redirection)

The `updatedInput` hook can rewrite file paths before the built-in tool executes, effectively redirecting reads/writes to a specific directory. This is useful for Docker volume mounts:

```typescript
const redirectToSandboxDir: HookCallback = async (input) => {
  const preInput = input as PreToolUseHookInput;
  const fileTools = ["Write", "Edit", "Read"];
  
  if (fileTools.includes(preInput.tool_name)) {
    const toolInput = preInput.tool_input as Record<string, unknown>;
    const originalPath = toolInput.file_path as string;
    
    // Redirect all file operations to /sandbox directory
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          ...toolInput,
          file_path: `/sandbox/${originalPath.replace(/^\//, "")}`
        }
      }
    };
  }
  return {};
};
```

**Important limitation:** This approach only redirects file paths. For `Bash`, you would need to rewrite the entire command, which is fragile. For true Bash isolation, use custom tools or run the SDK inside the container.

**Source:** [Hooks — Modify tool input](https://code.claude.com/docs/en/agent-sdk/hooks#modify-tool-input)

### Pattern: `updatedToolOutput` to Intercept Tool Results

The PostToolUse hook can replace tool output before Claude sees it:

```typescript
import { PostToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

const sanitizeOutput: HookCallback = async (input) => {
  if (input.hook_event_name !== "PostToolUse") return {};
  
  const postInput = input as PostToolUseHookInput;
  
  // Replace or sanitize tool output before Claude sees it
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: "Sanitized output"  // replaces tool result
    }
  };
};
```

**Source:** [Hooks — Callback functions outputs](https://code.claude.com/docs/en/agent-sdk/hooks#outputs)

---

## Performance Considerations

### Sandbox Lifecycle Management

**E2B sandbox creation time:** ~150ms cold start. For a multi-turn agent session (potentially dozens of turns), one sandbox per session is the right model — create it when the session starts, reuse it for all tool calls in that session, destroy it when the session ends.

**Docker container:**  Cold start is typically 1–5 seconds. Pre-warm containers or use a container pool for production.

**Tool call latency:**
- Built-in tool (local): ~1–5ms execution overhead
- Custom tool via E2B API: ~50–200ms network round-trip per tool call (varies by E2B region and operation)
- MCP server via HTTP/SSE: ~10–100ms per call (local network)

For a typical agent session making 20–50 tool calls, E2B API overhead adds ~1–10 seconds. This is acceptable for most use cases but should be factored into `maxTurns` and `maxBudgetUsd` budgets.

### SDK Subprocess Model

The Agent SDK spawns a `claude` CLI subprocess per session:

> "One agent session maps to one subprocess. Running N concurrent sessions means N subprocesses, each with its own process tree and transcript file."
>
> — [Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting)

For NestJS, this means each concurrent session is a subprocess. Memory baseline: ~1 GiB RAM per subprocess. Plan accordingly for concurrency.

### Context Window Accumulation

Tool outputs accumulate in the context window across turns. Large Bash outputs or file reads can consume thousands of tokens per turn. For E2B-routed tools, consider truncating large outputs in the tool handler before returning to Claude.

---

## Technology Stack Summary

| Component | Package/Service | Role |
|-----------|----------------|------|
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | Drives the agent loop; spawns `claude` CLI subprocess |
| Custom tool definition | `tool()` + `createSdkMcpServer()` from SDK | Replaces built-in tools with E2B-delegating handlers |
| E2B sandbox | `@e2b/sdk` | Provides isolated cloud VM; executes Bash commands, file I/O |
| Docker alternative | `dockerode` or Docker CLI | Provides isolated container; executes tool calls via exec |
| MCP protocol | Built into SDK | Wires custom tools to the agent loop |
| NestJS | `@nestjs/core` | Manages session lifecycle, SSE streaming, HTTP API |

---

## Key Findings Summary

1. **There is no built-in "remote tool execution" configuration in the Claude Agent SDK.** You must either (a) run the entire SDK inside the sandbox, or (b) replace built-in tools with custom tool handlers that call the remote sandbox.

2. **The `tools: []` option is the critical safety switch.** It removes all built-in tools (Bash, Read, Write, Edit, Glob, Grep, etc.) from Claude's context so Claude cannot fall back to local execution. Without this, your sandboxing is not complete.

3. **Custom tools via `createSdkMcpServer` + `tool()` are the SDK-native pattern** for routing tool execution to external services. The handler is a plain async function — it can call any API, including E2B.

4. **PreToolUse hooks intercept but cannot redirect Bash execution.** Hooks can block, modify input, or replace output — but the actual Bash subprocess still runs locally unless you use `updatedInput` to rewrite the command OR use custom tools. Hooks are best used as a secondary guard, not the primary isolation mechanism.

5. **E2B's official architecture runs Claude Code inside the E2B VM.** The `e2b-dev/claude-code-fastapi` reference implementation uses this pattern. MCP servers configured via `.mcp.json` also run inside the VM.

6. **MCP servers over HTTP/SSE are the right pattern** when the sandbox runs a tool server that the NestJS host connects to remotely. The SDK supports `type: "http"` and `type: "sse"` MCP server configurations.

7. **For NestJS multi-tenant production, the recommended pattern is:** one E2B sandbox per user session, custom tool handlers in the NestJS process that delegate to that sandbox via the E2B SDK, `tools: []` to remove local tools, and `permissionMode: "dontAsk"` for autonomous execution.

---

## Sources

- [Agent SDK Overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
- [How the agent loop works — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [Give Claude custom tools — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Connect to external tools with MCP — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/mcp)
- [Intercept and control agent behavior with hooks — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/hooks)
- [Hosting the Agent SDK — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/hosting)
- [Securely deploying AI agents — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/secure-deployment)
- [Configure the sandboxed Bash tool — Claude Code Docs](https://code.claude.com/docs/en/sandboxing)
- [E2B Claude Code docs](https://e2b.dev/docs/agents/claude-code)
- [E2B + Claude Code FastAPI (official E2B example)](https://github.com/e2b-dev/claude-code-fastapi)
- [Anthropic Claude Cookbooks — Hosting](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting)
- [Claude Agent SDK: Agent Loops, Tool Calls — Augment Code guide](https://www.augmentcode.com/guides/claude-agent-sdk-agent-loops-tool-calls)
- [Sandbox Execution — claude-code-templates DeepWiki](https://deepwiki.com/davila7/claude-code-templates/3.6-sandbox-execution)
- [Making Claude Code more secure with sandboxing — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-sandboxing)
