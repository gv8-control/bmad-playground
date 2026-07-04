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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  toolCall?: ToolCallData;
}
