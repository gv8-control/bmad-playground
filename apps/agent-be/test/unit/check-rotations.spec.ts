/**
 * @jest-environment node
 *
 * Story 4.12: Secret Rotation Reminder Mechanism
 *
 * Unit tests for .github/scripts/check-rotations.js — due-date calculation logic.
 *
 * Verifies:
 * - Script outputs valid JSON array for all scenarios
 * - Script exits 0 for expected empty results (no launch date, no secrets due)
 * - Script exits non-zero for unexpected errors (file not found, invalid JSON)
 * - Past-due secrets produce reminders (floor formula: most recent due date)
 * - Approaching secrets (within reminderWindowDays) produce reminders
 * - Future-due secrets produce no reminders
 * - null productionLaunchDate produces empty array with stderr warning
 * - Missing config path argument produces empty array
 * - Output fields: name, dueDate, runbookSection, runbookRef
 * - Multiple secrets due at once are all reported
 * - runbookRef is included when present, null when absent
 *
 * The script is executed as a child process (execSync) because it calls
 * process.exit(0) unconditionally — importing it directly would terminate
 * the test process. This approach tests the real script without modifying it.
 *
 * Run: yarn nx test agent-be -- --testPathPattern=check-rotations
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../../.github/scripts/check-rotations.js',
);

interface Reminder {
  name: string;
  dueDate: string;
  runbookSection: string;
  runbookRef: string | null;
}

interface TestConfig {
  productionLaunchDate: string | null;
  reminderWindowDays: number;
  secrets: Array<{
    name: string;
    rotationIntervalDays: number;
    platform: string;
    runbookSection: string;
    runbookRef?: string;
  }>;
}

function runScript(configPath: string): Reminder[] {
  const output = execSync(`node "${SCRIPT_PATH}" "${configPath}"`, {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return JSON.parse(output.trim()) as Reminder[];
}

interface ScriptResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runScriptWithStderr(configPath: string): ScriptResult {
  const result = spawnSync('node', [SCRIPT_PATH, configPath], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

function writeTempConfig(config: TestConfig): string {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `check-rotations-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf8');
  return tmpFile;
}

function cleanupTmpFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

const REAL_CONFIG_PATH = path.resolve(
  __dirname,
  '../../../../.github/secret-rotation-config.json',
);

describe('Story 4.12 — check-rotations.js due-date calculation', () => {
  describe('Script existence and basic execution', () => {
    test('[P0] script file exists at .github/scripts/check-rotations.js', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    test('[P0] script outputs valid JSON array for the real config file', () => {
      const output = execSync(
        `node "${SCRIPT_PATH}" "${REAL_CONFIG_PATH}"`,
        { encoding: 'utf8', timeout: 10_000 },
      );
      expect(() => JSON.parse(output.trim())).not.toThrow();
      const parsed = JSON.parse(output.trim());
      expect(Array.isArray(parsed)).toBe(true);
    });

    test('[P0] script exits 0 when no config path is provided', () => {
      expect(() => {
        execSync(`node "${SCRIPT_PATH}"`, {
          encoding: 'utf8',
          timeout: 10_000,
          stdio: 'pipe',
        });
      }).not.toThrow();
    });

    test('[P0] script outputs empty array when no config path is provided', () => {
      const output = execSync(`node "${SCRIPT_PATH}"`, {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: 'pipe',
      });
      const parsed = JSON.parse(output.trim());
      expect(parsed).toEqual([]);
    });
  });

  describe('Null and invalid dates', () => {
    test('[P0] null productionLaunchDate produces empty array with stderr warning', () => {
      const config: TestConfig = {
        productionLaunchDate: null,
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScriptWithStderr(tmpFile);
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout.trim())).toEqual([]);
        expect(result.stderr).toMatch(/productionLaunchDate is not set/i);
        expect(result.stderr).toMatch(/inactive/i);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] invalid date string produces empty array', () => {
      const config: TestConfig = {
        productionLaunchDate: 'not-a-date',
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toEqual([]);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Unexpected errors exit non-zero (H3)', () => {
    test('[P0] file not found exits with code 1', () => {
      const nonexistentPath = path.join(
        os.tmpdir(),
        `nonexistent-config-${Date.now()}.json`,
      );
      const result = spawnSync('node', [SCRIPT_PATH, nonexistentPath], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/check-rotations error/i);
      expect(JSON.parse(result.stdout.trim())).toEqual([]);
    });

    test('[P0] invalid JSON exits with code 1', () => {
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(
        tmpDir,
        `check-rotations-invalid-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );
      fs.writeFileSync(tmpFile, '{ not valid json }', 'utf8');
      try {
        const result = spawnSync('node', [SCRIPT_PATH, tmpFile], {
          encoding: 'utf8',
          timeout: 10_000,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/check-rotations error/i);
        expect(JSON.parse(result.stdout.trim())).toEqual([]);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Past-due detection (floor formula)', () => {
    test('[P0] secret past its rotation due date produces a reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 100);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('DAYTONA_API_KEY');
        expect(result[0].runbookSection).toBe('Section 1');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] secret past interval boundary (91 days since launch) produces a reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 91);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'ANTHROPIC_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 2',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('ANTHROPIC_API_KEY');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] secret exactly at interval boundary (90 days since launch) produces a reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 90);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('DAYTONA_API_KEY');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] dueDate in output is a valid YYYY-MM-DD string', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Use calendar arithmetic (setDate) to match the script's H5 fix.
        const launchDate = new Date(config.productionLaunchDate as string);
        const expectedDueDate = new Date(launchDate);
        expectedDueDate.setDate(expectedDueDate.getDate() + 180);
        const expectedDueDateStr = expectedDueDate.toISOString().split('T')[0];
        expect(result[0].dueDate).toBe(expectedDueDateStr);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Approaching-window detection', () => {
    test('[P0] secret approaching its due date (within reminderWindowDays) produces a reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 85);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('DAYTONA_API_KEY');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] secret just outside the reminder window does NOT produce a reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 82);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toEqual([]);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Future-due secrets', () => {
    test('[P0] secret with future due date (recent launch) produces no reminder', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 10);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toEqual([]);
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Multiple secrets', () => {
    test('[P0] multiple past-due secrets all produce reminders', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
          {
            name: 'ANTHROPIC_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 2',
          },
          {
            name: 'AUTH_SECRET',
            rotationIntervalDays: 180,
            platform: 'Vercel + Railway',
            runbookSection: 'Section 4',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(3);
        const names = result.map((r) => r.name);
        expect(names).toContain('DAYTONA_API_KEY');
        expect(names).toContain('ANTHROPIC_API_KEY');
        expect(names).toContain('AUTH_SECRET');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] mix of due and not-due secrets produces only the due ones', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 95);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
          {
            name: 'AUTH_SECRET',
            rotationIntervalDays: 180,
            platform: 'Vercel + Railway',
            runbookSection: 'Section 4',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('DAYTONA_API_KEY');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('runbookRef field handling', () => {
    test('[P0] runbookRef is included when present in config', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'CREDENTIAL_ENCRYPTION_KEK',
            rotationIntervalDays: 180,
            platform: 'Vercel + Railway',
            runbookSection: 'Section 5',
            runbookRef: 'docs/runbooks/kek-rotation.md',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].runbookRef).toBe('docs/runbooks/kek-rotation.md');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });

    test('[P0] runbookRef is null when absent from config', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        expect(result[0].runbookRef).toBeNull();
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Output format', () => {
    test('[P0] each reminder has all required fields (name, dueDate, runbookSection, runbookRef)', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config: TestConfig = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          {
            name: 'DAYTONA_API_KEY',
            rotationIntervalDays: 90,
            platform: 'Railway',
            runbookSection: 'Section 1',
          },
        ],
      };
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(1);
        const reminder = result[0];
        expect(reminder).toHaveProperty('name');
        expect(reminder).toHaveProperty('dueDate');
        expect(reminder).toHaveProperty('runbookSection');
        expect(reminder).toHaveProperty('runbookRef');
        expect(typeof reminder.name).toBe('string');
        expect(typeof reminder.dueDate).toBe('string');
        expect(typeof reminder.runbookSection).toBe('string');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });

  describe('Real config file (committed .github/secret-rotation-config.json)', () => {
    test('[P0] real config with placeholder date produces empty array (no crash)', () => {
      const result = runScript(REAL_CONFIG_PATH);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });

  describe('Malformed secrets array entries', () => {
    test('[P0] null entry in secrets array is skipped, valid entries still produce reminders', () => {
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - 200);
      const config = {
        productionLaunchDate: launchDate.toISOString().split('T')[0],
        reminderWindowDays: 7,
        secrets: [
          { name: 'DAYTONA_API_KEY', rotationIntervalDays: 90, platform: 'Railway', runbookSection: 'Section 1' },
          null,
          { name: 'ANTHROPIC_API_KEY', rotationIntervalDays: 90, platform: 'Railway', runbookSection: 'Section 2' },
        ],
      } as unknown as TestConfig;
      const tmpFile = writeTempConfig(config);
      try {
        const result = runScript(tmpFile);
        expect(result).toHaveLength(2);
        const names = result.map((r) => r.name);
        expect(names).toContain('DAYTONA_API_KEY');
        expect(names).toContain('ANTHROPIC_API_KEY');
      } finally {
        cleanupTmpFile(tmpFile);
      }
    });
  });
});
