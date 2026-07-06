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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  toolCall?: ToolCallData;
}
