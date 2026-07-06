import { EventType } from '@ag-ui/core';

export {
  EventType,
  type BaseEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
} from '@ag-ui/core';

export const STREAM_ERROR_EVENT = 'STREAM_ERROR' as const;

export interface StreamErrorEvent {
  type: typeof STREAM_ERROR_EVENT;
  code: 'STREAM_BACK_PRESSURE';
}

export const TOOL_CALL_PROMOTED_EVENT = 'TOOL_CALL_PROMOTED' as const;

export interface ToolCallPromotedEvent {
  type: typeof TOOL_CALL_PROMOTED_EVENT;
  toolCallId: string;
  artifactType: string;
  artifactTitle: string;
  artifactId: string | null;
  viewHref: string;
}

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

export type AgUiEventType =
  | EventType
  | typeof STREAM_ERROR_EVENT
  | typeof TOOL_CALL_PROMOTED_EVENT
  | typeof CREDENTIAL_FAILURE_EVENT
  | typeof ACCESS_DENIED_EVENT;
