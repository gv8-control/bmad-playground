/**
 * @jest-environment node
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * Unit tests for ToolPillClassifierService.
 *
 * Story 3.4 covers: AC-2 (git commit → Semantic Pill promotion logic),
 *                   AC-3 (failed commit returns null → error-state Tool Pill).
 * Story 3.7 covers: AC-1 (401 detection → CREDENTIAL_FAILURE + markCredentialFailed),
 *                   AC-2 (403 classification → ACCESS_DENIED, no markCredentialFailed).
 */
import { ToolPillClassifierService } from './tool-pill-classifier.service';

describe('ToolPillClassifierService', () => {
  let service: ToolPillClassifierService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCredentialsService: any;

  beforeEach(() => {
    mockPrisma = {
      repoConnection: {
        findUnique: jest.fn().mockResolvedValue({ id: 'repo-1' }),
      },
      artifact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    mockCredentialsService = {
      markCredentialFailed: jest.fn().mockResolvedValue(undefined),
    };
    service = new ToolPillClassifierService(mockPrisma, mockCredentialsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('[P0] AC-2 — Non-commit tool calls return null', () => {
    it('returns null for non-Bash tool', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Read',
        'read file.txt',
        'file content',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('returns null for Bash without git commit in input', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git status',
        'nothing to commit, working tree clean',
        'user-1',
      );
      expect(result).toBeNull();
    });
  });

  describe('[P0] AC-3 — Failed commit returns null', () => {
    it('returns null for failed commit (error in output)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "test"',
        'error: failed to push some refs',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('returns null for commit with non-zero exit', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "test"',
        'Command exited with code 1',
        'user-1',
      );
      expect(result).toBeNull();
    });
  });

  describe('[P0] AC-2 — Successful commit touching _bmad-output/', () => {
    const successOutput = `[main abc1234] Update PRD
 1 file changed, 10 insertions(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`;

    it('returns promoted event for successful commit touching _bmad-output/', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update PRD"',
        successOutput,
        'user-1',
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe('TOOL_CALL_PROMOTED');
      expect(result?.toolCallId).toBe('tc-1');
    });

    it('derives correct lowercase artifactType from path', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update PRD"',
        successOutput,
        'user-1',
      );
      expect(result).toMatchObject({ artifactType: 'prd' });
    });

    it('uses Postgres title and type when artifact is found', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: 'art-1',
        title: 'Authoritative Title',
        type: 'architecture',
      });

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result).toMatchObject({ artifactType: 'architecture' });
      expect(result).toMatchObject({ artifactTitle: 'Authoritative Title' });
    });

    it('returns viewHref with id when artifact in Postgres', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: 'art-42',
        title: 'My PRD',
        type: 'prd',
      });

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result).toMatchObject({ viewHref: '/artifacts?id=art-42' });
    });

    it('returns viewHref without id when artifact not in Postgres', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue(null);

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result).toMatchObject({ viewHref: '/artifacts' });
    });
  });

  describe('[P1] AC-2 — Edge cases', () => {
    it('returns null for commit not touching _bmad-output/ files', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update README"',
        `[main abc1234] Update README
 1 file changed, 1 insertion(+)
 create mode 100644 README.md`,
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('logs warn on Postgres lookup failure and returns degraded viewHref', async () => {
      mockPrisma.artifact.findFirst.mockRejectedValue(new Error('DB connection lost'));
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(result).toMatchObject({ viewHref: '/artifacts' });
    });
  });

  describe('[P0] Story 3.7 AC-1 — 401 detection emits CREDENTIAL_FAILURE', () => {
    it('returns CredentialFailureEvent when output contains "remote: Invalid username or token"', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'remote: Invalid username or token.',
        'user-1',
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
      expect(result?.toolCallId).toBe('tc-1');
    });

    it('calls credentialsService.markCredentialFailed(userId, ...) on 401 detection', async () => {
      await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'remote: Invalid username or token.',
        'user-1',
      );
      expect(mockCredentialsService.markCredentialFailed).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
    });

    it('returns CredentialFailureEvent (not ToolCallPromotedEvent) when a git commit+push output contains 401 pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update" && git push',
        'remote: Invalid username or token.',
        'user-1',
      );
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
    });
  });

  describe('[P0] Story 3.7 AC-2 — 403 classification emits ACCESS_DENIED', () => {
    it('returns AccessDeniedEvent with code RATE_LIMITED when output contains "Rate limit exceeded"', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'Rate limit exceeded',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('returns AccessDeniedEvent with code ORG_RESTRICTION when output contains "Resource not accessible by integration"', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'Resource not accessible by integration',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'ORG_RESTRICTION' });
    });

    it('returns AccessDeniedEvent with code INSUFFICIENT_PERMISSION when output contains "Permission denied"', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'Permission denied',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'INSUFFICIENT_PERMISSION' });
    });

    it('does NOT call markCredentialFailed on 403 detection (FINDING-12)', async () => {
      await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'Rate limit exceeded',
        'user-1',
      );
      expect(mockCredentialsService.markCredentialFailed).not.toHaveBeenCalled();
    });
  });

  describe('[P0] Story 3.7 — Non-Bash tool calls return null even with 401/403 patterns', () => {
    it('returns null for non-Bash tool (e.g. Read) even if output contains 401 pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Read',
        'read file.txt',
        'remote: Invalid username or token.',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('returns null for Bash tool calls with no 401/403 pattern and no git commit (e.g. ls -la output)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'ls -la',
        'total 0\ndrwxr-xr-x 2 root root 40 Jul 5 00:00 .',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('returns null for non-git Bash commands even if output contains 401 pattern (DP-1 guard)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'echo "401 Unauthorized"',
        '401 Unauthorized',
        'user-1',
      );
      expect(result).toBeNull();
      expect(mockCredentialsService.markCredentialFailed).not.toHaveBeenCalled();
    });

    it('returns null for non-git Bash commands even if output contains 403 pattern (DP-1 guard)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'ls /root/.ssh',
        'ls: cannot open directory: Permission denied',
        'user-1',
      );
      expect(result).toBeNull();
    });
  });

  describe('[P0] Story 3.4 regression — Successful commit still returns ToolCallPromotedEvent', () => {
    it('still returns ToolCallPromotedEvent for successful git commit touching _bmad-output/', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update PRD"',
        `[main abc1234] Update PRD
 1 file changed, 10 insertions(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result?.type).toBe('TOOL_CALL_PROMOTED');
    });
  });

  describe('[P1] Story 3.7 — retryAfter extraction', () => {
    it('extracts retryAfter from rate-limit output when present ("retry after 60" → retryAfter: 60)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'Rate limit exceeded. retry after 60',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'RATE_LIMITED' });
      expect(result).toMatchObject({ retryAfter: 60 });
    });
  });

  describe('[P1] Story 3.7 — capturedAt optimistic-concurrency guard', () => {
    it('markCredentialFailed is called with a capturedAt Date argument', async () => {
      await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'remote: Invalid username or token.',
        'user-1',
      );
      const args = mockCredentialsService.markCredentialFailed.mock.calls[0];
      expect(args[1]).toBeInstanceOf(Date);
    });
  });

  describe('[P1] Story 3.7 — additional 401 pattern coverage (isCredentialFailureOutput)', () => {
    it('returns CredentialFailureEvent for "remote: Anonymous authentication" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'remote: Anonymous authentication',
        'user-1',
      );
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
    });

    it('returns CredentialFailureEvent for "fatal: Authentication failed for" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'fatal: Authentication failed for https://github.com/org/repo.git/',
        'user-1',
      );
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
    });

    it('returns CredentialFailureEvent for "fatal: could not read Username for" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        'user-1',
      );
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
    });

    it('returns CredentialFailureEvent for "401 Unauthorized" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        '401 Unauthorized',
        'user-1',
      );
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
    });
  });

  describe('[P1] Story 3.7 — additional 403 sub-pattern coverage (classifyAccessDenied)', () => {
    it('returns ACCESS_DENIED with RATE_LIMITED for "secondary rate limit" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        'secondary rate limit: Please retry',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('returns ACCESS_DENIED with RATE_LIMITED for "abuse detection" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        '403 Forbidden: abuse detection mechanism triggered',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('returns ACCESS_DENIED with ORG_RESTRICTION for "org policy" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        '403: org policy restricts access',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'ORG_RESTRICTION' });
    });

    it('returns ACCESS_DENIED with INSUFFICIENT_PERMISSION for bare "403" pattern', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        '403 Forbidden',
        'user-1',
      );
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'INSUFFICIENT_PERMISSION' });
    });
  });

  describe('[P1] Story 3.7 — markCredentialFailed throws (defensive test for unreachable path)', () => {
    it('classifier throws when markCredentialFailed throws despite its try/catch — CREDENTIAL_FAILURE not returned', async () => {
      mockCredentialsService.markCredentialFailed.mockRejectedValue(
        new Error('unexpected throw bypassing try/catch'),
      );

      await expect(
        service.classifyToolResult(
          'tc-1',
          'Bash',
          'git push',
          'remote: Invalid username or token.',
          'user-1',
        ),
      ).rejects.toThrow('unexpected throw bypassing try/catch');
    });
  });

  describe('[P1] NFR Performance — classifier completes within time bound on large output', () => {
    // Regression guard: verifies 401/403 regex detection stays linear on large
    // tool output. Catches accidental O(n^2) regressions if detection logic grows.
    it('classifies 401 on 100KB output in < 100ms', async () => {
      const largeOutput = 'x'.repeat(100_000) + '\nremote: Invalid username or token.';
      const start = Date.now();
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        largeOutput,
        'user-1',
      );
      const elapsed = Date.now() - start;
      expect(result?.type).toBe('CREDENTIAL_FAILURE');
      expect(elapsed).toBeLessThan(100);
    });

    it('classifies 403 on 100KB output in < 100ms', async () => {
      const largeOutput = 'x'.repeat(100_000) + '\n403 Forbidden: Rate limit exceeded';
      const start = Date.now();
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git push',
        largeOutput,
        'user-1',
      );
      const elapsed = Date.now() - start;
      expect(result?.type).toBe('ACCESS_DENIED');
      expect(result).toMatchObject({ code: 'RATE_LIMITED' });
      expect(elapsed).toBeLessThan(100);
    });
  });
});
