/**
 * @jest-environment node
 *
 * Credential-isolation unit tests for scripts/run-migrations.ts — Story 4.4
 *
 * Scope note (Fix M11): the file name `run-migrations-credential-isolation`
 * reflects what these tests actually cover. They fully mock `child_process`
 * (`execSync`), so they verify command-STRING composition and credential
 * isolation — NOT that Prisma actually runs migrations end-to-end. The live
 * migration execution is verified separately (manually against the Railway
 * Postgres instance, per the runbook). Do not interpret a green run here as
 * evidence that `prisma migrate deploy` succeeds against a real database.
 *
 * Verifies:
 * - AC-2: describeDatabase() parses valid postgresql:// URLs, returns host:port/dbname
 * - AC-2: describeDatabase() never includes credentials (credential isolation invariant)
 * - Regression guard: execSync command string does not interpolate DATABASE_URL
 *   (credential isolation + input injection invariants)
 *
 * Run: yarn nx test agent-be -- --testPathPattern=run-migrations-credential-isolation
 */

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

import { execSync } from 'child_process';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { describeDatabase, main } from '../../../../scripts/run-migrations';

const mockedExecSync = jest.mocked(execSync);

describe('describeDatabase() — valid URL parsing (AC-2)', () => {
  test('[P0] returns host:port/dbname for a standard PostgreSQL URL', () => {
    const url = 'postgresql://user:pass@localhost:5432/mydb';
    expect(describeDatabase(url)).toBe('localhost:5432/mydb');
  });

  test('[P0] handles URL without port', () => {
    const url = 'postgresql://user:pass@localhost/mydb';
    expect(describeDatabase(url)).toBe('localhost/mydb');
  });

  test('[P0] handles Railway proxy URL', () => {
    const url = 'postgresql://user:pass@tokaido.proxy.rlwy.net:42861/railway';
    expect(describeDatabase(url)).toBe('tokaido.proxy.rlwy.net:42861/railway');
  });
});

describe('describeDatabase() — credential isolation invariant (AC-2)', () => {
  test('[P0] output does not contain username from URL', () => {
    const url = 'postgresql://myuser:pass@localhost:5432/mydb';
    const result = describeDatabase(url);
    expect(result).not.toContain('myuser');
  });

  test('[P0] output does not contain password from URL', () => {
    const url = 'postgresql://user:secretpass123@localhost:5432/mydb';
    const result = describeDatabase(url);
    expect(result).not.toContain('secretpass123');
  });

  test('[P0] output does not contain @ separator (userinfo stripped)', () => {
    const url = 'postgresql://user:pass@localhost:5432/mydb';
    const result = describeDatabase(url);
    expect(result).not.toMatch(/@/);
  });
});

describe('describeDatabase() — unparseable URL fallback (AC-2)', () => {
  test('[P0] returns fallback for invalid URL', () => {
    expect(describeDatabase('not-a-url')).toBe('(unparseable DATABASE_URL)');
  });

  test('[P0] returns fallback for empty string', () => {
    expect(describeDatabase('')).toBe('(unparseable DATABASE_URL)');
  });
});

describe('execSync command guard — regression guard (AC-2)', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  test('[P0] command string does not contain DATABASE_URL value (credential isolation — command arguments)', () => {
    process.env.DATABASE_URL = 'postgresql://user:secretpass@localhost:5432/testdb';

    try {
      main();
    } catch {
      // main() may call process.exit on success path or throw — either is fine
    }

    expect(mockedExecSync).toHaveBeenCalled();
    const commandString = mockedExecSync.mock.calls[0]?.[0] as string | undefined;
    expect(commandString).toBeDefined();
    expect(commandString!).not.toContain('secretpass');
    expect(commandString!).not.toContain('postgresql://');
    expect(commandString!).not.toContain('user:');
  });

  test('[P0] execSync env option does not explicitly pass DATABASE_URL (credential isolation — environment variables)', () => {
    process.env.DATABASE_URL = 'postgresql://user:secretpass@localhost:5432/testdb';

    try {
      main();
    } catch {
      // process.exit mock throws
    }

    expect(mockedExecSync).toHaveBeenCalled();
    const options = mockedExecSync.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;

    expect(options?.env).toBeUndefined();
  });

  test('[P0] DATABASE_URL with shell metacharacters cannot alter command (input injection)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass;rm -rf /@host:5432/db';

    try {
      main();
    } catch {
      // process.exit mock throws
    }

    expect(mockedExecSync).toHaveBeenCalled();
    const commandString = mockedExecSync.mock.calls[0]?.[0] as string | undefined;
    expect(commandString).toBeDefined();
    expect(commandString!).not.toContain('rm -rf');
    expect(commandString!).not.toContain(';');
    expect(commandString!).not.toContain('pass');
  });
});

describe('main() — behavioral flow (AC-2: target confirmed before and after)', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  test('[P0] exits with code 2 when DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;

    expect(() => main()).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(2);
    expect(console.error).toHaveBeenCalledWith('DATABASE_URL is not set');
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  test('[P0] logs target database before and after on success (AC-2)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/mydb';
    mockedExecSync.mockReturnValue('');

    main();

    const logCalls = jest.mocked(console.log).mock.calls.map((c) => c[0]);
    const targetLogs = logCalls.filter((c): c is string =>
      typeof c === 'string' && c.startsWith('Target database:'),
    );
    expect(targetLogs).toHaveLength(2);
    expect(targetLogs[0]).toBe('Target database: localhost:5432/mydb');
    expect(targetLogs[1]).toBe('Target database: localhost:5432/mydb');
    expect(logCalls).toContain('Migrations applied successfully.');
  });

  test('[P0] logs target database before and after on failure, exits with code 1 (AC-2)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/mydb';
    mockedExecSync.mockImplementation(() => {
      throw new Error('migration failed');
    });

    expect(() => main()).toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);

    const logCalls = jest.mocked(console.log).mock.calls.map((c) => c[0]);
    const targetLogs = logCalls.filter((c): c is string =>
      typeof c === 'string' && c.startsWith('Target database:'),
    );
    expect(targetLogs).toHaveLength(2);
    expect(targetLogs[0]).toBe('Target database: localhost:5432/mydb');
    expect(targetLogs[1]).toBe('Target database: localhost:5432/mydb');
  });
});
