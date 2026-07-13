import type { MessageSegment, ToolCallData } from '@bmad-easy/shared-types';

export type { AccessNoticeData, ToolCallData, MessageSegment } from '@bmad-easy/shared-types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  toolCall?: ToolCallData;
  segments?: MessageSegment[];
}
