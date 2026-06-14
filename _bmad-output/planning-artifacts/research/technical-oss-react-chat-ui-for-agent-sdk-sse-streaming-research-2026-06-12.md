---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'OSS React chat UI for Claude Agent SDK SSE streaming backend'
research_goals: 'Find the best existing OSS React chat UI library that can be dropped into Next.js 15 with Tailwind v4, supports streaming text rendering via SSE, can display tool call/result messages inline, supports custom event types (artifact-committed pill), is headless or easily Tailwind-stylable, and integrates with a custom Node.js backend (not locked to OpenAI/ChatGPT)'
user_name: 'Marius'
date: '2026-06-12'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-12
**Author:** Marius
**Research Type:** technical

---

## Research Overview

This research answers a precise architectural question: which OSS React chat UI library should be used for a Next.js 15 frontend communicating with a Node.js backend running the Claude Agent SDK — and how should it be wired?

The answer is **`assistant-ui`** with the **`assistant-stream` data-stream protocol** (Approach B). The library is Radix-style headless React primitives, Tailwind v4 native, with first-class streaming and tool-call rendering. The `assistant-stream` package gives the backend a stable wire format that decouples the frontend from Claude Agent SDK internals — enabling a future migration to Managed Agents without touching frontend code.

The research spans four technical domains: library landscape and selection (4 candidates evaluated), the Approach B wiring pattern (backend mapper → data-stream protocol → `useDataStreamRuntime`), component architecture and tool rendering patterns, and a concrete 3-sprint implementation roadmap. All findings are grounded in current official documentation and verified web sources (June 2026).

See the **Research Synthesis** section for the full executive summary and decision map.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** OSS React chat UI for Claude Agent SDK SSE streaming backend
**Research Goals:** Find the best existing OSS React chat UI library that can be dropped into Next.js 15 with Tailwind v4, supports streaming text rendering via SSE, can display tool call/result messages inline, supports custom event types (artifact-committed pill), is headless or easily Tailwind-stylable, and integrates with a custom Node.js backend (not locked to OpenAI/ChatGPT)

**Technical Research Scope:**

- Architecture Analysis — how OSS chat UI libraries are structured; headless vs pre-styled; adapter patterns for custom SSE backends
- Implementation Approaches — integrating the chosen library with the SSE endpoint, rendering streamed tokens, displaying tool call/result pairs, injecting the artifact pill as a custom message type
- Technology Stack — candidate libraries: Vercel AI SDK (`useChat`), `assistant-ui`, `@nlux/react`, CopilotKit
- Integration Patterns — how each library hooks up to a non-OpenAI backend, how message types map to the Claude Agent SDK's typed stream
- Performance Considerations — token-by-token rendering, large tool result payloads, long conversation history

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-12

---

## Technology Stack Analysis

### Candidate Library Overview

Four OSS libraries cover the realistic solution space for a React AI chat UI wired to a custom SSE backend in 2026. All are MIT-licensed and actively maintained.

| Library | Stars | Type | Tailwind-first | Custom backend | Tool call rendering |
|---|---|---|---|---|---|
| **assistant-ui** | ~7.9k | Headless React primitives | ✅ (Radix-style) | ✅ ExternalStoreRuntime | ✅ First-class |
| **Vercel AI SDK** (`ai`) | ~35k | Hooks only (no UI) | — hooks only | ✅ (protocol contract) | ⚠️ Server+client duplication |
| **CopilotKit** | ~18k | Full framework + UI | ⚠️ needs adapter | ✅ AG-UI protocol | ✅ First-class |
| **NLUX** | ~4k | Pre-styled components | ⚠️ theming API | ✅ ChatAdapter interface | ⚠️ Limited |

_Source: [I Evaluated Every AI Chat UI Library in 2026 — DEV Community](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10), [The Overview of UI Libraries for AI Chat Interfaces in 2026 — Medium](https://alexander-lukashov.medium.com/the-overview-of-ui-libraries-for-ai-chat-interfaces-in-2026-146a1492114a)_

---

### assistant-ui

**What it is:** A Y Combinator (W25)-backed, TypeScript/React library for AI chat UIs. It follows the Radix headless pattern — unstyled primitives (`Thread`, `Composer`, `Message`, `MessagePrimitive.Content`) that you compose and style yourself. State management, streaming, message branching, attachment handling, and auto-scroll are built in. You bring the CSS.

**Custom backend integration — the key mechanism: `useExternalStoreRuntime`**

`ExternalStoreRuntime` is used when the application owns the message state and provides callbacks for each interaction. This is the correct adapter for our architecture: the frontend consumes the SSE stream directly, populates a message array, and passes it to the runtime. The runtime turns capabilities on or off based on which callbacks are provided (e.g., `setMessages` enables branching; `onEdit` enables editing).

```tsx
import { useExternalStoreRuntime, ThreadMessageLike } from "@assistant-ui/react";

// Messages come from your own state, populated by the SSE consumer
const [messages, setMessages] = useState<ThreadMessageLike[]>([]);

const runtime = useExternalStoreRuntime({
  messages,
  setMessages,
  onNew: async (msg) => {
    // send msg.content to your Node.js backend, consume SSE stream,
    // append assistant tokens into the messages array
  },
});
```

**Alternative: `useDataStreamRuntime`**

If the Node.js backend is made to emit Vercel AI SDK v5's data stream format (`x-vercel-ai-ui-message-stream: v1`), the simpler `useDataStreamRuntime({ api: "/api/chat", protocol: "data-stream" })` can be used instead. This avoids writing the SSE consumer on the frontend — but requires the backend to map Claude Agent SDK messages to the AI SDK data stream format.

**Tool call rendering**

First-class. Each tool gets a `render` callback that receives `{ args, result, status }` and returns a React node. The runtime automatically matches tool results to their call by `toolCallId`. For a one-line status, `renderText` with `running` / `complete` values is available.

```tsx
makeAssistantToolUI({
  toolName: "Bash",
  render: ({ args, result, status }) => (
    <div className="font-mono text-xs rounded bg-muted p-2">
      <code>{args.command}</code>
      {status === "complete" && <pre>{result?.output}</pre>}
    </div>
  ),
})
```

**Generative UI / custom event types (artifact pill)**

`MessagePrimitive.GenerativeUI` renders UI described by the agent as a JSON spec at runtime. The agent emits a `generative-ui` message part; the runtime resolves component names against a consumer-provided allowlist. For our `artifact_committed` SSE event (a non-message event from the `PostToolUse` hook), the pattern is: intercept the event in the SSE consumer, inject it as a synthetic tool-result message with a registered custom renderer.

**Tailwind v4 support**

Explicit support confirmed. assistant-ui ships `tw-shimmer` — a Tailwind v4 plugin for shimmer/skeleton animations. Their own primitives have no default styles, so Tailwind classes are applied directly. No CSS-in-JS conflicts.

**Market position (June 2026):** 50k+ monthly npm downloads; actively maintained; responsive maintainers noted in community comparisons.

_Source: [assistant-ui — React Chat UI for AI Apps](https://www.assistant-ui.com/), [ExternalStoreRuntime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store), [Generative UI — assistant-ui](https://www.assistant-ui.com/docs/tools/generative-ui), [Launch Week: assistant-ui goes multi-platform](https://www.assistant-ui.com/blog/2026-03-launch-week), [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui)_

---

### Vercel AI SDK (`ai` / `@ai-sdk/*`)

**What it is:** The dominant TypeScript streaming toolkit (20M+ monthly downloads), providing `useChat` and `useCompletion` hooks. **Critically: it is hooks only — no UI components whatsoever.** You still build every message bubble, tool-call card, and scroll behaviour yourself.

**v5 (2026) changes:** AI SDK v5 moved to standard SSE as its streaming protocol (replacing the previous custom protocol). The `useChat` API adopted a transport-based architecture. On the backend, `toUIMessageStreamResponse()` returns a standard Web `Response` with the `x-vercel-ai-ui-message-stream: v1` header.

**Custom Node.js backend support**

Possible, but with a protocol contract: the backend must emit the AI SDK data stream format over SSE. This means mapping Claude Agent SDK typed messages (`AssistantMessage`, `ToolResultMessage`, `ResultMessage`, etc.) to the AI SDK's stream part types on the backend. Community discussions confirm this is feasible but requires writing a mapping layer.

**Tool call rendering**

The SDK docs note that tools are effectively split across environments: defined on the server (where the LLM executes them) and reimplemented on the client (so the UI can display them). This duplication creates drift risk between server logic and client display. No automatic matching of tool results to calls — that logic is the developer's responsibility.

**Verdict for this use case:** `useChat` is excellent for the streaming state hook, but since we'd need all the UI primitives anyway and the backend would need a format mapping layer, assistant-ui is a better foundation. The two are complementary: assistant-ui integrates tightly with the Vercel AI SDK if the backend adopts the data stream format.

_Source: [AI SDK UI: Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol), [AI SDK 5 — Vercel blog](https://vercel.com/blog/ai-sdk-5), [AI SDK UI: useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat), [Vercel AI SDK: How do I make this work with a separate Node.js backend — Vercel Community](https://community.vercel.com/t/vercel-ai-sdk-how-do-i-make-this-work-with-a-separate-node-js-backend/3892)_

---

### CopilotKit

**What it is:** A full agentic application framework — not just chat UI. It includes `<CopilotChat />` / `<CopilotPopup />` pre-styled components, `useCopilotChat` headless hook, app-state reading, and the **AG-UI protocol** (an open SSE-based event standard for agent ↔ UI communication, adopted by Google, Microsoft, Amazon, LangChain, Mastra, and others in 2026).

**AG-UI protocol:** A single JSON event sequence over standard HTTP/SSE. Events cover messages, tool calls, state patches, and lifecycle signals. CopilotKit's frontend runtime speaks AG-UI natively; the backend must emit AG-UI events.

**Custom backend integration**

CopilotKit ships a `CopilotRuntime` for Node.js (Express, Next.js, Hono). Factory mode lets you bring your own AI SDK or custom LLM backend. However, connecting our Claude Agent SDK backend means adapting its typed message stream into AG-UI events — a non-trivial mapping layer.

**Headless option:** `useCopilotChat` exposes raw state (messages, input, loading) and methods. Full UI control from scratch is possible.

**Verdict for this use case:** CopilotKit's AG-UI protocol is architecturally interesting and has strong industry momentum. However, it is significantly heavier than needed — the BMAD platform doesn't need app-state syncing, generative form filling, or multi-agent coordination. The AG-UI backend mapping layer adds complexity that isn't justified at MVP. Worth revisiting if the platform grows into broader agentic workflows.

_Source: [Introducing AG-UI — CopilotKit blog](https://www.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users), [How CopilotKit Is Redefining the Agentic AI Stack in 2026 — MarkTechPost](https://www.marktechpost.com/2026/05/21/how-copilotkit-is-redefining-the-agentic-ai-stack-in-2026/), [GitHub — CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit)_

---

### NLUX

**What it is:** An open-source JavaScript/React library for building conversational UIs. Provides `AiChat` component and `useChatAdapter` hook. Custom adapters implement a `ChatAdapter` interface with `stream` or `batch` modes.

**Custom backend:** Fully supported via the `ChatAdapter` interface. No protocol contract — the adapter owns the fetch and emits tokens via a `PromiseOrStream` return value.

**Styling:** Customizable via a theming API (`conversationOptions`, `displayOptions`) but not headless. Tailwind classes cannot be applied directly to internal elements. The styling model is not a natural fit for Tailwind v4.

**Verdict:** Less mature than assistant-ui for our needs. The theming API is not Tailwind-native, and tool call rendering support is limited compared to assistant-ui. Good option for a quick prototype but not the right long-term choice given the Tailwind v4 stack.

_Source: [NLUX documentation — nlkit.com](https://docs.nlkit.com/nlux), [GitHub — nlkitai/nlux](https://github.com/nlkitai/nlux)_

---

### Technology Adoption Context (2026)

The 2026 React AI chat landscape has consolidated around two tiers:

- **Hooks layer** (Vercel AI SDK `useChat`) — model-agnostic streaming state management, 20M+ monthly downloads, the de facto standard for streaming hooks regardless of UI choice
- **UI layer** (assistant-ui) — headless React primitives for chat UX, increasingly the standard for teams that want Radix-style composability without building from scratch

The protocol layer is in flux: AG-UI (CopilotKit) is gaining adoption at the infrastructure level but is not yet the default for greenfield React apps. assistant-ui bridges both worlds — it supports the Vercel AI SDK data stream protocol natively and is building AG-UI adapters.

_Source: [The Complete Guide to Generative UI Frameworks in 2026 — Medium](https://medium.com/@akshaychame2/the-complete-guide-to-generative-ui-frameworks-in-2026-fde71c4fa8cc), [A2UI vs AG-UI vs Vercel AI SDK: The 2026 Battle — QubitTool](https://qubittool.com/blog/a2ui-vs-ag-ui-vercel-agent-ui-comparison)_

---

## Integration Patterns Analysis

### The Two Wiring Approaches

There are two clean ways to connect the Claude Agent SDK SSE stream to assistant-ui. The choice is a backend trade-off: keep the backend SSE format as-is (Approach A) or add a thin mapping layer on the backend that assistant-ui consumes natively (Approach B).

#### Approach A — `useExternalStoreRuntime` (recommended for this architecture)

The frontend owns the SSE consumer. It receives raw Claude Agent SDK messages, maps them into a `ThreadMessageLike[]` array, and passes that array to the runtime. No backend changes required.

```tsx
// The SSE consumer + runtime wiring (simplified)
import {
  useExternalStoreRuntime,
  useExternalMessageConverter,
  type ThreadMessageLike,
} from "@assistant-ui/react";

// 1. Your own message state (populated by the SSE consumer)
const [agentMessages, setAgentMessages] = useState<AgentSdkMessage[]>([]);
const [sessionId, setSessionId] = useState<string | undefined>();

// 2. Convert Agent SDK message types → ThreadMessageLike
const messages = useExternalMessageConverter<AgentSdkMessage>({
  callback: (message): ThreadMessageLike | ThreadMessageLike[] => {
    if (message.type === "assistant") {
      return {
        id: message.id,
        role: "assistant",
        content: message.content.map((part) =>
          part.type === "text"
            ? { type: "text", text: part.text }
            : {
                type: "tool-call",
                toolCallId: part.id,
                toolName: part.name,
                args: part.input,
              }
        ),
      };
    }
    if (message.type === "tool") {
      return {
        id: message.tool_use_id,
        role: "tool",
        content: [{ type: "tool-result", toolCallId: message.tool_use_id, result: message.content }],
      };
    }
    return []; // skip SystemMessage, ResultMessage (handle session_id separately)
  },
  messages: agentMessages,
});

// 3. Runtime
const runtime = useExternalStoreRuntime({
  messages,
  onNew: async (msg) => {
    const response = await fetch(`${AGENT_BACKEND}/sessions/${sessionId}/stream`, {
      method: "POST",
      body: JSON.stringify({ prompt: msg.content[0].text }),
      headers: { "Content-Type": "application/json" },
    });
    // consume the SSE stream and append to agentMessages
    await consumeSseStream(response, (evt) => {
      if (evt.type === "system" && evt.subtype === "init") setSessionId(evt.session_id);
      setAgentMessages((prev) => [...prev, evt]);
    });
  },
});
```

**Why this is the right approach for the BMAD platform:**
- The Claude Agent SDK emits a well-typed stream. Mapping it client-side is straightforward.
- No changes to the backend SSE format.
- Session ID capture is natural — handled in the `onNew` callback before any assistant messages arrive.
- The `useExternalMessageConverter` handles edge cases like out-of-order tool results and partial stream state.

_Source: [ExternalStoreRuntime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store), [Message Format and Conversion — DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/3.3-thread-and-message-management)_

---

#### Approach B — `assistant-stream` backend package + `useDataStreamRuntime`

The backend maps Claude Agent SDK messages into the assistant-ui data stream protocol using the `assistant-stream` npm package. The frontend uses the simpler `useDataStreamRuntime` hook.

```typescript
// Backend: map SDK messages to assistant-ui data stream protocol
import { AssistantStream } from "assistant-stream";

const stream = new AssistantStream();
for await (const message of sdkQuery({ prompt, options })) {
  if (message.type === "assistant") {
    for (const part of message.content) {
      if (part.type === "text") stream.appendText(part.text);
      else stream.addToolCallPart({ toolCallId: part.id, toolName: part.name, args: part.input });
    }
  }
  if (message.type === "tool") {
    stream.addToolResult({ toolCallId: message.tool_use_id, result: message.content });
  }
}
stream.close();
return createAssistantStreamResponse(stream);
```

```tsx
// Frontend: dead-simple runtime
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
const runtime = useDataStreamRuntime({ api: "/api/chat" });
```

**Trade-off:** Cleaner frontend code but adds a backend mapping obligation. Useful if you want to standardise on the assistant-ui protocol for multi-tenant isolation (the backend controls what the UI sees). The `assistant-stream` package (latest: 0.3.19, June 2026) provides all the helpers needed.

_Source: [Streaming Infrastructure (assistant-stream) — DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/4-streaming-infrastructure-(assistant-stream)), [assistant-stream — npm](https://www.npmjs.com/package/assistant-stream), [Data Stream Protocol — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/data-stream)_

---

### Claude Agent SDK Message Type → ThreadMessageLike Mapping

The Claude Agent SDK emits five typed message classes. Here is how each maps to assistant-ui's thread model:

| SDK message type | subtype | ThreadMessageLike mapping |
|---|---|---|
| `SystemMessage` | `init` | → Not a thread message. Extract `session_id`, store it. |
| `SystemMessage` | `api_retry` | → Optional: inject a synthetic status message to show "retrying…" |
| `AssistantMessage` | — | → `role: "assistant"`, content parts: text blocks → `{type:"text"}`, tool_use blocks → `{type:"tool-call"}` |
| `ToolResultMessage` | — | → `role: "tool"`, content: `[{type:"tool-result", toolCallId, result}]` |
| `ResultMessage` | `success` | → Not displayed. Surface `total_cost_usd` to a cost tracker if needed. |
| `ResultMessage` | `error_*` | → Inject as a system/error status message in the thread. |

**Important:** The runtime auto-matches `ToolResultMessage` to its `AssistantMessage` tool-call part by `toolCallId`. The UI groups them and passes both `args` and `result` to the tool renderer.

_Source: [ExternalStoreRuntime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store), [Picking a runtime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime)_

---

### Tool Call Rendering — Tools() API

`makeAssistantToolUI` is deprecated as of early 2026. The current pattern is `defineToolkit` / the `Tools()` API, which co-locates schema, executor, and renderer in one file and automatically splits them across the client/server boundary via the compiler.

For our use case (rendering already-executed tool calls from the backend — no client-side execution), the pattern is a UI-only tool registration via `ToolPrimitive` or the `tools` prop on `<Thread />`.

```tsx
// Register a renderer for the "Bash" tool (display-only, no client execution)
const BashToolUI = makeAssistantToolUI({
  toolName: "Bash",
  render: ({ args, result, status }) => (
    <div className="my-1 rounded border border-border bg-muted/30 p-2 font-mono text-xs">
      <div className="flex items-center gap-1 text-muted-foreground">
        <TerminalIcon className="h-3 w-3" />
        <span>{args.command}</span>
        {status.type === "running" && <Spinner className="ml-auto h-3 w-3" />}
      </div>
      {status.type === "complete" && result?.output && (
        <pre className="mt-1 max-h-40 overflow-auto text-foreground">{result.output}</pre>
      )}
    </div>
  ),
});

// Register a renderer for the "Read" tool
const ReadToolUI = makeAssistantToolUI({
  toolName: "Read",
  render: ({ args, status }) => (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <FileIcon className="h-3 w-3" />
      <span>{args.file_path}</span>
      {status.type === "running" && <span>reading…</span>}
    </div>
  ),
});
```

The same pattern applies to `Write`, `Edit`, `Glob`, and `Grep`. Each renderer is a pure Tailwind-styled React component. The `status.type` enum is `"running" | "complete" | "incomplete" | "requires-action"`.

**Note:** The `tools` prop on `<Thread />` accepts an array of tool UI registrations:
```tsx
<Thread tools={[BashToolUI, ReadToolUI, WriteToolUI, EditToolUI]} />
```

_Source: [makeAssistantToolUI — assistant-ui](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui), [Tools — assistant-ui](https://www.assistant-ui.com/docs/guides/Tools), [Tool UIs — assistant-ui](https://www.assistant-ui.com/docs/advanced/ToolUI)_

---

### Artifact Committed Pill — Custom Event Injection

The `artifact_committed` event arrives from the `PostToolUse` hook on `Bash(git commit *)` — it is **not** an `AssistantMessage`, it is a side-channel SSE event. Two patterns handle this:

**Pattern 1 (recommended): Synthetic tool-call message injection**

In the SSE consumer, when `artifact_committed` is received, append a synthetic SDK message shaped like a `ToolResultMessage` with `toolName: "artifact_committed"` and the commit metadata as the result. Register a custom renderer for it:

```tsx
const ArtifactPillUI = makeAssistantToolUI({
  toolName: "artifact_committed",
  render: ({ result }) => (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircleIcon className="h-3 w-3" />
      <span>{result.artifactPath ?? "Artifact committed"}</span>
    </div>
  ),
});
```

**Pattern 2: Out-of-band React state**

Maintain a separate `committedArtifacts` state array updated by the SSE consumer. Render artifact pills as a fixed overlay or sticky banner above the Composer. Less integrated with the thread scroll position but simpler.

Pattern 1 is preferred: the pill appears inline at the correct position in the conversation, and the `useExternalStoreRuntime` handles its insertion naturally.

_Source: [Generative UI — assistant-ui](https://www.assistant-ui.com/docs/tools/generative-ui), [Defining Tools — assistant-ui](https://www.assistant-ui.com/docs/tools/defining-tools)_

---

### Next.js 15 App Router SSE Integration

**The architecture choice:** The Claude Agent SDK backend is a separate Node.js process. The browser's SSE consumer has two options for connecting to it:

**Option 1 (recommended): Direct browser → Agent backend SSE**

The browser connects directly to the Agent SDK backend URL via `fetch` with `{ cache: "no-store" }` and reads the response body as a `ReadableStream`. No Next.js proxy layer — avoids all buffering issues.

```tsx
// In the useExternalStoreRuntime onNew callback
const response = await fetch("https://agent-backend.internal/sessions/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ prompt, sessionId }),
  cache: "no-store",
});
const reader = response.body!.getReader();
// read chunks and update agentMessages state
```

CORS must be enabled on the Agent backend (`Access-Control-Allow-Origin: <frontend-origin>`). Authentication is via a short-lived bearer token issued by the Next.js app (the trusted authentication layer).

**Option 2: Next.js proxy route handler**

When the Agent backend is not publicly reachable (VPC-internal only), a Next.js route handler proxies the SSE stream:

```typescript
// app/api/sessions/[id]/stream/route.ts
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const backendResponse = await fetch(
    `${AGENT_BACKEND_URL}/sessions/${params.id}/stream`,
    { method: "POST", body: req.body, headers: { "Content-Type": "application/json" }, cache: "no-store" }
  );

  return new Response(backendResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Critical requirement:** `export const dynamic = "force-dynamic"` is mandatory. Without it, Vercel/Next.js may statically optimize or cache the route, completely breaking streaming. The `X-Accel-Buffering: no` header prevents nginx from buffering chunks.

_Source: [Guides: Streaming — Next.js](https://nextjs.org/docs/app/guides/streaming), [Next.js SSE Guide: Real-Time Apps (2026)](https://nextjslaunchpad.com/article/nextjs-server-sent-events-real-time-notifications-progress-tracking-live-dashboards), [Using SSE to stream LLM responses — Upstash](https://upstash.com/blog/sse-streaming-llm-responses)_

---

### Multi-Turn Session Management Pattern

Each user message triggers a new SSE connection to the backend (SSE is not a long-lived connection per session — it's a new fetch per turn). The `session_id` from the Agent SDK's first `SystemMessage/init` event ties turns together.

```
Turn 1:
  Browser → POST /sessions/new { prompt } → SSE stream
  ← SystemMessage(init, session_id: "abc123")  ← store this
  ← AssistantMessage(streaming tokens...)
  ← ResultMessage(success)
  [SSE connection closes]

Turn 2:
  Browser → POST /sessions/abc123/stream { prompt } → SSE stream
  ← AssistantMessage(streaming tokens...)  [SDK resumes transcript from session_id]
  ← ResultMessage(success)
  [SSE connection closes]
```

In `useExternalStoreRuntime`, this is handled automatically: the `onNew` callback fires per user message, and the accumulated `agentMessages` array (across all turns) is what the runtime renders. The `sessionId` state variable is captured once and used on every subsequent `onNew` call.

_Source: [Work with sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/sessions), [ExternalStoreRuntime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store)_

---

## Architectural Patterns and Design

### Full Stack Architecture (Approach B)

With Approach B confirmed as the primary pattern, the full stack looks like this:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15 App Router)                            │
│  · <AssistantRuntimeProvider runtime={dataStreamRuntime}>   │
│  · useDataStreamRuntime({ api: "/api/sessions/[id]/stream", │
│                           protocol: "data-stream" })        │
│  · <Thread tools={[BashUI, ReadUI, WriteUI, ArtifactUI]} /> │
│  · All styling via Tailwind v4 utility classes              │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP POST + SSE response
                         │  data-stream protocol (assistant-stream wire format)
┌────────────────────────▼────────────────────────────────────┐
│  Next.js Route Handler  /api/sessions/[id]/stream           │
│  · export const dynamic = "force-dynamic"                   │
│  · Thin proxy: fetch() → Agent backend, pipe body           │
│  · OR: direct browser → Agent backend (if CORS configured)  │
└────────────────────────┬────────────────────────────────────┘
                         │  fetch (internal / same VPC)
┌────────────────────────▼────────────────────────────────────┐
│  Agent Backend  (Node.js / TypeScript)                      │
│  · Receives prompt + session_id                             │
│  · Calls Agent SDK query() async iterator                   │
│  · Maps SDK messages → assistant-stream data-stream format  │
│  · createAssistantStreamResponse() → Web Response           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Claude Agent SDK subprocess (per session)                  │
│  · cwd = git worktree, BMAD skills loaded                   │
│  · Emits: SystemMessage, AssistantMessage, ToolResult,      │
│           ResultMessage, artifact_committed hook event      │
└─────────────────────────────────────────────────────────────┘
```

**Why this separation is clean:**
The Next.js frontend speaks only the `assistant-stream` data-stream protocol — a documented, stable wire format. The Agent backend is the only place that knows about Claude Agent SDK types. When the backend migrates to Managed Agents or any other agent framework, only the backend mapper changes.

_Source: [assistant-stream — npmx](https://npmx.dev/package/assistant-stream), [Data Stream Protocol — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/data-stream)_

---

### Frontend Component Architecture

assistant-ui follows the Radix UI composition model. Every shipped component (`<Thread />`) is a pre-styled composition of lower-level primitives that you can replace piecemeal.

```
AssistantRuntimeProvider          ← root: connects runtime to all descendant components
└── Thread                        ← pre-styled composition (can be replaced with primitives)
    ├── ThreadPrimitive.Viewport  ← scrollable area, auto-anchors to bottom
    │   └── ThreadPrimitive.Messages
    │       └── per message:
    │           ├── MessagePrimitive.Root     ← message container
    │           ├── MessagePrimitive.Content  ← renders content parts
    │           │   ├── text part     → <p> or Markdown renderer
    │           │   ├── tool-call part → tool UI renderer (BashUI, ReadUI…)
    │           │   └── generative-ui  → ArtifactPillUI
    │           └── MessagePrimitive.InProgress (streaming indicator)
    └── Composer                  ← new message input (or edit when inside a Message)
        ├── ComposerPrimitive.Input
        └── ComposerPrimitive.Send
```

**Key primitives for customisation:**

| Primitive | What to customise |
|---|---|
| `ThreadPrimitive.Empty` | "Start a BMAD skill" placeholder state |
| `MessagePrimitive.Content` | Pass `components={{ Text, ToolFallback }}` to override default renderers |
| `ComposerPrimitive.Input` | Textarea appearance, placeholder text |
| `ComposerPrimitive.Send` | Send button icon and disabled state |
| `ThreadPrimitive.Messages` | Pass `components={{ UserMessage, AssistantMessage }}` for full message bubble control |

All primitive components forward props and merge classes — Tailwind classes can be applied directly on any primitive element. No CSS-in-JS, no `className` conflicts with Tailwind v4.

_Source: [Thread — assistant-ui](https://www.assistant-ui.com/docs/ui/primitives/Thread), [Composition — assistant-ui](https://www.assistant-ui.com/docs/api-reference/primitives/composition), [MessagePrimitive — assistant-ui](https://www.assistant-ui.com/docs/api-reference/primitives/Message)_

---

### Backend Mapper Architecture (Agent SDK → assistant-stream)

The backend mapper is a single function that consumes the `query()` async iterator and pipes it into an `AssistantStream`. The stream is then returned as a Web `Response` via `createAssistantStreamResponse`.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { AssistantStream, createAssistantStreamResponse } from "assistant-stream";

export async function runSkillSession(prompt: string, options: AgentOptions) {
  const stream = new AssistantStream();

  // Run mapping in background — don't await, let the response stream
  (async () => {
    for await (const msg of query({ prompt, options })) {
      switch (msg.type) {
        case "system":
          if (msg.subtype === "init") {
            // Surface session_id as a stream annotation, not a message
            stream.addAnnotation({ type: "session_init", sessionId: msg.session_id });
          }
          break;

        case "assistant":
          for (const part of msg.content) {
            if (part.type === "text") stream.appendText(part.text);
            else if (part.type === "tool_use") {
              stream.addToolCallPart({
                toolCallId: part.id,
                toolName: part.name,
                args: part.input,
              });
            }
          }
          break;

        case "tool":
          stream.addToolResult({
            toolCallId: msg.tool_use_id,
            result: msg.content,
          });
          break;

        case "result":
          if (msg.subtype !== "success") {
            stream.addAnnotation({ type: "agent_error", subtype: msg.subtype });
          }
          // Optionally surface cost: msg.total_cost_usd
          break;
      }
    }

    // Inject artifact_committed events (set up via PostToolUse hook before query())
    // These arrive via the hook callback, not the iterator — see Hook Integration below

    stream.close();
  })();

  return createAssistantStreamResponse(stream);
}
```

**Framework compatibility of `createAssistantStreamResponse`:**

| Framework | Works natively? | Notes |
|---|---|---|
| Next.js App Router | ✅ | Web Response returned directly from route handler |
| Hono | ✅ | Same Web Response model |
| Bun / Deno / Cloudflare Workers | ✅ | Fetch-compatible |
| Express | ⚠️ | Needs adapter: copy headers, pipe `response.body` into `res` |
| Fastify | ⚠️ | Same adapter pattern as Express |

Since the Agent backend is Node.js + Express/Fastify, a small adapter is needed. The recommended pattern is to pipe `response.body` into the Express `res` writable stream after copying status and headers.

_Source: [assistant-stream — npmx](https://npmx.dev/package/assistant-stream), [Streaming Infrastructure — DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/4-streaming-infrastructure-(assistant-stream))_

---

### Artifact Committed Hook Integration

The `artifact_committed` event arrives via the `PostToolUse` hook callback — outside the `query()` async iterator. The hook fires after a `git commit` Bash call completes. The mapper must bridge this into the stream.

```typescript
import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";

const stream = new AssistantStream();
let commitArtifact: ((path: string) => void) | undefined;

// PostToolUse hook: fires when Bash(git commit *) completes
const onCommit: HookCallback = async (input) => {
  const cmd = (input as any).tool_input?.command ?? "";
  if (cmd.startsWith("git commit") && commitArtifact) {
    // Extract committed artifact path from git output or cmd args
    commitArtifact(cmd);
  }
  return {};
};

// Wire the hook into the mapper's tool-call emission
// The cleanest approach: emit a synthetic tool-call + immediate tool-result pair
commitArtifact = (cmd: string) => {
  const id = `artifact-${Date.now()}`;
  stream.addToolCallPart({ toolCallId: id, toolName: "artifact_committed", args: { command: cmd } });
  stream.addToolResult({ toolCallId: id, result: { committed: true, command: cmd } });
};

for await (const msg of query({
  prompt,
  options: {
    ...agentOptions,
    hooks: { PostToolUse: [{ matcher: "Bash", hooks: [onCommit] }] },
  },
})) {
  // ... mapper logic from above ...
}
```

The frontend registers a `artifact_committed` tool UI renderer (the pill) as shown in the Integration Patterns section. The synthetic tool-call + tool-result pair is emitted into the stream as a complete unit, so the pill renders immediately rather than waiting for a result.

_Source: [Agent SDK overview — Hooks tab](https://code.claude.com/docs/en/agent-sdk/overview), [assistant-stream — npmx](https://npmx.dev/package/assistant-stream)_

---

### Security and Authentication Architecture

The wire format separation introduced by Approach B creates a clean auth boundary:

```
Browser → Next.js Route Handler (auth gate) → Agent Backend (internal)
```

The Next.js route handler validates the session token (NextAuth / Clerk / custom JWT) before proxying to the Agent backend. The Agent backend is not publicly reachable — it only accepts connections from the Next.js process on the same VPC/container network. This means:
- No CORS needed on the Agent backend
- No auth complexity on the Agent backend (trust the Next.js gateway)
- The wire format (`assistant-stream`) contains no auth material — only message data
- The `session_id` annotation in the stream lets the frontend track which backend session it belongs to

_Source: [Securely deploying AI agents — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)_

---

## Implementation Approaches and Technology Adoption

### Package Inventory

**This project's current stack:** Next.js 15.5.19, React 19.2.7, Tailwind v4.3.0, TypeScript 6.0.3.

**React 19 compatibility:** Confirmed. `@assistant-ui/react` 0.12.15 has been verified with React 19.1.0 in production environments. No `--legacy-peer-deps` flag needed.

#### Frontend packages (add to this repo)

```bash
# Core runtime and UI
npm install @assistant-ui/react @assistant-ui/react-data-stream

# Shadcn-style component scaffolding via the assistant-ui CLI (optional but recommended)
npx assistant-ui@latest init
# Pulls pre-built Thread, Message, Composer components into src/components/ui/
# Handles Tailwind v4 config automatically
```

| Package | Purpose | Latest (June 2026) |
|---|---|---|
| `@assistant-ui/react` | Core primitives, `AssistantRuntimeProvider`, `useExternalStoreRuntime` | `^0.12.x` |
| `@assistant-ui/react-data-stream` | `useDataStreamRuntime` hook for data-stream protocol | `^0.5.x` |

#### Backend packages (add to the Agent SDK backend)

```bash
npm install assistant-stream
```

| Package | Purpose | Latest (June 2026) |
|---|---|---|
| `assistant-stream` | `AssistantStream`, `createAssistantStreamResponse` | `0.3.19` |

_Source: [@assistant-ui/react — npm](https://www.npmjs.com/package/@assistant-ui/react), [@assistant-ui/react-data-stream — npm](https://www.npmjs.com/package/@assistant-ui/react-data-stream), [assistant-stream — npm](https://www.npmjs.com/package/assistant-stream)_

---

### Frontend Implementation Checklist (Sprint 1)

**1. Install packages**
```bash
npm install @assistant-ui/react @assistant-ui/react-data-stream
```

**2. Create the runtime provider** (`src/components/chat/RuntimeProvider.tsx` — client component)
```tsx
"use client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

export function ChatRuntimeProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const runtime = useDataStreamRuntime({
    api: `/api/sessions/${sessionId}/stream`,
    protocol: "data-stream",   // ← CRITICAL: must not be the default "ui-message-stream"
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

**3. Create the SSE proxy route** (`src/app/api/sessions/[id]/stream/route.ts`)
```typescript
export const dynamic = "force-dynamic"; // ← CRITICAL: prevents Next.js from caching/buffering

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth check here (NextAuth session / Clerk / JWT)
  const backendRes = await fetch(
    `${process.env.AGENT_BACKEND_URL}/sessions/${params.id}/stream`,
    { method: "POST", body: req.body, headers: { "Content-Type": "application/json" }, cache: "no-store" }
  );
  return new Response(backendRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**4. Assemble the chat page** (`src/app/skills/[skillId]/page.tsx`)
```tsx
import { ChatRuntimeProvider } from "@/components/chat/RuntimeProvider";
import { SkillThread } from "@/components/chat/SkillThread";

export default function SkillPage({ params }: { params: { skillId: string } }) {
  return (
    <ChatRuntimeProvider sessionId={params.skillId}>
      <SkillThread />
    </ChatRuntimeProvider>
  );
}
```

**5. Build the thread component** (`src/components/chat/SkillThread.tsx`)
```tsx
"use client";
import { Thread } from "@assistant-ui/react";
import { BashToolUI, ReadToolUI, WriteToolUI, EditToolUI, ArtifactPillUI } from "./tools";

export function SkillThread() {
  return (
    <Thread
      tools={[BashToolUI, ReadToolUI, WriteToolUI, EditToolUI, ArtifactPillUI]}
      className="h-full"
    />
  );
}
```

_Source: [Getting Started — assistant-ui DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/1.2-getting-started), [@assistant-ui/react-data-stream — assistant-ui docs](https://www.assistant-ui.com/docs/api-reference/integrations/react-data-stream)_

---

### Backend Implementation Checklist (Sprint 1)

**1. Install package**
```bash
npm install assistant-stream
```

**2. Express adapter for `createAssistantStreamResponse`**

Since the Agent backend uses Express (not a Fetch-native framework), the Web `Response` returned by `createAssistantStreamResponse` needs to be adapted:

```typescript
import { createAssistantStreamResponse } from "assistant-stream";

// Utility: pipe a Web Response into an Express res
async function pipeWebResponseToExpress(webRes: Response, res: express.Response) {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("X-Accel-Buffering", "no");

  if (!webRes.body) { res.end(); return; }
  const reader = webRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

// Route handler
router.post("/sessions/:id/stream", async (req, res) => {
  const webResponse = await runSkillSession(req.body.prompt, {
    resume: req.params.id,
    sessionStore,
    cwd: await getWorktreePath(req.params.id),
    // ... other Agent SDK options
  });
  await pipeWebResponseToExpress(webResponse, res);
});
```

**Known failure mode to avoid:** Do NOT call `webRes.body.pipeTo(new WritableStream(...))` directly on the Express `res` — the `ERR_INVALID_STATE: Controller is already closed` error occurs because Express controls the response lifecycle. Use the manual `read()` loop above instead.

_Source: [assistant-stream — npmx](https://npmx.dev/package/assistant-stream)_

---

### Testing Strategy

**Framework:** Vitest (not Jest) — native Vite integration, faster, Jest-compatible API. Confirmed working with React 19 + Next.js 15 in 2026.

**What to test and how:**

| Layer | Test type | Approach |
|---|---|---|
| Tool UI renderers | Unit | Standard React Testing Library; pass mock `{ args, result, status }` props |
| SSE proxy route handler | Integration | `vi.fn()` mock on `fetch`, assert headers and body pipe |
| Backend stream mapper | Unit | Feed synthetic SDK messages into the mapper; collect `AssistantStream` chunks; assert data-stream protocol parts emitted |
| `RuntimeProvider` + `Thread` | E2E | Mock the `/api/sessions/[id]/stream` endpoint with a pre-built data-stream chunk sequence; assert messages render |

**Mocking an SSE stream in Vitest:**
```typescript
import { vi } from "vitest";

// Fake a data-stream response with two text chunks + a tool call
function fakeDataStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 10));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeDataStream([
  "0:Hello\n",          // text chunk (data-stream protocol)
  "9:{...tool call}\n", // tool call part
])));
```

_Source: [Testing AI Agents with Vitest 4 — DEV Community](https://dev.to/jangwook_kim_e31e7291ad98/testing-ai-agents-with-vitest-4-mocking-llm-calls-and-streaming-responses-in-practice-1bg4), [Vitest vs Jest in 2026 — DEV Community](https://dev.to/whoffagents/vitest-vs-jest-in-2026-i-migrated-my-ai-saas-and-heres-what-changed-2gda)_

---

### Known Gotchas and Risk Mitigation

| Gotcha | Severity | Fix |
|---|---|---|
| `protocol` defaults to `"ui-message-stream"` in `useDataStreamRuntime` | **Critical** | Always pass `protocol: "data-stream"` explicitly when using `assistant-stream` backend |
| `export const dynamic = "force-dynamic"` missing on SSE route | **Critical** | Without it, Next.js may cache or statically optimize the route, breaking streaming |
| Express `ERR_INVALID_STATE` when piping Web Response | **High** | Use the manual `reader.read()` loop; do not use `pipeTo()` |
| `X-Accel-Buffering: no` missing | **High** | nginx will buffer SSE chunks — tokens arrive in batches instead of streaming |
| `assistant-ui` CLI init may scaffold shadcn-style components that reference older Tailwind v3 syntax | **Medium** | Review scaffolded files for `@apply` directives; replace with Tailwind v4 equivalents |
| `artifact_committed` hook fires outside the `query()` iterator | **Medium** | Inject via `commitArtifact` closure; emit synthetic tool-call+result pair into stream before `stream.close()` |

---

## Technical Research Recommendations

### Implementation Roadmap

**Sprint 1 — Chat UI foundation (1 week)**
1. Install `@assistant-ui/react` + `@assistant-ui/react-data-stream` in the Next.js app
2. Scaffold `Thread` component via `npx assistant-ui init`; apply Tailwind v4 classes
3. Create `ChatRuntimeProvider` with `useDataStreamRuntime({ protocol: "data-stream" })`
4. Build SSE proxy route handler (`/api/sessions/[id]/stream`) with `force-dynamic`
5. Wire to a stub backend (return a hardcoded data-stream response) to verify end-to-end render

**Sprint 2 — Tool renderers + artifact pill (1 week)**
1. Install `assistant-stream` on the Agent backend
2. Implement the SDK message mapper + `createAssistantStreamResponse`
3. Write the Express Web Response adapter (pipe utility)
4. Register tool UI components: `BashToolUI`, `ReadToolUI`, `WriteToolUI`, `EditToolUI`
5. Wire `PostToolUse` hook into the mapper; implement `ArtifactPillUI`

**Sprint 3 — Testing (1 week)**
1. Write Vitest unit tests for tool renderers and stream mapper
2. Write integration test for the SSE proxy route
3. Smoke-test end-to-end with a real BMAD skill session

### Technology Stack Recommendation

| Layer | Choice | Rationale |
|---|---|---|
| Frontend runtime | `@assistant-ui/react` + `useDataStreamRuntime` | Headless, Tailwind-native, stable wire format, React 19 confirmed |
| Wire protocol | `assistant-stream` data-stream format | Backend-agnostic contract; survives Agent SDK → Managed Agents migration |
| Backend stream builder | `assistant-stream` 0.3.19 | `createAssistantStreamResponse`, tool call parts |
| SSE proxy | Next.js App Router route handler | Co-located auth gate; no extra infra |
| Testing | Vitest + React Testing Library | Native Vite/Next.js 15 compatibility; fast; `vi.fn()` for fetch mocking |

---

## Research Synthesis

### Table of Contents

1. [Technology Stack Analysis](#technology-stack-analysis) — 4 library candidates evaluated; selection rationale
2. [Integration Patterns Analysis](#integration-patterns-analysis) — Approach A vs B; message type mapping; tool rendering; artifact pill; multi-turn session management
3. [Architectural Patterns and Design](#architectural-patterns-and-design) — Full stack diagram; component tree; backend mapper; resumable streams; auth boundary
4. [Implementation Approaches and Technology Adoption](#implementation-approaches-and-technology-adoption) — Package inventory; sprint checklists; testing strategy; gotchas
5. [Technical Research Recommendations](#technical-research-recommendations) — Sprint roadmap; final stack decision

---

### Executive Summary

The React AI chat UI landscape in 2026 has converged around a two-layer model: a **hooks layer** (Vercel AI SDK `useChat`, 20M+ monthly downloads) for streaming state management, and a **UI primitives layer** (`assistant-ui`, 200k+ monthly downloads, used by LangChain, Stack AI, Athena Intelligence) for composable, headless chat components. For a Next.js 15 + Tailwind v4 project, `assistant-ui` is the correct foundation — it follows the Radix headless pattern, has no default styles to fight, and integrates natively with Tailwind v4 (including a first-party Tailwind v4 plugin).

**The central architectural decision is Approach B:** the backend maps Claude Agent SDK typed messages into the `assistant-stream` data-stream protocol. The frontend speaks only this stable wire format via `useDataStreamRuntime`. This decouples the React code from Agent SDK internals. When the platform migrates from the Agent SDK to Managed Agents (the documented Anthropic migration path), only the backend mapper changes — the entire frontend and all tool renderers are unaffected.

**The three questions this research answers:**

**1. Which OSS library?**
`assistant-ui` (`@assistant-ui/react` + `@assistant-ui/react-data-stream`). Headless, Tailwind-native, first-class tool call rendering, Generative UI for the artifact pill, React 19.2.7 compatible, actively maintained (YC W25, 200k+ monthly downloads June 2026). CopilotKit is too heavy (AG-UI backend mapping layer). NLUX's theming API is not Tailwind-native. Vercel AI SDK `useChat` is hooks only — no UI primitives.

**2. How does the backend connect to it?**
`assistant-stream` (0.3.19) on the Node.js Agent backend. The mapper consumes the `query()` async iterator, translates each SDK message type to the data-stream protocol via `AssistantStream`, and returns a `createAssistantStreamResponse()` Web Response. An Express pipe adapter bridges the Fetch-style `Response` to Express's `res` object. The `artifact_committed` hook event is injected as a synthetic tool-call + tool-result pair, rendered by a registered pill component.

**3. How does the Next.js frontend connect?**
A route handler at `/api/sessions/[id]/stream` proxies the SSE stream from the Agent backend (auth gate + VPC-internal fetch). The frontend mounts `useDataStreamRuntime({ api, protocol: "data-stream" })` inside `AssistantRuntimeProvider`. `<Thread tools={[...]} />` renders the conversation with per-tool UI components styled entirely in Tailwind v4.

**Key Technical Findings:**

- `assistant-ui` 200k+ monthly downloads June 2026; production-proven at LangChain, Stack AI, Athena Intelligence
- Approach B wire format (`assistant-stream` data-stream protocol) is the migration-safe choice — backend-agnostic, frontend stable
- React 19.2.7 is confirmed compatible with `@assistant-ui/react` 0.12.15
- Three critical deploy-blocking gotchas: wrong `protocol` value, missing `force-dynamic`, Express pipe failure mode
- `npx assistant-ui init` scaffolds Tailwind v4-compatible components in one command

**Technical Recommendations (priority order):**

1. Use `@assistant-ui/react` + `@assistant-ui/react-data-stream` as the frontend chat stack
2. Use `assistant-stream` on the Agent backend as the wire format adapter
3. Implement the Express Web Response pipe adapter (not `pipeTo()`)
4. Always pass `protocol: "data-stream"` to `useDataStreamRuntime` explicitly
5. Add `export const dynamic = "force-dynamic"` to the SSE proxy route handler
6. Use Vitest (not Jest) for the test suite — native Vite/Next.js 15 compatibility

---

### Source Index

| Source | Used in |
|---|---|
| [assistant-ui — React Chat UI for AI Apps](https://www.assistant-ui.com/) | Technology Stack, Architecture |
| [ExternalStoreRuntime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store) | Integration Patterns |
| [Data Stream Protocol — assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/data-stream) | Integration Patterns, Architecture |
| [@assistant-ui/react-data-stream — assistant-ui docs](https://www.assistant-ui.com/docs/api-reference/integrations/react-data-stream) | Implementation |
| [Generative UI — assistant-ui](https://www.assistant-ui.com/docs/tools/generative-ui) | Integration Patterns |
| [makeAssistantToolUI — assistant-ui](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui) | Integration Patterns, Implementation |
| [Thread — assistant-ui](https://www.assistant-ui.com/docs/ui/primitives/Thread) | Architecture |
| [Composition — assistant-ui](https://www.assistant-ui.com/docs/api-reference/primitives/composition) | Architecture |
| [assistant-stream — npm](https://www.npmjs.com/package/assistant-stream) | Architecture, Implementation |
| [Streaming Infrastructure (assistant-stream) — DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/4-streaming-infrastructure-(assistant-stream)) | Architecture |
| [Message Format and Conversion — DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/3.3-thread-and-message-management) | Integration Patterns |
| [Getting Started — assistant-ui DeepWiki](https://deepwiki.com/assistant-ui/assistant-ui/1.2-getting-started) | Implementation |
| [Launch Week: assistant-ui goes multi-platform](https://www.assistant-ui.com/blog/2026-03-launch-week) | Technology Stack |
| [I Evaluated Every AI Chat UI Library in 2026 — DEV Community](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10) | Technology Stack |
| [The Overview of UI Libraries for AI Chat Interfaces in 2026 — Medium](https://alexander-lukashov.medium.com/the-overview-of-ui-libraries-for-ai-chat-interfaces-in-2026-146a1492114a) | Technology Stack |
| [AI SDK UI: Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) | Technology Stack, Integration Patterns |
| [AI SDK 5 — Vercel blog](https://vercel.com/blog/ai-sdk-5) | Technology Stack |
| [Introducing AG-UI — CopilotKit blog](https://www.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users) | Technology Stack |
| [GitHub — CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) | Technology Stack |
| [NLUX documentation — nlkit.com](https://docs.nlkit.com/nlux) | Technology Stack |
| [Guides: Streaming — Next.js](https://nextjs.org/docs/app/guides/streaming) | Integration Patterns, Implementation |
| [Next.js SSE Guide: Real-Time Apps (2026)](https://nextjslaunchpad.com/article/nextjs-server-sent-events-real-time-notifications-progress-tracking-live-dashboards) | Integration Patterns, Implementation |
| [Using SSE to stream LLM responses — Upstash](https://upstash.com/blog/sse-streaming-llm-responses) | Integration Patterns |
| [Agent SDK overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview) | Integration Patterns |
| [Work with sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/sessions) | Integration Patterns |
| [The Complete Guide to Generative UI Frameworks in 2026 — Medium](https://medium.com/@akshaychame2/the-complete-guide-to-generative-ui-frameworks-in-2026-fde71c4fa8cc) | Technology Stack |
| [Testing AI Agents with Vitest 4 — DEV Community](https://dev.to/jangwook_kim_e31e7291ad98/testing-ai-agents-with-vitest-4-mocking-llm-calls-and-streaming-responses-in-practice-1bg4) | Implementation |
| [AI App of the Week: Assistant UI — SaaStr](https://www.saastr.com/ai-app-of-the-week-assistant-ui-the-react-library-thats-eating-the-ai-chat-interface-market/) | Technology Stack |
| [Securely deploying AI agents — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/secure-deployment) | Architecture |

---

**Research Completion Date:** 2026-06-12
**Research Period:** Current — all sources verified June 2026
**Confidence Level:** High — based on official documentation, npm package data, and verified current sources
**Packages referenced:** `@assistant-ui/react` ^0.12.x, `@assistant-ui/react-data-stream` ^0.5.x, `assistant-stream` 0.3.19

---

## Addendum: Multi-Harness Infrastructure (2026-06-12)

> **Amendment:** This section supersedes the wire format recommendation in "Integration Patterns Analysis" (Approach B) and "Implementation Approaches". The frontend library, component architecture, and tool rendering patterns are **unchanged**. Only the runtime adapter and backend wire format change.

### What Triggered This Addendum

After the initial research completed, a review of the harness landscape revealed that the platform should be designed from MVP to support multiple agent harnesses — with Claude Agent SDK first, and OpenCode / GitHub Copilot / others following the same interface. This makes the AG-UI protocol a better wire format choice than `assistant-stream` data-stream.

---

### The Multi-Harness Landscape

The agent harness space in 2026 has fragmented into several production-grade options, each with a different execution model and streaming API:

| Harness | Architecture | Streaming API | AG-UI support |
|---|---|---|---|
| **Claude Agent SDK** | TypeScript async iterator | In-process SDK messages | `ag-ui-claude-sdk` (Python confirmed; TS: write adapter) |
| **OpenCode** | Go TUI + Bun HTTP server (`opencode serve`) | SSE, 80+ event types, OpenAPI spec | Bridge via community tools (AgentPool); no native AG-UI yet |
| **GitHub Copilot SDK** | Multi-language SDK + REST API (cloud tasks, June 2026) | Real-time streaming | AG-UI via Microsoft Agent Framework (documented on Microsoft Learn) |
| **Codex CLI / Gemini CLI** | Subprocess | stdout / SSE | Community adapters |

AG-UI has achieved critical mass as the standard for agent ↔ UI communication: Google, Microsoft (Agent Framework + GitHub Copilot), Amazon Bedrock (March 2026), Oracle, LangChain, Mastra, PydanticAI all support it.

**`@assistant-ui/react-ag-ui`** is a confirmed npm package — an official runtime adapter that lets the existing `assistant-ui` `<Thread />` components consume AG-UI events instead of the data-stream protocol. **Zero component rewrites.**

_Source: [AG-UI Agent Runtime — assistant-ui](https://www.assistant-ui.com/docs/runtimes/ag-ui/overview), [AG-UI Integration with Agent Framework — Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/), [Amazon Bedrock AgentCore supports AG-UI — AWS](https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-bedrock-agentcore-runtime-ag-ui-protocol/), [AG-UI GitHub](https://github.com/ag-ui-protocol/ag-ui)_

---

### Amended Architecture

The full stack diagram from "Architectural Patterns and Design" is updated as follows:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15 App Router)                            │
│  · <AssistantRuntimeProvider runtime={agUiRuntime}>         │
│  · useAgUiRuntime({ api: "/api/sessions/[id]/stream" })     │  ← CHANGED
│  · <Thread tools={[BashUI, ReadUI, WriteUI, ArtifactUI]} /> │  ← UNCHANGED
│  · All styling via Tailwind v4 utility classes              │  ← UNCHANGED
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP POST + SSE response
                         │  AG-UI event stream                   ← CHANGED wire format
┌────────────────────────▼────────────────────────────────────┐
│  Next.js Route Handler  /api/sessions/[id]/stream           │  ← UNCHANGED
│  · export const dynamic = "force-dynamic"                   │
│  · Thin proxy: fetch() → Agent backend, pipe body           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Agent Backend  (Node.js / TypeScript)                      │
│  · IAgentHarness interface                                  │  ← NEW
│  · ClaudeAgentSdkHarness (MVP)                              │  ← NEW
│  · Future: OpenCodeHarness, GitHubCopilotHarness            │  ← PLANNED
│  · AgUiEmitter: harness output → AG-UI events → SSE         │  ← CHANGED
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Agent Substrate (whichever harness is active)              │
│  · MVP: Claude Agent SDK subprocess (git worktree, BMAD)    │
│  · Future: opencode serve / GitHub Copilot SDK / others     │
└─────────────────────────────────────────────────────────────┘
```

---

### Amended Package Inventory

#### Frontend — what changes

| Old | New | Notes |
|---|---|---|
| `@assistant-ui/react-data-stream` | `@assistant-ui/react-ag-ui` | Runtime adapter only; all components unchanged |

```bash
# Remove
npm uninstall @assistant-ui/react-data-stream

# Add
npm install @assistant-ui/react-ag-ui @ag-ui/client
```

`@assistant-ui/react` stays. All tool renderers, `<Thread />`, `<Composer />`, Tailwind classes — **no changes**.

#### Backend — what changes

| Old | New | Notes |
|---|---|---|
| `assistant-stream` | `@ag-ui/core` + harness adapters | AG-UI event emitter replaces data-stream builder |

```bash
# Remove
npm uninstall assistant-stream

# Add
npm install @ag-ui/core
```

**Note on `ag-ui-claude-sdk`:** A Python package exists on PyPI. A TypeScript equivalent is not yet published as an official npm package (confirmed gap as of June 2026 — GitHub issue #439 in ag-ui-protocol/ag-ui tracks this). For the TypeScript backend, the AG-UI emitter must be written as part of `ClaudeAgentSdkHarness`. The mapping is straightforward (same message types as before; just emit AG-UI events instead of data-stream parts).

_Source: [@assistant-ui/react-ag-ui — npm](https://www.npmjs.com/package/@assistant-ui/react-ag-ui), [AG-UI GitHub — issue #439](https://github.com/ag-ui-protocol/ag-ui/issues/439), [piwheels — ag-ui-claude-sdk](https://www.piwheels.org/project/ag-ui-claude-sdk/)_

---

### Backend: IAgentHarness Interface

The harness abstraction is the key MVP infrastructure decision. It isolates harness-specific code from the AG-UI emitter and the session management layer.

```typescript
// src/harnesses/IAgentHarness.ts
export interface AgentMessage {
  type: "text_delta" | "tool_call" | "tool_result" | "artifact_committed" | "error" | "done";
  payload: unknown;
}

export interface IAgentHarness {
  /** Run a prompt turn, yielding normalized AgentMessages */
  run(prompt: string, sessionId: string): AsyncIterable<AgentMessage>;
  /** Resume an existing session */
  resume(sessionId: string): Promise<void>;
  /** Tear down session resources */
  cleanup(sessionId: string): Promise<void>;
}
```

```typescript
// src/harnesses/ClaudeAgentSdkHarness.ts  — MVP implementation
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { IAgentHarness, AgentMessage } from "./IAgentHarness";

export class ClaudeAgentSdkHarness implements IAgentHarness {
  async *run(prompt: string, sessionId: string): AsyncIterable<AgentMessage> {
    const options = await this.buildOptions(sessionId);
    for await (const msg of query({ prompt, options })) {
      yield* this.normalize(msg);
    }
  }

  private async *normalize(msg: SdkMessage): AsyncIterable<AgentMessage> {
    if (msg.type === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") yield { type: "text_delta", payload: { text: part.text } };
        else if (part.type === "tool_use") yield { type: "tool_call", payload: { id: part.id, name: part.name, args: part.input } };
      }
    } else if (msg.type === "tool") {
      yield { type: "tool_result", payload: { toolCallId: msg.tool_use_id, result: msg.content } };
    } else if (msg.type === "result") {
      yield { type: "done", payload: { cost: (msg as any).total_cost_usd } };
    }
    // artifact_committed injected separately via PostToolUse hook (same pattern as before)
  }
  // ... buildOptions, cleanup, etc.
}
```

Future harnesses (`OpenCodeHarness`, `GitHubCopilotHarness`) implement the same interface. The AG-UI emitter and session management layer only know about `IAgentHarness` — they never import a specific harness.

---

### AG-UI Emitter (replaces assistant-stream mapper)

The AG-UI emitter consumes `IAgentHarness` messages and emits AG-UI typed events over SSE:

```typescript
import { EventType } from "@ag-ui/core";  // TEXT_MESSAGE_CHUNK, TOOL_CALL_START, etc.

export async function runAsAgUiStream(
  harness: IAgentHarness,
  prompt: string,
  sessionId: string
): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      emit({ type: EventType.RUN_STARTED, thread_id: sessionId });

      for await (const msg of harness.run(prompt, sessionId)) {
        if (msg.type === "text_delta") {
          emit({ type: EventType.TEXT_MESSAGE_CHUNK, delta: (msg.payload as any).text });
        } else if (msg.type === "tool_call") {
          const p = msg.payload as any;
          emit({ type: EventType.TOOL_CALL_START, tool_call_id: p.id, tool_name: p.name });
          emit({ type: EventType.TOOL_CALL_ARGS_CHUNK, tool_call_id: p.id, delta: JSON.stringify(p.args) });
          emit({ type: EventType.TOOL_CALL_END, tool_call_id: p.id });
        } else if (msg.type === "tool_result") {
          const p = msg.payload as any;
          emit({ type: EventType.TOOL_CALL_RESULT, tool_call_id: p.toolCallId, result: p.result });
        } else if (msg.type === "artifact_committed") {
          // Synthetic custom event — assistant-ui renders via registered tool UI
          emit({ type: EventType.TOOL_CALL_START, tool_call_id: `artifact-${Date.now()}`, tool_name: "artifact_committed" });
          emit({ type: EventType.TOOL_CALL_RESULT, tool_call_id: `artifact-${Date.now()}`, result: msg.payload });
        } else if (msg.type === "done") {
          emit({ type: EventType.RUN_FINISHED });
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

---

### Frontend: Swap One Hook

```tsx
// Before (Approach B)
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
const runtime = useDataStreamRuntime({ api: "/api/sessions/[id]/stream", protocol: "data-stream" });

// After (AG-UI)
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { HttpAgent } from "@ag-ui/client";

const agent = new HttpAgent({ url: `/api/sessions/${sessionId}/stream` });
const runtime = useAgUiRuntime({ agent });
```

`<Thread />`, tool renderers, `AssistantRuntimeProvider`, Tailwind classes — **all unchanged**.

---

### Amended Sprint Roadmap

**Sprint 1 — Chat UI + AG-UI foundation (1 week)**
1. Install `@assistant-ui/react`, `@assistant-ui/react-ag-ui`, `@ag-ui/client` in Next.js app
2. Scaffold `Thread` component via `npx assistant-ui init`; apply Tailwind v4 classes
3. Create `ChatRuntimeProvider` with `useAgUiRuntime`
4. Build SSE proxy route handler with `force-dynamic`
5. On backend: define `IAgentHarness` interface; implement stub harness returning hardcoded AG-UI events to verify end-to-end render

**Sprint 2 — Claude Agent SDK harness + tool renderers (1 week)**
1. Install `@ag-ui/core` on backend
2. Implement `ClaudeAgentSdkHarness` with AG-UI emitter
3. Write Express → Web Response adapter (same pipe utility as before)
4. Register tool UI components: `BashToolUI`, `ReadToolUI`, `WriteToolUI`, `EditToolUI`
5. Wire `PostToolUse` hook for `ArtifactPillUI`

**Sprint 3 — Hardening + harness registry (1 week)**
1. Add `HarnessRegistry` (`Map<string, IAgentHarness>`) keyed by harness identifier
2. Expose harness selection in session creation API
3. Write Vitest tests for `ClaudeAgentSdkHarness` normalization and AG-UI emitter
4. Smoke-test end-to-end with a real BMAD skill session

**Post-MVP — additional harnesses (separate sprints)**
- `OpenCodeHarness`: consume `opencode serve` SSE HTTP API; normalize to `AgentMessage[]`
- `GitHubCopilotHarness`: consume Copilot SDK streaming; normalize to `AgentMessage[]`
- Each is a self-contained implementation of `IAgentHarness` — zero changes to frontend or AG-UI emitter

---

### Amended Package Summary

**Frontend (this repo — add):**
```bash
npm install @assistant-ui/react @assistant-ui/react-ag-ui @ag-ui/client
```

**Backend (Agent backend — add):**
```bash
npm install @ag-ui/core
```

**Removed from original recommendation:** `@assistant-ui/react-data-stream`, `assistant-stream`

**Verified resolved versions** (dry-run against React 19.2.7 — no peer dep conflicts):

| Package | Resolved version | Stability note |
|---|---|---|
| `@assistant-ui/react` | `0.14.18` | — |
| `@assistant-ui/react-ag-ui` | `0.0.38` | ⚠️ Pin exact — pre-1.0 |
| `@ag-ui/client` | `0.0.55` | ⚠️ Pin exact — pre-1.0 |
| `@ag-ui/core` | `0.0.57` | ⚠️ Pin exact — pre-1.0 |

`assistant-stream 0.3.21` is pulled in as a transitive dependency of `@assistant-ui/react` — available if needed but not a direct dependency for the AG-UI path.

Use exact versions (no `^`) for all `@ag-ui/*` and `@assistant-ui/react-ag-ui` packages until they reach `1.0`.

---

### Amended Gotchas

Original gotchas from the Implementation section remain valid, with these additions:

| Gotcha | Severity | Fix |
|---|---|---|
| No official TypeScript `ag-ui-claude-sdk` package yet | **High** | Write `ClaudeAgentSdkHarness` AG-UI emitter manually (tracking: ag-ui-protocol/ag-ui issue #439) |
| `EventType` enum values must match the `@ag-ui/core` version exactly | **High** | Pin `@ag-ui/core` version; don't rely on string literals |
| OpenCode has no native AG-UI support | **Medium** | `OpenCodeHarness` will need to translate the OpenCode SSE event schema (80+ types, OpenAPI spec available) into `AgentMessage[]` — budget extra implementation time |
| `useAgUiRuntime` session ID management differs from `useDataStreamRuntime` | **Medium** | The AG-UI `HttpAgent` is created per session; ensure a new agent instance per `sessionId`, not a shared singleton |

**Research Completion Date:** 2026-06-12
**Addendum Date:** 2026-06-12
**Research Period:** Current — all sources verified June 2026
**Confidence Level:** High — based on official documentation, npm package data, and verified current sources
**Packages referenced:** `@assistant-ui/react` ^0.12.x, `@assistant-ui/react-ag-ui` latest, `@ag-ui/client` latest, `@ag-ui/core` latest
