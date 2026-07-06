import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10_000),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
