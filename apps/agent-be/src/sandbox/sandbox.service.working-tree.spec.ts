/**
 * @jest-environment node
 *
 * Originally documented Test Fidelity audit finding F1 (getWorkingTreeStatus
 * porcelain parse). The three `it.failing` blocks have been converted to
 * normal assertions after the parser was fixed to use `git status --porcelain -z`.
 *
 * SandboxService.getWorkingTreeStatus() previously parsed `git status --porcelain`
 * output with `output.trim()` + `line.slice(3)`, which broke in three ways:
 *   1. `output.trim()` strips the leading status-space of the FIRST line, so
 *      ` M a.ts` becomes `M a.ts` and slice(3) then yields `.ts` (a real char
 *      lost). This hits the single most common dirty state — an unstaged edit.
 *   2. rename `R  old.ts -> new.ts` → parsed as the literal "old.ts -> new.ts".
 *   3. quoted ` M "spaced name.ts"` → parsed as the literal `"spaced name.ts"`.
 *
 * The fix switched to `git status --porcelain -z` (NUL-separated, no quoting,
 * explicit rename field separation) with a NUL-aware parser.
 *
 * REAL_PORCELAIN below is verbatim `git status --porcelain -z` output captured
 * from a throwaway repo (2026-07-07) with a modified file, an untracked file,
 * a STAGED RENAME, and a path containing a space (-z disables quoting entirely).
 *
 * NOTE — cross-workflow collision: docs/fidelity-remediation-plan-2026-07-07.md
 * item 2 proposes migrating getWorkingTreeStatus off `git status --porcelain`
 * onto the Daytona SDK's structured `sandbox.git.status()` (Git.d.ts:187-203),
 * which would delete this parse entirely. If that migration lands, port these
 * three behavioral expectations onto the GitStatus.fileStatus mapping instead of
 * deleting them.
 *
 * Seam: the Daytona `executeCommand` boundary (the same seam
 * sandbox.service.nfr-s1.spec.ts already uses) — the real SandboxService runs;
 * only the external @daytonaio/sdk is mocked.
 */
import { SandboxService } from './sandbox.service';

// Verbatim `git status --porcelain -z` output. Capture:
//   git init; commit a.ts, old.ts, "spaced name.ts"
//   printf 'v2\n' >> a.ts        # modified, unstaged  → line starts with a space
//   git mv old.ts new.ts         # staged rename       → "R  old.ts\0new.ts\0"
//   printf 'x\n' >> "spaced name.ts"  # modified (no quotes with -z)
//   : > untracked.ts             # untracked
// With -z: entries are NUL-separated, no quoting, renames split into two fields.
const REAL_PORCELAIN = [
  ' M a.ts',
  'R  old.ts',
  'new.ts',
  ' M spaced name.ts',
  '?? untracked.ts',
].join('\0') + '\0';

describe('SandboxService.getWorkingTreeStatus — real porcelain parse (audit F1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSandbox: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDaytona: any;
  let service: SandboxService;

  beforeEach(() => {
    mockSandbox = {
      id: 'sandbox-1',
      process: {
        executeCommand: jest
          .fn()
          .mockResolvedValue({ exitCode: 0, result: REAL_PORCELAIN }),
      },
    };
    mockDaytona = { get: jest.fn().mockResolvedValue(mockSandbox) };
    service = new SandboxService(mockDaytona as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports the working tree as dirty', async () => {
    const status = await service.getWorkingTreeStatus('sandbox-1');
    expect(status.dirty).toBe(true);
  });

  it('parses a plain untracked path', async () => {
    const status = await service.getWorkingTreeStatus('sandbox-1');
    expect(status.files).toContain('untracked.ts');
  });

  // BUG 1 (fixed): output.trim() ate the first line's leading status-space,
  // so slice(3) dropped a real filename character on the most common dirty state.
  it(
    'does not corrupt the first modified path (trim() ate the leading status-space)',
    async () => {
      const status = await service.getWorkingTreeStatus('sandbox-1');
      expect(status.files).toContain('a.ts');
    },
  );

  // BUG 2 (fixed): a staged rename must report the new path, not the raw "old -> new".
  it(
    'reports the NEW path for a staged rename, not the raw "old -> new" string',
    async () => {
      const status = await service.getWorkingTreeStatus('sandbox-1');
      expect(status.files).toContain('new.ts');
      expect(status.files.some((f: string) => f.includes(' -> '))).toBe(false);
    },
  );

  // BUG 3 (fixed): with -z, git no longer C-quotes paths with spaces/special chars.
  it(
    'unquotes paths that git quoted for a space/special char',
    async () => {
      const status = await service.getWorkingTreeStatus('sandbox-1');
      expect(status.files).toContain('spaced name.ts');
      expect(
        status.files.some((f: string) => f.startsWith('"') || f.endsWith('"')),
      ).toBe(false);
    },
  );
});
