export type ConversationId = string;

export type ConversationStatus = 'active' | 'closed' | 'idle';

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

export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCallData };
