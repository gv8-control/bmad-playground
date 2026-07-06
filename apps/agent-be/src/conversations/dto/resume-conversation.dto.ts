import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const resumeConversationSchema = z.object({});

export class ResumeConversationDto extends createZodDto(resumeConversationSchema) {}
