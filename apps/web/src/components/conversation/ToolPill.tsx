'use client';

import type { ToolCallData } from './types';

export interface ToolPillProps {
  toolCall: ToolCallData;
}

export function ToolPill({ toolCall: _toolCall }: ToolPillProps) {
  throw new Error('ToolPill: not implemented (Story 3.4 ATDD red phase)');
}
