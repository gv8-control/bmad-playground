export interface AgentRunParams {
  conversationId: string;
  sandboxId: string;
  message: string;
  userId: string;
}

export interface IAgentService {
  runTurn(params: AgentRunParams): Promise<void>;
  stop(conversationId: string): Promise<void>;
  isIdle(conversationId: string): boolean;
}

export const AGENT_SERVICE = Symbol('IAgentService');
