export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertTestEnvNotInProduction } = await import('@/lib/env-guard');
    assertTestEnvNotInProduction();
  }
}
