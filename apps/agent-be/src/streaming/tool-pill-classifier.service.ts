import { Injectable } from '@nestjs/common';
import type { ToolCallPromotedEvent } from '@bmad-easy/shared-types';

@Injectable()
export class ToolPillClassifierService {
  async classifyToolResult(
    _toolCallId: string,
    _toolName: string,
    _toolInput: string,
    _toolOutput: string,
    _userId: string,
  ): Promise<ToolCallPromotedEvent | null> {
    throw new Error('ToolPillClassifierService: not implemented (Story 3.4 ATDD red phase)');
  }
}
