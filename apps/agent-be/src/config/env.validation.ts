import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DAYTONA_API_URL: z.string().optional().default(''),
  DAYTONA_API_KEY: z.string().optional().default(''),
  AUTH_SECRET: z.string().min(1),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${errors}`);
  }
  return parsed.data;
}
