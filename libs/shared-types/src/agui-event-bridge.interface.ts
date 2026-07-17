/**
 * SSE event shape consumed by the `onEvent` observer callback on
 * `AguiEventBridgeParams`. Structurally compatible with the `SseEvent`
 * interface exported from `apps/agent-be/src/streaming/session-events.service`
 * (`{ event: string; data: unknown }`), so callers passing a `SseEvent`-typed
 * callback satisfy this contract without importing shared-types into the
 * service module.
 */
export interface AguiBridgeEvent {
  event: string;
  data: unknown;
}

export interface AguiEventBridgeParams {
  conversationId: string;
  sandboxId: string;
  command: string;
  userId: string;
  /**
   * Optional working directory forwarded to `createAgentSession` (3rd arg).
   * `SandboxService` shell-quotes it and prefixes the command with
   * `cd ${shellQuote(cwd)} &&`.
   */
  cwd?: string;
  /**
   * Optional observer callback invoked in `processAgentEvent()` BEFORE
   * `sessionEvents.emit()` for non-lifecycle events. For lifecycle events
   * (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`), the callback is invoked but
   * `sessionEvents.emit()` is SKIPPED — the caller owns lifecycle emission to
   * SSE (prevents double emission). When omitted, all events (including
   * lifecycle) are forwarded to `sessionEvents.emit()` (backward compat).
   */
  onEvent?: (event: AguiBridgeEvent) => void;
}

/**
 * Symbol-token DI interface for `AguiEventBridgeService`. Declares the public
 * surface consumed by `AgentService` so the concrete service can be swapped in
 * tests via the `AGUI_EVENT_BRIDGE_SERVICE` token (same pattern as
 * `AGENT_SERVICE` / `SANDBOX_SERVICE`).
 */
export interface IAguiEventBridgeService {
  streamAgentEvents(params: AguiEventBridgeParams): Promise<void>;
  stop(conversationId: string): Promise<void>;
  onModuleDestroy(): void;
}

export const AGUI_EVENT_BRIDGE_SERVICE = Symbol('IAguiEventBridgeService');
