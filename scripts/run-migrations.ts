/**
 * Run Prisma migrations against the Railway Postgres instance (Story 4.4).
 *
 * Wraps `prisma migrate deploy` with the `describeDatabase()` safety pattern
 * (announce target before, confirm after). Mirrors `scripts/rotate-kek.ts`.
 *
 * Usage:
 *   DATABASE_URL=<railway-url> yarn db:migrate
 */

import { execSync } from 'child_process';

export function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    // host:port and /dbname only — never the userinfo (credentials).
    return `${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

export function main(): void {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }

  console.log(`Target database: ${describeDatabase(process.env.DATABASE_URL)}`);

  try {
    execSync('prisma migrate deploy --config libs/database-schemas/prisma.config.ts', {
      stdio: 'inherit',
      // NFR-4-4-H1: bound the migration process so a Railway TCP proxy drop,
      // Postgres lock-wait, or network partition cannot block the script
      // indefinitely. SIGTERM lets Prisma tear down cleanly before SIGKILL.
      timeout: 120_000,
      killSignal: 'SIGTERM',
    });
  } catch (err) {
    console.error(err);
    console.log(`Target database: ${describeDatabase(process.env.DATABASE_URL)}`);
    process.exit(1);
  }

  console.log(`Target database: ${describeDatabase(process.env.DATABASE_URL)}`);
  console.log('Migrations applied successfully.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
