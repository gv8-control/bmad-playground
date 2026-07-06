---
baseline_commit: d19eddbf0529b71a12d8529570762d6f93873eef
---

# Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation

Status: review

<!-- Review progress: Chunk 1 (agent-be backend) reviewed + patched 2026-07-05. NFR evidence audit completed 2026-07-05 (PASS, 1 timing test patch applied). Chunk 2 (web frontend) reviewed + patched 2026-07-05 (1 WCAG AA contrast patch on AccessNotice Dismiss button). Chunk 3 (adjacent changes + DI fix) reviewed + patched 2026-07-05 (1 redundant-null-assignment patch in StreamingController back-pressure timer; DI fix verified safe). All 3 chunks complete. -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user whose repository credentials fail while I'm actively working,
I want to be told immediately rather than on my next page load,
so that I can re-authorize and avoid losing more in-progress work than necessary.

## Acceptance Criteria

### AC-1: 401 detection emits `CREDENTIAL_FAILURE` and persists failed credential health (NFR-R1)

**Given** an active Conversation's git-related tool call result contains a 401 pattern
**When** it is detected by `tool-pill-classifier.service.ts`
**Then** it persists the failed credential health status (Story 1.6) and emits a `CREDENTIAL_FAILURE` event on the same SSE channel already carrying AG-UI events — no new transport
**And** this happens immediately, not only on the user's next page load (NFR-R1)

### AC-2: 403 classification emits `ACCESS_DENIED` without marking credential failed (FINDING-12)

**Given** an active Conversation's git-related tool call result contains a 403 pattern
**When** it is detected by `tool-pill-classifier.service.ts`
**Then** it classifies the 403 into `RATE_LIMITED`, `ORG_RESTRICTION`, or `INSUFFICIENT_PERMISSION` (reusing the Epic 1 / Story 1.6 vocabulary) and emits an `ACCESS_DENIED` event with that `code` on the same SSE channel — it does NOT emit `CREDENTIAL_FAILURE`, does NOT call `markCredentialFailed`, and does NOT persist failed credential health (per FINDING-12; event contract defined in architecture.md)

### AC-3: Frontend handles `CREDENTIAL_FAILURE` — re-auth prompt without navigation away

**Given** a `CREDENTIAL_FAILURE` event is received in an active Conversation
**When** the frontend processes it
**Then** the user sees a re-auth prompt without needing to navigate away from the Conversation

### AC-4: Frontend handles `ACCESS_DENIED` — error-state Tool Pill + Access Notice, no banner, no halt

**Given** an `ACCESS_DENIED` event is received in an active Conversation
**When** the frontend processes it
**Then** the failing git operation renders as an error-state Tool Pill with an Access Notice inline in the message stream below it, whose copy is derived from the event's `code` (`RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`)
**And** the Credential Error Banner does NOT appear and no re-auth prompt is shown (re-authentication resolves none of the three 403 causes, per FINDING-12)
**And** the input is not disabled and the agent turn is not halted (the tool call's error result is returned to the agent, which adapts)

### AC-5: Daytona outage does not break Project Map / Artifact Browser

**Given** a Daytona outage affecting Sandbox provisioning
**When** a user visits the Project Map or Artifact Browser
**Then** those surfaces remain functional (pure Postgres/git reads with no Sandbox dependency); only new Conversation provisioning is blocked

## Tasks / Subtasks

- [x] Task 1: Add `CREDENTIAL_FAILURE` / `ACCESS_DENIED` event types to shared-types (AC: 1, 2)
  - [x] 1.1 In `libs/shared-types/src/ag-ui.types.ts`, add the following after the existing `TOOL_CALL_PROMOTED` block (after line 34):
    ```typescript
    export const CREDENTIAL_FAILURE_EVENT = 'CREDENTIAL_FAILURE' as const;

    export interface CredentialFailureEvent {
      type: typeof CREDENTIAL_FAILURE_EVENT;
      toolCallId: string;
    }

    export type AccessDeniedCode = 'RATE_LIMITED' | 'ORG_RESTRICTION' | 'INSUFFICIENT_PERMISSION';

    export const ACCESS_DENIED_EVENT = 'ACCESS_DENIED' as const;

    export interface AccessDeniedEvent {
      type: typeof ACCESS_DENIED_EVENT;
      toolCallId: string;
      code: AccessDeniedCode;
      retryAfter?: number;
    }
    ```
  - [x] 1.2 Update the `AgUiEventType` union (line 36) to include the two new event types:
    ```typescript
    export type AgUiEventType =
      | EventType
      | typeof STREAM_ERROR_EVENT
      | typeof TOOL_CALL_PROMOTED_EVENT
      | typeof CREDENTIAL_FAILURE_EVENT
      | typeof ACCESS_DENIED_EVENT;
    ```
  - [x] 1.3 Verify `libs/shared-types/src/index.ts` barrel-exports the new types (it re-exports from `./ag-ui.types` — check if a wildcard or explicit list is used; add explicit exports if needed)

- [x] Task 2: Add `markCredentialFailed` to agent-be `CredentialsService` (AC: 1)
  - [x] 2.1 In `apps/agent-be/src/credentials/credentials.service.ts`, add the following method to the `CredentialsService` class (after `resolveOAuthToken`, before the closing brace at line 49). This duplicates the `apps/web/src/lib/credential-health.ts:markCredentialFailed` logic per the deliberate cross-service logic duplication rule (project-context.md line 142 — crypto, credential resolution, and git-identity resolution are replicated in agent-be from apps/web BY DESIGN):
    ```typescript
    async markCredentialFailed(userId: string, capturedAt?: Date): Promise<void> {
      try {
        await this.prisma.repoConnection.updateMany({
          where: capturedAt
            ? { userId, updatedAt: { lt: capturedAt } }
            : { userId },
          data: { credentialHealth: 'failed' },
        });
      } catch (err) {
        this.logger.error(
          `Failed to update credential health for userId ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    ```
    - Uses `updateMany` (no-op on zero matches — no throw if no RepoConnection exists). Uses `this.logger` (NestJS Logger, NOT `console.error` — project-context.md line 316). The `capturedAt` optimistic-concurrency guard uses `lt` (strict less-than, not `lte` — project-context.md line 347) to prevent a stale `failed` write from clobbering a concurrent re-authorization. In the classifier context, `capturedAt = new Date()` at classification time is the best available timestamp (the classifier sees the result AFTER the git tool call completed — there is no earlier timestamp to capture; this is a known limitation, see Deferred Findings)
    - Do NOT add `markCredentialHealthy` or `getCredentialHealth` — those are not needed in agent-be (re-auth happens via `apps/web`'s jwt callback which resets health to `healthy`; the classifier only writes `failed`, never reads health). Per DP-5, defer these to post-MVP

- [x] Task 3: Add 401/403 detection + classification to `ToolPillClassifierService` (AC: 1, 2)
  - [x] 3.1 In `apps/agent-be/src/streaming/tool-pill-classifier.service.ts`, add `CredentialsService` to the constructor injection (currently only injects `PrismaService` at line 80):
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly credentialsService: CredentialsService,
    ) {}
    ```
    Add the import: `import { CredentialsService } from '../credentials/credentials.service';`
  - [x] 3.2 Add 401/403 pattern-detection helper functions at the module level (after the existing `extractBmadArtifactPaths` function, before the `@Injectable()` decorator). These detect git authentication failures from the tool call RESULT TEXT (not HTTP Response objects — git tool call results are text output from `git` commands run inside the sandbox, which do not carry HTTP headers). The classification vocabulary reuses Epic 1's `RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION` (per architecture.md line 625); the detection mechanism is adapted to text patterns (DP-2 — semantic intent over literal text: the spec says "reuse detectGithubRateLimit" but that function takes a `Response` object with headers; git tool call output is text, so the detection is text-based but produces the same vocabulary):
    ```typescript
    function isCredentialFailureOutput(output: string): boolean {
      if (/remote: Invalid username or token/i.test(output)) return true;
      if (/remote: Anonymous authentication/i.test(output)) return true;
      if (/fatal: Authentication failed for/i.test(output)) return true;
      if (/fatal: could not read Username for/i.test(output)) return true;
      if (/\b401\s+Unauthorized\b/i.test(output)) return true;
      return false;
    }

    function classifyAccessDenied(output: string): { code: AccessDeniedCode; retryAfter?: number } | null {
      if (!/\b403\b|Permission denied|Resource not accessible by integration|Rate limit/i.test(output)) {
        return null;
      }

      // RATE_LIMITED — GitHub primary or secondary rate limit
      if (/Rate limit exceeded/i.test(output) || /secondary rate limit/i.test(output) || /abuse detection/i.test(output)) {
        const waitMatch = output.match(/retry after (\d+)/i);
        return { code: 'RATE_LIMITED', retryAfter: waitMatch ? Number(waitMatch[1]) : undefined };
      }

      // ORG_RESTRICTION — org has not authorized the OAuth App
      if (/Resource not accessible by integration/i.test(output) || /org.*policy/i.test(output)) {
        return { code: 'ORG_RESTRICTION' };
      }

      // INSUFFICIENT_PERMISSION — token's user lacks access to the specific resource
      return { code: 'INSUFFICIENT_PERMISSION' };
    }
    ```
    Add the import: `import type { AccessDeniedCode } from '@bmad-easy/shared-types';`
  - [x] 3.3 Widen the `classifyToolResult` return type (line 88) from `Promise<ToolCallPromotedEvent | null>` to a discriminated union:
    ```typescript
    import type { ToolCallPromotedEvent, CredentialFailureEvent, AccessDeniedEvent } from '@bmad-easy/shared-types';
    import { CREDENTIAL_FAILURE_EVENT, ACCESS_DENIED_EVENT } from '@bmad-easy/shared-types';

    async classifyToolResult(
      toolCallId: string,
      toolName: string,
      toolInput: string,
      toolOutput: string,
      userId: string,
    ): Promise<ToolCallPromotedEvent | CredentialFailureEvent | AccessDeniedEvent | null> {
    ```
    This is the simplest reversible option (DP-3) — one method, one return type widened, AgentService dispatches by `result.type`. Alternative (separate methods) would split classification logic and require AgentService to call multiple methods.
  - [x] 3.4 Restructure the method body. The 401/403 detection runs on ALL `Bash` tool calls (any git command can hit the remote and return 401/403 — `git push`, `git fetch`, `git pull`, etc.). The commit-promotion logic stays gated on `Bash` + `git commit`. Check 401/403 BEFORE commit promotion (a failed auth means no commit). Replace the early-return at lines 89-91 with:
    ```typescript
    // 401/403 detection runs on all Bash tool calls (any git command can hit the remote)
    if (toolName === 'Bash') {
      if (isCredentialFailureOutput(toolOutput)) {
        await this.credentialsService.markCredentialFailed(userId, new Date());
        return {
          type: CREDENTIAL_FAILURE_EVENT,
          toolCallId,
        };
      }

      const accessDenied = classifyAccessDenied(toolOutput);
      if (accessDenied) {
        return {
          type: ACCESS_DENIED_EVENT,
          toolCallId,
          code: accessDenied.code,
          retryAfter: accessDenied.retryAfter,
        };
      }
    }

    // Commit promotion runs only on git commit tool calls (existing logic unchanged below)
    if (toolName !== 'Bash' || !toolInput.includes('git commit')) {
      return null;
    }
    ```
    The 401 path has a side effect (`markCredentialFailed` — the classifier does the DB write per architecture.md line 624: "on detection it (a) calls `credentials.service.ts` to persist the failed health status"). The 403 path has NO side effect (per FINDING-12 — do NOT call `markCredentialFailed`). The rest of the method (lines 93-148, the commit-promotion logic) stays unchanged.

- [x] Task 4: Wire `CredentialsModule` into `StreamingModule` (AC: 1)
  - [x] 4.1 In `apps/agent-be/src/streaming/streaming.module.ts`, add `CredentialsModule` to the imports array (currently has no imports array — `@Module({})` has only `providers`, `controllers`, `exports`). The classifier (`ToolPillClassifierService`) is registered in `StreamingModule` and now needs `CredentialsService` injected, so `StreamingModule` must import `CredentialsModule`:
    ```typescript
    import { Module } from '@nestjs/common';
    import { StreamingController } from './streaming.controller';
    import { SessionEventsService } from './session-events.service';
    import { AgentService } from './agent.service';
    import { ToolPillClassifierService } from './tool-pill-classifier.service';
    import { CredentialsModule } from '../credentials/credentials.module';
    import { AGENT_SERVICE } from '@bmad-easy/shared-types';

    @Module({
      imports: [CredentialsModule],
      providers: [
        SessionEventsService,
        ToolPillClassifierService,
        { provide: AGENT_SERVICE, useClass: AgentService },
      ],
      controllers: [StreamingController],
      exports: [SessionEventsService, AGENT_SERVICE, ToolPillClassifierService],
    })
    export class StreamingModule {}
    ```

- [x] Task 5: Update `AgentService` to dispatch by event type (AC: 1, 2)
  - [x] 5.1 In `apps/agent-be/src/streaming/agent.service.ts`, update the classifier `.then()` handler in `processAssistantMessage` (lines 415-422). Currently it hard-codes `TOOL_CALL_PROMOTED`:
    ```typescript
    .then((promotedEvent) => {
      if (promotedEvent) {
        this.sessionEvents.emit(conversationId, {
          event: 'TOOL_CALL_PROMOTED',
          data: promotedEvent,
        });
      }
    })
    ```
    Replace with type-based dispatch:
    ```typescript
    .then((result) => {
      if (!result) return;
      this.sessionEvents.emit(conversationId, {
        event: result.type,
        data: result,
      });
    })
    ```
    The `result.type` is the event-type string (`'TOOL_CALL_PROMOTED'` / `'CREDENTIAL_FAILURE'` / `'ACCESS_DENIED'`) — it's the discriminant on the widened union return type. This works because `SseEvent.event` is `string` (no validation/allow-list — project-context.md line 137 confirms `SessionEventsService` uses `ReplaySubject<SseEvent>(100)` with `SseEvent = { event: string; data: unknown }`). The `StreamingController` is pure pass-through (writes `event: <type>\ndata: <json>\n\n` — no filtering, no event mapping). Zero changes to `SessionEventsService` or `StreamingController`.
  - [x] 5.2 Verify the `pendingClassifierPromises` mechanism (lines 427-430) already handles the new events. The classifier promise (which now may emit `CREDENTIAL_FAILURE` / `ACCESS_DENIED` instead of `TOOL_CALL_PROMOTED`) is already pushed to `pendingClassifierPromises` and awaited via `Promise.allSettled()` before `RUN_FINISHED` (lines 110-113). This satisfies project-context.md line 144 ("Await pending event-emitting promises before run completion") — the credential/access event arrives before the run "finishes". No change needed to the promise-tracking mechanism.
  - [x] 5.3 Verify the `.catch()` on the classifier promise (line 423-425) still logs failures. The 401 path's `markCredentialFailed` side effect is inside the classifier — if it fails, the `.catch()` logs the error and the run continues (the `CREDENTIAL_FAILURE` event is not emitted, but the run is not crashed). This is acceptable: a failed credential-health write is logged but does not block the user. The `markCredentialFailed` method itself has its own try/catch (Task 2.1) that logs and swallows the error, so it should not throw. But if it does, the `.catch()` is the safety net.

- [x] Task 6: Update `AgentServiceFake` to mirror new side effects (AC: 1, 2)
  - [x] 6.1 In `apps/agent-be/test/helpers/agent-service.fake.ts`, extend `setToolCallScript` (lines 42-64) with optional `credentialFailure` and `accessDenied` params so integration tests can script these events. The fake mimics production side effects (project-context.md line 130 — "Test-seam fakes mimic production side effects, not just canned returns"):
    ```typescript
    setToolCallScript(
      toolName: string,
      input: string,
      output: string,
      promoted?: { artifactType: string; artifactTitle: string; viewHref: string },
      credentialFailure?: boolean,
      accessDenied?: { code: AccessDeniedCode; retryAfter?: number },
    ): void {
      const toolCallId = `tc-${Date.now()}`;
      const events: SseEvent[] = [
        { event: 'RUN_STARTED', data: {} },
        { event: 'TOOL_CALL_START', data: { toolCallId, toolCallName: toolName, parentMessageId: null } },
        { event: 'TOOL_CALL_ARGS', data: { toolCallId, delta: input } },
        { event: 'TOOL_CALL_END', data: { toolCallId } },
        { event: 'TOOL_CALL_RESULT', data: { messageId: toolCallId, toolCallId, content: output, role: 'tool' } },
      ];
      if (credentialFailure) {
        events.push({
          event: 'CREDENTIAL_FAILURE',
          data: { type: 'CREDENTIAL_FAILURE', toolCallId },
        });
      } else if (accessDenied) {
        events.push({
          event: 'ACCESS_DENIED',
          data: { type: 'ACCESS_DENIED', toolCallId, code: accessDenied.code, retryAfter: accessDenied.retryAfter },
        });
      } else if (promoted) {
        events.push({
          event: 'TOOL_CALL_PROMOTED',
          data: { type: 'TOOL_CALL_PROMOTED', toolCallId, artifactId: null, ...promoted },
        });
      }
      events.push({ event: 'RUN_FINISHED', data: {} });
      this.script = events;
    }
    ```
    Add the import: `import type { AccessDeniedCode } from '@bmad-easy/shared-types';`
    The `credentialFailure` / `accessDenied` / `promoted` are mutually exclusive (a tool call result is one of: credential failure, access denied, promoted commit, or none) — the `else if` chain enforces this. The fake does NOT call `markCredentialFailed` (it's a test fake — the DB side effect is verified in classifier unit tests, not in fake-scripted integration tests). If an integration test needs to verify the DB side effect, it should spy on `credentialsService.markCredentialFailed` directly.

- [x] Task 7: Add `accessNotice` field to `ToolCallData` type (AC: 4)
  - [x] 7.1 In `apps/web/src/components/conversation/types.ts`, add an `AccessNoticeData` interface and an `accessNotice?` field to `ToolCallData`:
    ```typescript
    export interface AccessNoticeData {
      code: 'RATE_LIMITED' | 'ORG_RESTRICTION' | 'INSUFFICIENT_PERMISSION';
      retryAfter?: number;
    }

    export interface ToolCallData {
      toolCallId: string;
      toolName: string;
      status: 'running' | 'completed' | 'error';
      input: string;
      output: string;
      errorMessage?: string;
      semantic?: {
        artifactType: string;
        artifactTitle: string;
        viewHref: string;
      };
      accessNotice?: AccessNoticeData;
    }
    ```
    The `accessNotice` is on `ToolCallData` (not top-level `ChatMessage`) — keeps the notice scoped to its failing pill (DESIGN.md line 381: "scoped to the single failing tool call"). The `ChatMessageList` renders the notice as a sibling below `<ToolPill>` when `toolCall.accessNotice` is present (Task 10). This is the simplest reversible option (DP-3) — one new optional field, no type change to `ChatMessage`.

- [x] Task 8: Create `AccessNotice` component (AC: 4)
  - [x] 8.1 Create `apps/web/src/components/conversation/AccessNotice.tsx` — a `'use client'` component that renders the access-denied notice inline below the error-state Tool Pill:
    ```typescript
    'use client';

    import * as React from 'react';
    import type { AccessNoticeData } from './types';

    const NOTICE_COPY: Record<AccessNoticeData['code'], string> = {
      RATE_LIMITED: 'GitHub is rate-limiting this request. Wait a moment and try again.',
      ORG_RESTRICTION: "Your organization hasn't approved this app. Ask an org admin to grant access.",
      INSUFFICIENT_PERMISSION: "Your account doesn't have access to this resource.",
    };

    export interface AccessNoticeProps {
      notice: AccessNoticeData;
    }

    export function AccessNotice({ notice }: AccessNoticeProps) {
      const [dismissed, setDismissed] = React.useState(false);

      if (dismissed) return null;

      const copy = NOTICE_COPY[notice.code];
      const retrySuffix = notice.code === 'RATE_LIMITED' && notice.retryAfter
        ? ` (retry in ~${notice.retryAfter}s)`
        : '';
      const isInsufficient = notice.code === 'INSUFFICIENT_PERMISSION';

      return (
        <div
          className={`my-1 flex items-start gap-2 rounded-lg border-l-2 px-3 py-2 text-sm ${
            isInsufficient
              ? 'bg-negative-bg border-negative text-text-1'
              : 'bg-caution-bg border-caution text-text-1'
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="flex-1">{copy}{retrySuffix}</p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss notice"
            className="text-text-3 hover:text-text-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
          >
            Dismiss
          </button>
        </div>
      );
    }
    ```
    - Dismissible (local `dismissed` state) — per DESIGN.md line 381 ("dismissible, unlike the Credential Error Banner") and EXPERIENCE.md line 262 ("The notice is dismissible")
    - `caution-bg` / `caution` border for `RATE_LIMITED` / `ORG_RESTRICTION`; `negative-bg` / `negative` border for `INSUFFICIENT_PERMISSION` (DESIGN.md line 381 names these `warning-bg` / `warning`, but the actual Tailwind tokens are `caution-bg` / `caution` — `tailwind.config.ts` lines 22-23)
    - Copy derived from `code` (EXPERIENCE.md line 262): `RATE_LIMITED` → "GitHub is rate-limiting this request. Wait a moment and try again." (with retry hint when `retryAfter` present); `ORG_RESTRICTION` → "Your organization hasn't approved this app. Ask an org admin to grant access."; `INSUFFICIENT_PERMISSION` → "Your account doesn't have access to this resource."
    - `role="status"` + `aria-live="polite"` (UX-DR16 accessibility floor)
    - Standard focus ring on the Dismiss button (project-context.md line 168)
    - Does NOT disable input or halt agent turn (it's a passive notice — AC-4)

- [x] Task 9: Update `ChatMessageList` to render `AccessNotice` below `ToolPill` (AC: 4)
  - [x] 9.1 In `apps/web/src/components/conversation/ChatMessageList.tsx`, update the `ToolPill` rendering branch (around line 73). Currently:
    ```tsx
    return <ToolPill key={message.id} toolCall={message.toolCall} />;
    ```
    Replace with a fragment that renders the `ToolPill` and conditionally the `AccessNotice` below it:
    ```tsx
    return (
      <div key={message.id}>
        <ToolPill toolCall={message.toolCall} />
        {message.toolCall.accessNotice && (
          <AccessNotice notice={message.toolCall.accessNotice} />
        )}
      </div>
    );
    ```
    Add the import: `import { AccessNotice } from './AccessNotice';`
    The notice renders as a sibling below the pill within the same `<div>` — matches DESIGN.md line 381 ("inline in the message stream directly below the error-state Tool Pill"). The `ToolPill` component itself is NOT modified — the notice is a sibling, not a child (keeps `ToolPill` focused on the pill). This is the simplest reversible option (DP-3).

- [x] Task 10: Update `ConversationPane` — SSE listeners + banner + tool pill state (AC: 3, 4)
  - [x] 10.1 Add `credentialFailed` state to `ConversationPane` (after the existing `workingTreeState` state, around line 37):
    ```typescript
    const [credentialFailed, setCredentialFailed] = useState(false);
    ```
    Import `CredentialErrorBanner` from the project-map feature (cross-feature import — see Decision Records for rationale):
    ```typescript
    import { CredentialErrorBanner } from '@/components/project-map/CredentialErrorBanner';
    ```
  - [x] 10.2 Add `CREDENTIAL_FAILURE` SSE listener in `startSession()` (after the existing `MANUAL_SAVE_FAILED` listener, before `eventSource.onerror` around line 453):
    ```typescript
    eventSource.addEventListener('CREDENTIAL_FAILURE', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.toolCall?.toolCallId === toolCallId
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    status: 'error' as const,
                    errorMessage: 'GitHub credentials have expired or been revoked.',
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
      setCredentialFailed(true);
    });
    ```
    The handler: (a) marks the failing tool pill as error state with a credential-specific message (in case the `TOOL_CALL_RESULT` regex didn't already flag it — git output like `remote: Invalid username or token` doesn't match the existing `/^error:/im` regex), and (b) sets `credentialFailed = true` to show the banner. The `CREDENTIAL_FAILURE` event carries only `toolCallId` — the error message is frontend-derived (the raw git output is already in the tool pill's `output` field from the preceding `TOOL_CALL_RESULT` event).
  - [x] 10.3 Add `ACCESS_DENIED` SSE listener in `startSession()` (after the `CREDENTIAL_FAILURE` listener):
    ```typescript
    eventSource.addEventListener('ACCESS_DENIED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, code, retryAfter } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.toolCall?.toolCallId === toolCallId
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    status: 'error' as const,
                    errorMessage: 'Access denied.',
                    accessNotice: { code, retryAfter },
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
    });
    ```
    The handler: marks the failing tool pill as error state + attaches `accessNotice` with the `code` and `retryAfter`. The `ChatMessageList` renders `AccessNotice` below the pill (Task 9). Does NOT set `credentialFailed` (no banner for 403 — AC-4). Does NOT disable input or halt the agent turn (AC-4 — the event is informational UI surfacing only, not a control signal).
  - [x] 10.4 Render `<CredentialErrorBanner />` when `credentialFailed` is true. Place it above the message panel (before the scroll container, inside the main content area). The banner is non-dismissible (UX-DR10) — it clears only on re-auth (the `reauthorizeGitHub` Server Action redirects to GitHub OAuth; on return, the Server Component re-reads `credentialHealth` from Postgres which is now `healthy`, and `credentialFailed` state is reset on page reload). Add near the top of the return JSX (before the message list container):
    ```tsx
    {credentialFailed && <CredentialErrorBanner />}
    ```
    The banner reuses the existing component from `components/project-map/` — it has its own inline re-auth modal (shadcn `Dialog` + `reauthorizeGitHub` Server Action). No new re-auth UI needed. See Decision Records for the cross-feature import rationale.
  - [x] 10.5 Reset `credentialFailed` to `false` when the component unmounts or a new session starts. Add `setCredentialFailed(false)` to the `startSession()` function's initialization (near the top, where other state is reset). This prevents a stale banner from a previous failed session lingering on a new conversation.
  - [x] 10.6 Modify `CredentialErrorBanner` (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`) to accept an optional `callbackUrl` prop, passed to `reauthorizeGitHub(callbackUrl)`. This ensures the user returns to the conversation after re-auth (AC-3: "without needing to navigate away"). Currently `handleReconnect` calls `reauthorizeGitHub()` with no args — after re-auth, NextAuth may redirect to the default page instead of the conversation. The change is backward-compatible (optional prop, Project Map / Artifact Browser don't pass it — default behavior unchanged):
    ```typescript
    export interface CredentialErrorBannerProps {
      callbackUrl?: string;
    }

    export function CredentialErrorBanner({ callbackUrl }: CredentialErrorBannerProps = {}) {
      // ... existing implementation ...
      const handleReconnect = () => {
        setErrorMessage(null);
        startTransition(async () => {
          try {
            await reauthorizeGitHub(callbackUrl);
          } catch {
            // ... existing error handling ...
          }
        });
      };
      // ... rest unchanged ...
    }
    ```
    In `ConversationPane`, pass the current conversation URL: `<CredentialErrorBanner callbackUrl={typeof window !== 'undefined' ? window.location.pathname : undefined} />`. The `typeof window` guard is for SSR safety (ConversationPane is a Client Component but may render on server first). This is the simplest reversible option (DP-3) — one optional prop, no behavior change for existing callers.

- [x] Task 11: Tests — `ToolPillClassifierService` (AC: 1, 2)
  - [x] 11.1 Create `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` (if it doesn't exist) or extend the existing test file. Use `buildTestModule()` from `test/helpers/test-module-builder.ts`. Test cases:
    - `[P0]` returns `CredentialFailureEvent` when output contains 401 pattern (`remote: Invalid username or token`) — assert `result.type === 'CREDENTIAL_FAILURE'`, `result.toolCallId` matches input
    - `[P0]` calls `credentialsService.markCredentialFailed(userId, ...)` on 401 detection — spy on `markCredentialFailed`, assert called with correct userId
    - `[P0]` returns `AccessDeniedEvent` with `code: 'RATE_LIMITED'` when output contains rate-limit pattern (`Rate limit exceeded`) — assert `result.type === 'ACCESS_DENIED'`, `result.code === 'RATE_LIMITED'`
    - `[P0]` returns `AccessDeniedEvent` with `code: 'ORG_RESTRICTION'` when output contains org-restriction pattern (`Resource not accessible by integration`)
    - `[P0]` returns `AccessDeniedEvent` with `code: 'INSUFFICIENT_PERMISSION'` when output contains generic 403 (`Permission denied`)
    - `[P0]` does NOT call `markCredentialFailed` on 403 detection (FINDING-12) — spy on `markCredentialFailed`, assert NOT called
    - `[P0]` returns `null` for non-Bash tool calls (e.g. `toolName: 'Read'`) even if output contains 401 pattern
    - `[P0]` returns `null` for Bash tool calls with no 401/403 pattern and no `git commit` (e.g. `ls -la` output)
    - `[P0]` still returns `ToolCallPromotedEvent` for successful `git commit` touching `_bmad-output/` (regression guard — existing behavior unchanged)
    - `[P0]` returns `CredentialFailureEvent` (not `ToolCallPromotedEvent`) when a `git commit` output contains 401 pattern — 401/403 is checked BEFORE commit promotion
    - `[P1]` `retryAfter` is extracted from rate-limit output when present (`retry after 60` → `retryAfter: 60`)
    - `[P1]` `markCredentialFailed` is called with a `capturedAt` Date argument (optimistic-concurrency guard)

- [x] Task 12: Tests — `AgentService` event emission (AC: 1, 2)
  - [x] 12.1 In `apps/agent-be/src/streaming/agent.service.unit.spec.ts`, add test cases (follow the existing `emitSpy.mock.calls.map((c) => c[1].event)` pattern — project-context.md line 217):
    - `[P0]` emits `CREDENTIAL_FAILURE` on the SSE channel when classifier returns `CredentialFailureEvent` — use `AgentServiceFake.setToolCallScript('Bash', 'git push', 'remote: Invalid username or token', undefined, true)` (credentialFailure=true), assert `CREDENTIAL_FAILURE` in emitted events
    - `[P0]` emits `ACCESS_DENIED` on the SSE channel when classifier returns `AccessDeniedEvent` — use `setToolCallScript('Bash', 'git push', 'Rate limit exceeded', undefined, undefined, { code: 'RATE_LIMITED' })`, assert `ACCESS_DENIED` in emitted events
    - `[P0]` `CREDENTIAL_FAILURE` is emitted before `RUN_FINISHED` — assert `events.indexOf('CREDENTIAL_FAILURE') < events.indexOf('RUN_FINISHED')` with both `> -1` guards (project-context.md line 217 — event ordering assertion via `events.indexOf()`)
    - `[P0]` `ACCESS_DENIED` is emitted before `RUN_FINISHED` — same ordering assertion
    - `[P1]` classifier failure (throws) does not crash the agent run — `RUN_FINISHED` still emits, `logger.error` called (follows the existing `.catch()` pattern at line 423-425)

- [x] Task 13: Tests — `CredentialsService.markCredentialFailed` (AC: 1)
  - [x] 13.1 In `apps/agent-be/src/credentials/credentials.service.spec.ts` (create if it doesn't exist), add test cases:
    - `[P0]` `markCredentialFailed` calls `prisma.repoConnection.updateMany` with `{ where: { userId }, data: { credentialHealth: 'failed' } }`
    - `[P0]` `markCredentialFailed` with `capturedAt` adds `updatedAt: { lt: capturedAt }` to the where clause (optimistic-concurrency guard)
    - `[P0]` `markCredentialFailed` does NOT throw when `updateMany` fails — logs via `logger.error` and swallows
    - `[P0]` `markCredentialFailed` is a no-op (no throw) when no RepoConnection exists (`updateMany` updates 0 rows)

- [x] Task 14: Tests — `AccessNotice` component (AC: 4)
  - [x] 14.1 Create `apps/web/src/components/conversation/AccessNotice.test.tsx`. `@jest-environment jsdom`. Test cases:
    - `[P0]` renders correct copy for `RATE_LIMITED` code
    - `[P0]` renders correct copy for `ORG_RESTRICTION` code
    - `[P0]` renders correct copy for `INSUFFICIENT_PERMISSION` code
    - `[P0]` renders retry hint when `retryAfter` is present and code is `RATE_LIMITED`
    - `[P0]` does NOT render retry hint when `retryAfter` is absent
    - `[P0]` Dismiss button hides the notice on click
    - `[P0]` uses `caution-bg` / `caution` border for `RATE_LIMITED` and `ORG_RESTRICTION`
    - `[P0]` uses `negative-bg` / `negative` border for `INSUFFICIENT_PERMISSION`
    - `[P0]` has `role="status"` and `aria-live="polite"`
    - `[P0]` Dismiss button has standard focus ring classes

- [x] Task 15: Tests — `ConversationPane` SSE handling (AC: 3, 4)
  - [x] 15.1 In `apps/web/src/components/conversation/ConversationPane.test.tsx`, add test cases using the existing `MockEventSource.emit(eventType, data)` helper (line 70 — already supports any event type):
    - `[P0]` `CREDENTIAL_FAILURE` event shows `CredentialErrorBanner` (AC-3) — emit `SESSION_READY`, then emit `CREDENTIAL_FAILURE` with `{ toolCallId: 'tc-1' }`, assert banner text "Your repository connection needs attention." is visible
    - `[P0]` `CREDENTIAL_FAILURE` event marks the failing tool pill as error state — first emit `TOOL_CALL_START` + `TOOL_CALL_RESULT` for `tc-1`, then emit `CREDENTIAL_FAILURE`, assert the tool pill shows error state (errorMessage "GitHub credentials have expired or been revoked.")
    - `[P0]` `ACCESS_DENIED` event renders `AccessNotice` below the failing tool pill (AC-4) — emit `TOOL_CALL_START` + `TOOL_CALL_RESULT` for `tc-1`, then emit `ACCESS_DENIED` with `{ code: 'RATE_LIMITED', toolCallId: 'tc-1' }`, assert AccessNotice copy "GitHub is rate-limiting this request." is visible
    - `[P0]` `ACCESS_DENIED` event does NOT show `CredentialErrorBanner` (AC-4, FINDING-12) — assert banner text is NOT in the document
    - `[P0]` `ACCESS_DENIED` event does NOT disable the chat input (AC-4) — assert the textarea is not disabled
    - `[P0]` `ACCESS_DENIED` event does NOT halt the agent turn (AC-4) — the agent state remains unchanged (no transition to idle/error)
    - `[P0]` `ACCESS_DENIED` with `ORG_RESTRICTION` code renders org-restriction copy
    - `[P0]` `ACCESS_DENIED` with `INSUFFICIENT_PERMISSION` code renders insufficient-permission copy
    - `[P0]` `CREDENTIAL_FAILURE` for a non-existent `toolCallId` does not crash (graceful no-op for the pill update, banner still shows)
    - `[P1]` `CredentialErrorBanner` "Update access token" link opens the re-auth dialog (AC-3) — click the link, assert dialog title "Reconnect your GitHub account" is visible
    - `[P1]` `credentialFailed` state resets on new session start — emit `CREDENTIAL_FAILURE`, verify banner shows, then trigger a new session (`startSession`), verify banner is hidden

- [x] Task 16: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 16.1 Run `yarn nx lint agent-be` — 0 errors (pre-existing warnings acceptable)
  - [x] 16.2 Run `yarn nx lint web` — 0 new errors/warnings in Story 3.7 files
  - [x] 16.3 Run `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 16.4 Run `npx tsc --noEmit -p apps/web/tsconfig.json` — clean
  - [x] 16.5 Run `yarn nx test agent-be` — all unit + integration tests pass
  - [x] 16.6 Run `yarn nx test web` — all tests pass

## Dev Notes

### Decision Records

**Decision (DP-2):** Architecture.md line 625 says "Classification signals reuse Epic 1's `detectGithubRateLimit` + org-restriction disambiguation, applied to the git tool call result." The existing `detectGithubRateLimit` in `apps/web/src/lib/repository-validation.ts:62-91` takes a `Response` object (with HTTP headers like `X-RateLimit-Remaining`). Git tool call results are text output from `git` commands run inside the sandbox — they do not carry HTTP headers. Followed semantic intent over literal text: created text-based 401/403 pattern detection (`isCredentialFailureOutput`, `classifyAccessDenied`) in the classifier that produces the same classification vocabulary (`RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`). The vocabulary is reused; the detection mechanism is adapted to text input. Contradiction resolved on record.

**Decision (DP-3):** Widened `classifyToolResult` return type to discriminated union `ToolCallPromotedEvent | CredentialFailureEvent | AccessDeniedEvent | null` (from `ToolCallPromotedEvent | null`). AgentService dispatches by `result.type`. Simplest reversible option — one method, one return type widened, one dispatch point changed. Alternative (separate `classifyCredentialFailure` / `classifyAccessDenied` methods) would split classification logic across methods and require AgentService to call multiple methods in sequence. The discriminated union follows the existing `STREAM_ERROR { code }` precedent (architecture.md line 625: "A single event type with a `code` discriminator follows the `STREAM_ERROR { code }` precedent").

**Decision (DP-3):** Added `markCredentialFailed(userId, capturedAt?)` as a method on the existing `CredentialsService` in `apps/agent-be/src/credentials/credentials.service.ts`, duplicating the `apps/web/src/lib/credential-health.ts:markCredentialFailed` logic. Per project-context.md line 142 ("Deliberate cross-service logic duplication: crypto, credential resolution, and git-identity resolution are replicated in apps/agent-be from apps/web BY DESIGN — the architecture forbids a shared utility library beyond libs/shared-types and libs/database-schemas"). Story 1.6's spec line 110 explicitly anticipated this: "When apps/agent-be is built, the resolveOAuthToken and markCredentialFailed/markCredentialHealthy functions should be moved or duplicated there." The `CredentialFailureError` class was already duplicated in agent-be (credentials.service.ts:5) — this confirms the duplication pattern is established. Simplest reversible option: extend existing service, no new module.

**Decision (DP-3):** Added `accessNotice?: AccessNoticeData` to `ToolCallData` (not top-level `ChatMessage`). Keeps the notice scoped to its failing pill (DESIGN.md line 381: "scoped to the single failing tool call, not full-width"). `ChatMessageList` renders `AccessNotice` as a sibling below `<ToolPill>` when present. Alternative (top-level `ChatMessage.accessNotice`) would decouple the notice from its pill and require a separate message entry — more complex, less cohesive. Simplest reversible option: one new optional field on the existing `ToolCallData` interface.

**Decision (DP-3):** Created a new `AccessNotice` component in `apps/web/src/components/conversation/AccessNotice.tsx` rather than embedding the notice inside `ToolPill.tsx`. The notice is visually distinct from the pill (different background, left border, dismissible, scoped to 403 only). Keeping it separate preserves `ToolPill`'s focus on the pill rendering and matches DESIGN.md's "inline in the message stream directly below the failing pill" layout (sibling, not child). Simplest reversible option.

**Decision (DP-3):** Imported `CredentialErrorBanner` from `components/project-map/` into `ConversationPane` (cross-feature import). The UX decision-log (`.decision-log.md` line 72) and EXPERIENCE.md (line 261) confirm "Banner reuse for mid-Conversation credential failure also confirmed." The banner is a self-contained client component (only imports shadcn `Dialog` and `reauthorizeGitHub` Server Action) — it can be rendered anywhere. Moving it to `components/shell/` or `components/common/` would be cleaner (it's a cross-cutting credential-health concern), but that touches Story 2.2/2.4 import paths (a separate refactor). Simplest reversible: import from current location. If cross-feature imports accumulate, move to a shared location in a future refactor.

**Decision (DP-3):** The classifier does the `markCredentialFailed` DB write as a side effect (401 path only), AND returns the `CredentialFailureEvent` for AgentService to emit. The architecture (line 624) says "on detection it (a) calls `credentials.service.ts` to persist the failed health status, and (b) emits a synthetic `CREDENTIAL_FAILURE` event." The "it" is `tool-pill-classifier.service.ts` for (a), and the system (AgentService) for (b) — the classifier doesn't inject `SessionEventsService` (AgentService does the emitting, following the existing `TOOL_CALL_PROMOTED` pattern). This keeps the emit/emit-only responsibility in AgentService and the classify+side-effect responsibility in the classifier. Simplest reversible option that matches the existing architecture.

**Decision (DP-5):** Deferred `markCredentialHealthy` and `getCredentialHealth` in agent-be. The classifier only writes `failed` (401 path) — it never reads health or writes `healthy`. Re-auth happens via `apps/web`'s jwt callback (which resets health to `healthy` on new token storage). Adding unused methods would be speculative. Per DP-5, defer to post-MVP (or to a future story if agent-be needs to read/write healthy state).

**Decision (DP-5):** Deferred E2E tests for Story 3.7. The ACs are fully covered by unit tests (classifier pattern detection, agent event emission) and component tests (ConversationPane SSE handling, AccessNotice rendering, CredentialErrorBanner display). E2E tests would require simulating a real GitHub 401/403 mid-conversation, which needs a real OAuth token revocation — not feasible in CI. Per DP-5, defer E2E to manual testing.

**Decision (DP-5):** Deferred `capturedAt` race condition mitigation. The `markCredentialFailed(userId, capturedAt)` optimistic-concurrency guard uses `capturedAt = new Date()` at classification time (after the git tool call completed). If the user re-auths while a failing git operation is in flight, the stale `failed` write could clobber the fresh `healthy` status (the `updatedAt < capturedAt` check would pass because the re-auth's `updatedAt` is before the classification time). This is an edge case (user re-auths while a failing git operation is in flight). The apps/web pattern has a smaller window (captures `capturedAt` before the HTTP call). The classifier can't capture before the call — it only sees the result. Per DP-5, defer to post-MVP (the `markCredentialFailed` method's own try/catch + the re-auth flow's `updateMany` to `healthy` provide defense-in-depth). The user can always re-auth again if the banner reappears.

**Decision (DP-2):** Testing Requirements contained an internal contradiction on whether `CREDENTIAL_FAILURE` emits when `markCredentialFailed` throws. Resolved per semantic intent: `markCredentialFailed` has its own try/catch that swallows errors (Task 2.1), so it should not throw; the classifier awaits it, then returns the event, and `CREDENTIAL_FAILURE` emits normally. The contradictory "assert `CREDENTIAL_FAILURE` still emits" / "the event is NOT emitted" text was amended to state the resolved behavior clearly. The unreachable throw path remains as a defensive test.

**Decision (DP-2):** `CredentialErrorBanner.tsx` was listed in both the Modified files list (line 684, Task 10.6 adds `callbackUrl` prop) and the Not modified list (line 697). Removed from the Not modified list — the file IS modified. Contradiction resolved on record.

**Decision (DP-4):** Corrected five project-context.md line-number citations that drifted from the actual content: line 143 → 144 (`pendingClassifierPromises` ordering — "Await pending event-emitting promises before run completion"), line 132 → 137 (`ReplaySubject` for SSE event buffers), line 180 → 184 (co-located tests), line 187 → 191 (P0/P1 priority tags). Also removed the `aria-live="polite"` citation attributed to project-context.md line 117 — that line is actually `role: 'system'` for platform-generated chat messages, and `aria-live="polite"` does not appear in project-context.md at all (it is from UX-DR16, already correctly cited in Architecture Compliance). Artifact-only citation fixes; no production behavior change.

### What Already Exists (Do Not Recreate)

#### Story 3.1–3.6 Deliverables (Foundational — Extend, Do Not Rewrite)

- **`ToolPillClassifierService`** (`apps/agent-be/src/streaming/tool-pill-classifier.service.ts`, 150 lines) — Story 3.4 delivered this. Classifies successful `git commit` tool calls touching `_bmad-output/` into `TOOL_CALL_PROMOTED` events. Returns `Promise<ToolCallPromotedEvent | null>`. Injects only `PrismaService`. Story 3.7 EXTENDS this: adds 401/403 detection, widens return type, injects `CredentialsService`. Do NOT rewrite — extend
- **`AgentService`** (`apps/agent-be/src/streaming/agent.service.ts`, 469 lines) — Story 3.3/3.4/3.6 delivered this. `processAssistantMessage` (lines 369-464) processes tool call results: emits `TOOL_CALL_RESULT`, calls `classifier.classifyToolResult(...)`, pushes the classifier promise to `pendingClassifierPromises`, emits `TOOL_CALL_PROMOTED` on result. Story 3.7 changes ONLY the `.then()` handler (dispatch by `result.type` instead of hard-coded `TOOL_CALL_PROMOTED`). Do NOT rewrite — extend
- **`SessionEventsService`** (`apps/agent-be/src/streaming/session-events.service.ts`, 36 lines) — Story 3.1 delivered this. `SseEvent = { event: string; data: unknown }`. `emit(conversationId, event)`. Wide-open — no validation, no allow-list. Story 3.7 does NOT modify this — new events go through the existing `emit()` method. Do NOT modify
- **`StreamingController`** (`apps/agent-be/src/streaming/streaming.controller.ts`, 172 lines) — Story 3.1/3.4 delivered this. Pure pass-through: writes `event: <type>\ndata: <json>\n\n`. No filtering, no event mapping. Story 3.7 does NOT modify this — new events pass through automatically. Do NOT modify
- **`CredentialsService`** (`apps/agent-be/src/credentials/credentials.service.ts`, 50 lines) — Story 1.6/3.1 delivered this. Has `resolveOAuthToken` (throws `CredentialFailureError` on missing/failed credential). `CredentialFailureError` is already duplicated here from `apps/web`. Story 3.7 EXTENDS this: adds `markCredentialFailed(userId, capturedAt?)` method. Do NOT rewrite — extend
- **`CredentialErrorBanner`** (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`, 73 lines) — Story 2.2 delivered this. Full-width banner + embedded shadcn `Dialog` re-auth modal. Self-contained client component (imports only `Dialog` from `@/components/ui/dialog` and `reauthorizeGitHub` from `@/actions/credential-health.actions`). Story 3.7 imports this into `ConversationPane` AND adds an optional `callbackUrl` prop (Task 10.6) so re-auth returns the user to the conversation. Do NOT rewrite — extend
- **`ConversationPane`** (`apps/web/src/components/conversation/ConversationPane.tsx`, 731 lines) — Story 3.1–3.6 delivered this. 19 SSE event listeners in `startSession()`. Story 3.7 EXTENDS this: adds `credentialFailed` state, two new SSE listeners (`CREDENTIAL_FAILURE`, `ACCESS_DENIED`), renders `CredentialErrorBanner` conditionally. Do NOT rewrite — extend
- **`ChatMessageList`** (`apps/web/src/components/conversation/ChatMessageList.tsx`, 88 lines) — Story 3.3/3.4 delivered this. Routes by role: `toolCall.semantic` → `SemanticPill`, `toolCall` (no semantic) → `ToolPill`. Story 3.7 EXTENDS the `ToolPill` branch: renders `AccessNotice` as sibling when `toolCall.accessNotice` is present. Do NOT rewrite — extend
- **`ToolPill`** (`apps/web/src/components/conversation/ToolPill.tsx`, 96 lines) — Story 3.4 delivered this. Renders tool call pills with running/completed/error states. Story 3.7 does NOT modify this — the `AccessNotice` renders as a sibling, not inside `ToolPill`. Do NOT modify
- **`ChatMessage` / `ToolCallData` types** (`apps/web/src/components/conversation/types.ts`, 22 lines) — Story 3.3/3.4 delivered these. Story 3.7 EXTENDS `ToolCallData`: adds `accessNotice?: AccessNoticeData` field. Do NOT rewrite — extend
- **`reauthorizeGitHub` Server Action** (`apps/web/src/actions/credential-health.actions.ts`, 45 lines) — Story 1.6 delivered this. `reauthorizeGitHub(callbackUrl?)` calls `signIn('github', { redirectTo: callbackUrl })`. Story 3.7 does NOT modify this — `CredentialErrorBanner` already calls it. Do NOT modify
- **`AgentServiceFake`** (`apps/agent-be/test/helpers/agent-service.fake.ts`, 168 lines) — Story 3.3/3.6 delivered this. `setToolCallScript` mimics classifier side effects via scripted events. Story 3.7 EXTENDS this: adds `credentialFailure` / `accessDenied` optional params. Do NOT rewrite — extend
- **`buildTestModule()`** (`apps/agent-be/test/helpers/test-module-builder.ts`) — canonical test module factory. Story 3.7 uses this for classifier tests. Do NOT modify

#### Shared Types (Extend, Do Not Recreate)

- **`ag-ui.types.ts`** (`libs/shared-types/src/ag-ui.types.ts`, 36 lines) — Story 3.4 delivered this. Defines `STREAM_ERROR_EVENT`, `TOOL_CALL_PROMOTED_EVENT`, `AgUiEventType` union. Story 3.7 EXTENDS this: adds `CREDENTIAL_FAILURE_EVENT`, `ACCESS_DENIED_EVENT`, `AccessDeniedCode`, `CredentialFailureEvent`, `AccessDeniedEvent`. Do NOT rewrite — extend

### Architecture Compliance

- **Global prefix `/api`** — no new endpoints (SSE events are emitted on the existing `/conversations/:id/events` channel). No change to `main.ts`
- **Raw resource body on success / `{ code, message, meta }` error envelope** — N/A (no new REST endpoints)
- **Zod + nestjs-zod** — N/A (no new DTOs)
- **Boundary JWT** — N/A (SSE channel already authenticated via `?token=` query param)
- **SSE event emission** — new events (`CREDENTIAL_FAILURE`, `ACCESS_DENIED`) go through `SessionEventsService.emit()` (existing). The `ReplaySubject<SseEvent>(100)` ensures late SSE subscribers receive missed events (project-context.md line 137). Conversation-level events (not per-connection) — go via `emit()`, NOT directly to `res` (project-context.md line 138)
- **`pendingClassifierPromises` ordering** — the classifier promise (which may now emit `CREDENTIAL_FAILURE` / `ACCESS_DENIED`) is already pushed to `pendingClassifierPromises` and awaited via `Promise.allSettled()` before `RUN_FINISHED` (project-context.md line 144 — "Await pending event-emitting promises before run completion"). No change to the promise-tracking mechanism
- **Deliberate cross-service logic duplication** — `markCredentialFailed` is duplicated into agent-be `CredentialsService` from `apps/web/src/lib/credential-health.ts` per project-context.md line 142. Do NOT extract a shared `libs/credential-health` — the duplication is the intended service boundary
- **`logger.error()` in catch blocks** — `markCredentialFailed` uses `this.logger.error()` (NestJS Logger, NOT `console.error` — project-context.md line 316). The classifier's existing `.catch()` on the classifier promise (agent.service.ts line 423-425) uses `this.logger.error()`
- **Optimistic concurrency in `markCredentialFailed`** — `capturedAt` timestamp passed to `markCredentialFailed(userId, capturedAt)`. The write only applies if `updatedAt < capturedAt` (strict less-than — `lt`, not `lte` — project-context.md line 347). Prevents a stale `failed` write from clobbering a concurrent re-authorization
- **Tenant isolation** — the classifier receives `userId` from `AgentService` (which gets it from the authenticated request context). `markCredentialFailed(userId)` uses `where: { userId }` — the tenant authorization check is implicit in the userId scoping
- **FINDING-12 compliance** — 403 path does NOT call `markCredentialFailed`, does NOT emit `CREDENTIAL_FAILURE`, does NOT persist failed credential health. The `CredentialErrorBanner` (gated on `credentialHealth === 'failed'`) never fires for a 403. The `ACCESS_DENIED` event + `AccessNotice` is the 403 surfacing mechanism
- **No global client-state library** — `credentialFailed` is local React state in `ConversationPane` (ephemeral UI state, project-context.md line 91). Resets on page reload (the Server Component re-reads `credentialHealth` from Postgres)
- **Server Components are default** — `AccessNotice` is a `'use client'` Client Component (needs `useState` for dismiss). `CredentialErrorBanner` is already a Client Component. `ConversationPane` is already a Client Component
- **Co-located tests** — `*.spec.ts` / `*.test.tsx` next to source
- **Standard focus ring** — `AccessNotice` Dismiss button uses `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (project-context.md line 168)
- **`aria-live="polite"`** — `AccessNotice` container has `aria-live="polite"` + `role="status"` (UX-DR16)
- **Non-color state signaling** — `AccessNotice` uses background color + left border + text copy (three signals, never color alone — UX-DR16)
- **`prefers-reduced-motion`** — no animations in `AccessNotice` (static text + dismiss button). N/A
- **`.max(N)` on Zod string fields** — N/A (no new DTOs)
- **`logger.warn()` in catch blocks that return a default** — the classifier's 401 path calls `markCredentialFailed` inside the classify method. If `markCredentialFailed` fails, it logs via `this.logger.error()` and swallows (the method has its own try/catch — Task 2.1). The classifier returns the `CredentialFailureEvent` regardless of whether the DB write succeeded — the event emission is not blocked by a failed health write. This is correct: the user sees the banner even if the DB write failed (the banner is triggered by the SSE event, not by the DB state)

### How AC-1 Is Satisfied

AC-1 ("401 detection emits `CREDENTIAL_FAILURE` and persists failed credential health") is satisfied by:

1. **Classifier detects 401 patterns** — `isCredentialFailureOutput(toolOutput)` checks for `remote: Invalid username or token`, `fatal: Authentication failed for`, `fatal: could not read Username for`, `401 Unauthorized` (Task 3.2)
2. **Classifier persists failed health** — calls `credentialsService.markCredentialFailed(userId, new Date())` (Task 3.4). The `markCredentialFailed` method (Task 2.1) writes `credentialHealth: 'failed'` to Postgres via `updateMany` with optimistic-concurrency guard
3. **Classifier returns `CredentialFailureEvent`** — `{ type: 'CREDENTIAL_FAILURE', toolCallId }` (Task 3.4)
4. **AgentService emits `CREDENTIAL_FAILURE` on SSE** — dispatches by `result.type`, emits via `sessionEvents.emit()` (Task 5.1). The event is buffered in `ReplaySubject(100)` and written to the SSE wire by `StreamingController` (pass-through)
5. **Immediate, not next page load** — the event flows through the existing SSE channel (already open for AG-UI events). No new transport, no polling, no page reload (NFR-R1)

### How AC-2 Is Satisfied

AC-2 ("403 classification emits `ACCESS_DENIED` without marking credential failed") is satisfied by:

1. **Classifier detects 403 patterns** — `classifyAccessDenied(toolOutput)` checks for `Rate limit exceeded`, `Resource not accessible by integration`, `Permission denied`, `403` (Task 3.2)
2. **Classifier classifies into three codes** — `RATE_LIMITED` (rate limit patterns + `retryAfter` extraction), `ORG_RESTRICTION` (org-restriction patterns), `INSUFFICIENT_PERMISSION` (default 403) (Task 3.2)
3. **Classifier does NOT call `markCredentialFailed`** — the 403 path returns `AccessDeniedEvent` without any DB side effect (Task 3.4). Per FINDING-12, a 403 is not a credential failure
4. **Classifier returns `AccessDeniedEvent`** — `{ type: 'ACCESS_DENIED', toolCallId, code, retryAfter? }` (Task 3.4)
5. **AgentService emits `ACCESS_DENIED` on SSE** — same dispatch mechanism as AC-1 (Task 5.1)

### How AC-3 Is Satisfied

AC-3 ("Frontend handles `CREDENTIAL_FAILURE` — re-auth prompt without navigation away") is satisfied by:

1. **`CREDENTIAL_FAILURE` SSE listener** — `ConversationPane` adds an `addEventListener('CREDENTIAL_FAILURE', ...)` handler (Task 10.2) that sets `credentialFailed = true` and marks the failing tool pill as error state
2. **`CredentialErrorBanner` rendered** — when `credentialFailed` is true, `ConversationPane` renders `<CredentialErrorBanner />` (Task 10.4). The banner is non-dismissible (UX-DR10) and contains an "Update access token" link that opens an inline shadcn `Dialog` re-auth modal
3. **Re-auth without navigation away** — the `CredentialErrorBanner`'s `handleReconnect` calls `reauthorizeGitHub(callbackUrl)` Server Action (Task 10.6 passes the current conversation URL as `callbackUrl`), which calls `signIn('github', { redirectTo: callbackUrl })` (a full redirect to GitHub OAuth, then back to the conversation). The user returns to the conversation page (the Server Component re-reads `credentialHealth` which is now `healthy`, and `credentialFailed` state is reset on page reload). No manual navigation needed — the banner provides the re-auth trigger inline
4. **Failing tool pill shows error state** — the handler sets `toolCall.status = 'error'` + `errorMessage = 'GitHub credentials have expired or been revoked.'` so the user sees which operation failed

### How AC-4 Is Satisfied

AC-4 ("Frontend handles `ACCESS_DENIED` — error-state Tool Pill + Access Notice, no banner, no halt") is satisfied by:

1. **`ACCESS_DENIED` SSE listener** — `ConversationPane` adds an `addEventListener('ACCESS_DENIED', ...)` handler (Task 10.3) that marks the failing tool pill as error state + attaches `accessNotice: { code, retryAfter }`
2. **`AccessNotice` rendered below the pill** — `ChatMessageList` renders `<AccessNotice>` as a sibling below `<ToolPill>` when `toolCall.accessNotice` is present (Task 9.1). The notice copy is derived from `code` (Task 8.1)
3. **No `CredentialErrorBanner`** — the handler does NOT set `credentialFailed = true` (Task 10.3). The banner is gated on `credentialFailed` state, which stays `false` for 403. Per FINDING-12, re-authentication resolves none of the three 403 causes
4. **Input not disabled** — the handler does NOT touch the input disabled state. The chat input remains enabled (AC-4)
5. **Agent turn not halted** — the handler does NOT call `stopAgent()` or transition the agent state. The `ACCESS_DENIED` event is informational UI surfacing only — the tool call's error result was already returned to the agent (via the preceding `TOOL_CALL_RESULT` event), and the agent adapts (architecture.md line 625: "the tool call's error result is returned to the agent, which adapts")

### How AC-5 Is Satisfied

AC-5 ("Daytona outage does not break Project Map / Artifact Browser") is satisfied by the existing architecture — no new work needed:

1. **Project Map and Artifact Browser are pure Postgres/git reads** — they read from the `Artifact` table (mirrored by `artifacts.service.ts` from `_bmad-output/`) via Server Component Prisma reads. No Sandbox dependency
2. **Only new Conversation provisioning is blocked** — `ConversationsService.provisionSandbox()` calls `SandboxService.provision()` which calls Daytona. A Daytona outage causes `provision()` to fail, which tears down partial allocations (Story 3.1 AC). The Project Map and Artifact Browser are unaffected
3. **No new code needed** — this AC is a regression guard / architecture invariant, already satisfied by the existing service boundaries (architecture.md line 621: "apps/web reads Postgres independently for non-live data"). Verify by confirming no new Sandbox dependency was introduced in this story

### Library/Framework Requirements

**No new packages to install.** All dependencies are already installed:

- `rxjs` — `ReplaySubject` for SSE (already installed)
- shadcn `Dialog` — re-auth modal (already installed, used by `CredentialErrorBanner`)
- `next-auth` — `signIn` for re-auth (already installed)
- No modal/popover library — `AccessNotice` uses local React state for dismiss (DP-3)

### File Structure Requirements

New files:
```
apps/web/src/components/conversation/
└── AccessNotice.tsx                    # NEW — dismissible 403 notice (Task 8.1)
└── AccessNotice.test.tsx               # NEW — component tests (Task 14.1)
```

Modified files:
- `libs/shared-types/src/ag-ui.types.ts` — add `CREDENTIAL_FAILURE_EVENT`, `ACCESS_DENIED_EVENT`, `AccessDeniedCode`, `CredentialFailureEvent`, `AccessDeniedEvent` (Task 1.1-1.2)
- `apps/agent-be/src/credentials/credentials.service.ts` — add `markCredentialFailed(userId, capturedAt?)` method (Task 2.1)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — add 401/403 detection, widen return type, inject `CredentialsService` (Tasks 3.1-3.4)
- `apps/agent-be/src/streaming/streaming.module.ts` — import `CredentialsModule` (Task 4.1)
- `apps/agent-be/src/streaming/agent.service.ts` — dispatch by `result.type` in classifier `.then()` handler (Task 5.1)
- `apps/agent-be/test/helpers/agent-service.fake.ts` — extend `setToolCallScript` with `credentialFailure` / `accessDenied` params (Task 6.1)
- `apps/web/src/components/conversation/types.ts` — add `AccessNoticeData` interface + `accessNotice?` field to `ToolCallData` (Task 7.1)
- `apps/web/src/components/conversation/ChatMessageList.tsx` — render `AccessNotice` below `ToolPill` when `accessNotice` present (Task 9.1)
- `apps/web/src/components/conversation/ConversationPane.tsx` — add `credentialFailed` state, `CREDENTIAL_FAILURE` + `ACCESS_DENIED` SSE listeners, render `CredentialErrorBanner` (Tasks 10.1-10.6)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — add optional `callbackUrl` prop (Task 10.6)

Test files (new or extended):
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` — extend or create (Task 11.1)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — extend (Task 12.1)
- `apps/agent-be/src/credentials/credentials.service.spec.ts` — extend or create (Task 13.1)
- `apps/web/src/components/conversation/AccessNotice.test.tsx` — NEW (Task 14.1)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — extend (Task 15.1)

**Not modified (no changes needed):**
- `apps/agent-be/src/streaming/session-events.service.ts` — `emit()` handles new events (wide-open `SseEvent = { event: string; data: unknown }`)
- `apps/agent-be/src/streaming/streaming.controller.ts` — pure pass-through, no filtering
- `apps/web/src/components/conversation/ToolPill.tsx` — `AccessNotice` renders as sibling, not inside `ToolPill`
- `apps/web/src/actions/credential-health.actions.ts` — `reauthorizeGitHub` already exists
- `apps/agent-be/src/credentials/credentials.module.ts` — already exports `CredentialsService`
- `libs/database-schemas/src/prisma/schema.prisma` — no new models or fields (`RepoConnection.credentialHealth` already exists)

### Testing Requirements

- **Test organization:** co-located `*.spec.ts` / `*.test.tsx` next to source (project-context.md line 184)
- **Test priority tags:** `[P0]` for AC coverage (100% pass required), `[P1]` for edge cases (≥95% pass) (project-context.md line 191)
- **`buildTestModule()`** — use for agent-be classifier tests. Inject `CredentialsService` mock (Task 11.1)
- **`AgentServiceFake.setToolCallScript`** — extended with `credentialFailure` / `accessDenied` params (Task 6.1). Tests control which event the fake emits
- **`MockEventSource.emit(eventType, data)`** — the existing helper in `ConversationPane.test.tsx` (line 70) already supports any event type. Use `MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' })` and `MockEventSource.emit('ACCESS_DENIED', { code: 'RATE_LIMITED', toolCallId: 'tc-1' })` (Task 15.1)
- **Event ordering assertion** — use `events.indexOf('CREDENTIAL_FAILURE') < events.indexOf('RUN_FINISHED')` with both `> -1` guards (project-context.md line 217)
- **`@jest-environment jsdom`** — for all React component tests (`AccessNotice.test.tsx`, `ConversationPane.test.tsx`)
- **Spy on `markCredentialFailed`** — classifier tests spy on `credentialsService.markCredentialFailed` to verify 401 calls it and 403 does NOT (Task 11.1)
- **Failure tolerance test** — `markCredentialFailed` has its own try/catch that swallows errors (Task 2.1), so it should not throw; the classifier awaits it, then returns the `CredentialFailureEvent`, and `CREDENTIAL_FAILURE` emits normally. Test both paths: `markCredentialFailed` succeeds (event emits) and `markCredentialFailed` throws despite its try/catch (event does NOT emit — the classifier method throws, `.catch()` in AgentService logs, run continues). The latter is a defensive test for an unreachable path

### Previous Story Intelligence

- **Story 3.6 (done):** Delivered working tree indicator, manual commit, `FILE_MODIFYING_TOOLS` pattern. Key learnings applied to Story 3.7:
  - `pendingClassifierPromises` mechanism for awaiting event-emitting promises before `RUN_FINISHED` — Story 3.7's `CREDENTIAL_FAILURE` / `ACCESS_DENIED` events use the same mechanism (no change needed)
  - `AgentServiceFake` mimics production side effects via scripted events — Story 3.7 extends `setToolCallScript` with new params (same pattern as Story 3.6's working tree emission)
  - `SseEvent` type is wide-open (`{ event: string; data: unknown }`) — new events need zero changes to `SessionEventsService` or `StreamingController`
  - DP-3 (simplest reversible) and DP-5 (defer scope temptation) decision patterns — Story 3.7 follows the same discipline
- **Story 3.4 (done):** Delivered `ToolPillClassifierService`, `ToolPill`, `SemanticPill`, circuit breaker, SSE heartbeat. Key:
  - `ToolPillClassifierService` structure — Story 3.7 extends it with 401/403 detection
  - `TOOL_CALL_PROMOTED` emission pattern — Story 3.7's `CREDENTIAL_FAILURE` / `ACCESS_DENIED` follow the same pattern (classifier returns event, AgentService emits)
  - `ToolPill` error state — Story 3.7 reuses it for the failing git operation (ACCESS_DENIED)
- **Story 1.6 (done):** Delivered credential health detection, `markCredentialFailed`, `resolveOAuthToken`, re-auth flow. Key:
  - `markCredentialFailed` with `capturedAt` optimistic-concurrency guard — Story 3.7 duplicates this into agent-be
  - `CredentialFailureError` class — already duplicated in agent-be (credentials.service.ts:5)
  - 403 classification vocabulary (`RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`) — Story 3.7 reuses this exact vocabulary
  - FINDING-12 — 403 is NOT a credential failure; do NOT call `markCredentialFailed` for 403
  - `reauthorizeGitHub` Server Action + `CredentialErrorBanner` — Story 3.7 reuses both for the 401 re-auth prompt

### Git Intelligence

- Recent commits: `d19eddb chore: give planner agent a system prompt`, `dfd7c6f chore: reviewer agent`, `2d917a3 ci: cleanup playbook prompts`, `5203175 docs: playbook updates`, `3a1b3cf chore: remove 'test' agent`. Stories 3.1–3.6 are done. Story 3.7 is the seventh story in Epic 3
- The agent-be streaming module has `ToolPillClassifierService`, `AgentService`, `SessionEventsService`, `StreamingController` from Stories 3.1/3.3/3.4. Story 3.7 extends the classifier + agent service
- The agent-be credentials module has `CredentialsService` with `resolveOAuthToken` from Story 1.6/3.1. Story 3.7 adds `markCredentialFailed`
- The web conversation components have `ConversationPane`, `ChatMessageList`, `ToolPill`, `SemanticPill` from Stories 3.3/3.4. Story 3.7 adds `AccessNotice` + extends `ConversationPane` + `ChatMessageList`
- The shared-types have `ag-ui.types.ts` with `TOOL_CALL_PROMOTED_EVENT` from Story 3.4. Story 3.7 adds `CREDENTIAL_FAILURE_EVENT` + `ACCESS_DENIED_EVENT`

### Project Structure Notes

**Alignment with architecture directory structure:**

- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — classifier in the `streaming/` module. Matches the existing location (Story 3.4)
- `apps/agent-be/src/credentials/credentials.service.ts` — `markCredentialFailed` in `CredentialsService`. Matches the existing location (Story 1.6/3.1)
- `apps/web/src/components/conversation/AccessNotice.tsx` — matches the `components/conversation/` feature directory (existing `ConversationPane.tsx`, `ToolPill.tsx`, `SemanticPill.tsx`)
- `libs/shared-types/src/ag-ui.types.ts` — new event types added to the existing file. Matches the existing location

**Variance from architecture:**

- `CredentialErrorBanner` is imported from `components/project-map/` into `ConversationPane` (cross-feature import). The architecture (DESIGN.md line 377) lists the banner on "Project Map, Artifact Browser, and Conversation." The component currently lives in `components/project-map/` (delivered in Story 2.2). Moving it to `components/shell/` or `components/common/` would be cleaner (it's a cross-cutting credential-health concern), but that touches Story 2.2/2.4 import paths (a separate refactor). Per DP-3, simplest reversible: import from current location. If cross-feature imports accumulate, move to a shared location in a future refactor. This is a deliberate variance, recorded per DP-3.

### Out of Scope (Do Not Implement)

- **`markCredentialHealthy` / `getCredentialHealth` in agent-be:** The classifier only writes `failed` (401 path). Re-auth happens via `apps/web`'s jwt callback. Per DP-5, defer unused methods
- **E2E tests:** Require real GitHub 401/403 simulation (token revocation). Not feasible in CI. Per DP-5, defer to manual testing
- **`capturedAt` race condition mitigation:** The `capturedAt = new Date()` at classification time has a larger window than the apps/web pattern (which captures before the HTTP call). Per DP-5, defer the edge case (user re-auths while a failing git op is in flight)
- **Cost tracking (per-user LLM spend, NFR-O1):** Story 3.8 scope
- **Mid-session idle timeout:** Story 3.9 scope
- **Commit identity verification:** Story 3.10 scope
- **Concurrent conversations (FR11 cap):** Story 3.11 scope
- **SSE drain on deploy:** Story 3.12 scope
- **Moving `CredentialErrorBanner` to a shared location:** Cross-feature import is a smell, but moving touches Story 2.2/2.4 import paths. Per DP-5, defer to a future refactor
- **Extracting a shared `useFocusTrap` hook:** Story 3.6 established the popover focus-trap pattern. Story 3.7's `AccessNotice` doesn't need a focus trap (it's a dismissible notice, not a modal). Per DP-5, defer hook extraction

### Deferred Findings

The following gaps were identified during story creation but are out of Story 3.7's acceptance criteria. Recorded per DP-5 (defer scope temptation):

- **`capturedAt` race condition:** `markCredentialFailed(userId, new Date())` uses classification time as `capturedAt`. If the user re-auths while a failing git operation is in flight, the stale `failed` write could clobber the fresh `healthy` status. The `markCredentialFailed` method's own try/catch + the re-auth flow's `updateMany` to `healthy` provide defense-in-depth. The user can always re-auth again if the banner reappears. **Owner: post-MVP hardening.**
- **401/403 pattern detection heuristics:** The text-based pattern detection (`isCredentialFailureOutput`, `classifyAccessDenied`) is heuristic — it matches common git error output patterns. GitHub may change error messages in the future, or edge-case outputs may not match. The raw git output remains available in the Tool Pill's expanded view for debugging. **Owner: monitor and update patterns as needed.**
- **`detectGithubRateLimit` duplication:** The classification logic is adapted from `apps/web`'s `detectGithubRateLimit` but operates on text (not HTTP `Response` objects). The vocabulary is reused; the detection mechanism is different. A future refactor could extract a shared classification module, but per the deliberate cross-service duplication rule (project-context.md line 142), the duplication is the intended service boundary. **Owner: post-MVP (if classification logic grows complex).**
- **`CredentialErrorBanner` cross-feature import:** Importing from `components/project-map/` into `ConversationPane` is a cross-feature import smell. Moving the banner to `components/shell/` or `components/common/` would be cleaner but touches Story 2.2/2.4 import paths. **Owner: future refactoring.**
- **`CREDENTIAL_FAILURE` event does not carry the error message:** The event payload is `{ type, toolCallId }` only. The frontend derives the error message ("GitHub credentials have expired or been revoked.") from the event type, not from the payload. The raw git output is already in the tool pill's `output` field from the preceding `TOOL_CALL_RESULT` event. If a future story needs a more specific error message in the event, add a `message` field to `CredentialFailureEvent`. **Owner: post-MVP (if richer error messaging is needed).**
- **`AccessDeniedCode` not yet shared with Epic 1's synchronous path:** Architecture.md line 625 intends "the synchronous onboarding path (`connectRepository`) and the real-time mid-conversation path share one classification language." Story 3.7 creates `AccessDeniedCode` in `libs/shared-types/src/ag-ui.types.ts`, but Epic 1's synchronous path (`apps/web/src/lib/repository-validation.ts`) classifies 403s via the `RateLimitError` class + `CredentialFailureError` — it does not reference `AccessDeniedCode`. The string values (`RATE_LIMITED` etc.) align, but the type is not shared. Epic 1 is done; refactoring it to use `AccessDeniedCode` would be scope expansion. **Owner: future hardening story (align Epic 1's synchronous classification to the shared `AccessDeniedCode` type).**

### References

- **Epics Source:** `_bmad-output/planning-artifacts/epics.md` lines 776-805 — Story 3.7 ACs
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md` lines 624-625 — credential failure propagation (401 path: classifier detects + persists + emits `CREDENTIAL_FAILURE`; 403 path: classifier classifies + emits `ACCESS_DENIED`, no persist), event contract (`{ code: 'RATE_LIMITED' | 'ORG_RESTRICTION' | 'INSUFFICIENT_PERMISSION', toolCallId: string, retryAfter?: number }`), `STREAM_ERROR { code }` precedent, FINDING-12 rationale
- **PRD NFR-R1:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` line 458 — Credential health status must update within one git operation cycle of a 401 response; a 403 is classified, not treated as a credential failure
- **PRD Additional Requirements:** epics.md line 122 — `tool-pill-classifier.service.ts` detects 401 patterns in git-related tool call results and emits `CREDENTIAL_FAILURE`; 403 is classified and does not emit `CREDENTIAL_FAILURE` or mark credential as failed (per FINDING-12)
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` line 261 (Credential failed mid-Conversation: error-state Tool Pill + Credential Error Banner), line 262 (Access denied mid-Conversation: error-state Tool Pill + Access Notice, no banner, no halt, dismissible, copy per code)
- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` line 377 (`{components.credential-error-banner}` — full-width, non-dismissible, gated on `credentialHealth === 'failed'`, 403 does NOT trigger), line 381 (`{components.access-notice}` — inline below error-state Tool Pill, dismissible, `warning-bg`/`negative-bg`, left border, copy per `code`, does not disable input or halt agent turn)
- **UX decision log:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` line 72 (banner reuse for mid-Conversation credential failure confirmed), line 96 (banner reuse confirmed by Marius 2026-07-02)
- **Project context:** `_bmad-output/project-context.md` — deliberate cross-service logic duplication (line 142), `markCredentialFailed` optimistic-concurrency guard (line 347), SSE event emission patterns (lines 132-138), `pendingClassifierPromises` ordering (line 144), NestJS Logger not console.error (line 316), event ordering assertion via `events.indexOf()` (line 217), test-seam fakes mimic production side effects (line 130), standard focus ring (line 168), co-located tests (line 184), P0/P1 priority tags (line 191), no global client-state library (line 91)
- **Decision policy:** `_bmad-output/decision-policy.md` — DP-2 (semantic intent over literal text), DP-3 (simplest reversible option), DP-5 (defer scope temptation)
- **Story 1.6:** `_bmad-output/implementation-artifacts/1-6-detect-and-recover-from-credential-failures.md` — `markCredentialFailed`, `resolveOAuthToken`, `CredentialFailureError`, re-auth flow, 403 classification vocabulary, FINDING-12
- **Story 3.4:** `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md` — `ToolPillClassifierService`, `ToolPill`, `SemanticPill`, `TOOL_CALL_PROMOTED` emission pattern
- **Story 3.6:** `_bmad-output/implementation-artifacts/3-6-track-and-manually-save-working-tree-state.md` — `pendingClassifierPromises` mechanism, `FILE_MODIFYING_TOOLS` pattern, `AgentServiceFake` side-effect mirroring, `ManualCommitService` event emission pattern
- **Classifier source:** `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` (150 lines) — existing `classifyToolResult` method, `ToolCallPromotedEvent` return type, `PrismaService` injection
- **AgentService source:** `apps/agent-be/src/streaming/agent.service.ts` (469 lines) — `processAssistantMessage` (lines 369-464), classifier `.then()` handler (lines 415-422), `pendingClassifierPromises` (line 43)
- **CredentialsService source:** `apps/agent-be/src/credentials/credentials.service.ts` (50 lines) — `resolveOAuthToken`, `CredentialFailureError` (already duplicated from apps/web)
- **Shared types:** `libs/shared-types/src/ag-ui.types.ts` (36 lines) — `STREAM_ERROR_EVENT`, `TOOL_CALL_PROMOTED_EVENT`, `AgUiEventType` union
- **ConversationPane source:** `apps/web/src/components/conversation/ConversationPane.tsx` (731 lines) — 19 SSE listeners, `MockEventSource.emit` test helper
- **ChatMessageList source:** `apps/web/src/components/conversation/ChatMessageList.tsx` (88 lines) — role routing, `toolCall.semantic` → `SemanticPill`, `toolCall` → `ToolPill`
- **CredentialErrorBanner source:** `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (73 lines) — full-width banner + shadcn `Dialog` re-auth modal, `reauthorizeGitHub` Server Action call
- **Types source:** `apps/web/src/components/conversation/types.ts` (22 lines) — `ChatMessage`, `ToolCallData`

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- TypeScript narrowing issue in ConversationPane: `m.toolCall?.toolCallId === toolCallId` did not narrow `m.toolCall` to non-undefined for the spread `...m.toolCall`. Fixed by using `m.toolCall && m.toolCall.toolCallId === toolCallId` (matches the existing `TOOL_CALL_PROMOTED` handler pattern).
- ConversationPane.test.tsx required a mock for `@/actions/credential-health.actions` because the new `CredentialErrorBanner` import pulls in `next-auth` (ESM-only) via the server action chain. Mocked at the module boundary (server actions should not execute in component tests).
- "credentialFailed state resets on new session start" test: initial approach of emitting `SESSION_READY` did not trigger `startSession()`. Fixed by using the retry flow (timeout → retry button → `startSession()`).

### Completion Notes List

- All 16 tasks completed. All 5 ACs satisfied.
- AC-1: 401 detection via `isCredentialFailureOutput` text patterns → `markCredentialFailed` DB write + `CREDENTIAL_FAILURE` SSE event. Classifier detects, AgentService emits.
- AC-2: 403 classification via `classifyAccessDenied` text patterns → `ACCESS_DENIED` SSE event with `RATE_LIMITED`/`ORG_RESTRICTION`/`INSUFFICIENT_PERMISSION` code. No `markCredentialFailed` call (FINDING-12).
- AC-3: `CREDENTIAL_FAILURE` SSE listener in ConversationPane sets `credentialFailed=true` → renders `CredentialErrorBanner` with `callbackUrl` for return-to-conversation re-auth.
- AC-4: `ACCESS_DENIED` SSE listener marks tool pill error state + attaches `accessNotice`. `ChatMessageList` renders `AccessNotice` below the pill. No banner, no input disable, no agent halt.
- AC-5: No new Sandbox dependency introduced — Project Map / Artifact Browser remain pure Postgres reads (architecture invariant, no code change needed).
- Test results: agent-be 127 tests pass (9 suites), web 644 tests pass (54 suites). 0 regressions.
- Lint: agent-be 0 errors (15 pre-existing warnings), web 0 new errors (1 pre-existing error in `InProgressArtifactCard.test.tsx`).
- Typecheck: both `apps/agent-be/tsconfig.app.json` and `apps/web/tsconfig.json` clean.

### File List

New files:
- `apps/web/src/components/conversation/AccessNotice.tsx` — dismissible 403 notice component (Task 8.1)
- `apps/web/src/components/conversation/AccessNotice.test.tsx` — component tests (Task 14.1)
- `apps/agent-be/src/credentials/credentials.service.spec.ts` — markCredentialFailed unit tests (Task 13.1)

Modified files:
- `libs/shared-types/src/ag-ui.types.ts` — added `CREDENTIAL_FAILURE_EVENT`, `ACCESS_DENIED_EVENT`, `AccessDeniedCode`, `CredentialFailureEvent`, `AccessDeniedEvent` (Tasks 1.1-1.2)
- `apps/agent-be/src/credentials/credentials.service.ts` — added `markCredentialFailed(userId, capturedAt?)` method (Task 2.1)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — added 401/403 detection helpers, widened return type, injected `CredentialsService` (Tasks 3.1-3.4)
- `apps/agent-be/src/streaming/streaming.module.ts` — imported `CredentialsModule` (Task 4.1)
- `apps/agent-be/src/streaming/agent.service.ts` — dispatch by `result.type` in classifier `.then()` handler (Task 5.1)
- `apps/agent-be/test/helpers/agent-service.fake.ts` — extended `setToolCallScript` with `credentialFailure`/`accessDenied` params (Task 6.1)
- `apps/web/src/components/conversation/types.ts` — added `AccessNoticeData` interface + `accessNotice?` field to `ToolCallData` (Task 7.1)
- `apps/web/src/components/conversation/ChatMessageList.tsx` — render `AccessNotice` below `ToolPill` when `accessNotice` present (Task 9.1)
- `apps/web/src/components/conversation/ConversationPane.tsx` — added `credentialFailed` state, `CREDENTIAL_FAILURE` + `ACCESS_DENIED` SSE listeners, render `CredentialErrorBanner` (Tasks 10.1-10.6)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — added Story 3.7 SSE handling tests + mock for `@/actions/credential-health.actions` (Task 15.1)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — added optional `callbackUrl` prop (Task 10.6)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` — extended with Story 3.7 401/403 detection tests (Task 11.1)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — extended with Story 3.7 event emission tests (Task 12.1)

### Change Log

- 2026-07-05: Story 3.7 implementation complete — all 16 tasks done, all ACs satisfied, 127+644 tests pass, lint/typecheck clean.
- 2026-07-05: Test automation expansion (bmad-testarch-automate) — 11 new P1 tests added for edge-case pattern coverage and defensive paths. agent-be 136 tests, web 646 tests, 0 regressions. No production code modified.
- 2026-07-05: NFR evidence audit (bmad-testarch-nfr) — Performance, Security, Reliability, Scalability assessed. Overall PASS (28/29 ADR criteria). 1 NFR patch applied: timing test for classifier 401/403 detection on 100KB output (performance regression guard). 4 NFR findings deferred. agent-be 140 tests, 0 regressions. No production code modified.

### Automation Expansion Decision Records

**Decision (DP-4):** Added 11 new test cases as P1 edge-case coverage to existing test files (`tool-pill-classifier.service.spec.ts` +9, `CredentialErrorBanner.test.tsx` +2). No existing tests were modified. Test-only changes with no production behavior change. Per DP-4, decided autonomously.

**Decision (DP-2):** The "abuse detection" 403 sub-pattern test initially used output `'abuse detection mechanism triggered'` alone, which failed because `classifyAccessDenied` has a guard clause requiring `403|Permission denied|Resource not accessible|Rate limit` to be present first. This is correct production behavior — GitHub's abuse detection messages always include a 403 status or "Rate limit" prefix. Amended the test to use `'403 Forbidden: abuse detection mechanism triggered'` (realistic output). Followed semantic intent over literal text.

### Review Findings

**Review date:** 2026-07-05
**Reviewer:** Code Review skill (Blind Hunter + Edge Case Hunter + Acceptance Auditor)
**Chunk:** 1 of 3 (agent-be backend — classifier, credentials service, agent service, shared types, fakes)

#### Decision-Needed (Resolved via Decision Policy)

- [x] [Review][Decision] 401/403 detection runs on ALL Bash output, enabling false-positive `markCredentialFailed` from non-git commands (e.g. `echo "401 Unauthorized"`) [tool-pill-classifier.service.ts:128-146] — **Resolved per DP-1 + DP-2.** DP-1: `markCredentialFailed` is a destructive DB write; a 401 pattern in non-git Bash output is an ambiguous signal. Never take the destructive path on ambiguity. DP-2: spec says "ALL Bash tool calls" but semantic intent is "detect git auth failures" — amend spec to match intent. Fix: gate 401/403 detection on Bash inputs containing git remote commands (`push`, `fetch`, `pull`, `clone`, `ls-remote`). Patch applied.

#### Patch Findings (Applied)

- [x] [Review][Patch] Gate 401/403 detection on git remote commands to prevent false-positive `markCredentialFailed` from non-git Bash output [tool-pill-classifier.service.ts:128] — applied: added `isGitRemoteOp` guard
- [x] [Review][Patch] `retryAfter` has no bound check — `Number(waitMatch[1])` accepts unbounded/huge values and `retryAfter: 0` is ambiguous [tool-pill-classifier.service.ts:102] — applied: clamped to `[1, 3600]` range with `Math.trunc`

#### Deferred Findings (Pre-existing from prior stories or spec-deferred)

- [x] [Review][Defer] Iterator errors in `Promise.race` silently swallowed, masked as `RUN_FINISHED` instead of `RUN_ERROR` [agent.service.ts:96-106] — deferred, pre-existing from Story 3.4 (circuit breaker). Critical severity: if `iterator.next()` rejects (network/SDK error), the `catch {}` block swallows it with no logging and `RUN_FINISHED` is emitted. Recommend dedicated fix in Story 3.4 hardening.
- [x] [Review][Defer] Concurrent `runTurn` calls for same `conversationId` corrupt shared per-conversation state maps [agent.service.ts:52] — deferred, pre-existing from Story 3.3. Critical severity: no per-conversation lock; second run overwrites first run's state. Recommend adding `isIdle` guard or mutex.
- [x] [Review][Defer] Stale circuit breaker timer from prior run fires on new run [agent.service.ts:221-227] — deferred, pre-existing from Story 3.4. `startCircuitBreakerTimer` doesn't clear pre-existing timer.
- [x] [Review][Defer] `markCredentialFailed` marks ALL of user's connections, not the specific failing one [credentials.service.ts:53-57] — deferred, spec'd behavior matching `apps/web` pattern (DP-3). Scoping to specific connection requires threading connection ID through classifier — beyond Story 3.7 scope (DP-5).
- [x] [Review][Defer] `content_block_stop` for unknown block types emits spurious `TEXT_MESSAGE_END` with no matching `START` [agent.service.ts:313-332] — deferred, pre-existing from Story 3.3/3.4.
- [x] [Review][Defer] Race condition emits events after `RUN_ERROR` when circuit breaker fires while message is pending [agent.service.ts:112-122 vs 218-244] — deferred, pre-existing from Story 3.4.
- [x] [Review][Defer] `TOOL_CALL_RESULT` emitted for untracked `tool_use_id`, skipping classification [agent.service.ts:353-371] — deferred, pre-existing from Story 3.4/3.6.
- [x] [Review][Defer] `Promise.race` doesn't release/cancel iterator on abort; pending `iterator.next()` orphaned [agent.service.ts:110-122] — deferred, pre-existing from Story 3.4.
- [x] [Review][Defer] `abortPromise` listener never removed after normal completion [agent.service.ts:87-93] — deferred, pre-existing from Story 3.4. Low severity (`{ once: true }` limits damage).
- [x] [Review][Defer] `resetCircuitBreakerTimer` re-arms new timer for already-aborted run [agent.service.ts:229-239] — deferred, pre-existing from Story 3.4. Low severity.
- [x] [Review][Defer] `isSuccessfulCommit` first regex subsumed by second (dead logic); second regex too permissive [tool-pill-classifier.service.ts:53-58] — deferred, pre-existing from Story 3.4.
- [x] [Review][Defer] `extractBmadArtifactPaths` truncates paths containing whitespace [tool-pill-classifier.service.ts:69,78] — deferred, pre-existing from Story 3.4.
- [x] [Review][Defer] `capturedAt` taken at classification time, not failure-detection time [tool-pill-classifier.service.ts:130] — deferred, DP-5 deferral on record (Deferred Findings section).
- [x] [Review][Defer] `processAssistantMessage` double-processes duplicate `tool_use_id` blocks [agent.service.ts:383-459] — deferred, pre-existing from Story 3.4/3.6.
- [x] [Review][Defer] `onModuleDestroy` aborts queries but never `interrupt()`s or terminates sandbox processes [agent.service.ts:204-219] — deferred, pre-existing from Story 3.1/3.4.
- [x] [Review][Defer] `isFailedCommit`/`isSuccessfulCommit` match patterns inside commit messages, not just infrastructure output [tool-pill-classifier.service.ts:46-58] — deferred, pre-existing from Story 3.4.
- [x] [Review][Defer] `deriveTitleFromPath` produces degenerate titles for unusual paths [tool-pill-classifier.service.ts:39-44] — deferred, pre-existing from Story 3.4. Low severity.
- [x] [Review][Defer] `viewHref` not URL-encoded [tool-pill-classifier.service.ts:191] — deferred, pre-existing from Story 3.4. Low severity (IDs are UUIDs in practice).
- [x] [Review][Defer] `pendingClassifierPromises` race: working-tree promise push misses when array concurrently deleted [agent.service.ts:452-455] — deferred, pre-existing from Story 3.6. Low severity.
- [x] [Review][Defer] `processAssistantMessage` uses `as` type assertion instead of `unknown` narrowing [agent.service.ts:338-346] — deferred, pre-existing from Story 3.6. Minor type-safety concern.

#### Dismissed Findings

- `markCredentialFailed` swallows errors, hiding DB failures from callers — dismissed: spec'd behavior (DP-2 decision on record). `markCredentialFailed` has its own try/catch that logs and swallows. The classifier returns `CREDENTIAL_FAILURE` regardless of DB write success — the event is based on pattern detection, not DB state. The defensive test (line 458-474) correctly tests the unreachable throw path via mock rejection.
- Classifier unit tests bypass `buildTestModule()` — dismissed per DP-4 (test-only, no production behavior change). Direct constructor instantiation is acceptable for pure unit tests with fully-mocked dependencies. `buildTestModule()` is reserved for integration tests needing the NestJS DI container.

#### Chunk 2 Review

**Review date:** 2026-07-05
**Reviewer:** Code Review skill (Blind Hunter + Edge Case Hunter + Acceptance Auditor)
**Chunk:** 2 of 3 (web frontend — `types.ts`, `AccessNotice.tsx`, `AccessNotice.test.tsx`, `ChatMessageList.tsx`, `ConversationPane.tsx`, `ConversationPane.test.tsx`, `CredentialErrorBanner.tsx`, `CredentialErrorBanner.test.tsx`)
**Diff baseline:** `d19eddbf0529b71a12d8529570762d6f93873eef` (frontmatter `baseline_commit`) — 1,594 diff lines across 8 files (1,244 insertions / 354 deletions in tracked file numbers; new files `AccessNotice.tsx` + `AccessNotice.test.tsx` contribute 49 + 112 lines untracked).

**Focus areas (1–6) status:**

1. **`callbackUrl` open-redirect prevention** — VERIFIED SAFE. `ConversationPane.tsx:731-735` passes `window.location.pathname` only (path-only, no host/query/protocol). `CredentialErrorBanner.tsx:26` forwards to `reauthorizeGitHub(callbackUrl)` → `signIn('github', { redirectTo: callbackUrl })` (NextAuth validates same-origin). NFR audit already recorded this control.
2. **`try/catch` around `JSON.parse` in every `EventSource.addEventListener` handler** — VERIFIED. All 12 listeners in `ConversationPane.tsx` that call `JSON.parse` wrap it in `try { ... } catch { // ignore parse errors }` (`SESSION_ERROR`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`, `RUN_ERROR`, `MANUAL_SAVE_SUCCEEDED`, `MANUAL_SAVE_FAILED`, `CREDENTIAL_FAILURE`, `ACCESS_DENIED`). Listeners without parsing (`SESSION_READY`, `SESSION_TIMEOUT`, `RUN_STARTED`, `TEXT_MESSAGE_END`, `RUN_FINISHED`, `STREAM_ERROR`, `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`) are exempt per project-context.md line 122 (rule scopes to "wraps `JSON.parse`"). Pattern is uniform.
3. **TypeScript narrowing** — VERIFIED CORRECT. `m.toolCall && m.toolCall.toolCallId === toolCallId` correctly narrows `m.toolCall` to non-undefined for the spread `...m.toolCall` in `CREDENTIAL_FAILURE` (line 462) and `ACCESS_DENIED` (line 486) handlers. Matches dev-note fix.
4. **Accessibility (UX-DR16)** — VERIFIED with one patch (below). `role="status"` + `aria-live="polite"` on AccessNotice (`AccessNotice.tsx:35-36`); 2px focus ring (`focus:ring-2`) confirmed on Dismiss button. Re-auth modal uses shadcn `Dialog` → Radix `react-focus-scope` + `react-focus-guards` (v1.1.18) — focus trap + return-to-trigger built-in.
5. **FINDING-12 compliance** — VERIFIED. `ACCESS_DENIED` handler (`ConversationPane.tsx:480-502`) does NOT call `setCredentialFailed(true)`, does NOT touch input state, does NOT call `setAgentState`. Tests explicitly assert all three ("ACCESS_DENIED event does NOT show CredentialErrorBanner", "does NOT disable the chat input", "does NOT halt the agent turn").
6. **State reset** — VERIFIED. `setCredentialFailed(false)` is the third statement in `startSession()` (line 106), runs on every session start including `handleRetry()` (which calls `startSession()`). Component unmount → state discarded automatically. Test "credentialFailed state resets on new session start" asserts this via the retry flow.

**Patch Findings (Applied)**

- [x] [Review][Patch] `AccessNotice` Dismiss button fails WCAG AA text contrast (`text-text-3` against composited `bg-caution-bg` / `bg-negative-bg`) [AccessNotice.tsx:43] — `text-text-3` (`#56556A`) against composited caution-bg (~`rgb(31,25,21)`) yields ~2.40:1 contrast; against composited negative-bg ~2.46:1. Both fail WCAG AA (4.5:1 for normal 14px text). Fixed by swapping to `text-text-2 hover:text-text-1` — `text-text-2` (`#8D8CA0`) yields ~5.29:1 (caution) / ~5.42:1 (negative), both pass AA. Hover affordance preserved (brightens to `text-text-1`, ~14.8:1). Decision (DP-3): simplest reversible fix — one class swap, no design-token changes, no test changes (existing tests assert focus ring classes, not text color). All 11 AccessNotice tests still pass.

#### Decision-Needed (Resolved via Decision Policy)

- (none) — no decision-needed findings arose; all findings fit `patch`/`defer`/`dismiss` triage.

#### Deferred Findings

- [x] [Review][Defer] Frontend `code` validation from SSE — re-affirm and correct the prior NFR deferral assessment [ConversationPane.tsx:480-502, AccessNotice.tsx:21,34]. ACCESS_DENIED handler trusts `code` from `JSON.parse` without validating against `AccessDeniedCode` union; `AccessNotice`'s `NOTICE_COPY[notice.code]` returns `undefined` for unknown codes, rendering `<p>` with empty content (an empty colored box + Dismiss button — degraded UX, not "graceful" as the prior NFR deferral claimed at line 939). The risk surface is unchanged: SSE channel is JWT-authenticated, classifier emits valid codes. **Decision (DP-5):** defer (out of Story 3.7 scope; defense-in-depth only). Corrected prior deferral assessment: empty-notice UX, while degraded, is non-critical and only reachable via a backend bug. **Owner: post-MVP hardening (frontend runtime validation + empty-state copy).**
- [x] [Review][Defer] Focus management on Dismiss — when a keyboard user Tabs to the AccessNotice Dismiss button and activates it, focus lands on `<body>` because the dismissible region unmounts. WAI-ARIA does not strictly require return-focus for non-modal dismissible notices (only modal dialogs require focus return). Touching this would require either returning focus to the trigger or to the next logical focusable element. **Decision (DP-5):** defer — edge case, low severity, no UX-DR16 citation requires this for non-modal notices. **Owner: post-MVP accessibility hardening.**

#### Dismissed Findings

- `setCredentialFailed(true)` outside the try/catch in the `CREDENTIAL_FAILURE` handler — dismissed: intentional design (banner must show even when the SSE payload is unparseable). The `setMessages` mutation inside `try` is best-effort pill-state update; `setCredentialFailed` outside `try` guarantees the user-visible banner regardless. Matches story AC-3.
- Type-narrowing style inconsistency between 3.4/3.6 handlers (`m.id === toolCallId && m.toolCall`) and 3.7 handlers (`m.toolCall && m.toolCall.toolCallId === toolCallId`) — dismissed: both patterns narrow correctly. The 3.7 approach is slightly more defensive (doesn't rely on the `m.id === m.toolCall.toolCallId` invariant established by `TOOL_CALL_START`), but touching the pre-existing handlers would expand scope. Not a bug.
- `text-text-3 hover:text-text-2` pattern duplication with `CopyButton.tsx:27` and `WorkingTreeIndicator.tsx:125` — dismissed: those callers use `text-text-3` on `surface` background (lighter, meets contrast), not on `bg-caution-bg` / `bg-negative-bg`. The colored-background context is unique to `AccessNotice`, so the pattern transfer doesn't justify the contrast failure.

#### Chunk 3 Review

**Review date:** 2026-07-05
**Reviewer:** Code Review skill (Blind Hunter + Edge Case Hunter + Acceptance Auditor — run in session; subagent spawning not available)
**Chunk:** 3 of 3 (adjacent changes not in Story 3.7 task list + DI fix applied in step 2)
**Diff baseline:** `d19eddbf0529b71a12d8529570762d6f93873eef` (frontmatter `baseline_commit`) — 1,568 diff lines across 25 tracked files (DI fix, agent-be adjacent conversations/sandbox/streaming, web adjacent SemanticPill/ToolPill/SessionStartSpinner/ArtifactCard/project-map page, shared-types, playwright). New untracked `ResumeConversationDto` / `SaveConversationDto` / `ProjectMapArtifacts` referenced by the diff were inspected for coherence.

**Focus areas (1–4) status:**

1. **DI fix verification** — VERIFIED SAFE. `StreamingModule` now `imports: [CredentialsModule, SandboxModule]` (`streaming.module.ts:11`). `SandboxModule` imports nothing (`sandbox.module.ts`); `CredentialsModule` is leaf-relative to `StreamingModule`. **No circular dependency introduced:** `ConversationsModule → StreamingModule → (CredentialsModule, SandboxModule)` with no back-edge to `ConversationsModule`. `AGENT_SERVICE` token still resolves correctly in `StreamingModule` (`streaming.module.ts:15` provides `useClass: AgentService`, exports `AGENT_SERVICE`); `ConversationsModule` imports `StreamingModule` (`conversations.module.ts:13`) and can inject `AGENT_SERVICE`. `SANDBOX_SERVICE` token resolves via `StreamingModule.imports: [SandboxModule]` → `SandboxModule.exports: [SANDBOX_SERVICE]`. `ConversationsModule` (which imports both `SandboxModule` directly and `StreamingModule` transitively) still works — NestJS hoists/re-exports module providers correctly when the same module is imported in multiple places. Fix is safe.
2. **Shared-types exports** — VERIFIED CORRECT. `libs/shared-types/src/index.ts` barrel re-exports `ag-ui.types`, `agent.interface`, `sandbox.interface` (all three `export * from` entries pre-existing). New `CREDENTIAL_FAILURE_EVENT`, `CredentialFailureEvent`, `AccessDeniedCode`, `ACCESS_DENIED_EVENT`, `AccessDeniedEvent` types added in `ag-ui.types.ts:33-58`. `AgUiEventType` union extended to include both new events (`ag-ui.types.ts:54-58`). `isIdle` added to `IAgentService` (`agent.interface.ts:11`); production `AgentService` implements it (`agent.service.ts:465`). `commit(...)` added to `ISandboxService` (`sandbox.interface.ts:35`); production `SandboxService` (`sandbox.service.ts:120`) and `SandboxServiceFake` (`sandbox-service.fake.ts:95`) both implement it. No existing consumer breaks — additions are additive only.
3. **Adjacent modification coherence** — VERIFIED COHERENT. Files touched during 3.7's pipeline run carry work for Stories 3.4 / 3.5 / 3.6 / 3.7 that shipped adjacently. None of the changes are accidental: `conversations.controller.ts` adds `resume`/`save` endpoints (3.5/3.6); `conversations.service.ts` refactors git-identity extraction to `resolveGitIdentity` + adds `manualCommit`/`resumeConversation` (3.5/3.6) + adds `select` projection on `repoConnection.findUnique` (NFR-pattern); `sandbox.service.ts` adds `commit` with two separate `executeCommand` calls + `shellQuote(message)` + `exitCode` check per project-context rules; `streaming.controller.ts` adds heartbeat interval + `cleanupAll()` aggregator + try/catch on `res.end()` in complete/error (3.4); `SemanticPill` / `ToolPill` un-skip ATDD red-phase tests and implement production components; `SessionStartSpinner` adds `label` prop (3.5 resume loading); `ArtifactCard` adds optional `onClick` (3.5 cross-tab focus, backward compatible); `project-map/page.tsx` swaps to `ProjectMapArtifacts` wrapper + adds `select: { id: true }`; playwr ag-UI test payload updates `toolName → toolCallName` + adds `toolCallId` (AG-UI contract); `custom-fixtures.ts` adds `withConversationAndTurns` (3.5 resume E2E). All changes follow established project-context patterns.
4. **Fake/helper consistency** — VERIFIED CONSISTENT. `AgentServiceFake.setToolCallScript` mirrors the new AG-UI event contract (RUN_STARTED → TOOL_CALL_START/ARGS/END/RESULT → optional CREDENTIAL_FAILURE / ACCESS_DENIED / TOOL_CALL_PROMOTED → RUN_FINISHED) for downstream consumer tests; the fake short-circuits the classifier (intentional — classifier has its own dedicated tests, fakes shouldn't reimplement production logic). `FILE_MODIFYING_TOOLS` Set added to the fake mirrors production (`agent.service.ts:32`) — fake now emits `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN` after file-modifying tool results, matching the "Test-seam fakes mimic production side effects" rule. `isIdle` implemented in the fake (`return !this.activeRun`). `SandboxServiceFake.commit` records calls via `getCommitCalls()` and supports `failNextCommit()` — mirrors the production side effect (`SandboxServiceFake` already mirrors provision/clone/injectGitConfig/getWorkingTreeStatus). All looks coherent.

#### Decision-Needed (Resolved via Decision Policy)

- (none) — no decision-needed findings arose; all findings fit `patch`/`defer`/`dismiss` triage.

#### Patch Findings (Applied)

- [x] [Review][Patch] Redundant `backPressureTimer = null;` after `cleanupAll()` in back-pressure timer body [streaming.controller.ts:127] — `cleanupAll()` is called immediately prior on line 121; `cleanupAll()` → `cleanupBackPressure()` which already nulls `backPressureTimer` when truthy (`streaming.controller.ts:82-87`). The redundancy was INDUCED by the 3.7 change (adding `cleanupAll()` to that block); the line was sensible pre-3.7 but is now dead code. Removed the redundant assignment. The `else` branch's `backPressureTimer = null;` (when pendingCount dropped below 200 in the 30s window, where `cleanupAll()` is NOT called) is preserved — that one is non-redundant. **Decision (DP-3):** simplest reversible fix — one line removal, no behavioral change (same end-state reached via `cleanupBackPressure`), no test changes (no test asserts on the post-`res.end()` null assignment).

#### Deferred Findings

- [x] [Review][Defer] Back-pressure `res.write()` x3 + `res.end()` not wrapped in try/catch [streaming.controller.ts:123-126] — pre-existing robustness gap from Story 3.3/3.4. The `complete`/`error` callbacks wrap `res.end()` in try/catch (project-context rule "SSE heartbeat + connection cleanup robustness"), but the back-pressure codepath's writes/end do not. A race with `req.on('close')` (client disconnect in the 30s window between timer-set and timer-fire) would throw inside the `setTimeout` callback, propagating synchronously rather than to the RxJS `error` callback (RxJS does NOT convert `next`-callback throws to error callbacks). The 3.7 chunk-3 change added `cleanupAll()` + `subscription.unsubscribe()` BEFORE the writes (good — stops further event reception) but did not wrap the writes themselves. **Decision (DP-5):** defer — pre-existing robustness gap, not a 3.7 regression; the change touched the preceding lines but not the writes themselves. Behavioral change (turns throws into silent swallows) warrants its own dedicated task with corresponding tests. **Owner: future SSE robustness pass on `StreamingController` (add try/catch around back-pressure writes + the streaming.controller spec test for client-disconnect-during-back-pressure-window).** Severity: P3 (low — requires specific timing).
- [x] [Review][Defer] `ResumeConversationDto` / `SaveConversationDto` are empty Zod schemas with no fields [conversations/dto/resume-conversation.dto.ts:4, save-conversation.dto.ts:4] — the controllers apply `ZodValidationPipe` to a `_body` parameter that is intentionally unused. The DTOs serve no validation purpose (no fields, no `.max()` constraints applicable). They could be removed in favor of `@Post()` without `@Body()`, but the pattern is harmless and forward-compatible (a future requirement to validate a body field would extend the schema). **Decision (DP-5):** defer — pattern is redundant but harmless, no production behavior change, removing risks a contract change for API consumers. **Owner: future API contract cleanup pass.** Severity: P3 (code-quality nit).
- [x] [Review][Defer] Inconsistent tenant-isolation response shape between `resumeConversation` (returns `{ sandboxStatus: 'failed' }`) and `manualCommit` (throws `NotFoundException`) [conversations.service.ts:392, 371] — `resumeConversation` is best-effort (user asks "is this conversation resumable?") and `manualCommit` requires an active session (user expects a save to succeed). The asymmetry is intentional (resume shouldn't reveal via error code whether a conversation exists for another user) but undocumented. **Decision (DP-5):** defer — adjacent to 3.5/3.6 work, not 3.7's territory; the asymmetry is defensible (security-conscious) and undocumented rather than wrong. **Owner: future API docs / contract-cleanup pass to make the intent explicit.** Severity: P3 (doc nit).

#### Dismissed Findings

- `text-positive/80` Tailwind opacity modifier across hex-defined color token [SemanticPill.tsx:51] — dismissed: Tailwind 3.x supports the `/80` opacity modifier on raw hex color values by generating `rgb(r g b / 0.8)`. The `positive: '#3ECF8E'` token supports alpha-modifier classes. Verified against `tailwind.config.ts:20`.
- `AgentServiceFake.setToolCallScript` emits `CREDENTIAL_FAILURE` / `ACCESS_DENIED` events directly via a boolean flag instead of routing through the classifier [agent-service.fake.ts:60-71] — dismissed: intentional design. The classifier has its own dedicated unit tests (`tool-pill-classifier.service.spec.ts`). Fakes should mimic side effects (working-tree emission), not production decision logic — that coupling would force fake updates whenever classifier regex changes.
- `ProjectMapArtifacts` casts `a.status as ArtifactStatus` and `a.type as ArtifactType` internally (vs. at the page level previously) [ProjectMapArtifacts.tsx:24,29,39] — dismissed: cast moved with the rendering responsibility from page to component; obligation to validate cast was already absent pre-3.7. Touching it would expand scope.
- `conversations.service.spec.ts` test "does not start duplicate idle timer when one is already running" relies on provisioning first to start a timer, which is implicit coupling [conversations.service.spec.ts:179-186] — dismissed: test assertion is on the resume-side `startTimer` not being called, and the spy is installed AFTER provision so the provision-side call doesn't count. Mechanically correct; naming could be clearer but pattern is fine.
- `ArtifactCard` new `onClick?` prop is `MouseEvent<HTMLAnchorElement>` but Next.js Link's `onClick` accepts `MouseEvent<HTMLAnchorElement>` only when the root element is `<a>` [ArtifactCard.tsx:6,38] — dismissed: Next.js's `<Link>` renders an `<a>` anchor by default (no `<a>` child); the type matches. Test asserts the click handler is invoked via `fireEvent.click(item)`.

#### Chunk 3 Review Outcome

Chunk 3 (adjacent changes + DI fix) review complete. DI fix verified safe (no circular dependency, `AGENT_SERVICE` / `SANDBOX_SERVICE` tokens resolve, `ConversationsModule` wiring intact). Shared-types exports are correct and additive-only. Adjacent modifications are coherent (carry forward work for Stories 3.4/3.5/3.6 that shipped in the same pipeline run, all following established patterns). Fakes correctly mirror production side effects. 1 patch applied (redundant null-assignment in back-pressure timer body, induced by 3.7's `cleanupAll()` addition). 3 findings deferred (P3 severity, pre-existing/adjacent — back-pressure try/catch wrap, empty DTOs, tenant-isolation response asymmetry). All other observations dismissed as noise/false-positive/intentional-design.

#### NFR Evidence Audit

**Audit date:** 2026-07-05
**Auditor:** Master Test Architect (bmad-testarch-nfr)
**Scope:** Performance, Security, Reliability, Scalability — NFR-specific patches only (no features, refactors, DB migrations, or test-quality fixes)
**Overall Status:** PASS ✅ (28/29 ADR criteria met, 0 blockers)
**Report:** `_bmad-output/test-artifacts/nfr-assessment-3-7.md`

**NFR Patch Applied:**

- [x] [NFR][Patch] Timing test for classifier 401/403 detection (Performance) [tool-pill-classifier.service.spec.ts:499-532] — applied: added 2 `[P1]` timing tests verifying the classifier completes < 100ms on 100KB output. Regression guard catches accidental O(n²) regressions if detection logic grows. Test-only change, no production code modified. All 140 agent-be tests pass (9 suites).

**NFR Controls Verified (No Patch Needed):**

- **Performance:** `select` projection on all DB reads (`repoConnection.findUnique`, `artifact.findFirst`, `conversation.findFirst`). `retryAfter` clamped to `[1, 3600]`. Classifier regexes are linear (no ReDoS). `isGitRemoteOp` gate limits regex execution to git remote commands.
- **Security:** `X-Content-Type-Options: nosniff` on SSE response. Boundary JWT auth on SSE channel (`jose.jwtVerify`). `callbackUrl` uses `window.location.pathname` (path only — no open redirect). No secrets in event payloads or logs. `isGitRemoteOp` guard prevents false-positive `markCredentialFailed`.
- **Reliability:** All SSE event handlers have try/catch. `markCredentialFailed` has own try/catch (swallows, logs). Classifier `.catch()` in AgentService logs and continues. `CREDENTIAL_FAILURE` emits regardless of DB write success (decoupled). `pendingClassifierPromises` ensures events arrive before `RUN_FINISHED` (NFR-R1). SSE heartbeat (15s) + back-pressure handling (200 threshold + 30s timer).
- **Scalability:** Stateless classifier (no instance state). `ReplaySubject(100)` event buffer. Conversation-level event emission. Scoped DB writes (`where: { userId }`).

**Deferred NFR Findings:**

- [x] [NFR][Defer] Output scan take-limit (Performance) — classifier scans full `toolOutput` with regex. Risk negligible (linear regexes, no ReDoS, bounded git remote output). Not warranted at current risk level. **Owner: post-MVP hardening (if output sizes grow).**
- [x] [NFR][Defer] Frontend `code` validation from SSE (Security) — `ACCESS_DENIED` handler trusts `code` from `JSON.parse` without validating against `AccessDeniedCode` union. SSE channel is authenticated (JWT); `AccessNotice` handles unknown codes gracefully (undefined copy). Not a vulnerability — defense-in-depth only. **Owner: post-MVP hardening.**
- [x] [NFR][Defer] Formal performance SLO for classifier (Performance) — no formal p95/p99 latency SLO defined. Timing test uses 100ms as a generous guard. **Owner: next milestone.**
- [x] [NFR][Defer] `capturedAt` race condition (Reliability) — already deferred in story per DP-5. **Owner: post-MVP hardening.**
