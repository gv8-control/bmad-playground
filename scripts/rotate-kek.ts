/**
 * KEK rotation script (Story 1.9).
 *
 * Re-wraps every per-user DEK in `oauth_credentials` from the old KEK to the
 * new KEK. Token ciphertexts are never touched and no OAuth token plaintext
 * is ever produced. Operating procedure: docs/runbooks/kek-rotation.md.
 *
 * Usage:
 *   CREDENTIAL_ENCRYPTION_KEK_OLD=<hex> CREDENTIAL_ENCRYPTION_KEK_NEW=<hex> \
 *     yarn dotenv -e .env -- ts-node --transpile-only scripts/rotate-kek.ts <dry-run|rotate|verify>
 *
 * Commands:
 *   dry-run — classify every row's stored kekId against the old/new KEK
 *             fingerprints; report; write nothing
 *   rotate  — re-wrap DEKs under the new KEK (fresh nonce), update rows'
 *             encryptedDek/dekNonce/kekId
 *   verify  — classify every row's stored kekId against the NEW KEK
 *             fingerprint; report; write nothing
 *
 * KEKs are accepted from environment variables only — never CLI arguments
 * (shell history / process listings). Output never contains key material,
 * DEK bytes, or token fields.
 *
 * Row selection uses the `kekId` column (a non-reversible fingerprint of the
 * KEK that wrapped that row, computed via `computeKekId`) instead of
 * trial-decryption — an exact string comparison against
 * `computeKekId(oldKek)` / `computeKekId(newKek)`.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../libs/database-schemas/src/index';
import { computeKekId, parseKekHex, rewrapDek } from '../apps/web/src/lib/crypto';

const COMMANDS = ['dry-run', 'rotate', 'verify'] as const;
type Command = (typeof COMMANDS)[number];

interface Summary {
  total: number;
  ok: number;
  rotated: number;
  skipped: number;
  retryNeeded: number;
  failed: number;
}

function usage(): never {
  console.error('Usage: rotate-kek.ts <dry-run|rotate|verify>');
  process.exit(2);
}

function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    // host:port and /dbname only — never the userinfo (credentials).
    return `${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  if (!command || !COMMANDS.includes(command)) usage();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }

  // dry-run and rotate require BOTH KEKs — dry-run needs the new KEK to tell an
  // already-rotated row apart from an unrecoverable one. verify requires only the
  // new KEK; the old KEK is optional there, used to distinguish "not yet rotated"
  // (needs another rotate pass) from "unrecoverable" on a live system.
  const oldRequired = command === 'dry-run' || command === 'rotate';
  const newRequired = command === 'dry-run' || command === 'rotate' || command === 'verify';
  const oldKekHex = process.env.CREDENTIAL_ENCRYPTION_KEK_OLD ?? '';
  const newKekHex = process.env.CREDENTIAL_ENCRYPTION_KEK_NEW ?? '';

  const oldKek =
    oldRequired || (command === 'verify' && oldKekHex)
      ? parseKekHex(oldKekHex, 'CREDENTIAL_ENCRYPTION_KEK_OLD')
      : null;
  const newKek = newRequired ? parseKekHex(newKekHex, 'CREDENTIAL_ENCRYPTION_KEK_NEW') : null;

  if (oldRequired && oldKek!.equals(newKek!)) {
    console.error('CREDENTIAL_ENCRYPTION_KEK_OLD and CREDENTIAL_ENCRYPTION_KEK_NEW must differ');
    process.exit(2);
  }

  const oldKekId = oldKek ? computeKekId(oldKek) : null;
  const newKekId = newKek ? computeKekId(newKek) : null;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter, log: ['error'] });

  const summary: Summary = { total: 0, ok: 0, rotated: 0, skipped: 0, retryNeeded: 0, failed: 0 };

  // Announce the target BEFORE any read/write so the operator can abort if it
  // is the wrong database (e.g. dev `.env` when prod was intended).
  console.log(`Target database: ${describeDatabase(process.env.DATABASE_URL)}`);
  console.log(`Command: ${command}`);

  try {
    const rows = await prisma.oAuthCredential.findMany({
      select: { id: true, userId: true, encryptedDek: true, dekNonce: true, kekId: true },
      orderBy: { createdAt: 'asc' },
    });
    summary.total = rows.length;
    console.log(`Found ${rows.length} credential row(s).`);

    for (const row of rows) {
      if (command === 'verify') {
        if (row.kekId === newKekId) {
          summary.ok += 1;
        } else if (oldKekId && row.kekId === oldKekId) {
          summary.retryNeeded += 1; // still under old KEK — run another rotate pass
          console.error(`  RETRY NEEDED userId=${row.userId} id=${row.id}: still under old KEK — re-run rotate`);
        } else {
          summary.failed += 1;
          console.error(`  FAILED userId=${row.userId} id=${row.id}: kekId matches neither KEK fingerprint — user must re-authenticate`);
        }
        continue;
      }

      if (row.kekId !== oldKekId) {
        if (newKekId && row.kekId === newKekId) {
          summary.skipped += 1; // already rotated — idempotent re-run
        } else {
          summary.failed += 1;
          console.error(`  FAILED userId=${row.userId} id=${row.id}: kekId matches neither KEK fingerprint — user must re-authenticate`);
        }
        continue;
      }

      if (command === 'dry-run') {
        summary.ok += 1;
        continue;
      }

      // Reached only for `rotate` (dry-run returned above), where both KEKs are set.
      const rewrapped = rewrapDek(row, oldKek!, newKek!, row.userId);
      const updated = await prisma.oAuthCredential.updateMany({
        where: { id: row.id, encryptedDek: row.encryptedDek, kekId: oldKekId! },
        data: {
          encryptedDek: rewrapped.encryptedDek,
          dekNonce: rewrapped.dekNonce,
          kekId: rewrapped.kekId,
        },
      });
      if (updated.count === 1) {
        summary.rotated += 1;
      } else {
        summary.retryNeeded += 1; // row changed concurrently (e.g. re-auth mid-rotation)
        console.error(`  RETRY NEEDED userId=${row.userId} id=${row.id}: row changed concurrently — re-run rotate`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${command} summary:`);
  console.log(`  total:        ${summary.total}`);
  if (command === 'rotate') {
    console.log(`  rotated:      ${summary.rotated}`);
    console.log(`  skipped:      ${summary.skipped} (already rotated)`);
    console.log(`  retry needed: ${summary.retryNeeded}`);
  } else {
    console.log(`  ok:           ${summary.ok}`);
    if (command === 'dry-run') console.log(`  skipped:      ${summary.skipped} (already rotated)`);
    if (command === 'verify') console.log(`  retry needed: ${summary.retryNeeded} (still under old KEK)`);
  }
  console.log(`  failed:       ${summary.failed}`);

  if (summary.failed > 0 || summary.retryNeeded > 0) process.exit(1);
}

main().catch((err) => {
  console.error('rotate-kek aborted:', err instanceof Error ? err.message : err);
  process.exit(1);
});
