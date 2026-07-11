import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url(),
  AUTH_SECRET: z.string().min(1),
  DATABASE_URL: z.string(),
  /**
   * AES-256-GCM key for OAuth token encryption (64-char hex).
   * Format is validated at point of use in crypto.ts; presence is checked here.
   */
  CREDENTIAL_ENCRYPTION_KEK: z.string().min(1),
  TEST_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function assertRequiredEnv(): void {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${errors}`);
  }

  if (process.env.TEST_ENV && process.env.NODE_ENV === 'production') {
    throw new Error(
      'TEST_ENV must not be set in a production environment (NODE_ENV=production) — refusing to start',
    );
  }
}
