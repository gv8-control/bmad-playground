/**
 * @jest-environment node
 *
 * Originally documented Test Fidelity audit finding F1 (getWorkingTreeStatus
 * porcelain parse). The parser has been replaced by the Daytona SDK's
 * structured `sandbox.git.status()` (Git.d.ts:187-203), which returns a
 * `GitStatus` object with `fileStatus: FileStatus[]` where each entry has
 * `name`, `staging`, `worktree`, and `extra` fields.
 *
 * The original porcelain parser bugs (trim() eating leading status-space,
 * rename "old -> new" literal, C-quoted paths) are structurally impossible
 * with the SDK's typed response — there is no string parsing to get wrong.
 * These tests verify the GitStatus → WorkingTreeStatus mapping instead.
 *
 * The three original behavioral expectations are preserved:
 *   1. Modified files are detected as dirty.
 *   2. Untracked files are included in the dirty file list.
 *   3. Staged renames report the NEW path (FileStatus.name), not the old
 *      path (FileStatus.extra).
 *   4. Paths with spaces are preserved exactly (no quoting/escaping).
 *
 * Fidelity remediation item 8: uses the shared mock-daytona.ts factory
 * instead of hand-rolled `any` + `as never` casts. This is the forcing
 * function — if the SDK changes the GitStatus/FileStatus contract, the
 * compiler flags it in the factory types, not silently at runtime.
 *
 * Seam: the Daytona `sandbox.git.status` boundary — the real SandboxService
 * runs; only the external @daytonaio/sdk is mocked.
 */
import type { Daytona } from '@daytonaio/sdk';
import { SandboxService } from './sandbox.service';
import {
  createMockDaytonaWithSandbox,
  buildFileStatus,
  type MockDaytona,
  type MockSandbox,
} from '../../test/helpers/mock-daytona';

describe('SandboxService.getWorkingTreeStatus — SDK git.status() mapping (audit F1)', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports the working tree as clean when fileStatus is empty', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.dirty).toBe(false);
    expect(status.files).toEqual([]);
  });

  it('reports the working tree as dirty when there are modified files', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('a.ts', { worktree: 'Modified' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.dirty).toBe(true);
  });

  it('includes a plain untracked path in the dirty file list', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('untracked.ts', { staging: 'Untracked', worktree: 'Untracked' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.files).toContain('untracked.ts');
  });

  // BUG 1 (structurally impossible with SDK): the old output.trim() ate the
  // first line's leading status-space, so slice(3) dropped a real filename
  // character on the most common dirty state. With the SDK, the filename is
  // a structured field — no string slicing can corrupt it.
  it('does not corrupt a modified path (SDK structured field, no string slicing)', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('a.ts', { worktree: 'Modified' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.files).toContain('a.ts');
  });

  // BUG 2 (structurally impossible with SDK): a staged rename must report the
  // new path, not the raw "old -> new" string. With the SDK, FileStatus.name
  // is the new path and FileStatus.extra is the old path — the mapping uses
  // .name, so the new path is always reported.
  it('reports the NEW path for a staged rename, not the old path (FileStatus.name vs .extra)', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('new.ts', {
          staging: 'Renamed',
          worktree: 'Unmodified',
          extra: 'old.ts',
        }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.files).toContain('new.ts');
    expect(status.files).not.toContain('old.ts');
    expect(status.files.some((f: string) => f.includes(' -> '))).toBe(false);
  });

  // BUG 3 (structurally impossible with SDK): with -z, git no longer C-quotes
  // paths with spaces/special chars. With the SDK, FileStatus.name is already
  // the unquoted path — no unquoting logic needed.
  it('preserves paths with spaces exactly (SDK structured field, no quoting)', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('spaced name.ts', { worktree: 'Modified' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.files).toContain('spaced name.ts');
    expect(
      status.files.some((f: string) => f.startsWith('"') || f.endsWith('"')),
    ).toBe(false);
  });

  it('filters out fully unmodified files (both staging and worktree unmodified)', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('clean.ts', { staging: 'Unmodified', worktree: 'Unmodified' }),
        buildFileStatus('dirty.ts', { worktree: 'Modified' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.dirty).toBe(true);
    expect(status.files).toContain('dirty.ts');
    expect(status.files).not.toContain('clean.ts');
  });

  it('reports dirty when files are staged but worktree is unmodified', async () => {
    mockSandbox.git.status.mockResolvedValueOnce({
      currentBranch: 'main',
      fileStatus: [
        buildFileStatus('staged.ts', { staging: 'Added', worktree: 'Unmodified' }),
      ],
    });

    const status = await service.getWorkingTreeStatus('sandbox-1');

    expect(status.dirty).toBe(true);
    expect(status.files).toContain('staged.ts');
  });
});
