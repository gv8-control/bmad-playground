import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createConversationSchema = z.object({});

export class CreateConversationDto extends createZodDto(createConversationSchema) {}
