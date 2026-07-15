/**
 * Shared typed mock factory for @daytonaio/sdk Daytona/Sandbox objects.
 *
 * This is the forcing function for item 8 (typed-mock discipline). Every test
 * that needs a mock Daytona client MUST use this factory instead of hand-rolling
 * `any`-typed mocks or `as never` casts. The typed interfaces below are
 * structurally compatible with the real SDK types — if the SDK changes a
 * signature, the compiler flags it here, not silently at runtime.
 *
 * Usage:
 *   const { mockDaytona, mockSandbox } = createMockDaytonaWithSandbox();
 *   const service = new SandboxService(mockDaytona);
 *
 *   // Override return values per-test:
 *   mockSandbox.git.status.mockResolvedValue({ currentBranch: 'main', fileStatus: [...] });
 *   mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: '' });
 *
 * Reference: node_modules/@daytonaio/sdk/cjs/Git.d.ts, Process.d.ts, Sandbox.d.ts,
 *            node_modules/@daytonaio/sdk/cjs/types/ExecuteResponse.d.ts
 */
import type { ExecuteResponse } from '@daytonaio/sdk/cjs/types/ExecuteResponse';
import type { GitStatus, FileStatus, Status } from '@daytona/toolbox-api-client';

// --- Typed mock interfaces (structurally compatible with real SDK types) ---

export type MockExecuteCommand = jest.Mock<
  Promise<ExecuteResponse>,
  [string, string?, Record<string, string>?, number?]
>;

export type MockGitClone = jest.Mock<
  Promise<void>,
  [string, string, string?, string?, string?, string?, boolean?]
>;

export type MockGitAdd = jest.Mock<Promise<void>, [string, string[]]>;

export type MockGitCommit = jest.Mock<
  Promise<{ sha: string }>,
  [string, string, string, string, boolean?]
>;

export type MockGitStatus = jest.Mock<Promise<GitStatus>, [string]>;

export interface MockGit {
  clone: MockGitClone;
  add: MockGitAdd;
  commit: MockGitCommit;
  status: MockGitStatus;
}

export interface MockProcess {
  executeCommand: MockExecuteCommand;
  killPtySession: jest.Mock<Promise<void>, [string]>;
}

export type MockUploadFile = jest.Mock<
  Promise<void>,
  [Buffer | string, string, number?]
>;

export interface MockFileSystem {
  uploadFile: MockUploadFile;
}

export interface MockSandbox {
  id: string;
  labels?: Record<string, string>;
  process: MockProcess;
  git: MockGit;
  fs: MockFileSystem;
}

export interface MockDaytona {
  create: jest.Mock<Promise<MockSandbox>>;
  get: jest.Mock<Promise<MockSandbox>, [string]>;
  delete: jest.Mock<Promise<void>, [MockSandbox]>;
  start: jest.Mock<Promise<void>, [MockSandbox]>;
}

// --- Factory functions ---

/**
 * Creates a mock Sandbox with all git/process methods as jest.fn() returning
 * success defaults. Override individual methods per-test as needed.
 */
export function createMockSandbox(overrides?: Partial<MockSandbox>): MockSandbox {
  return {
    id: 'sandbox-1',
    process: {
      executeCommand: jest.fn().mockResolvedValue({ exitCode: 0, result: '' }),
      killPtySession: jest.fn().mockResolvedValue(undefined),
    },
    git: {
      clone: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue({ sha: 'abc123' }),
      status: jest.fn().mockResolvedValue({
        currentBranch: 'main',
        fileStatus: [],
      }),
    },
    fs: {
      uploadFile: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

/**
 * Creates a mock Daytona client with create/get/delete/start as jest.fn().
 * Optionally accepts a pre-built mock sandbox.
 */
export function createMockDaytona(sandbox?: MockSandbox): MockDaytona {
  const mockSandbox = sandbox ?? createMockSandbox();
  return {
    create: jest.fn().mockResolvedValue(mockSandbox),
    get: jest.fn().mockResolvedValue(mockSandbox),
    delete: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Convenience: creates both a mock Daytona and its inner mock Sandbox in one call.
 * Returns both so tests can override sandbox methods directly.
 *
 * @example
 * const { mockDaytona, mockSandbox } = createMockDaytonaWithSandbox();
 * mockSandbox.git.status.mockResolvedValue({ currentBranch: 'main', fileStatus: [...] });
 * const service = new SandboxService(mockDaytona as unknown as Daytona);
 */
export function createMockDaytonaWithSandbox(
  sandboxOverrides?: Partial<MockSandbox>,
): { mockDaytona: MockDaytona; mockSandbox: MockSandbox } {
  const mockSandbox = createMockSandbox(sandboxOverrides);
  const mockDaytona = createMockDaytona(mockSandbox);
  return { mockDaytona, mockSandbox };
}

// --- Helper builders for GitStatus / FileStatus ---

/**
 * Builds a FileStatus object for test assertions.
 * Defaults to a modified file in the worktree.
 */
export function buildFileStatus(
  name: string,
  overrides?: Partial<FileStatus>,
): FileStatus {
  return {
    name,
    staging: 'Unmodified' as Status,
    worktree: 'Modified' as Status,
    extra: '',
    ...overrides,
  };
}

/**
 * Builds a GitStatus object from a list of file specs.
 * All files default to "Modified" in the worktree (the most common dirty state).
 */
export function buildGitStatus(
  files: Array<{ name: string; staging?: Status; worktree?: Status; extra?: string }>,
  currentBranch = 'main',
): GitStatus {
  return {
    currentBranch,
    fileStatus: files.map((f) => buildFileStatus(f.name, f)),
  };
}
