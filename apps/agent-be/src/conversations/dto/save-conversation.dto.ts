import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const saveConversationSchema = z.object({});

export class SaveConversationDto extends createZodDto(saveConversationSchema) {}
